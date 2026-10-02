"""
WebSocketサーバー実装
Electron ↔ Python間通信
"""

import asyncio
import websockets
import json
import logging
from typing import Dict, Any, Optional
from pathlib import Path

from .transcriber import KotobaWhisperTranscriber, TranscriptionResult
from .config import ServerConfig, ModelInfo, WhisperModelConfigs

logger = logging.getLogger(__name__)


class WebSocketHandler:
    """WebSocket通信ハンドラー"""
    
    def __init__(self):
        self.transcriber = KotobaWhisperTranscriber()
        self.clients = set()
        self.current_model = "small"  # デフォルトモデル
        self.current_config_version = 1  # デフォルト設定バージョン
        
    async def initialize(self):
        """サーバー初期化"""
        logger.info("Initializing WebSocket handler...")
        
        try:
            # Kotoba-Whisperモデル読み込み
            if await self.transcriber.load_model():
                logger.info("WebSocket handler initialized successfully")
                return True
            else:
                logger.error("Failed to initialize transcriber")
                return False
        except Exception as e:
            logger.error(f"Failed to initialize WebSocket handler: {e}")
            return False
    
    async def handle_client(self, websocket):
        """クライアント接続処理"""
        client_addr = None
        try:
            client_addr = websocket.remote_address
            logger.info(f"New client connected: {client_addr}")
            logger.debug(f"WebSocket state: {websocket.state.name}")
            
            self.clients.add(websocket)
            logger.debug(f"Active clients: {len(self.clients)}")
            
            # 接続確認メッセージ送信
            connection_msg = {
                "type": "connection",
                "status": "connected",
                "message": "Kotoba-Whisper server ready"
            }
            logger.debug(f"Sending connection message: {connection_msg}")
            
            try:
                await websocket.send(json.dumps(connection_msg))
                logger.debug("Connection message sent successfully")
            except Exception as send_error:
                logger.error(f"Failed to send connection message: {send_error}")
                return
            
            logger.info(f"Starting message loop for {client_addr}")
            async for message in websocket:
                logger.debug(f"Received message from {client_addr}: {message[:100]}...")
                await self.handle_message(websocket, message)
                
        except websockets.exceptions.ConnectionClosed as e:
            logger.info(f"Client disconnected normally: {client_addr} - {e}")
        except websockets.exceptions.WebSocketException as e:
            logger.error(f"WebSocket error for client {client_addr}: {e}")
            import traceback
            traceback.print_exc()
        except Exception as e:
            logger.error(f"Unexpected error handling client {client_addr}: {e}")
            import traceback
            traceback.print_exc()
        finally:
            if websocket in self.clients:
                self.clients.discard(websocket)
                logger.debug(f"Client {client_addr} removed. Active clients: {len(self.clients)}")
    
    async def handle_message(self, websocket, message: str):
        """メッセージ処理"""
        try:
            data = json.loads(message)
            message_type = data.get("type")
            
            logger.info(f"Received message type: {message_type}")
            
            if message_type == "transcribe_file":
                await self.handle_transcribe_file(websocket, data)
            elif message_type == "transcribe_chunk":
                await self.handle_transcribe_chunk(websocket, data)
            elif message_type == "change_model":
                await self.handle_change_model(websocket, data)
            elif message_type == "health_check":
                await self.handle_health_check(websocket)
            elif message_type == "shutdown":
                await self.handle_shutdown(websocket)
            else:
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": f"Unknown message type: {message_type}"
                }))
        
        except json.JSONDecodeError:
            await websocket.send(json.dumps({
                "type": "error",
                "message": "Invalid JSON format"
            }))
        except Exception as e:
            logger.error(f"Error handling message: {e}")
            await websocket.send(json.dumps({
                "type": "error",
                "message": str(e)
            }))
    
    async def handle_transcribe_file(self, websocket, data: Dict[str, Any]):
        """ファイル音声認識処理"""
        try:
            file_path = data.get("file_path")
            language = data.get("language", "ja")
            logger.info(f"音声認識リクエスト受信: {file_path}, 言語: {language}")
            
            if not file_path:
                logger.error("file_pathが指定されていません")
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": "file_path is required"
                }))
                return
            
            # ファイル存在確認
            if not Path(file_path).exists():
                logger.error(f"音声ファイルが見つかりません: {file_path}")
                await websocket.send(json.dumps({
                    "type": "transcription_result",
                    "status": "failed",
                    "message": f"音声ファイルが見つかりません: {file_path}"
                }))
                return
            
            # 進捗通知: 開始
            logger.info("音声認識開始通知を送信")
            await websocket.send(json.dumps({
                "type": "transcription_progress",
                "status": "started",
                "file_path": file_path
            }))
            
            # 音声認識実行（エラーハンドリング強化）
            logger.info("音声認識処理開始")
            
            # 進捗通知: 処理中
            await websocket.send(json.dumps({
                "type": "transcription_progress",
                "status": "processing",
                "message": "Kotoba-Whisperで音声認識実行中..."
            }))
            
            try:
                result = await self.transcriber.transcribe_file(file_path, language)
                logger.info("音声認識処理完了")
                
                if result:
                    logger.info(f"音声認識成功: セグメント数 {len(result.segments)}")
                    
                    # 進捗通知: 結果送信中
                    await websocket.send(json.dumps({
                        "type": "transcription_progress",
                        "status": "sending_result",
                        "segments_count": len(result.segments)
                    }))
                    
                    # 結果送信
                    result_data = result.to_dict()
                    await websocket.send(json.dumps({
                        "type": "transcription_result",
                        "status": "completed",
                        "result": result_data
                    }))
                    logger.info("音声認識結果送信完了")
                    
                else:
                    logger.error("音声認識結果がNone")
                    await websocket.send(json.dumps({
                        "type": "transcription_result",
                        "status": "failed",
                        "message": "音声認識処理でエラーが発生しました"
                    }))
                    
            except Exception as transcribe_error:
                logger.error(f"音声認識処理中のエラー: {transcribe_error}")
                import traceback
                traceback.print_exc()
                
                await websocket.send(json.dumps({
                    "type": "transcription_result",
                    "status": "failed",
                    "message": f"音声認識エラー: {str(transcribe_error)}"
                }))
        
        except websockets.exceptions.ConnectionClosed:
            logger.error("WebSocket接続が閉じられました")
        except Exception as e:
            logger.error(f"Handle transcribe file error: {e}")
            import traceback
            traceback.print_exc()
            try:
                if not websocket.closed:
                    await websocket.send(json.dumps({
                        "type": "transcription_result",
                        "status": "failed",
                        "message": f"予期しないエラー: {str(e)}"
                    }))
            except Exception as send_error:
                logger.error(f"エラーレスポンス送信失敗: {send_error}")
    
    async def handle_transcribe_chunk(self, websocket, data: Dict[str, Any]):
        """チャンク音声認識処理（リアルタイム用）"""
        try:
            # Base64エンコードされた音声データをデコード
            import base64
            audio_data_b64 = data.get("audio_data")
            language = data.get("language", "ja")

            # クライアントが送った識別子。応答には必ず同じ値を返す。
            # 返さないとクライアントは「最古の未完了チャンク」で推測して
            # 紐付け，造成 2つ以上 in-flight のときに別チャンクの結果を
            # 別チャンクに上書きしてしまう（silent mis-attribution）。
            chunk_number = data.get("chunkNumber")
            chunk_timestamp = data.get("timestamp")

            if not audio_data_b64:
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": "audio_data is required",
                    "chunkNumber": chunk_number
                }))
                return

            audio_data = base64.b64decode(audio_data_b64)

            # 進捗通知
            await websocket.send(json.dumps({
                "type": "chunk_progress",
                "status": "processing",
                "data_size": len(audio_data),
                "chunkNumber": chunk_number,
                "timestamp": chunk_timestamp
            }))

            # チャンク音声認識実行
            result = await self.transcriber.transcribe_chunk(audio_data, language)

            if result:
                await websocket.send(json.dumps({
                    "type": "chunk_result",
                    "status": "completed",
                    "chunkNumber": chunk_number,
                    "timestamp": chunk_timestamp,
                    "result": result.to_dict()
                }))
            else:
                await websocket.send(json.dumps({
                    "type": "chunk_result",
                    "status": "failed",
                    "chunkNumber": chunk_number,
                    "timestamp": chunk_timestamp,
                    "message": "Chunk transcription failed"
                }))

        except Exception as e:
            logger.error(f"Chunk transcription error: {e}")
            await websocket.send(json.dumps({
                "type": "chunk_result",
                "status": "failed",
                "chunkNumber": data.get("chunkNumber"),
                "timestamp": data.get("timestamp"),
                "message": str(e)
            }))
    
    async def handle_health_check(self, websocket):
        """ヘルスチェック"""
        await websocket.send(json.dumps({
            "type": "health_check",
            "status": "healthy",
            "model_loaded": self.transcriber.is_loaded,
            "current_model": self.current_model,
            "active_clients": len(self.clients)
        }))
    
    async def handle_shutdown(self, websocket):
        """シャットダウン要求処理"""
        logger.info("Shutdown request received from client")
        try:
            await websocket.send(json.dumps({
                "type": "shutdown_ack",
                "status": "shutting_down"
            }))
        except Exception:
            pass
        # サーバー停止をトリガー
        if hasattr(self, '_server_instance') and self._server_instance:
            asyncio.create_task(self._server_instance.stop())
    
    async def handle_change_model(self, websocket, data: Dict[str, Any]):
        """モデル変更処理"""
        try:
            model_name = data.get("model_name")
            if not model_name:
                await websocket.send(json.dumps({
                    "type": "error",
                    "message": "model_name is required"
                }))
                return
            
            # サポートされているモデルの確認
            supported_models = ModelInfo.supported()
            
            if model_name not in supported_models:
                await websocket.send(json.dumps({
                    "type": "error", 
                    "message": f"Unsupported model: {model_name}. Supported models: {supported_models}"
                }))
                return
            
            # 現在のモデルと同じ場合はスキップ
            if model_name == self.current_model:
                await websocket.send(json.dumps({
                    "type": "model_changed",
                    "status": "already_loaded",
                    "model_name": model_name
                }))
                return
            
            # 進捗通知
            await websocket.send(json.dumps({
                "type": "model_loading",
                "status": "loading",
                "model_name": model_name
            }))
            
            # 新しいトランスクライバーを作成してモデル読み込み
            # config_versionをデータから取得（将来の拡張用）
            config_version = data.get("config_version", None)
            
            logger.info(f"Changing model from {self.current_model} to {model_name}")
            if config_version:
                logger.info(f"Using config version: {config_version}")
            
            new_transcriber = KotobaWhisperTranscriber(model_name, config_version)
            
            if await new_transcriber.load_model():
                # 成功した場合、古いモデルを置き換え
                self.transcriber = new_transcriber
                self.current_model = model_name  # UIでの選択値を保存
                if config_version:
                    self.current_config_version = config_version
                
                await websocket.send(json.dumps({
                    "type": "model_changed",
                    "status": "success",
                    "model_name": model_name
                }))
                logger.info(f"Model successfully changed to {model_name}")
            else:
                await websocket.send(json.dumps({
                    "type": "model_changed",
                    "status": "failed",
                    "model_name": model_name,
                    "message": "Failed to load new model"
                }))
                logger.error(f"Failed to load model {model_name}")
                
        except Exception as e:
            logger.error(f"Error changing model: {e}")
            await websocket.send(json.dumps({
                "type": "model_changed",
                "status": "failed",
                "model_name": model_name,
                "message": str(e)
            }))


class KotobaWhisperServer:
    """Kotoba-Whisper WebSocketサーバー"""
    
    def __init__(self, host: str = None, port: int = None):
        self.host = host or ServerConfig.WEBSOCKET_HOST
        self.port = port or ServerConfig.WEBSOCKET_PORT
        self.handler = WebSocketHandler()
        self._server = None
        self._shutdown_event = asyncio.Event()
        
        # ログ設定（設定ファイルから取得）
        log_level = getattr(logging, ServerConfig.LOG_LEVEL.upper())
        logging.basicConfig(
            level=log_level,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            handlers=[
                logging.StreamHandler(),
                logging.FileHandler(ServerConfig.LOG_FILE)
            ]
        )
    
    async def start(self):
        """サーバー開始"""
        logger.info("Starting Kotoba-Whisper WebSocket server...")
        
        # ハンドラー初期化
        if not await self.handler.initialize():
            logger.error("Failed to initialize server")
            return False
        
        # WebSocketサーバー起動
        try:
            self._server = await websockets.serve(
                self.handler.handle_client,
                self.host,
                self.port,
                family=2,  # IPv4のみに制限
                ping_interval=ServerConfig.PING_INTERVAL,
                ping_timeout=ServerConfig.PING_TIMEOUT,
                close_timeout=ServerConfig.CLOSE_TIMEOUT,
                max_size=ServerConfig.MAX_MESSAGE_SIZE,
                max_queue=ServerConfig.MAX_QUEUE_SIZE
            )
            # handlerにサーバーインスタンスへの参照を設定（shutdown要求用）
            self.handler._server_instance = self
            
            logger.info(f"Server started on ws://{self.host}:{self.port}")
            logger.info(f"WebSocket settings: ping_interval={ServerConfig.PING_INTERVAL}s, "
                       f"ping_timeout={ServerConfig.PING_TIMEOUT}s, "
                       f"max_size={ServerConfig.MAX_MESSAGE_SIZE//1024//1024}MB")
            
            # サーバー実行維持
            await self._server.wait_closed()
            
        except Exception as e:
            logger.error(f"Server error: {e}")
            return False
    
    async def stop(self):
        """サーバー停止"""
        logger.info("Stopping server...")
        if self._server:
            self._server.close()
            await self._server.wait_closed()
            logger.info("WebSocket server closed")
        # プロセス終了
        import os
        os._exit(0)


# サーバー実行用
async def main():
    server = KotobaWhisperServer()
    await server.start()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nServer stopped by user")
    except Exception as e:
        print(f"Server error: {e}")