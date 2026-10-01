"""
Kotoba-Whisper WebSocket Server
メインエントリーポイント
"""

import asyncio
import sys
import os
import signal
from pathlib import Path

# PyInstaller環境でのパス解決
if getattr(sys, 'frozen', False):
    # PyInstallerでビルドされた場合
    base_path = Path(sys._MEIPASS)
    src_path = base_path / "whisper_server"
else:
    # 通常のPython実行の場合
    base_path = Path(__file__).parent
    src_path = base_path / "src"

# src ディレクトリをパスに追加
sys.path.insert(0, str(src_path))

from whisper_server.server import KotobaWhisperServer


async def main():
    """メイン実行関数"""
    print("Starting Whisper WebSocket Server...")
    print("Model: small (OpenAI Whisper)")
    print("Device: CPU (安定性優先設定)")
    from whisper_server.config import ServerConfig
    print(f"Workers: {ServerConfig.NUM_WORKERS} (処理ボトルネック解消のため2→4に変更)")
    print("WebSocket: localhost:8770")
    print("-" * 50)
    
    server = KotobaWhisperServer(host="localhost", port=8770)
    
    # SIGTERM/SIGINTハンドリング（graceful shutdown）
    loop = asyncio.get_running_loop()
    def _signal_handler():
        print("\nShutdown signal received")
        asyncio.create_task(server.stop())
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, _signal_handler)
        except (NotImplementedError, AttributeError):
            # Windowsではadd_signal_handler未サポート
            signal.signal(sig, lambda s, f: _signal_handler())
    
    try:
        await server.start()
    except KeyboardInterrupt:
        print("\nServer stopped by user")
        await server.stop()
    except Exception as e:
        print(f"Server error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
