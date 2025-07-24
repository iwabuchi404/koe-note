/**
 * ApplicationState - アプリケーション全体の状態管理型定義
 * 
 * 設計方針:
 * - 全体的なアプリケーション状態の統合管理
 * - 各機能間の状態連携の明確化
 * - UI全体の状態管理
 * - エラー・通知の一元管理
 */

import { RecordingState } from './RecordingState'
import { TranscriptionState } from './TranscriptionState'

// アプリケーション全体の動作モード
export type ApplicationMode = 
  | 'idle'           // 待機中
  | 'recording'      // 録音中
  | 'transcribing'   // 文字起こし中
  | 'both'           // 録音と文字起こし同時実行
  | 'playback'       // 再生中
  | 'error'          // エラー状態

// ファイル情報（統合）
export interface AudioFileInfo {
  id: string
  fileName: string
  filePath: string
  size: number
  duration: number
  format: string
  createdAt: Date
  modifiedAt: Date
  metadata?: {
    sampleRate?: number
    channels?: number
    bitrate?: number
  }
  transcription?: {
    hasFile: boolean
    filePath?: string
    lastUpdated?: Date
    segmentCount?: number
    wordCount?: number
  }
  isRecording: boolean      // 現在録音中のファイルかどうか
  isSelected: boolean       // UI上で選択されているか
  isPlaying: boolean        // 現在再生中か
}

// フォルダ・ディレクトリ情報
export interface FolderInfo {
  path: string
  name: string
  fileCount: number
  totalSize: number
  lastModified: Date
  isWatched: boolean        // ファイル変更を監視中か
}

// 通知情報
export interface NotificationInfo {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  message: string
  timestamp: Date
  duration?: number         // 表示時間（ミリ秒、undefinedで手動閉じのみ）
  actionable?: {
    label: string
    action: () => void
  }
  persistent?: boolean      // 永続的な通知（アプリ再起動まで保持）
}

// アプリケーション設定
export interface ApplicationSettings {
  general: {
    language: 'ja' | 'en'
    theme: 'light' | 'dark' | 'auto'
    autoSave: boolean
    saveFolder: string
    backupFolder?: string
    maxRecentFiles: number
  }
  audio: {
    defaultInputDevice: string
    defaultOutputDevice: string
    audioQuality: 'high' | 'medium' | 'low'
    defaultVolume: number      // 0.0 - 1.0
    enableAudioEnhancements: boolean
  }
  recording: {
    defaultFormat: 'webm' | 'mp3' | 'wav'
    defaultQuality: 'high' | 'medium' | 'low'
    autoStart: boolean
    silenceDetection: boolean
    maxRecordingDuration?: number  // 秒
    enableRealtimeTranscription: boolean
  }
  transcription: {
    defaultModel: string
    defaultLanguage: 'ja' | 'en' | 'auto'
    enableTimestamp: boolean
    enableSpeakerIdentification: boolean
    autoSave: boolean
    exportFormat: 'txt' | 'srt' | 'vtt' | 'json'
    serverUrl: string
    apiKey?: string
  }
  ui: {
    windowSize: { width: number; height: number }
    windowPosition: { x: number; y: number }
    panelLayout: 'standard' | 'compact' | 'expanded'
    showFileList: boolean
    showTranscriptionPanel: boolean
    fontSize: 'small' | 'medium' | 'large'
    enableAnimations: boolean
  }
  advanced: {
    enableDebugMode: boolean
    logLevel: 'error' | 'warn' | 'info' | 'debug'
    enablePerformanceMonitoring: boolean
    maxLogFiles: number
    enableTelemetry: boolean
  }
}

// パフォーマンス監視情報
export interface PerformanceMetrics {
  memory: {
    used: number              // MB
    total: number            // MB
    percentage: number       // 0-100
  }
  cpu: {
    usage: number            // 0-100
    processes: number
  }
  disk: {
    available: number        // MB
    total: number           // MB
    percentage: number      // 0-100
  }
  network: {
    isOnline: boolean
    latency?: number        // ミリ秒
    uploadSpeed?: number    // Mbps
    downloadSpeed?: number  // Mbps
  }
  lastUpdate: Date
}

// UI状態
export interface UIState {
  // パネル表示状態
  leftPanelWidth: number
  rightPanelWidth: number
  bottomPanelHeight: number
  isLeftPanelCollapsed: boolean
  isRightPanelCollapsed: boolean
  isBottomPanelCollapsed: boolean
  
  // モーダル・ダイアログ
  activeModal: string | null
  dialogStack: string[]
  
  // フォーカス・選択状態
  focusedComponent: string | null
  selectedFiles: string[]         // 選択されたファイルIDのリスト
  
  // ドラッグ&ドロップ
  isDragging: boolean
  draggedItems: string[]
  dropTarget: string | null
  
  // ローディング状態
  loadingStates: Record<string, boolean>  // コンポーネント別のローディング状態
  
  // エラー表示
  globalError: string | null
  componentErrors: Record<string, string>
}

// アプリケーション状態の完全な定義
export interface ApplicationState {
  // 基本情報
  mode: ApplicationMode
  isInitialized: boolean
  version: string
  buildNumber: string
  
  // 機能別状態
  recording: RecordingState
  transcription: TranscriptionState
  
  // ファイル管理
  currentFolder: FolderInfo | null
  fileList: AudioFileInfo[]
  selectedFile: AudioFileInfo | null
  recentFiles: AudioFileInfo[]
  
  // 設定
  settings: ApplicationSettings
  
  // 通知・エラー
  notifications: NotificationInfo[]
  globalError: string | null
  
  // UI状態
  ui: UIState
  
  // システム情報
  performance: PerformanceMetrics | null
  
  // メタデータ
  lastUpdate: Date
  sessionStartTime: Date
  totalUsageTime: number        // 総使用時間（ミリ秒）
}

// 初期設定
export const createInitialApplicationSettings = (): ApplicationSettings => ({
  general: {
    language: 'ja',
    theme: 'auto',
    autoSave: true,
    saveFolder: '',
    maxRecentFiles: 10
  },
  audio: {
    defaultInputDevice: '',
    defaultOutputDevice: '',
    audioQuality: 'medium',
    defaultVolume: 0.8,
    enableAudioEnhancements: false
  },
  recording: {
    defaultFormat: 'webm',
    defaultQuality: 'medium',
    autoStart: false,
    silenceDetection: false,
    enableRealtimeTranscription: false
  },
  transcription: {
    defaultModel: 'kotoba-whisper-v1.0',
    defaultLanguage: 'ja',
    enableTimestamp: true,
    enableSpeakerIdentification: false,
    autoSave: true,
    exportFormat: 'txt',
    serverUrl: 'ws://127.0.0.1:8770'
  },
  ui: {
    windowSize: { width: 1200, height: 800 },
    windowPosition: { x: 100, y: 100 },
    panelLayout: 'standard',
    showFileList: true,
    showTranscriptionPanel: true,
    fontSize: 'medium',
    enableAnimations: true
  },
  advanced: {
    enableDebugMode: false,
    logLevel: 'info',
    enablePerformanceMonitoring: false,
    maxLogFiles: 5,
    enableTelemetry: false
  }
})

// 初期UI状態
export const createInitialUIState = (): UIState => ({
  leftPanelWidth: 300,
  rightPanelWidth: 400,
  bottomPanelHeight: 200,
  isLeftPanelCollapsed: false,
  isRightPanelCollapsed: false,
  isBottomPanelCollapsed: false,
  
  activeModal: null,
  dialogStack: [],
  
  focusedComponent: null,
  selectedFiles: [],
  
  isDragging: false,
  draggedItems: [],
  dropTarget: null,
  
  loadingStates: {},
  
  globalError: null,
  componentErrors: {}
})

// 初期状態
export const createInitialApplicationState = (): ApplicationState => ({
  mode: 'idle',
  isInitialized: false,
  version: '1.0.0',
  buildNumber: '',
  
  recording: require('./RecordingState').createInitialRecordingState(),
  transcription: require('./TranscriptionState').createInitialTranscriptionState(),
  
  currentFolder: null,
  fileList: [],
  selectedFile: null,
  recentFiles: [],
  
  settings: createInitialApplicationSettings(),
  
  notifications: [],
  globalError: null,
  
  ui: createInitialUIState(),
  
  performance: null,
  
  lastUpdate: new Date(),
  sessionStartTime: new Date(),
  totalUsageTime: 0
})

// アプリケーション全体のアクション型
export type ApplicationAction = 
  | { type: 'INITIALIZE_APP'; version: string; buildNumber: string }
  | { type: 'SET_MODE'; mode: ApplicationMode }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<ApplicationSettings> }
  | { type: 'SET_CURRENT_FOLDER'; folder: FolderInfo }
  | { type: 'UPDATE_FILE_LIST'; files: AudioFileInfo[] }
  | { type: 'SELECT_FILE'; file: AudioFileInfo | null }
  | { type: 'ADD_RECENT_FILE'; file: AudioFileInfo }
  | { type: 'ADD_NOTIFICATION'; notification: NotificationInfo }
  | { type: 'REMOVE_NOTIFICATION'; notificationId: string }
  | { type: 'CLEAR_NOTIFICATIONS' }
  | { type: 'SET_GLOBAL_ERROR'; error: string | null }
  | { type: 'UPDATE_UI_STATE'; ui: Partial<UIState> }
  | { type: 'UPDATE_PERFORMANCE'; metrics: PerformanceMetrics }
  | { type: 'INCREMENT_USAGE_TIME'; milliseconds: number }

// 状態バリデーション関数
export const validateApplicationState = (state: ApplicationState): string[] => {
  const errors: string[] = []
  
  // 初期化チェック
  if (!state.isInitialized) {
    errors.push('アプリケーションが初期化されていません')
  }
  
  // モード整合性チェック
  if (state.mode === 'recording' && state.recording.status === 'idle') {
    errors.push('録音モードですが、録音状態が待機中です')
  }
  
  if (state.mode === 'transcribing' && state.transcription.status === 'idle') {
    errors.push('文字起こしモードですが、文字起こし状態が待機中です')
  }
  
  // ファイル選択整合性チェック
  if (state.selectedFile && !state.fileList.find(f => f.id === state.selectedFile?.id)) {
    errors.push('選択されたファイルがファイルリストに存在しません')
  }
  
  // 設定値チェック
  if (state.settings.audio.defaultVolume < 0 || state.settings.audio.defaultVolume > 1) {
    errors.push('デフォルト音量が不正な値です')
  }
  
  return errors
}

// ヘルパー関数：モード表示用
export const getApplicationModeDisplay = (mode: ApplicationMode): string => {
  switch (mode) {
    case 'idle': return '待機中'
    case 'recording': return '録音中'
    case 'transcribing': return '文字起こし中'
    case 'both': return '録音・文字起こし中'
    case 'playback': return '再生中'
    case 'error': return 'エラー'
    default: return '不明'
  }
}

// ヘルパー関数：通知作成
export const createNotification = (
  type: NotificationInfo['type'],
  title: string,
  message: string,
  options?: Partial<NotificationInfo>
): NotificationInfo => ({
  id: `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  type,
  title,
  message,
  timestamp: new Date(),
  duration: type === 'error' ? undefined : 5000,
  ...options
})

// ヘルパー関数：使用時間フォーマット
export const formatUsageTime = (milliseconds: number): string => {
  const seconds = Math.floor(milliseconds / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  
  if (hours > 0) {
    return `${hours}時間${minutes % 60}分`
  } else if (minutes > 0) {
    return `${minutes}分${seconds % 60}秒`
  } else {
    return `${seconds}秒`
  }
}