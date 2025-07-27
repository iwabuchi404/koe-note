/**
 * 音声処理関連の共通型定義
 */

// 音声デバイス情報
export interface AudioDevice {
  deviceId: string
  kind: MediaDeviceKind
  label: string
  groupId: string
}

// 音声ストリーム設定
export interface AudioStreamConfig {
  deviceId?: string
  echoCancellation?: boolean
  noiseSuppression?: boolean
  autoGainControl?: boolean
  sampleRate?: number
  channelCount?: number
}

// 音声レベル情報
export interface AudioLevel {
  volume: number // 0.0 - 1.0
  peak: number   // 0.0 - 1.0
  timestamp: number
}

// 音声品質情報
export interface AudioQuality {
  sampleRate: number
  bitRate: number
  channels: number
  duration: number
  format: string
}

// 音声エラー情報
export interface AudioError {
  code: string
  message: string
  details?: any
  timestamp: number
}

// 音声処理状態
export enum AudioProcessingState {
  IDLE = 'idle',
  INITIALIZING = 'initializing',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  ERROR = 'error'
}

// 音声ミキシング設定
export interface MixingConfig {
  enableMicrophone: boolean
  enableDesktop: boolean
  microphoneDeviceId?: string
  desktopSourceId?: string
  microphoneGain: number // 0.0 - 1.0
  desktopGain: number    // 0.0 - 1.0
}

// 音声レベル監視結果
export interface AudioLevels {
  microphoneLevel: number
  desktopLevel: number
  mixedLevel: number
}