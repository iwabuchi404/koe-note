/**
 * TranscriptionState - 文字起こし機能の状態管理型定義
 * 
 * 設計方針:
 * - リアルタイム文字起こしとバッチ処理の両方をサポート
 * - 進捗状況の詳細な管理
 * - エラー状態の明確な分類
 * - 結果の構造化された管理
 */

// 文字起こし処理状態
export type TranscriptionStatus = 
  | 'idle'           // 待機中
  | 'initializing'   // 初期化中
  | 'processing'     // 処理中
  | 'paused'         // 一時停止中
  | 'completing'     // 完了処理中
  | 'completed'      // 完了
  | 'error'          // エラー状態
  | 'cancelled'      // キャンセル済み

// 文字起こしモード
export type TranscriptionMode = 
  | 'realtime'       // リアルタイム文字起こし
  | 'batch'          // バッチ処理
  | 'file'           // ファイル処理

// 文字起こし品質設定
export type TranscriptionQuality = 'high' | 'medium' | 'fast'

// 対応言語
export type SupportedLanguage = 'ja' | 'en' | 'auto'

// 文字起こし設定
export interface TranscriptionConfig {
  mode: TranscriptionMode
  quality: TranscriptionQuality
  language: SupportedLanguage
  model: string
  enableTimestamp: boolean
  enableSpeakerIdentification: boolean
  enablePunctuation: boolean
  chunkDurationSeconds: number
  confidenceThreshold: number  // 0.0 - 1.0
}

// 文字起こしセグメント（個別の音声区間）
export interface TranscriptionSegment {
  id: string
  startTime: number            // 秒
  endTime: number             // 秒
  text: string
  confidence: number          // 0.0 - 1.0
  speaker?: string            // 話者識別結果
  isEdited: boolean           // ユーザーが編集済みか
  originalText?: string       // 編集前のテキスト
  alternatives?: string[]     // 代替候補
  language?: SupportedLanguage // 検出された言語
}

// 文字起こし進捗情報
export interface TranscriptionProgress {
  processedDuration: number   // 処理済み時間（秒）
  totalDuration: number      // 総時間（秒）
  currentSegment: number     // 現在処理中のセグメント番号
  totalSegments: number      // 総セグメント数
  percentage: number         // 0-100
  estimatedTimeRemaining?: number // 推定残り時間（秒）
  processingSpeed: number    // 処理速度（倍速）
}

// リアルタイム文字起こしチャンク
export interface RealtimeTranscriptionChunk {
  id: string
  chunkIndex: number
  timestamp: number          // Unix timestamp
  partialText: string        // 部分的なテキスト
  finalText?: string         // 確定したテキスト
  confidence: number
  isPartial: boolean         // 部分的な結果か確定結果か
  audioData?: ArrayBuffer    // 音声データ（デバッグ用）
}

// 文字起こし結果
export interface TranscriptionResult {
  id: string
  audioFileId?: string       // 関連する音声ファイルのID
  mode: TranscriptionMode
  config: TranscriptionConfig
  segments: TranscriptionSegment[]
  metadata: {
    totalDuration: number
    processingTime: number   // 処理にかかった時間（ミリ秒）
    modelUsed: string
    accuracy?: number        // 全体の精度スコア
    wordCount: number
    characterCount: number
    speakerCount?: number    // 検出された話者数
    createdAt: Date
    completedAt?: Date
  }
  rawText: string           // 全テキスト（タイムスタンプなし）
  formattedText: string     // フォーマット済みテキスト
  exportFormats: {
    txt?: string
    srt?: string           // 字幕形式
    vtt?: string           // WebVTT形式
    json?: string          // JSON形式
  }
}

// 文字起こしエラー情報
export interface TranscriptionError {
  type: 'server_error' | 'audio_error' | 'network_error' | 'timeout_error' | 'format_error' | 'model_error' | 'quota_error' | 'unknown_error'
  message: string
  details?: any
  timestamp: Date
  recoverable: boolean
  suggestedAction?: string
  errorCode?: string        // サーバーエラーコード
  retryCount?: number       // リトライ回数
}

// サーバー接続状態
export interface ServerConnectionState {
  isConnected: boolean
  serverUrl: string
  lastPingTime?: Date
  responseTime?: number     // ミリ秒
  version?: string          // サーバーバージョン
  availableModels?: string[]
}

// 文字起こし状態の完全な定義
export interface TranscriptionState {
  // 基本状態
  status: TranscriptionStatus
  mode: TranscriptionMode
  config: TranscriptionConfig
  
  // 処理状況
  currentResult: TranscriptionResult | null
  progress: TranscriptionProgress | null
  error: TranscriptionError | null
  
  // リアルタイム処理
  realtimeChunks: RealtimeTranscriptionChunk[]
  currentChunk: RealtimeTranscriptionChunk | null
  
  // 履歴・結果管理
  recentResults: TranscriptionResult[]
  savedResults: string[]    // 保存済みファイルパス
  
  // サーバー状態
  serverConnection: ServerConnectionState
  
  // UI状態
  isResultPanelOpen: boolean
  isConfigPanelOpen: boolean
  selectedSegment: string | null  // 選択中のセグメントID
  editingSegment: string | null   // 編集中のセグメントID
  
  // 設定・オプション
  autoSave: boolean
  exportFormat: 'txt' | 'srt' | 'vtt' | 'json'
  
  // メタデータ
  lastUpdate: Date
  processingStartTime?: Date
}

// 初期状態
export const createInitialTranscriptionState = (): TranscriptionState => ({
  status: 'idle',
  mode: 'realtime',
  config: {
    mode: 'realtime',
    quality: 'medium',
    language: 'ja',
    model: 'kotoba-whisper-v1.0',
    enableTimestamp: true,
    enableSpeakerIdentification: false,
    enablePunctuation: true,
    chunkDurationSeconds: 20,
    confidenceThreshold: 0.5
  },
  
  currentResult: null,
  progress: null,
  error: null,
  
  realtimeChunks: [],
  currentChunk: null,
  
  recentResults: [],
  savedResults: [],
  
  serverConnection: {
    isConnected: false,
    serverUrl: 'ws://127.0.0.1:8770'
  },
  
  isResultPanelOpen: false,
  isConfigPanelOpen: false,
  selectedSegment: null,
  editingSegment: null,
  
  autoSave: true,
  exportFormat: 'txt',
  
  lastUpdate: new Date()
})

// 状態更新アクション型
export type TranscriptionAction = 
  | { type: 'START_TRANSCRIPTION'; mode: TranscriptionMode; config?: Partial<TranscriptionConfig> }
  | { type: 'PAUSE_TRANSCRIPTION' }
  | { type: 'RESUME_TRANSCRIPTION' }
  | { type: 'STOP_TRANSCRIPTION' }
  | { type: 'CANCEL_TRANSCRIPTION' }
  | { type: 'SET_ERROR'; error: TranscriptionError }
  | { type: 'CLEAR_ERROR' }
  | { type: 'UPDATE_CONFIG'; config: Partial<TranscriptionConfig> }
  | { type: 'UPDATE_PROGRESS'; progress: TranscriptionProgress }
  | { type: 'ADD_REALTIME_CHUNK'; chunk: RealtimeTranscriptionChunk }
  | { type: 'UPDATE_CURRENT_CHUNK'; chunk: Partial<RealtimeTranscriptionChunk> }
  | { type: 'FINALIZE_CHUNK'; chunkId: string; finalText: string }
  | { type: 'SET_RESULT'; result: TranscriptionResult }
  | { type: 'UPDATE_SEGMENT'; segmentId: string; updates: Partial<TranscriptionSegment> }
  | { type: 'DELETE_SEGMENT'; segmentId: string }
  | { type: 'ADD_SEGMENT'; segment: TranscriptionSegment }
  | { type: 'SELECT_SEGMENT'; segmentId: string | null }
  | { type: 'START_EDIT_SEGMENT'; segmentId: string }
  | { type: 'FINISH_EDIT_SEGMENT'; segmentId: string; newText: string }
  | { type: 'UPDATE_SERVER_CONNECTION'; connection: Partial<ServerConnectionState> }
  | { type: 'SAVE_RESULT'; filePath: string }
  | { type: 'LOAD_RESULT'; result: TranscriptionResult }
  | { type: 'CLEAR_REALTIME_CHUNKS' }
  | { type: 'TOGGLE_RESULT_PANEL' }
  | { type: 'TOGGLE_CONFIG_PANEL' }

// 状態バリデーション関数
export const validateTranscriptionState = (state: TranscriptionState): string[] => {
  const errors: string[] = []
  
  // 処理中なのに結果がない
  if ((state.status === 'processing' || state.status === 'completing') && !state.currentResult && !state.currentChunk) {
    errors.push('処理中ですが、処理対象がありません')
  }
  
  // サーバー接続が必要なのに未接続
  if ((state.status === 'processing' || state.status === 'initializing') && !state.serverConnection.isConnected) {
    errors.push('処理にはサーバー接続が必要です')
  }
  
  // 設定値の妥当性チェック
  if (state.config.confidenceThreshold < 0 || state.config.confidenceThreshold > 1) {
    errors.push('信頼度閾値が不正な値です')
  }
  
  if (state.config.chunkDurationSeconds < 1 || state.config.chunkDurationSeconds > 300) {
    errors.push('チャンク時間が不正な値です')
  }
  
  return errors
}

// ステータス表示用のヘルパー関数
export const getTranscriptionStatusDisplay = (status: TranscriptionStatus): string => {
  switch (status) {
    case 'idle': return '待機中'
    case 'initializing': return '初期化中'
    case 'processing': return '処理中'
    case 'paused': return '一時停止'
    case 'completing': return '完了処理中'
    case 'completed': return '完了'
    case 'error': return 'エラー'
    case 'cancelled': return 'キャンセル済み'
    default: return '不明'
  }
}

// 進捗率計算関数
export const calculateProgress = (progress: TranscriptionProgress): number => {
  if (progress.totalDuration === 0) return 0
  return Math.min(100, Math.max(0, (progress.processedDuration / progress.totalDuration) * 100))
}

// テキスト統計計算関数
export const calculateTextStats = (segments: TranscriptionSegment[]): { wordCount: number; characterCount: number } => {
  const allText = segments.map(s => s.text).join(' ')
  const wordCount = allText.trim().split(/\s+/).filter(word => word.length > 0).length
  const characterCount = allText.length
  
  return { wordCount, characterCount }
}

// セグメント時間のフォーマット関数
export const formatSegmentTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const millisecs = Math.floor((seconds % 1) * 1000)
  
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${millisecs.toString().padStart(3, '0')}`
}