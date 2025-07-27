/**
 * 録音関連の型定義
 */

// 録音状態
export enum RecordingState {
  IDLE = 'idle',
  STARTING = 'starting',
  RECORDING = 'recording',
  PAUSED = 'paused',
  STOPPING = 'stopping',
  STOPPED = 'stopped',
  ERROR = 'error'
}

// 録音設定
export interface RecordingConfig {
  deviceId?: string
  mimeType?: string
  audioBitsPerSecond?: number
  videoBitsPerSecond?: number
  timeslice?: number
  echoCancellation?: boolean
  noiseSuppression?: boolean
  autoGainControl?: boolean
}

// 録音情報
export interface RecordingInfo {
  state: RecordingState
  startTime: number | null
  currentTime: number
  duration: number
  fileName: string | null
  filePath: string | null
  fileSize: number
  config: RecordingConfig
}

// 録音データ
export interface RecordingData {
  blob: Blob
  timestamp: number
  duration: number
  size: number
}

// 録音統計
export interface RecordingStats {
  totalDuration: number
  averageLevel: number
  peakLevel: number
  silenceDuration: number
  recordingCount: number
}

// 録音イベント
export interface RecordingEvent {
  type: 'start' | 'stop' | 'pause' | 'resume' | 'data' | 'error'
  timestamp: number
  data?: any
  error?: Error
}

// 録音コールバック
export interface RecordingCallbacks {
  onRecordingStart?: () => void
  onRecordingStopped?: (data: RecordingData) => void
  onRecordingPaused?: () => void
  onRecordingResumed?: () => void
  onDataAvailable?: (data: RecordingData) => void
  onError?: (error: Error) => void
  onLevelUpdate?: (level: number) => void
}