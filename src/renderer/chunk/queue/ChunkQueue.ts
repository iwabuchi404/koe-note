/**
 * ChunkQueue - チャンク処理キューシステム
 * チャンクの処理順序管理、並列処理の制御、エラーハンドリングを行う
 */

import { AudioChunk, ChunkResult, QueueItem, QueueStats } from '../types'
import { LoggerFactory, LogCategories } from '../../utils/LoggerFactory'

export class ChunkQueue {
  private queue: QueueItem[] = []
  private processing: Map<string, QueueItem> = new Map()
  private completed: Map<string, ChunkResult> = new Map()
  private failed: Map<string, QueueItem> = new Map()
  private maxConcurrency: number = 1
  private isProcessing: boolean = false
  private processingCallbacks: ((result: ChunkResult) => void)[] = []
  private progressCallbacks: ((stats: QueueStats) => void)[] = []
  private consecutiveErrors: number = 0
  private lastErrorTime: number = 0
  private logger = LoggerFactory.getLogger(LogCategories.TRANSCRIPTION_QUEUE)
  private stats: QueueStats

  constructor(maxConcurrency: number = 1) {
    this.maxConcurrency = maxConcurrency
    this.stats = {
      totalItems: 0,
      pendingItems: 0,
      processingItems: 0,
      completedItems: 0,
      failedItems: 0,
      averageProcessingTime: 0,
      totalProcessingTime: 0,
      queueStartTime: Date.now()
    }
    
    this.logger.info('ChunkQueue初期化完了', { maxConcurrency })
  }

  /**
   * チャンクをキューに追加
   */
  enqueue(chunk: AudioChunk, priority: number = 0, maxRetries: number = 2): void {
    const queueItem: QueueItem = {
      id: chunk.id,
      chunk,
      priority,
      retryCount: 0,
      maxRetries,
      addedAt: Date.now()
    }

    // 優先度に基づいてソート挿入
    const insertIndex = this.queue.findIndex(item => item.priority < priority)
    if (insertIndex === -1) {
      this.queue.push(queueItem)
    } else {
      this.queue.splice(insertIndex, 0, queueItem)
    }

    this.stats.totalItems++
    this.stats.pendingItems++

    this.logger.debug('チャンクがキューに追加されました', { 
      chunkId: chunk.id, 
      priority, 
      queueLength: this.queue.length 
    })

    this.notifyProgress()
    this.processNext()
  }

  /**
   * 次のチャンクを処理
   */
  private async processNext(): Promise<void> {
    if (this.processing.size >= this.maxConcurrency || this.queue.length === 0) {
      return
    }

    const queueItem = this.queue.shift()!
    this.processing.set(queueItem.id, queueItem)
    this.stats.pendingItems--
    this.stats.processingItems++

    queueItem.startedAt = Date.now()

    this.logger.debug('チャンク処理開始', { chunkId: queueItem.id })

    try {
      // チャンク処理の実行（外部から注入される処理関数を使用）
      const result = await this.processChunk(queueItem.chunk)
      
      queueItem.completedAt = Date.now()
      const processingTime = queueItem.completedAt - queueItem.startedAt!

      this.processing.delete(queueItem.id)
      this.completed.set(queueItem.id, result)
      
      this.stats.processingItems--
      this.stats.completedItems++
      this.stats.totalProcessingTime += processingTime

      this.consecutiveErrors = 0
      
      this.logger.debug('チャンク処理完了', { 
        chunkId: queueItem.id, 
        processingTime 
      })

      // 完了コールバックを呼び出し
      this.processingCallbacks.forEach(callback => callback(result))

    } catch (error) {
      this.logger.error('チャンク処理エラー', error instanceof Error ? error : new Error(String(error)), { 
        chunkId: queueItem.id, 
        retryCount: queueItem.retryCount 
      })

      await this.handleError(queueItem, error)
    }

    this.updateStats()
    this.notifyProgress()

    // 次のチャンクを処理
    this.processNext()
  }

  /**
   * エラーハンドリング
   */
  private async handleError(queueItem: QueueItem, error: any): Promise<void> {
    this.consecutiveErrors++
    this.lastErrorTime = Date.now()

    if (queueItem.retryCount < queueItem.maxRetries) {
      // リトライ
      queueItem.retryCount++
      queueItem.error = error instanceof Error ? error.message : String(error)
      
      this.processing.delete(queueItem.id)
      this.stats.processingItems--
      
      // 指数バックオフでリトライ間隔を調整
      const retryDelay = Math.min(1000 * Math.pow(2, queueItem.retryCount), 10000)
      
      setTimeout(() => {
        this.queue.unshift(queueItem) // 先頭に再挿入
        this.stats.pendingItems++
        this.processNext()
      }, retryDelay)

      this.logger.info('チャンク処理をリトライします', { 
        chunkId: queueItem.id,
        retryCount: queueItem.retryCount,
        retryDelay 
      })
    } else {
      // 失敗として記録
      queueItem.error = error instanceof Error ? error.message : String(error)
      this.processing.delete(queueItem.id)
      this.failed.set(queueItem.id, queueItem)
      
      this.stats.processingItems--
      this.stats.failedItems++

      this.logger.error('チャンク処理が最大リトライ回数に達しました', error instanceof Error ? error : new Error(String(error)), { 
        chunkId: queueItem.id,
        maxRetries: queueItem.maxRetries
      })
    }
  }

  /**
   * チャンク処理関数（外部から注入される）
   */
  private processChunk: (chunk: AudioChunk) => Promise<ChunkResult> = async () => {
    throw new Error('チャンク処理関数が設定されていません')
  }

  /**
   * チャンク処理関数を設定
   */
  setChunkProcessor(processor: (chunk: AudioChunk) => Promise<ChunkResult>): void {
    this.processChunk = processor
  }

  /**
   * 統計情報を更新
   */
  private updateStats(): void {
    if (this.stats.completedItems > 0) {
      this.stats.averageProcessingTime = this.stats.totalProcessingTime / this.stats.completedItems
    }
  }

  /**
   * 進捗通知
   */
  private notifyProgress(): void {
    this.progressCallbacks.forEach(callback => callback(this.stats))
  }

  /**
   * 処理完了コールバックを追加
   */
  onChunkProcessed(callback: (result: ChunkResult) => void): void {
    this.processingCallbacks.push(callback)
  }

  /**
   * 進捗コールバックを追加
   */
  onProgress(callback: (stats: QueueStats) => void): void {
    this.progressCallbacks.push(callback)
  }

  /**
   * キューの状態を取得
   */
  getStats(): QueueStats {
    return { ...this.stats }
  }

  /**
   * 完了したチャンクを取得
   */
  getCompletedChunks(): ChunkResult[] {
    return Array.from(this.completed.values())
  }

  /**
   * 失敗したチャンクを取得
   */
  getFailedChunks(): QueueItem[] {
    return Array.from(this.failed.values())
  }

  /**
   * キューをクリア
   */
  clear(): void {
    this.queue.length = 0
    this.processing.clear()
    this.completed.clear()
    this.failed.clear()
    
    this.stats = {
      totalItems: 0,
      pendingItems: 0,
      processingItems: 0,
      completedItems: 0,
      failedItems: 0,
      averageProcessingTime: 0,
      totalProcessingTime: 0,
      queueStartTime: Date.now()
    }

    this.logger.info('キューがクリアされました')
  }

  /**
   * 処理中のキューを停止
   */
  stop(): void {
    this.isProcessing = false
    this.logger.info('キューが停止されました')
  }
}

export default ChunkQueue