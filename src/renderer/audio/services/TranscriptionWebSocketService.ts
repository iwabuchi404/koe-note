/**
 * TranscriptionWebSocketService
 * 
 * AudioWorkletで生成されたMP3チャンクをWhisperサーバーに送信し、
 * リアルタイム文字起こし結果を受信するWebSocketサービス
 */

import { LoggerFactory, LogCategories } from '../../utils/LoggerFactory'
import type {
  ChunkTranscriptionResult,
  ChunkTranscriptionProgress,
  TranscriptionChunk
} from '@shared/types'

// チャンク・結果・進捗の型は @shared/types を正とする。
// サーバー応答の TranscriptionResult との名前衝突を避けるため
// ChunkTranscription* という名前にしている。
export type { ChunkTranscriptionResult, ChunkTranscriptionProgress, TranscriptionChunk }

export class TranscriptionWebSocketService {
  private ws: WebSocket | null = null;
  private serverUrl: string;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 2000; // 2秒
  private pendingChunks: Map<string, number> = new Map(); // timestamp -> chunkNumber のマッピング
  private lastSentChunkNumber: number = 0; // 最後に送信したチャンク番号（フォールバック用）
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
          this.handleServerMessage(data);
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
   */
  private handleServerMessage(data: any): void {
    this.logger.info('サーバーメッセージ受信', { type: data.type });
    
    switch (data.type) {
      case 'connection':
        this.logger.info('接続確認メッセージ', { message: data.message });
        break;
        
      case 'chunk_progress':
        // チャンク処理進捗
        let progressChunkNumber = data.chunkNumber || 0;
        
        // 進捗でもchunkNumber=0の場合は推定（ただし削除はしない）
        if (progressChunkNumber === 0 && this.pendingChunks.size > 0) {
          const oldestEntry = Array.from(this.pendingChunks.entries())
            .sort(([timestampA], [timestampB]) => parseInt(timestampA) - parseInt(timestampB))[0];
          
          if (oldestEntry) {
            progressChunkNumber = oldestEntry[1];
            this.logger.info('進捗: 最古のチャンク番号を推定', { chunkNumber: progressChunkNumber, status: data.status });
          }
        }
        
        this.onChunkTranscriptionProgress({
          chunkNumber: progressChunkNumber,
          status: data.status,
          message: data.message
        });
        break;
        
      case 'chunk_result':
        // チャンク文字起こし結果
        this.logger.info('文字起こし結果受信', { text: data.result?.text || '(空文字)', serverData: data });
        
        if (data.status === 'completed' && data.result) {
          // segmentsからtextを生成（サーバーがtextを返さない場合の対策）
          let resultText = data.result.text || '';
          if (!resultText && data.result.segments && data.result.segments.length > 0) {
            resultText = data.result.segments
              .map((segment: any) => segment.text)
              .filter((text: string) => text && text.trim())
              .join(' ')
              .trim();
          }
          
          // chunkNumberを特定（timestampベースのフォールバック）
          let chunkNumber = data.chunkNumber || 0;
          
          // サーバーがchunkNumber=0を返す場合、pendingChunksから最も古いものを取得
          if (chunkNumber === 0) {
            this.logger.info('chunkNumber=0のため、pendingChunksから推定', { pendingChunks: Array.from(this.pendingChunks.entries()) });
            
            if (this.pendingChunks.size > 0) {
              // 最も古いタイムスタンプ（最初に送信されたチャンク）を取得
              const oldestEntry = Array.from(this.pendingChunks.entries())
                .sort(([timestampA], [timestampB]) => parseInt(timestampA) - parseInt(timestampB))[0];
              
              if (oldestEntry) {
                chunkNumber = oldestEntry[1];
                this.pendingChunks.delete(oldestEntry[0]);
                this.logger.info('最古のチャンク番号を使用', { chunkNumber, timestamp: oldestEntry[0] });
              } else {
                // フォールバックとして最後に送信したチャンク番号を使用
                chunkNumber = this.lastSentChunkNumber;
                this.logger.info('フォールバック: 最後のチャンク番号を使用', { chunkNumber });
              }
            }
          } else if (data.timestamp) {
            // chunkNumberが正常に返された場合、対応するタイムスタンプを削除
            const mappedChunkNumber = this.pendingChunks.get(data.timestamp.toString());
            if (mappedChunkNumber !== undefined) {
              this.pendingChunks.delete(data.timestamp.toString());
            }
          }
          
          const result: ChunkTranscriptionResult = {
            chunkNumber,
            text: resultText,
            segments: data.result.segments || [],
            timestamp: Date.now()
          };
          this.logger.debug('🔗 変換後の結果:', result);
          this.onChunkTranscriptionResult(result);
        } else {
          this.logger.debug('🔗 文字起こし失敗:', data);
          this.onChunkTranscriptionProgress({
            chunkNumber: data.chunkNumber || 0,
            status: 'failed',
            message: data.message || 'チャンク文字起こしに失敗しました'
          });
        }
        break;
        
      case 'error':
        this.logger.error('🔗 サーバーエラー:', data.message);
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
      
      // chunkNumberとtimestampのマッピングを保存
      this.pendingChunks.set(chunk.timestamp.toString(), chunk.chunkNumber);
      this.lastSentChunkNumber = chunk.chunkNumber; // 最後に送信したチャンク番号を記録
      
      this.logger.debug(`🔗 チャンク#${chunk.chunkNumber}を送信 (${(chunk.audioData.size / 1024).toFixed(1)}KB)`, { chunkNumber: chunk.chunkNumber, timestamp: chunk.timestamp, pendingChunks: this.pendingChunks.size });
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