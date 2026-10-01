"""
Kotoba-Whisper transcription handler
"""

import logging
from typing import Dict, List, Optional, Any
from pathlib import Path
import time

from .config import (
    WhisperModelConfigs, 
    ServerConfig, 
    ModelInfo, 
    CURRENT_MEDIUM_CONFIG_VERSION,
    validate_config
)

logger = logging.getLogger(__name__)


class TranscriptionSegment:
    """音声認識結果のセグメント"""
    def __init__(self, start: float, end: float, text: str, words: Optional[List[Dict]] = None):
        self.start = start
        self.end = end
        self.text = text
        self.words = words or []
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "start": self.start,
            "end": self.end,
            "text": self.text,
            "words": self.words
        }


class TranscriptionResult:
    """音声認識結果の完全な情報"""
    def __init__(self, language: str, duration: float, segments: List[TranscriptionSegment]):
        self.language = language
        self.duration = duration
        self.segments = segments
        self.created_at = time.time()
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "language": self.language,
            "duration": self.duration,
            "segments": [seg.to_dict() for seg in self.segments],
            "created_at": self.created_at,
            "segment_count": len(self.segments)
        }


class KotobaWhisperTranscriber:
    """Kotoba-Whisper v2.0を使用した音声認識クラス"""
    
    def __init__(self, model_name: str = "small", config_version: int = None):
        self.model_name = model_name
        self.model = None
        self.is_loaded = False
        
        # 設定バージョンの決定
        if config_version is None:
            if "kotoba-tech" in model_name:
                config_version = CURRENT_MEDIUM_CONFIG_VERSION
            else:
                config_version = 1
        
        self.config_version = config_version
        self.transcription_config = WhisperModelConfigs.get_config(model_name, config_version)
        
        logger.info(f"Initializing KotobaWhisperTranscriber:")
        logger.info(f"  Model: {model_name}")
        logger.info(f"  Size: {ModelInfo.get_model_size(model_name)}")
        logger.info(f"  Config version: {config_version}")
        logger.info(f"  Config: {self.transcription_config}")
    
    async def load_model(self) -> bool:
        """Kotoba-Whisperモデルの非同期読み込み"""
        try:
            logger.info(f"Loading Kotoba-Whisper model: {self.model_name}")
            
            # モデル情報の表示
            size_info = ModelInfo.get_model_size(self.model_name)
            description = ModelInfo.get_model_description(self.model_name)
            logger.info(f"Model size: {size_info} ({description}) - This may take time for first download")
            
            # faster-whisperのインポートとモデル読み込み
            from faster_whisper import WhisperModel
            import asyncio
            
            # モデル読み込みを非同期で実行（ブロッキングを避ける）
            def _load_model():
                return WhisperModel(
                    self.model_name,
                    device=ServerConfig.DEVICE,
                    compute_type=ServerConfig.COMPUTE_TYPE,
                    num_workers=ServerConfig.NUM_WORKERS,
                    download_root=ServerConfig.DOWNLOAD_ROOT
                )
            
            # 別スレッドで実行してメインループをブロックしない
            loop = asyncio.get_event_loop()
            self.model = await loop.run_in_executor(None, _load_model)
            
            self.is_loaded = True
            logger.info(f"Kotoba-Whisper model '{self.model_name}' loaded successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to load Kotoba-Whisper model '{self.model_name}': {e}")
            self.is_loaded = False
            return False
    
    async def transcribe_file(self, audio_path: str, language: str = "ja") -> Optional[TranscriptionResult]:
        """音声ファイルの文字起こし"""
        if not self.is_loaded:
            logger.error("Model not loaded. Call load_model() first.")
            return None
        
        try:
            audio_file = Path(audio_path)
            if not audio_file.exists():
                logger.error(f"Audio file not found: {audio_path}")
                return None
            
            logger.info(f"Starting transcription: {audio_path}")
            logger.debug(f"File size: {audio_file.stat().st_size} bytes")
            logger.debug(f"Language: {language}")
            start_time = time.time()
            
            # 設定ファイルから音声認識パラメータを取得
            config = self.transcription_config
            
            # 設定の妥当性チェック
            if not validate_config(config):
                logger.error(f"Invalid transcription config: {config}")
                return None
            
            # パラメータ辞書の作成
            transcribe_params = config.to_dict()
            transcribe_params["language"] = language  # 言語を追加
            
            logger.debug(f"Using transcription config version {self.config_version}")
            logger.debug(f"Transcription parameters: {transcribe_params}")
            logger.debug("Calling model.transcribe()...")
            try:
                segments, info = self.model.transcribe(audio_path, **transcribe_params)
                logger.debug("model.transcribe() completed successfully")
            except Exception as transcribe_error:
                logger.error(f"model.transcribe() failed: {transcribe_error}")
                import traceback
                traceback.print_exc()
                return None
            
            # 結果をTranscriptionSegmentに変換（詳細ログ付き）
            transcription_segments = []
            total_audio_duration = 0
            
            for i, segment in enumerate(segments):
                transcription_segments.append(TranscriptionSegment(
                    start=segment.start,
                    end=segment.end,
                    text=segment.text,
                    words=[]  # 空の配列で軽量化
                ))
                total_audio_duration = max(total_audio_duration, segment.end)
                
                # 進捗ログ（設定可能な間隔）
                if ServerConfig.ENABLE_PROGRESS_LOG and (i + 1) % ServerConfig.PROGRESS_LOG_INTERVAL == 0:
                    logger.debug(f"Processed {i + 1} segments, latest time: {segment.end:.1f}s")
            
            processing_time = time.time() - start_time
            result = TranscriptionResult(
                language=info.language,
                duration=info.duration,
                segments=transcription_segments
            )
            
            # 詳細な結果ログ
            logger.info(f"Transcription completed in {processing_time:.2f}s:")
            logger.info(f"  Model: {self.model_name}")
            logger.info(f"  Audio duration: {info.duration:.1f}s")
            logger.info(f"  Processed duration: {total_audio_duration:.1f}s")
            logger.info(f"  Segments: {len(transcription_segments)}")
            logger.info(f"  Coverage: {(total_audio_duration / info.duration * 100):.1f}%")
            
            # カバレッジが低い場合の警告
            if total_audio_duration < info.duration * 0.8:
                logger.warning(f"Low coverage detected! Only {total_audio_duration:.1f}s of {info.duration:.1f}s processed")
            
            return result
            
        except Exception as e:
            logger.error(f"Transcription failed: {e}")
            return None
    
    async def transcribe_chunk(self, audio_data: bytes, language: str = "ja") -> Optional[TranscriptionResult]:
        """音声チャンクの文字起こし（リアルタイム処理用）"""
        if not self.is_loaded:
            logger.error("Model not loaded. Call load_model() first.")
            return None
        
        try:
            # 一時ファイルに保存してから処理
            import tempfile
            with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as tmp_file:
                tmp_file.write(audio_data)
                tmp_path = tmp_file.name
            
            # ファイルとして処理
            result = await self.transcribe_file(tmp_path, language)
            
            # 一時ファイル削除
            Path(tmp_path).unlink(missing_ok=True)
            
            return result
            
        except Exception as e:
            logger.error(f"Chunk transcription failed: {e}")
            return None


# モジュールレベルでの使用例
if __name__ == "__main__":
    import asyncio
    
    async def test_transcriber():
        transcriber = KotobaWhisperTranscriber()
        
        if await transcriber.load_model():
            print("Model loaded successfully")
        else:
            print("Failed to load model")
    
    asyncio.run(test_transcriber())