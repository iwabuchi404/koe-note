/**
 * タブシステムの型定義
 */

// タブの種類（3つのタブ）
export enum TabType {
  WELCOME = 'welcome',           // ウェルカムスクリーン（初期状態）
  PLAYER = 'player',            // テキスト/音声プレイヤータブ（ファイル選択時）
  ADVANCED_RECORDING = 'advanced_recording'  // 新録音システム（AudioWorklet + lamejs + リアルタイム文字起こし）
}

// タブの状態
export enum TabStatus {
  IDLE = 'idle',                // アイドル状態
  LOADING = 'loading',          // 読み込み中
  RECORDING = 'recording',      // 録音中
  TRANSCRIBING = 'transcribing', // 文字起こし中
  PLAYING = 'playing',          // 再生中
  EDITING = 'editing',          // 編集中
  ERROR = 'error'               // エラー状態
}

// タブのデータ
export interface TabData {
  id: string
  type: TabType
  title: string
  status: TabStatus
  isActive: boolean
  isClosable: boolean
  data?: AdvancedRecordingTabData | PlayerTabData | Record<string, unknown>  // タブ固有のデータ
  createdAt: Date
  lastAccessedAt: Date
}


// 新録音システム専用のタブデータ
export interface AdvancedRecordingTabData {
  startTime: Date
  duration: number
  audioLevel: number
  isRecording: boolean
  
  // 録音設定
  recordingSettings: {
    source: 'microphone' | 'desktop' | 'mix'
    deviceId?: string
    chunkSize: number  // KB単位
    chunkDuration: number // 秒数での設定
    chunkSizeMode: 'bytes' | 'duration' // バイト指定か秒数指定か
    format: 'mp3' | 'wav'  // lamejs MP3またはWAVフォールバック
  }
  
  // 文字起こし設定
  transcriptionSettings: {
    enabled: boolean
    serverUrl: string
    language: 'ja' | 'en' | 'auto'
    model: 'small' | 'medium' | 'large'
  }
  
  // リアルタイムデータ
  chunks: Array<{
    id: number
    size: number
    timestamp: Date
    blob: Blob
    transcriptionStatus: 'pending' | 'processing' | 'completed' | 'failed'
    transcriptionText?: string
  }>
  
  // 統計情報
  stats: {
    totalChunks: number
    totalDataSize: number
    currentBitrate: number
    processedSamples: number
  }
  
  // エラー状況
  errors: Array<{
    timestamp: Date
    type: 'recording' | 'transcription' | 'encoding'
    message: string
  }>
}

// プレイヤータブ固有のデータ（音声・テキスト統合）
export interface PlayerTabData {
  filePath: string
  fileName: string
  fileType: 'audio' | 'text' | 'transcription'
  
  // 音声ファイル用のプロパティ
  duration?: number
  currentTime?: number
  isPlaying?: boolean
  volume?: number
  playbackRate?: number
  waveformData?: number[]
  hasTranscriptionFile?: boolean
  transcriptionPath?: string
  
  // テキストファイル用のプロパティ
  content?: string
  isEdited?: boolean
  editHistory?: Array<{
    timestamp: Date
    content: string
  }>
  metadata?: {
    wordCount: number
    characterCount: number
    lastSaved: Date
  }
}

// ワークフローのアクション
export enum WorkflowAction {
  TRANSCRIBE_FILE = 'transcribe_file',
  OPEN_AUDIO_FILE = 'open_audio_file',
  OPEN_TEXT_FILE = 'open_text_file',
  ADVANCED_RECORD_WITH_TRANSCRIPTION = 'advanced_record_with_transcription'  // 新録音システム
}

// ワークフロー設定
export interface WorkflowSettings {
  action: WorkflowAction
  recordingSettings?: {
    source: 'microphone' | 'desktop' | 'mix'
    quality: 'low' | 'medium' | 'high'
    enableRealTimeTranscription: boolean
  }
  transcriptionSettings?: {
    model: 'small' | 'medium' | 'large'
    language: 'auto' | 'ja' | 'en'
    accuracy: 'speed' | 'balanced' | 'accuracy'
  }
  filePath?: string
}

// タブマネージャーのアクション
export interface TabManagerAction {
  type: 'CREATE_TAB' | 'CLOSE_TAB' | 'ACTIVATE_TAB' | 'UPDATE_TAB' | 'REORDER_TABS'
  payload: {
    tabId?: string
    updates?: Partial<TabData>
    fromIndex?: number
    toIndex?: number
    type?: TabType
    title?: string
    data?: AdvancedRecordingTabData | PlayerTabData | Record<string, unknown>
    isClosable?: boolean
  }
}

// タブコンテキストの型
export interface TabContextType {
  tabs: TabData[]
  activeTabId: string | null
  createTab: (type: TabType, data?: AdvancedRecordingTabData | PlayerTabData | Record<string, unknown>) => string
  closeTab: (tabId: string) => void
  activateTab: (tabId: string) => void
  updateTab: (tabId: string, updates: Partial<TabData>) => void
  reorderTabs: (fromIndex: number, toIndex: number) => void
  getActiveTab: () => TabData | null
  getTabById: (tabId: string) => TabData | null
}