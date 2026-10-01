"""
Whisper音声認識の設定管理
各モデルの最適化パラメータを一元管理
"""

from typing import Dict, Any
from dataclasses import dataclass, asdict

from .model_catalog import describe, find_by_server_name, size_label, supported_server_names


# モデルダウンロードルート解決（PyInstaller環境対応）
def resolve_download_root() -> str:
    import os
    import sys
    from pathlib import Path

    # 環境変数から取得を試行
    if 'WHISPER_MODELS_PATH' in os.environ:
        return os.environ['WHISPER_MODELS_PATH']

    # PyInstaller環境の場合
    if getattr(sys, 'frozen', False):
        # 実行ファイルのディレクトリの親ディレクトリのmodels
        exe_dir = Path(sys.executable).parent
        models_path = exe_dir.parent / "models"
        if models_path.exists():
            return str(models_path)

    # デフォルトパス
    return "./models"


@dataclass
class TranscriptionConfig:
    """音声認識設定"""
    # 基本設定
    beam_size: int = 1
    chunk_length: int = 30
    vad_filter: bool = True
    word_timestamps: bool = False
    
    # 高度な設定
    condition_on_previous_text: bool = True
    temperature: float = 0.0
    compression_ratio_threshold: float = 2.4
    log_prob_threshold: float = -1.0
    no_speech_threshold: float = 0.6
    
    # faster-whisper固有設定
    repetition_penalty: float = 1.0
    length_penalty: float = 1.0
    
    def to_dict(self) -> Dict[str, Any]:
        """辞書形式に変換（言語は別途追加）"""
        return asdict(self)


class WhisperModelConfigs:
    """モデル別設定管理"""
    
    # smallモデル（軽量・高速）
    SMALL_CONFIG = TranscriptionConfig(
        beam_size=1,
        chunk_length=30,
        vad_filter=False,
        word_timestamps=False,
        condition_on_previous_text=True,
        temperature=0.0
    )
    
    # mediumモデル（kotoba-whisper）- テスト用設定1
    MEDIUM_CONFIG_V1 = TranscriptionConfig(
        beam_size=1,
        chunk_length=30,
        vad_filter=False,
        word_timestamps=False,
        condition_on_previous_text=True,
        temperature=0.0
    )
    
    # mediumモデル（kotoba-whisper）- テスト用設定2
    MEDIUM_CONFIG_V2 = TranscriptionConfig(
        beam_size=1,
        chunk_length=15,  # より短いチャンク
        vad_filter=False,
        word_timestamps=False,
        condition_on_previous_text=True,
        temperature=0.1
    )
    
    # mediumモデル（kotoba-whisper）- テスト用設定3
    MEDIUM_CONFIG_V3 = TranscriptionConfig(
        beam_size=1,
        chunk_length=30,
        vad_filter=False,  # VADを無効化
        word_timestamps=False,
        condition_on_previous_text=True,
        temperature=0.0
    )
    
    # large-v2モデル（高精度）
    LARGE_CONFIG = TranscriptionConfig(
        beam_size=1,
        chunk_length=30,
        vad_filter=False,
        word_timestamps=False,
        condition_on_previous_text=True,
        temperature=0.0
    )
    
    @classmethod
    def get_config(cls, model_name: str, config_version: int = 1) -> TranscriptionConfig:
        """
        モデル名に基づいて設定を取得する

        分岐は「カタログのID」で行う。以前はサーバー名（kotoba-tech/...）を
        部分一致で判定しており、表記が1文字でも違えば
        設定が違うものにfallbackしていた。
        """
        entry = find_by_server_name(model_name)

        # 未知のモデル（外部起動のサーバー等）は既定設定で動かす
        model_id = entry.id if entry else None

        if model_id in ("tiny", "base", "small"):
            return cls.SMALL_CONFIG
        if model_id == "kotoba-whisper-v2.0-faster":
            if config_version == 2:
                return cls.MEDIUM_CONFIG_V2
            if config_version == 3:
                return cls.MEDIUM_CONFIG_V3
            return cls.MEDIUM_CONFIG_V1
        if model_id in ("medium", "large-v2", "large-v3"):
            return cls.LARGE_CONFIG
        return cls.SMALL_CONFIG
    
    @classmethod
    def get_available_configs(cls, model_name: str) -> Dict[str, str]:
        """利用可能な設定一覧を取得"""
        if "kotoba-tech" in model_name:
            return {
                "1": "標準設定（V1）",
                "2": "短チャンク設定（V2）",
                "3": "VAD無効設定（V3）"
            }
        else:
            return {"1": "標準設定"}


class ServerConfig:
    """サーバー設定"""
    
    # WebSocket設定
    WEBSOCKET_HOST = "localhost"
    WEBSOCKET_PORT = 8770
    PING_INTERVAL = 30
    PING_TIMEOUT = 120
    CLOSE_TIMEOUT = 10
    MAX_MESSAGE_SIZE = 2**23  # 8MB
    MAX_QUEUE_SIZE = 32
    
    # faster-whisper設定
    DEVICE = "cpu"
    COMPUTE_TYPE = "int8"
    NUM_WORKERS = 4  # 2→4に変更：処理ボトルネック解消のため
    
    # モデルのダウンロードルート
    DOWNLOAD_ROOT = resolve_download_root()
    
    # タイムアウト設定
    TRANSCRIPTION_TIMEOUT = 120  # 音声認識タイムアウト（秒）
    MODEL_LOADING_TIMEOUT = 180  # モデル読み込みタイムアウト（秒）
    
    # ログ設定
    LOG_LEVEL = "DEBUG"
    LOG_FILE = "whisper_server.log"
    
    # デバッグ設定
    ENABLE_PROGRESS_LOG = True  # 進捗ログの有効/無効
    PROGRESS_LOG_INTERVAL = 10  # 何セグメントごとにログ出力するか


class ModelInfo:
    """
    モデル情報

    定義の正は src/shared/models.json（model_catalog.py）。
    以前は この许可リスト（MODEL_SIZES）が3モデルしか無く、
    ダウンロード可能な7モデルのうち4つと renderer のデフォルト値が
    拒否されていた。supported_server_names() が许可リストの代わりになる。
    """

    @classmethod
    def supported(cls) -> list:
        """サーバーが受け付けるモデル名の一覧"""
        return supported_server_names()

    @classmethod
    def get_model_size(cls, model_name: str) -> str:
        return size_label(model_name)

    @classmethod
    def get_model_description(cls, model_name: str) -> str:
        return describe(model_name)


# 現在の設定バージョン（mediumモデル用）
# この値を変更することで簡単にテスト可能
CURRENT_MEDIUM_CONFIG_VERSION = 1

# 設定を環境変数から読み込む場合の関数
def load_config_from_env():
    """環境変数から設定を読み込み（将来の拡張用）"""
    import os
    
    # 環境変数の例
    config = {}
    
    if os.getenv("WHISPER_BEAM_SIZE"):
        config["beam_size"] = int(os.getenv("WHISPER_BEAM_SIZE"))
    
    if os.getenv("WHISPER_CHUNK_LENGTH"):
        config["chunk_length"] = int(os.getenv("WHISPER_CHUNK_LENGTH"))
    
    if os.getenv("WHISPER_VAD_FILTER"):
        config["vad_filter"] = os.getenv("WHISPER_VAD_FILTER").lower() == "true"
    
    return config


# 設定のバリデーション
def validate_config(config: TranscriptionConfig) -> bool:
    """設定値の妥当性チェック"""
    if config.beam_size < 1 or config.beam_size > 10:
        return False
    
    if config.chunk_length < 5 or config.chunk_length > 60:
        return False
    
    if config.temperature < 0.0 or config.temperature > 1.0:
        return False
    
    return True


if __name__ == "__main__":
    # 設定テスト
    print("=== Whisper Model Configurations ===")
    
    models = supported_server_names()
    
    for model in models:
        print(f"\n{model}:")
        print(f"  Size: {ModelInfo.get_model_size(model)}")
        print(f"  Description: {ModelInfo.get_model_description(model)}")
        
        config = WhisperModelConfigs.get_config(model)
        print(f"  Config: {config}")
        
        if "kotoba-tech" in model:
            available_configs = WhisperModelConfigs.get_available_configs(model)
            print(f"  Available configs: {available_configs}")
