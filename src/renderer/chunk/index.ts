/**
 * チャンク生成システム - エクスポートインデックス
 */

// Core components
export { ChunkProcessor } from './core/ChunkProcessor'
export { ChunkQueue } from './queue/ChunkQueue' 
export { ChunkFileWatcher } from './watcher/ChunkFileWatcher'
export { ChunkManager } from './manager/ChunkManager'

// Types
export * from './types'

// Default configurations
export const DEFAULT_CHUNK_SETTINGS = {
  chunkSize: 20, // 20秒
  overlapSize: 2, // 2秒重複
  autoScroll: true,
  maxConcurrency: 1, // 順次処理
  enableRetry: true,
  maxRetries: 2
}

export const DEFAULT_WATCHER_CONFIG = {
  watchIntervalMs: 1000, // 1秒間隔
  fileStabilityCheckDelay: 500, // 0.5秒待機
  minFileSize: 1000, // 1KB最小サイズ
  enableRealtimeTranscription: true
}