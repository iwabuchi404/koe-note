/**
 * ChunkManager - チャンク生成システムの統合管理クラス
 * チャンク処理、キューイング、ファイル監視を統合管理
 */

import { ChunkProcessor } from '../core/ChunkProcessor'
import { ChunkQueue } from '../queue/ChunkQueue'
import { ChunkFileWatcher } from '../watcher/ChunkFileWatcher'
import { 
  AudioChunk, 
  ChunkResult, 
  ChunkSettings, 
  ChunkProgress, 
  ChunkWatcherConfig,
  QueueStats
} from '../types'
import { LoggerFactory, LogCategories } from '../../utils/LoggerFactory'

export interface ChunkManagerConfig {
  chunkSettings: ChunkSettings
  watcherConfig: ChunkWatcherConfig
}

export class ChunkManager {
  private chunkProcessor: ChunkProcessor
  private chunkQueue: ChunkQueue
  private fileWatcher: ChunkFileWatcher
  private logger = LoggerFactory.getLogger(LogCategories.CHUNK_MANAGER)
  
  private isInitialized: boolean = false
  private currentAudioFile: string | null = null
  private progressCallbacks: ((progress: ChunkProgress) => void)[] = []
  private completionCallbacks: ((results: ChunkResult[]) => void)[] = []
  private realtimeMode: boolean = false

  constructor(config: ChunkManagerConfig) {
    this.chunkProcessor = new ChunkProcessor(config.chunkSettings)
    this.chunkQueue = new ChunkQueue(config.chunkSettings.maxConcurrency)
    this.fileWatcher = new ChunkFileWatcher(config.watcherConfig)

    this.setupEventHandlers()
    this.isInitialized = true
    
    this.logger.info('ChunkManager初期化完了', { config })
  }

  /**
   * イベントハンドラーをセットアップ
   */
  private setupEventHandlers(): void {
    // チャンク処理関数を設定
    this.chunkQueue.setChunkProcessor(async (chunk: AudioChunk) => {
      return await this.chunkProcessor.processChunk(chunk)
    })

    // キューの進捗監視
    this.chunkQueue.onProgress((stats: QueueStats) => {
      this.notifyProgress(stats)
    })

    // チャンク完了時の処理
    this.chunkQueue.onChunkProcessed((result: ChunkResult) => {
      this.logger.info('チャンク処理完了通知', { 
        chunkId: result.chunkId, 
        status: result.status 
      })
    })

    // ファイル監視での新しいチャンク検出
    this.fileWatcher.onNewFile((fileInfo) => {
      if (this.realtimeMode) {
        this.processRealtimeChunk(fileInfo)
      }
    })
  }

  /**
   * 音声ファイル全体をチャンク分割処理
   */
  async processAudioFile(audioFilePath: string): Promise<ChunkResult[]> {
    try {
      this.currentAudioFile = audioFilePath
      this.logger.info('音声ファイルのチャンク処理開始', { audioFilePath })

      // チャンクに分割
      const chunks = await this.chunkProcessor.splitIntoChunks(audioFilePath)
      
      // 各チャンクをキューに追加
      chunks.forEach((chunk, index) => {
        const priority = chunks.length - index // 先頭のチャンクほど高優先度
        this.chunkQueue.enqueue(chunk, priority)
      })

      // 全チャンクの処理完了を待機
      return await this.waitForAllChunks(chunks.length)
      
    } catch (error) {
      this.logger.error('音声ファイル処理エラー', error instanceof Error ? error : new Error(String(error)), { 
        audioFilePath 
      })
      throw error
    }
  }

  /**
   * リアルタイムチャンク処理モードを開始
   */
  startRealtimeMode(watchFolder: string): void {
    if (this.realtimeMode) {
      this.logger.warn('既にリアルタイムモード中です')
      return
    }

    this.realtimeMode = true
    this.fileWatcher.startWatching(watchFolder)
    
    this.logger.info('リアルタイムチャンク処理開始', { watchFolder })
  }

  /**
   * リアルタイムチャンク処理モードを停止
   */
  stopRealtimeMode(): void {
    if (!this.realtimeMode) {
      return
    }

    this.realtimeMode = false
    this.fileWatcher.stopWatching()
    
    this.logger.info('リアルタイムチャンク処理停止')
  }

  /**
   * リアルタイムで検出されたチャンクを処理
   */
  private async processRealtimeChunk(fileInfo: any): Promise<void> {
    try {
      // ファイル情報からAudioChunkを作成
      const chunk: AudioChunk = {
        id: `realtime_${fileInfo.sequenceNumber}_${Date.now()}`,
        sequenceNumber: fileInfo.sequenceNumber,
        startTime: fileInfo.startTimeSeconds || 0,
        endTime: (fileInfo.startTimeSeconds || 0) + 20, // 仮定: 20秒チャンク
        audioData: new ArrayBuffer(0), // 実際のデータは処理時に読み込み
        sampleRate: 44100, // デフォルト値
        channels: 2, // デフォルト値
        overlapWithPrevious: 0,
        sourceFilePath: fileInfo.fullPath
      }

      // 高優先度でキューに追加
      this.chunkQueue.enqueue(chunk, 100)
      
      this.logger.info('リアルタイムチャンクをキューに追加', { 
        chunkId: chunk.id,
        sequenceNumber: chunk.sequenceNumber 
      })
      
    } catch (error) {
      this.logger.error('リアルタイムチャンク処理エラー', error instanceof Error ? error : new Error(String(error)), { 
        fileInfo 
      })
    }
  }

  /**
   * 全チャンクの処理完了を待機
   */
  private async waitForAllChunks(totalChunks: number): Promise<ChunkResult[]> {
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const stats = this.chunkQueue.getStats()
        const completedChunks = this.chunkQueue.getCompletedChunks()
        
        // 全チャンクが完了または失敗した場合
        if (stats.completedItems + stats.failedItems >= totalChunks) {
          clearInterval(checkInterval)
          
          if (stats.failedItems > 0) {
            this.logger.warn('一部のチャンク処理が失敗しました', { 
              completed: stats.completedItems,
              failed: stats.failedItems 
            })
          }
          
          resolve(completedChunks)
        }
      }, 500)

      // タイムアウト処理
      setTimeout(() => {
        clearInterval(checkInterval)
        reject(new Error('チャンク処理がタイムアウトしました'))
      }, 600000) // 10分でタイムアウト
    })
  }

  /**
   * 進捗状況を通知
   */
  private notifyProgress(queueStats: QueueStats): void {
    const progress: ChunkProgress = {
      totalChunks: queueStats.totalItems,
      processedChunks: queueStats.completedItems,
      failedChunks: queueStats.failedItems,
      currentChunk: queueStats.processingItems,
      estimatedTimeRemaining: this.calculateEstimatedTime(queueStats),
      processingRate: this.calculateProcessingRate(queueStats)
    }

    this.progressCallbacks.forEach(callback => callback(progress))
  }

  /**
   * 推定残り時間を計算
   */
  private calculateEstimatedTime(stats: QueueStats): number {
    if (stats.averageProcessingTime === 0 || stats.pendingItems === 0) {
      return 0
    }
    
    return (stats.pendingItems * stats.averageProcessingTime) / 1000 // 秒単位
  }

  /**
   * 処理速度を計算
   */
  private calculateProcessingRate(stats: QueueStats): number {
    const elapsedTime = (Date.now() - stats.queueStartTime) / 1000 / 60 // 分単位
    if (elapsedTime === 0 || stats.completedItems === 0) {
      return 0
    }
    
    return stats.completedItems / elapsedTime // チャンク/分
  }

  /**
   * 処理完了チャンクを取得
   */
  getCompletedChunks(): ChunkResult[] {
    return this.chunkQueue.getCompletedChunks()
  }

  /**
   * 統計情報を取得
   */
  getStats(): { queue: QueueStats, watcher: any } {
    return {
      queue: this.chunkQueue.getStats(),
      watcher: this.fileWatcher.getStats()
    }
  }

  /**
   * 進捗コールバックを追加
   */
  onProgress(callback: (progress: ChunkProgress) => void): void {
    this.progressCallbacks.push(callback)
  }

  /**
   * 完了コールバックを追加
   */
  onCompletion(callback: (results: ChunkResult[]) => void): void {
    this.completionCallbacks.push(callback)
  }

  /**
   * 処理をリセット
   */
  reset(): void {
    this.chunkQueue.clear()
    this.chunkProcessor.reset()
    this.fileWatcher.reset()
    this.currentAudioFile = null
    this.realtimeMode = false
    
    this.logger.info('ChunkManager状態リセット完了')
  }

  /**
   * 設定を更新
   */
  updateConfig(config: Partial<ChunkManagerConfig>): void {
    if (config.chunkSettings) {
      this.chunkProcessor.updateSettings(config.chunkSettings)
    }
    
    if (config.watcherConfig) {
      this.fileWatcher.updateConfig(config.watcherConfig)
    }
    
    this.logger.info('ChunkManager設定更新', { config })
  }

  /**
   * リソースをクリーンアップ
   */
  cleanup(): void {
    this.stopRealtimeMode()
    this.reset()
    this.logger.info('ChunkManager クリーンアップ完了')
  }
}

export default ChunkManager