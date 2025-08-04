/**
 * 音声処理サービス公開API
 * 
 * 音声関連の全機能へのアクセスポイント
 */

// コア音声サービス
export { AudioMixingService } from './services/core/AudioMixingService'
export { MicrophoneMonitor } from './services/core/MicrophoneMonitorService'

// 音声処理サービス
export { AudioDiagnostics } from './services/processing/AudioDiagnostics'

// 音声フック
export { useAudioPlayer } from './hooks/useAudioPlayer'

// 型定義
export * from './types/audio.types'
export * from './types/recording.types'
export * from './types/processing.types'

// 便利な定数とユーティリティ
export const AUDIO_CONSTANTS = {
  DEFAULT_SAMPLE_RATE: 44100,
  DEFAULT_CHANNELS: 2,
  DEFAULT_BIT_DEPTH: 16,
  DEFAULT_CHUNK_SIZE: 10, // seconds
  DEFAULT_OVERLAP_SIZE: 2, // seconds
  SUPPORTED_FORMATS: ['webm', 'wav', 'mp3', 'mp4'],
  MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
} as const

export const AUDIO_UTILS = {
  /**
   * 音声ファイル形式の検証
   */
  isValidAudioFormat: (filename: string): boolean => {
    const extension = filename.toLowerCase().split('.').pop()
    return AUDIO_CONSTANTS.SUPPORTED_FORMATS.includes(extension as any)
  },

  /**
   * 音声レベルの正規化
   */
  normalizeAudioLevel: (level: number): number => {
    return Math.max(0, Math.min(1, level))
  },

  /**
   * 時間のフォーマット
   */
  formatDuration: (seconds: number): string => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`
  },

  /**
   * ファイルサイズのフォーマット
   */
  formatFileSize: (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
} as const