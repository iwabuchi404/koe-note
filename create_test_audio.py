"""
テスト用音声ファイル作成スクリプト
5秒の簡単な音声を生成してWebM形式で保存
"""

import numpy as np
import soundfile as sf
from pathlib import Path
import subprocess
import tempfile

def create_test_audio():
    """テスト用音声ファイルを作成"""
    
    # 音声パラメータ
    sample_rate = 44100  # サンプリング周波数
    duration = 5.0       # 5秒
    frequency = 440      # A4音（ラ）
    
    # サイン波を生成
    t = np.linspace(0, duration, int(sample_rate * duration))
    audio_data = 0.3 * np.sin(2 * np.pi * frequency * t)
    
    # フェードイン・フェードアウト
    fade_samples = int(0.1 * sample_rate)  # 0.1秒
    audio_data[:fade_samples] *= np.linspace(0, 1, fade_samples)
    audio_data[-fade_samples:] *= np.linspace(1, 0, fade_samples)
    
    # テストディレクトリを作成
    test_dir = Path("D:/work/voise-encoder/test-audio")
    test_dir.mkdir(exist_ok=True)
    
    # WAVファイルとして一時保存
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp_wav:
        sf.write(temp_wav.name, audio_data, sample_rate)
        temp_wav_path = temp_wav.name
    
    # FFmpegでWebMに変換
    webm_path = test_dir / "test_audio_440hz_5sec.webm"
    
    try:
        subprocess.run([
            "ffmpeg", "-y",
            "-i", temp_wav_path,
            "-c:a", "libopus",
            "-b:a", "128k",
            str(webm_path)
        ], check=True, capture_output=True)
        
        print(f"テスト音声ファイル作成完了: {webm_path}")
        print(f"ファイルサイズ: {webm_path.stat().st_size} bytes")
        return str(webm_path)
        
    except subprocess.CalledProcessError as e:
        print(f"FFmpeg変換エラー: {e}")
        return None
    except FileNotFoundError:
        print("FFmpegが見つかりません。WAVファイルを直接使用します。")
        
        # WAVファイルをテストディレクトリにコピー
        wav_path = test_dir / "test_audio_440hz_5sec.wav"
        with open(temp_wav_path, 'rb') as src, open(wav_path, 'wb') as dst:
            dst.write(src.read())
        
        print(f"テスト音声ファイル作成完了（WAV）: {wav_path}")
        return str(wav_path)
    
    finally:
        # 一時ファイル削除
        Path(temp_wav_path).unlink(missing_ok=True)

if __name__ == "__main__":
    result = create_test_audio()
    if result:
        print(f"成功: {result}")
    else:
        print("失敗")