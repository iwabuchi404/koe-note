/**
 * タブシステムの型定義
 */

// タブの種類（2つのタブのみ）
export enum TabType {
  WELCOME = 'welcome',           // ウェルカムスクリーン（初期状態）
  PLAYER = 'player',            // テキスト/音声プレイヤータブ（ファイル選択時）
  RECORDING = 'recording'        // 録音・文字起こしタブ（録音開始時）
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
  data?: any                    // タブ固有のデータ
  createdAt: Date
  lastAccessedAt: Date
}

// 録音タブ固有のデータ
export interface RecordingTabData {
  startTime: Date
  duration: number
  audioLevel: number
  isRealTimeTranscription: boolean
  transcriptionText: string
  recordingSettings: {
    source: 'microphone' | 'desktop' | 'mix'
    quality: 'low' | 'medium' | 'high'
    model: 'small' | 'medium' | 'large'
  }
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
  RECORD_WITH_TRANSCRIPTION = 'record_with_transcription',
  RECORD_ONLY = 'record_only',
  TRANSCRIBE_FILE = 'transcribe_file',
  OPEN_AUDIO_FILE = 'open_audio_file',
  OPEN_TEXT_FILE = 'open_text_file'
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
  payload: any
}

// タブコンテキストの型
export interface TabContextType {
  tabs: TabData[]
  activeTabId: string | null
  createTab: (type: TabType, data?: any) => string
  closeTab: (tabId: string) => void
  activateTab: (tabId: string) => void
  updateTab: (tabId: string, updates: Partial<TabData>) => void
  reorderTabs: (fromIndex: number, toIndex: number) => void
  getActiveTab: () => TabData | null
  getTabById: (tabId: string) => TabData | null
}