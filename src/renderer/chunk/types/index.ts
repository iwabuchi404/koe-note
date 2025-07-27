/**
 * チャンク生成システム用の型定義
 */

export interface AudioChunk {
  id: string
  sequenceNumber: number
  startTime: number        // 録音開始からの時間（秒）
  endTime: number
  audioData: ArrayBuffer
  sampleRate: number
  channels: number
  overlapWithPrevious: number  // 前チャンクとの重複時間
  sourceFilePath?: string  // 元のファイルパス（WebMチャンク抽出用）
}

export interface ChunkResult {
  chunkId: string
  sequenceNumber: number
  status: 'processing' | 'completed' | 'failed'
  segments: any[] // TranscriptionSegment[] の代替
  confidence: number
  processingTime: number
  error?: string
}

export interface ChunkFileInfo {
  filename: string
  fullPath: string
  sequenceNumber: number
  timestamp: number
  size: number
  isReady: boolean // ファイル書き込み完了フラグ
  startTimeSeconds?: number // 録音開始からの絶対秒数
}

export interface QueueItem {
  id: string
  chunk: AudioChunk
  priority: number
  retryCount: number
  maxRetries: number
  addedAt: number
  startedAt?: number
  completedAt?: number
  error?: string
}

export interface QueueStats {
  totalItems: number
  pendingItems: number
  processingItems: number
  completedItems: number
  failedItems: number
  averageProcessingTime: number
  totalProcessingTime: number
  queueStartTime: number
}

export interface ChunkWatcherStats {
  totalDetected: number
  totalProcessed: number
  pendingCount: number
  isWatching: boolean
}

export interface ChunkWatcherConfig {
  watchIntervalMs: number // ファイル監視間隔
  fileStabilityCheckDelay: number // ファイル安定性チェック遅延
  minFileSize: number // 最小ファイルサイズ（バイト）
  enableRealtimeTranscription: boolean // リアルタイム文字起こし有効
}

export interface ChunkProgress {
  totalChunks: number
  processedChunks: number
  failedChunks: number
  currentChunk: number
  estimatedTimeRemaining: number
  processingRate: number // チャンク/分
}

export interface ChunkSettings {
  chunkSize: number // チャンク長（秒）
  overlapSize: number // 重複時間（秒）  
  autoScroll: boolean // 自動スクロール
  maxConcurrency: number // 最大並列処理数
  enableRetry: boolean // リトライ有効
  maxRetries: number // 最大リトライ回数
}