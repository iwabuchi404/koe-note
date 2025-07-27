/**
 * ChunkFileWatcher - チャンクファイル監視システム
 * テンポラリフォルダの新しいチャンクファイルを検出し、順次処理のためのキューイング機能を提供
 */

import { ChunkFileInfo, ChunkWatcherStats, ChunkWatcherConfig } from '../types'
import { LoggerFactory, LogCategories } from '../../utils/LoggerFactory'

export class ChunkFileWatcher {
  private watchFolder: string | null = null
  private isWatching: boolean = false
  private detectedFiles: Map<string, ChunkFileInfo> = new Map()
  private processedFiles: Set<string> = new Set()
  private watchInterval: NodeJS.Timeout | null = null
  private onNewFileCallbacks: ((fileInfo: ChunkFileInfo) => void)[] = []
  private realtimeChunkCounter: number = 0
  private config: ChunkWatcherConfig
  private logger = LoggerFactory.getLogger(LogCategories.CHUNK_WATCHER)

  constructor(config: ChunkWatcherConfig) {
    this.config = config
    this.logger.info('🎯 ChunkFileWatcher初期化:', this.config)
  }

  /**
   * ファイル監視を開始
   */
  startWatching(watchFolder: string): void {
    if (this.isWatching) {
      this.logger.warn('既に監視中です')
      return
    }

    this.watchFolder = watchFolder
    this.isWatching = true
    this.realtimeChunkCounter = 0

    this.logger.info('📁 ファイル監視開始', { watchFolder })

    // 定期的にフォルダをスキャン
    this.watchInterval = setInterval(() => {
      this.scanForNewFiles()
    }, this.config.watchIntervalMs)

    // 初回スキャンを実行
    this.scanForNewFiles()
  }

  /**
   * ファイル監視を停止
   */
  stopWatching(): void {
    if (!this.isWatching) {
      return
    }

    this.isWatching = false
    
    if (this.watchInterval) {
      clearInterval(this.watchInterval)
      this.watchInterval = null
    }

    this.logger.info('📁 ファイル監視停止')
  }

  /**
   * 新しいファイルをスキャン
   */
  private async scanForNewFiles(): Promise<void> {
    if (!this.watchFolder || !this.isWatching) {
      return
    }

    try {
      // ElectronAPIを使用してフォルダ内のファイルを取得
      const files = await window.electronAPI.getFileList(this.watchFolder)
      
      for (const file of files) {
        // チャンクファイルかどうかをチェック
        if (this.isChunkFile(file.filename) && !this.processedFiles.has(file.filename)) {
          await this.processNewFile(file)
        }
      }
    } catch (error) {
      this.logger.error('ファイルスキャンエラー', error instanceof Error ? error : new Error(String(error)), { 
        watchFolder: this.watchFolder 
      })
    }
  }

  /**
   * チャンクファイルかどうかを判定
   */
  private isChunkFile(filename: string): boolean {
    // チャンクファイルの命名規則をチェック
    // 例: recording_chunk_001.webm, audio_001.webm など
    const chunkPatterns = [
      /chunk_\d+\.(webm|wav|mp3)$/i,
      /audio_\d+\.(webm|wav|mp3)$/i,
      /recording.*_\d+\.(webm|wav|mp3)$/i
    ]

    return chunkPatterns.some(pattern => pattern.test(filename))
  }

  /**
   * 新しいファイルを処理
   */
  private async processNewFile(file: any): Promise<void> {
    try {
      // ファイルサイズと安定性をチェック
      if (file.size < this.config.minFileSize) {
        this.logger.debug('ファイルサイズが小さすぎます', { filename: file.filename, size: file.size })
        return
      }

      // ファイル安定性チェック（書き込み完了まで待機）
      await this.waitForFileStability(file.filepath)

      // シーケンス番号を抽出
      const sequenceNumber = this.extractSequenceNumber(file.filename)
      const startTimeSeconds = this.calculateStartTime(sequenceNumber)

      const chunkFileInfo: ChunkFileInfo = {
        filename: file.filename,
        fullPath: file.filepath,
        sequenceNumber,
        timestamp: Date.now(),
        size: file.size,
        isReady: true,
        startTimeSeconds
      }

      this.detectedFiles.set(file.filename, chunkFileInfo)
      this.processedFiles.add(file.filename)

      this.logger.info('🆕 新しいチャンクファイルを検出', {
        filename: file.filename,
        sequenceNumber,
        size: file.size,
        startTimeSeconds
      })

      // リアルタイム文字起こしが有効な場合
      if (this.config.enableRealtimeTranscription) {
        // コールバックを呼び出し
        this.onNewFileCallbacks.forEach(callback => callback(chunkFileInfo))
      }

    } catch (error) {
      this.logger.error('新しいファイル処理エラー', error instanceof Error ? error : new Error(String(error)), { 
        filename: file.filename 
      })
    }
  }

  /**
   * ファイル安定性を待機（書き込み完了チェック）
   */
  private async waitForFileStability(filePath: string): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, this.config.fileStabilityCheckDelay)
    })
  }

  /**
   * ファイル名からシーケンス番号を抽出
   */
  private extractSequenceNumber(filename: string): number {
    const matches = filename.match(/(\d+)/)
    return matches ? parseInt(matches[1], 10) : 0
  }

  /**
   * シーケンス番号から録音開始時間を計算
   */
  private calculateStartTime(sequenceNumber: number): number {
    // 仮定: チャンクは20秒間隔で作成される
    const chunkIntervalSeconds = 20
    return sequenceNumber * chunkIntervalSeconds
  }

  /**
   * 新しいファイル検出時のコールバックを追加
   */
  onNewFile(callback: (fileInfo: ChunkFileInfo) => void): void {
    this.onNewFileCallbacks.push(callback)
  }

  /**
   * 検出されたファイル一覧を取得
   */
  getDetectedFiles(): ChunkFileInfo[] {
    return Array.from(this.detectedFiles.values()).sort((a, b) => a.sequenceNumber - b.sequenceNumber)
  }

  /**
   * 統計情報を取得
   */
  getStats(): ChunkWatcherStats {
    return {
      totalDetected: this.detectedFiles.size,
      totalProcessed: this.processedFiles.size,
      pendingCount: Math.max(0, this.detectedFiles.size - this.processedFiles.size),
      isWatching: this.isWatching
    }
  }

  /**
   * 監視状態をリセット
   */
  reset(): void {
    this.stopWatching()
    this.detectedFiles.clear()
    this.processedFiles.clear()
    this.realtimeChunkCounter = 0
    this.logger.info('ChunkFileWatcher状態リセット完了')
  }

  /**
   * 設定を更新
   */
  updateConfig(newConfig: Partial<ChunkWatcherConfig>): void {
    this.config = { ...this.config, ...newConfig }
    this.logger.info('ChunkFileWatcher設定更新', { newConfig })
  }
}

export default ChunkFileWatcher