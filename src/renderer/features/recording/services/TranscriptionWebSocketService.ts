/**
 * TranscriptionWebSocketService
 * 
 * AudioWorkletで生成されたMP3チャンクをWhisperサーバーに送信し、
 * リアルタイム文字起こし結果を受信するWebSocketサービス
 */

import { LoggerFactory, LogCategories } from '@renderer/shared/utils/LoggerFactory'
import type {
  ChunkTranscriptionResult,
  ChunkTranscriptionProgress,
  ServerMessage,
  TranscriptionChunk,
  WhisperTranscriptionResult
} from '@shared/types'

// チャンク・結果・進捗・プロトコルの型は @shared/types を正とする。
// サーバー応答の TranscriptionResult との名前衝突を避けるため
// ChunkTranscription* という名前にしている。
export type { ChunkTranscriptionResult, ChunkTranscriptionProgress, TranscriptionChunk }

/**
 * サーバー応答から本文を取り出す
 *
 * faster-whisper の結果には text フィールドが無いため segments を連結する。
 * 区切りは空白（日本語の文節を繋げるため）。
 */
export function extractText(result: WhisperTranscriptionResult): string {
  if (result.text) return result.text
  return result.segments
    .map((segment) => segment.text)
    .filter((text) => text && text.trim())
    .join(' ')
    .trim()
}

export class TranscriptionWebSocketService {
  private ws: WebSocket | null = null;
  private serverUrl: string;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 2000; // 2秒
  /** 送信済みで応答待ちのチャンク（監視用。紐付けには使わない） */
  private pendingChunks: Set<number> = new Set();
  private logger = LoggerFactory.getLogger(LogCategories.TRANSCRIPTION_WEBSOCKET);
  
  // イベントコールバック
  private onConnectionChange: (connected: boolean) => void;
  private onChunkTranscriptionResult: (result: ChunkTranscriptionResult) => void;
  private onChunkTranscriptionProgress: (progress: ChunkTranscriptionProgress) => void;
  private onError: (error: string) => void;

  constructor(
    serverUrl: string = 'ws://localhost:8770',
    callbacks: {
      onConnectionChange: (connected: boolean) => void;
      onChunkTranscriptionResult: (result: ChunkTranscriptionResult) => void;
      onChunkTranscriptionProgress: (progress: ChunkTranscriptionProgress) => void;
      onError: (error: string) => void;
    }
  ) {
    this.serverUrl = serverUrl;
    this.onConnectionChange = callbacks.onConnectionChange;
    this.onChunkTranscriptionResult = callbacks.onChunkTranscriptionResult;
    this.onChunkTranscriptionProgress = callbacks.onChunkTranscriptionProgress;
    this.onError = callbacks.onError;
  }

  /**
   * WebSocket接続開始
   */
  async connect(): Promise<boolean> {
    try {
      this.logger.info('Whisperサーバーに接続中', { serverUrl: this.serverUrl });
      
      this.ws = new WebSocket(this.serverUrl);
      
      // 接続成功
      this.ws.onopen = () => {
        this.logger.info('Whisperサーバーに接続成功');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.onConnectionChange(true);
      };
      
      // メッセージ受信
      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleServerMessage(data as ServerMessage);
        } catch (error) {
          this.logger.error('🔗 サーバーメッセージパースエラー:', error);
          this.onError('サーバーメッセージの解析に失敗しました');
        }
      };
      
      // 接続切断
      this.ws.onclose = (event) => {
        this.logger.info('Whisperサーバー接続切断', { code: event.code, reason: event.reason });
        this.isConnected = false;
        this.onConnectionChange(false);
        
        // 自動再接続（意図的な切断でない場合）
        if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.attemptReconnect();
        }
      };
      
      // エラー処理
      this.ws.onerror = (error) => {
        this.logger.error('🔗 WebSocketエラー:', error);
        this.onError('WebSocket接続エラーが発生しました');
      };
      
      // 接続完了を待機（タイムアウト10秒）
      return new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
          this.logger.warn('🔗 WebSocket接続タイムアウト');
          resolve(false);
        }, 10000); // 10秒でタイムアウト

        const checkConnection = () => {
          if (this.isConnected) {
            clearTimeout(timeoutId);
            resolve(true);
          } else if (this.ws?.readyState === WebSocket.CLOSED) {
            clearTimeout(timeoutId);
            resolve(false);
          } else {
            setTimeout(checkConnection, 100);
          }
        };
        checkConnection();
      });
      
    } catch (error) {
      this.logger.error('🔗 WebSocket接続エラー:', error);
      this.onError('WebSocket接続の初期化に失敗しました');
      return false;
    }
  }

  /**
   * サーバーメッセージ処理
   *
   * サーバーは chunk_progress / chunk_result に必ず chunkNumber を返す。
   * 返ってきた値をそのまま使う（推測しない）。返っていない場合は
   * 黙って別のチャンクに紐付けるのではなく、落として明示的にエラーにする。
   */
  private handleServerMessage(data: ServerMessage): void {
    this.logger.info('サーバーメッセージ受信', { type: data.type });

    switch (data.type) {
      case 'connection':
        this.logger.info('接続確認メッセージ', { message: data.message });
        break;

      case 'chunk_progress': {
        const chunkNumber = data.chunkNumber
        if (typeof chunkNumber !== 'number') {
          this.logger.error('chunk_progress に chunkNumber がありません。プロトコルを確認してください', {
            data
          })
          return
        }
        this.onChunkTranscriptionProgress({
          chunkNumber,
          status: 'processing',
          message: data.status
        })
        break
      }

      case 'chunk_result': {
        const chunkNumber = data.chunkNumber
        if (typeof chunkNumber !== 'number') {
          // 推測すると別チャンクの結果を上書きしてしまうため、落とす
          this.logger.error(
            'chunk_result に chunkNumber がありません。サーバーとプロトコルのバージョンが一致していません',
            { data }
          )
          this.onError(
            'サーバーから chunkNumber が返されませんでした。' +
              'KoeNote と Whisper サーバーのバージョンが一致していません。'
          )
          return
        }

        this.pendingChunks.delete(chunkNumber)

        if (data.status === 'completed' && data.result) {
          this.onChunkTranscriptionResult({
            chunkNumber,
            text: extractText(data.result),
            segments: data.result.segments ?? [],
            timestamp: data.timestamp ?? Date.now()
          })
        } else {
          this.logger.warn('文字起こし失敗', { chunkNumber, message: data.message })
          this.onChunkTranscriptionProgress({
            chunkNumber,
            status: 'failed',
            message: data.message || 'チャンク文字起こしに失敗しました'
          })
        }
        break
      }

      case 'error':
        this.logger.error('サーバーエラー:', data.message);
        this.onError(data.message);
        break;
        
      default:
        this.logger.warn('🔗 未知のメッセージタイプ:', data.type);
    }
  }

  /**
   * MP3チャンクを文字起こしサーバーに送信
   */
  async sendChunkForTranscription(chunk: TranscriptionChunk): Promise<boolean> {
    if (!this.isConnected || !this.ws) {
      this.logger.warn('🔗 サーバーに接続されていません');
      this.onError('サーバーに接続されていません');
      return false;
    }

    try {
      // サイズ制限チェック（5MB以上は送信しない）
      if (chunk.audioData.size > 5 * 1024 * 1024) {
        this.logger.warn(`🔗 チャンク#${chunk.chunkNumber}が大きすぎます (${(chunk.audioData.size / 1024 / 1024).toFixed(1)}MB)`);
        this.onError('チャンクサイズが大きすぎます');
        return false;
      }
      
      // FileReaderを使用したBase64エンコード（より安全）
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // data:audio/mp3;base64, プレフィックスを除去
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(chunk.audioData);
      });
      
      const message = {
        type: 'transcribe_chunk',
        audio_data: base64Data,
        language: 'ja',
        chunkNumber: chunk.chunkNumber,
        timestamp: chunk.timestamp
      };
      
      // 送信済みとして記録（結果の紐付けには使わない）
      this.pendingChunks.add(chunk.chunkNumber);

      
      this.logger.debug(`🔗 チャンク#${chunk.chunkNumber}を送信 (${(chunk.audioData.size / 1024).toFixed(1)}KB)`, { chunkNumber: chunk.chunkNumber, pendingCount: this.pendingChunks.size });
      this.ws.send(JSON.stringify(message));
      
      return true;
      
    } catch (error) {
      this.logger.error('🔗 チャンク送信エラー:', error);
      this.onError('チャンクの送信に失敗しました');
      return false;
    }
  }

  /**
   * 再接続試行
   */
  private async attemptReconnect(): Promise<void> {
    this.reconnectAttempts++;
    this.logger.debug(`🔗 再接続試行 ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
    
    setTimeout(async () => {
      await this.connect();
    }, this.reconnectDelay);
  }

  /**
   * ヘルスチェック
   */
  async healthCheck(): Promise<boolean> {
    if (!this.isConnected || !this.ws) {
      return false;
    }

    try {
      this.ws.send(JSON.stringify({ type: 'health_check' }));
      return true;
    } catch (error) {
      this.logger.error('🔗 ヘルスチェックエラー:', error);
      return false;
    }
  }

  /**
   * 接続切断
   */
  disconnect(): void {
    this.logger.debug('🔗 Whisperサーバー接続を切断');
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnecting');
      this.ws = null;
    }
    
    this.isConnected = false;
    this.onConnectionChange(false);
  }

  /**
   * 接続状態取得
   */
  getConnectionStatus(): {
    connected: boolean;
    reconnectAttempts: number;
    serverUrl: string;
  } {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      serverUrl: this.serverUrl
    };
  }
}



