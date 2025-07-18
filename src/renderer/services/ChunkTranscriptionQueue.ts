/**
 * ChunkTranscriptionQueue - チャンク分割文字起こしの処理キューシステム
 * 
 * チャンクの処理順序管理、並列処理の制御、エラーハンドリングを行う
 * 複数の処理を効率的に管理し、システムリソースを最適化する
 */

import { AudioChunk, ChunkResult } from './ChunkTranscriptionManager';
import { TranscriptionSegment } from '../../preload/preload';

export interface QueueItem {
  id: string;
  chunk: AudioChunk;
  priority: number;
  retryCount: number;
  maxRetries: number;
  addedAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export interface QueueStats {
  totalItems: number;
  pendingItems: number;
  processingItems: number;
  completedItems: number;
  failedItems: number;
  averageProcessingTime: number;
  totalProcessingTime: number;
  queueStartTime: number;
}

export class ChunkTranscriptionQueue {
  private queue: QueueItem[] = [];
  private processing: Map<string, QueueItem> = new Map();
  private completed: Map<string, ChunkResult> = new Map();
  private failed: Map<string, QueueItem> = new Map();
  private maxConcurrency: number = 2;
  private stats: QueueStats;
  private isProcessing: boolean = false;
  private processingCallbacks: ((result: ChunkResult) => void)[] = [];
  private progressCallbacks: ((stats: QueueStats) => void)[] = [];

  constructor(maxConcurrency: number = 2) {
    this.maxConcurrency = maxConcurrency;
    this.stats = {
      totalItems: 0,
      pendingItems: 0,
      processingItems: 0,
      completedItems: 0,
      failedItems: 0,
      averageProcessingTime: 0,
      totalProcessingTime: 0,
      queueStartTime: 0
    };
  }

  /**
   * チャンクをキューに追加
   */
  enqueue(chunk: AudioChunk, priority: number = 0): void {
    const queueItem: QueueItem = {
      id: chunk.id,
      chunk,
      priority,
      retryCount: 0,
      maxRetries: 3,
      addedAt: Date.now()
    };

    // 優先度順で挿入
    const insertIndex = this.queue.findIndex(item => item.priority < priority);
    if (insertIndex === -1) {
      this.queue.push(queueItem);
    } else {
      this.queue.splice(insertIndex, 0, queueItem);
    }

    this.stats.totalItems++;
    this.stats.pendingItems++;
    this.updateStats();

    console.log(`チャンクをキューに追加: ${chunk.id} (優先度: ${priority})`);
  }

  /**
   * 処理開始
   */
  async startProcessing(): Promise<void> {
    if (this.isProcessing) {
      console.warn('既に処理中です');
      return;
    }

    this.isProcessing = true;
    this.stats.queueStartTime = Date.now();
    console.log('チャンクキュー処理開始');

    // 並列処理を開始
    const processingPromises: Promise<void>[] = [];
    for (let i = 0; i < this.maxConcurrency; i++) {
      processingPromises.push(this.processNext());
    }

    await Promise.all(processingPromises);
    this.isProcessing = false;
    console.log('チャンクキュー処理完了');
  }

  /**
   * 次のチャンクを処理
   */
  private async processNext(): Promise<void> {
    while (this.isProcessing && this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) continue;

      this.stats.pendingItems--;
      this.stats.processingItems++;
      this.processing.set(item.id, item);
      item.startedAt = Date.now();

      try {
        console.log(`チャンク処理開始: ${item.id} (${item.retryCount + 1}/${item.maxRetries + 1}回目)`);
        
        const result = await this.processChunk(item.chunk);
        
        // 成功時の処理
        item.completedAt = Date.now();
        const processingTime = item.completedAt - item.startedAt!;
        
        this.processing.delete(item.id);
        this.completed.set(item.id, result);
        
        this.stats.processingItems--;
        this.stats.completedItems++;
        this.stats.totalProcessingTime += processingTime;
        this.stats.averageProcessingTime = this.stats.totalProcessingTime / this.stats.completedItems;
        
        // コールバック実行
        this.processingCallbacks.forEach(callback => callback(result));
        
        console.log(`チャンク処理完了: ${item.id} (処理時間: ${processingTime}ms)`);
        
      } catch (error) {
        console.error(`チャンク処理エラー: ${item.id}`, error);
        
        // リトライ処理
        if (item.retryCount < item.maxRetries) {
          item.retryCount++;
          item.error = String(error);
          this.processing.delete(item.id);
          
          // 優先度を下げて再キューイング
          item.priority = Math.max(item.priority - 1, 0);
          this.queue.push(item);
          
          this.stats.processingItems--;
          this.stats.pendingItems++;
          
          console.log(`チャンクを再キューイング: ${item.id} (リトライ: ${item.retryCount}/${item.maxRetries})`);
          
        } else {
          // 最大リトライ回数に達した場合は失敗として処理
          item.error = String(error);
          this.processing.delete(item.id);
          this.failed.set(item.id, item);
          
          this.stats.processingItems--;
          this.stats.failedItems++;
          
          console.error(`チャンク処理最終失敗: ${item.id}`);
          
          // 失敗したチャンクの結果を作成
          const failedResult: ChunkResult = {
            chunkId: item.chunk.id,
            sequenceNumber: item.chunk.sequenceNumber,
            status: 'failed',
            segments: [],
            confidence: 0,
            processingTime: 0,
            error: String(error)
          };
          
          this.processingCallbacks.forEach(callback => callback(failedResult));
        }
      }
      
      this.updateStats();
    }
  }

  /**
   * 個別チャンクの処理
   */
  private async processChunk(chunk: AudioChunk): Promise<ChunkResult> {
    // 録音中チャンクの場合はリアルタイム文字起こしを実行
    if (chunk.id.startsWith('pending_chunk_') || 
        chunk.id.startsWith('recording_live_chunk_') ||
        chunk.id.startsWith('safe_recording_chunk_') ||
        chunk.id.startsWith('safe_minimal_chunk_') ||
        chunk.id.startsWith('live_real_chunk_') ||
        chunk.id.startsWith('recording_')) {
      console.log(`🎆 録音中チャンク ${chunk.id} を処理中 - リアルタイム文字起こしを実行`);
      
      try {
        // 録音中チャンクでも実際の文字起こしを実行
        const tempFilePath = await this.createTempAudioFile(chunk);
        
        try {
          console.log(`📝 録音中チャンク ${chunk.id} の文字起こしを開始`);
          
          // 実際のWhisper APIで文字起こし実行
          const result = await window.electronAPI.speechTranscribe(tempFilePath);
          
          console.log(`📝 録音中チャンク ${chunk.id} の文字起こし完了:`, {
            segments: result.segments.length,
            duration: result.duration,
            language: result.language
          });
          
          // 結果を ChunkResult 形式に変換
          const chunkResult: ChunkResult = {
            chunkId: chunk.id,
            sequenceNumber: chunk.sequenceNumber,
            status: 'completed',
            segments: result.segments.map(segment => ({
              ...segment,
              start: segment.start + chunk.startTime,  // 全体の時間軸に調整
              end: segment.end + chunk.startTime
            })),
            confidence: result.segments.length > 0 ? 0.8 : 0,
            processingTime: 0  // 呼び出し元で設定
          };

          return chunkResult;
          
        } finally {
          // 一時ファイルを削除
          try {
            await window.electronAPI.deleteFile(tempFilePath);
          } catch (error) {
            console.warn('録音中チャンクの一時ファイル削除エラー:', error);
          }
        }
        
      } catch (error) {
        console.error(`🚨 録音中チャンク ${chunk.id} の文字起こしエラー:`, error);
        
        // エラーの場合はフォールバック結果を返す
        const fallbackResult: ChunkResult = {
          chunkId: chunk.id,
          sequenceNumber: chunk.sequenceNumber,
          status: 'completed',
          segments: [{
            start: chunk.startTime,
            end: chunk.endTime,
            text: `[録音中チャンク ${chunk.sequenceNumber + 1}: ${chunk.startTime.toFixed(1)}秒-${chunk.endTime.toFixed(1)}秒] 文字起こし処理中にエラーが発生しました。`
          }],
          confidence: 0.0,
          processingTime: 1000,
          error: String(error)
        };
        
        console.log(`🎆 録音中チャンク ${chunk.id} のエラー処理完了 - フォールバック結果を返しました`);
        return fallbackResult;
      }
    }
    
    // 通常のチャンク処理
    const tempFilePath = await this.createTempAudioFile(chunk);
    
    try {
      // Electron API経由で文字起こし実行
      const result = await window.electronAPI.speechTranscribe(tempFilePath);
      
      // 結果を ChunkResult 形式に変換
      const chunkResult: ChunkResult = {
        chunkId: chunk.id,
        sequenceNumber: chunk.sequenceNumber,
        status: 'completed',
        segments: result.segments.map(segment => ({
          ...segment,
          start: segment.start + chunk.startTime,  // 全体の時間軸に調整
          end: segment.end + chunk.startTime
        })),
        confidence: result.segments.length > 0 ? 0.8 : 0,
        processingTime: 0  // 呼び出し元で設定
      };

      return chunkResult;
      
    } finally {
      // 一時ファイルを削除
      try {
        await window.electronAPI.deleteFile(tempFilePath);
      } catch (error) {
        console.warn('一時ファイル削除エラー:', error);
      }
    }
  }

  /**
   * チャンク用の一時音声ファイルを作成
   */
  private async createTempAudioFile(chunk: AudioChunk): Promise<string> {
    const tempFileName = `chunk_${chunk.id}_${Date.now()}.wav`;
    
    // AudioChunkProcessor の createWavBuffer を使用
    const { AudioChunkProcessor } = await import('./AudioChunkProcessor');
    const processor = new AudioChunkProcessor();
    const wavBuffer = processor.createWavBuffer(chunk);
    
    return await window.electronAPI.saveFile(wavBuffer, tempFileName);
  }

  /**
   * 統計情報を更新
   */
  private updateStats(): void {
    this.progressCallbacks.forEach(callback => callback(this.stats));
  }

  /**
   * 処理停止
   */
  stop(): void {
    this.isProcessing = false;
    console.log('チャンクキュー処理停止');
  }

  /**
   * 完了した結果を取得
   */
  getCompletedResults(): Map<string, ChunkResult> {
    return new Map(this.completed);
  }

  /**
   * 失敗したアイテムを取得
   */
  getFailedItems(): Map<string, QueueItem> {
    return new Map(this.failed);
  }

  /**
   * 統計情報を取得
   */
  getStats(): QueueStats {
    return { ...this.stats };
  }

  /**
   * 処理完了コールバックを追加
   */
  onProcessingComplete(callback: (result: ChunkResult) => void): void {
    this.processingCallbacks.push(callback);
  }

  /**
   * 進捗コールバックを追加
   */
  onProgress(callback: (stats: QueueStats) => void): void {
    this.progressCallbacks.push(callback);
  }

  /**
   * コールバックをクリア
   */
  clearCallbacks(): void {
    this.processingCallbacks = [];
    this.progressCallbacks = [];
  }

  /**
   * キューをクリア
   */
  clear(): void {
    this.queue = [];
    this.processing.clear();
    this.completed.clear();
    this.failed.clear();
    this.stats = {
      totalItems: 0,
      pendingItems: 0,
      processingItems: 0,
      completedItems: 0,
      failedItems: 0,
      averageProcessingTime: 0,
      totalProcessingTime: 0,
      queueStartTime: 0
    };
  }
}