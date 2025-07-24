/**
 * RecordingState - 録音機能の状態管理型定義
 * 
 * 設計方針:
 * - 現在のBottomPanelの状態を型安全化
 * - 状態の一貫性を保証
 * - エラー状態の明確な管理
 * - UI更新のトリガー明確化
 */

// 基本的な録音状態
export type RecordingStatus = 
  | 'idle'           // 待機中
  | 'recording'      // 録音中
  | 'paused'         // 一時停止中
  | 'stopping'       // 停止処理中
  | 'error'          // エラー状態

// 入力ソースタイプ
export type InputSourceType = 
  | 'microphone'     // マイクロフォン
  | 'desktop'        // デスクトップ音声
  | 'stereo-mix'     // ステレオミックス
  | 'mixing'         // 複数ソースのミキシング

// デバイス情報
export interface AudioDeviceInfo {
  deviceId: string
  label: string
  kind: 'audioinput' | 'audiooutput'
  groupId?: string
}

// デスクトップソース情報
export interface DesktopSourceInfo {
  id: string
  name: string
  thumbnail?: string
  display_id?: string
  appIcon?: string
}

// 録音設定
export interface RecordingConfig {
  inputType: InputSourceType
  selectedDevice: string
  quality: 'high' | 'medium' | 'low'
  format: 'webm' | 'mp3' | 'wav'
  enableRealtimeTranscription: boolean
  desktopSource?: string
  systemAudioDevice?: string
}

// ミキシング設定（音声合成用）
export interface MixingConfig {
  enableMicrophone: boolean
  enableDesktop: boolean
  microphoneGain: number      // 0.0 - 1.0
  desktopGain: number        // 0.0 - 1.0
}

// 音声レベル情報
export interface AudioLevels {
  microphoneLevel: number    // 0.0 - 1.0
  desktopLevel: number      // 0.0 - 1.0
  mixedLevel: number        // 0.0 - 1.0
}

// マイクロフォン監視状態
export interface MicrophoneStatus {
  isConnected: boolean
  level: number             // 0.0 - 1.0
  isMuted: boolean
  deviceName: string
  lastUpdate: Date
}

// マイクロフォンアラート
export interface MicrophoneAlert {
  id: string
  type: 'device_disconnected' | 'low_level' | 'high_noise' | 'permission_denied'
  message: string
  timestamp: Date
  severity: 'info' | 'warning' | 'error'
}

// 録音セッション情報
export interface RecordingSession {
  id: string
  startTime: Date
  pausedDuration: number    // 一時停止時間の累計（ミリ秒）
  currentDuration: number   // 現在の録音時間（ミリ秒）
  config: RecordingConfig
  filePath?: string
  fileSize?: number
}

// 録音エラー情報
export interface RecordingError {
  type: 'device_error' | 'permission_error' | 'storage_error' | 'format_error' | 'unknown_error'
  message: string
  details?: any
  timestamp: Date
  recoverable: boolean      // ユーザー操作で回復可能か
  suggestedAction?: string  // 推奨される対処法
}

// 録音状態の完全な定義
export interface RecordingState {
  // 基本状態
  status: RecordingStatus
  session: RecordingSession | null
  error: RecordingError | null
  
  // デバイス管理
  availableDevices: AudioDeviceInfo[]
  desktopSources: DesktopSourceInfo[]
  systemAudioDevices: AudioDeviceInfo[]
  
  // 設定
  config: RecordingConfig
  mixingConfig: MixingConfig
  
  // 監視データ
  microphoneStatus: MicrophoneStatus | null
  microphoneAlerts: MicrophoneAlert[]
  audioLevels: AudioLevels
  
  // UI状態
  isDeviceListOpen: boolean
  isConfigPanelOpen: boolean
  
  // メタデータ
  lastUpdate: Date
}

// 初期状態
export const createInitialRecordingState = (): RecordingState => ({
  status: 'idle',
  session: null,
  error: null,
  
  availableDevices: [],
  desktopSources: [],
  systemAudioDevices: [],
  
  config: {
    inputType: 'microphone',
    selectedDevice: '',
    quality: 'medium',
    format: 'webm',
    enableRealtimeTranscription: false
  },
  
  mixingConfig: {
    enableMicrophone: true,
    enableDesktop: true,
    microphoneGain: 0.7,
    desktopGain: 0.8
  },
  
  microphoneStatus: null,
  microphoneAlerts: [],
  audioLevels: {
    microphoneLevel: 0,
    desktopLevel: 0,
    mixedLevel: 0
  },
  
  isDeviceListOpen: false,
  isConfigPanelOpen: false,
  
  lastUpdate: new Date()
})

// 状態更新アクション型
export type RecordingAction = 
  | { type: 'START_RECORDING'; config: RecordingConfig }
  | { type: 'PAUSE_RECORDING' }
  | { type: 'RESUME_RECORDING' }
  | { type: 'STOP_RECORDING' }
  | { type: 'SET_ERROR'; error: RecordingError }
  | { type: 'CLEAR_ERROR' }
  | { type: 'UPDATE_DEVICES'; devices: AudioDeviceInfo[] }
  | { type: 'UPDATE_DESKTOP_SOURCES'; sources: DesktopSourceInfo[] }
  | { type: 'UPDATE_CONFIG'; config: Partial<RecordingConfig> }
  | { type: 'UPDATE_MIXING_CONFIG'; config: Partial<MixingConfig> }
  | { type: 'UPDATE_MICROPHONE_STATUS'; status: MicrophoneStatus }
  | { type: 'ADD_MICROPHONE_ALERT'; alert: MicrophoneAlert }
  | { type: 'REMOVE_MICROPHONE_ALERT'; alertId: string }
  | { type: 'UPDATE_AUDIO_LEVELS'; levels: AudioLevels }
  | { type: 'UPDATE_SESSION'; session: Partial<RecordingSession> }
  | { type: 'TOGGLE_DEVICE_LIST' }
  | { type: 'TOGGLE_CONFIG_PANEL' }

// 状態バリデーション関数
export const validateRecordingState = (state: RecordingState): string[] => {
  const errors: string[] = []
  
  // 録音中なのにセッションがない
  if ((state.status === 'recording' || state.status === 'paused') && !state.session) {
    errors.push('録音中ですが、録音セッション情報がありません')
  }
  
  // デバイスが選択されていない
  if (state.config.inputType === 'microphone' && !state.config.selectedDevice && state.status !== 'idle') {
    errors.push('マイクロフォンが選択されていません')
  }
  
  // デスクトップソースが選択されていない
  if (state.config.inputType === 'desktop' && !state.config.desktopSource && state.status !== 'idle') {
    errors.push('デスクトップソースが選択されていません')
  }
  
  // 音声レベルの範囲チェック
  if (state.audioLevels.microphoneLevel < 0 || state.audioLevels.microphoneLevel > 1) {
    errors.push('マイクロフォンレベルが不正な値です')
  }
  
  return errors
}

// ステータス表示用のヘルパー関数
export const getRecordingStatusDisplay = (status: RecordingStatus): string => {
  switch (status) {
    case 'idle': return '待機中'
    case 'recording': return '録音中'
    case 'paused': return '一時停止'
    case 'stopping': return '停止中'
    case 'error': return 'エラー'
    default: return '不明'
  }
}

// 録音時間のフォーマット関数
export const formatRecordingTime = (milliseconds: number): string => {
  const seconds = Math.floor(milliseconds / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  
  if (hours > 0) {
    return `${hours}:${(minutes % 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
  } else {
    return `${minutes}:${(seconds % 60).toString().padStart(2, '0')}`
  }
}