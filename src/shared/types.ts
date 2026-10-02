/**
 * プロセス間で共有する型の SSOT（Single Source of Truth）
 *
 * 此前は preload.ts が型定義と IPC 実装を同居させ、renderer の11ファイルと
 * main がそのファイルから型を import していた。preload.ts は
 * contextBridge.exposeInMainWorld という副作用を持つため、型だけを
 * 必要とする場所から副作用のあるモジュールを import する状態になっていた。
 *
 * さらに同じ概念の型が renderer 側に重複して宣言され、7型は形状が
 * 食い違っていた:
 *   AppSettings      main版 {saveFolder,...} / renderer版 {recording,...}
 *   TranscriptionResult  server応答版 / チャンク結果版
 *   ChunkSettings / ChunkProgress  main版 / renderer版
 *
 * ここでは「1つの概念に1つの型」を确立する。进程的寿命や実装には依存させない。
 */

// =============================================================================
// ファイル・録音
// =============================================================================

/** 音声・文字起こしファイルの種別 */
export type AudioFileFormat = 'webm' | 'wav' | 'mp3' | 'rt.txt' | 'txt' | 'md'

export interface AudioFile {
  id: string
  filename: string
  filepath: string
  format: AudioFileFormat
  size: number
  createdAt: Date
  duration?: number
  transcription?: string
  inputDevice?: string
  /** 対応する .trans.txt が存在するか */
  hasTranscriptionFile?: boolean
  transcriptionPath?: string
  transcriptionSize?: number
  /** 録音中かどうか */
  isRecording?: boolean
  /** 逐次文字起こしで生成されたファイルか */
  isRealtimeTranscription?: boolean
  isTextFile?: boolean
  isAudioFile?: boolean
  isTranscriptionFile?: boolean
  /** 音声ファイルと .trans.txt のペアとして扱うか */
  isPairedFile?: boolean
}

// =============================================================================
// 設定
// =============================================================================

/**
 * main プロセスが settings.json で管理する設定
 *
 * renderer のユーザー設定（UserPreferences）とは別概念。
 * 混同を防ぐため名称を分けている。
 */
export interface AppSettings {
  saveFolder: string
  audioQuality: 'low' | 'medium' | 'high'
  defaultVolume: number
  defaultInputDevice: string
  mp3Bitrate: 128 | 192 | 320
  autoTranscribe: boolean
}

// =============================================================================
// 文字起こし
// =============================================================================

/** 音声1ファイルのセグメント（Whisperの応答と共通） */
export interface TranscriptionSegment {
  start: number
  end: number
  text: string
  /** 編集済みか（保存時にのみ付ける） */
  isEdited?: boolean
  /** 単語レベルのタイムスタンプ（Whisperが返した場合のみ） */
  words?: Array<{ start: number; end: number; word: string }>
}

/** 表示・編集用に話者ラベルを持てるセグメント */
export interface TranscriptionSegmentExtended {
  start: number
  end: number
  text: string
  speaker?: string
  isEdited?: boolean
}

/**
 * Whisperサーバー（Python）が返す文字起こし結果
 *
 * フィールド名は server.py / transcriber.py の to_dict() に一致させる。
 */
export interface TranscriptionResult {
  language: string
  duration: number
  segments: TranscriptionSegment[]
  created_at: number
  segment_count: number
}

/**
 * 逐次（チャンク）文字起こしの結果
 *
 * 旧: TranscriptionWebSocketService の TranscriptionResult。
 * サーバーの応答版と名前が衝突していたため分離した。
 */
export interface ChunkTranscriptionResult {
  chunkNumber: number
  text: string
  segments: Array<{
    start: number
    end: number
    text: string
    confidence?: number
  }>
  /** 結果を受信した時刻（epoch ms）。音声上の位置ではない */
  timestamp: number
}

/** 逐次文字起こしの進捗通知 */
export interface ChunkTranscriptionProgress {
  chunkNumber: number
  status: 'processing' | 'completed' | 'failed'
  message?: string
}

/**
 * 逐次文字起こしで送る1チャンク
 *
 * chunkNumber / timestamp はサーバーが応答にそのまま返す。
 * これが結果の紐付けの唯一の手がかり（推測はしない）。
 */
export interface TranscriptionChunk {
  chunkNumber: number
  audioData: Blob
  /** 送信時刻（epoch ms） */
  timestamp: number
}

// =============================================================================
// Whisper サーバーとの WebSocket プロトコル
// =============================================================================

/** Whisper サーバーの応答（faster-whisper の結果を内包） */
export interface WhisperTranscriptionResult {
  language: string
  duration: number
  segments: Array<{
    start: number
    end: number
    text: string
  }>
  created_at: number
  segment_count: number
  /** サーバーは text フィールドを持たない。segments から本文を復元する */
  text?: string
}

/** renderer が受け取るサーバーからのメッセージ */
export type ServerMessage =
  | { type: 'connection'; status: string; message: string }
  | {
      type: 'chunk_progress'
      status: string
      data_size: number
      chunkNumber?: number
      timestamp?: number
    }
  | {
      type: 'chunk_result'
      status: 'completed' | 'failed'
      chunkNumber?: number
      timestamp?: number
      result?: WhisperTranscriptionResult
      message?: string
    }
  | { type: 'error'; message: string; chunkNumber?: number }
  | {
      type: 'health_check'
      status: string
      model_loaded: boolean
      current_model: string
      active_clients: number
    }

/** ファイル文字起こし（speech:transcribe）の進捗通知 */
export interface SpeechProgress {
  type: string
  status: string
  file_path?: string
  message?: string
}

/**
 * .trans.txt のヘッダーに記録されるメタデータ
 *
 * coverage は話者分離・品質評価が未実装のため、writer は出力しない。
 * 過去のファイルには値が入っている可能性があるため optional とする。
 */
export interface TranscriptionMetadata {
  audioFile: string
  model: string
  transcribedAt: string
  duration: number
  segmentCount: number
  language: string
  speakers: string[]
  coverage?: number
  chunkCount?: number
  qualityScore?: number
}

/** .trans.txt 全体（メタデータ + セグメント） */
export interface TranscriptionFile {
  metadata: TranscriptionMetadata
  segments: TranscriptionSegmentExtended[]
  filePath: string
  isModified: boolean
}

// =============================================================================
// AI対話記録
// =============================================================================

export interface ClipboardCopyRecord {
  timestamp: string
  selectedText: string
  segmentIndex?: number
}

export interface AIChatFile {
  sourceFile: string
  createdAt: string
  clipboardHistory: ClipboardCopyRecord[]
}

// =============================================================================
// デスクトップキャプチャ
// =============================================================================

export interface DesktopCapturerSource {
  id: string
  name: string
  /** base64 encoded PNG */
  thumbnail: string
}

// =============================================================================
// モデル
// =============================================================================

export interface ModelInfo {
  id: string
  name: string
  description: string
  size: string
  sizeBytes: number
  version: string
  license: string
  licenseUrl?: string
  downloadUrl: string
  checksum: string
  isInstalled: boolean
  isDownloading: boolean
  downloadProgress: number
  installPath?: string
  lastUpdated?: Date
}

export interface ModelDownloadProgress {
  modelId: string
  progress: number
  downloadedBytes: number
  totalBytes: number
  speed: number
  eta: number
  status: 'downloading' | 'paused' | 'completed' | 'error' | 'cancelled'
}

/** モデルの完全性検証結果 */
export interface ModelVerificationResult {
  valid: boolean
  modelId: string
  missingFiles: string[]
  corruptFiles: string[]
  totalFiles: number
  checkedFiles: number
  errors: string[]
}

// =============================================================================
// Renderer → Main の IPC 契約
// =============================================================================

/**
 * renderer が window.electronAPI として参照する API
 *
 * 実装は src/preload/api.ts。型に追従したテスト用モックは
 * tests/mocks/electronAPI.ts。
 */
export interface ElectronAPI {
  // ---- ダイアログ ----
  selectFolder: () => Promise<string | null>
  selectFile: (filters?: Array<{ name: string; extensions: string[] }>) => Promise<{ path: string; name: string } | null>

  // ---- ファイル操作 ----
  saveFile: (buffer: ArrayBuffer, filename: string, subfolder?: string) => Promise<string>
  saveFileToPath: (filePath: string, data: ArrayBuffer | Blob) => Promise<boolean>
  saveTextFile: (filePath: string, content: string) => Promise<boolean>
  getFileList: (folderPath: string) => Promise<AudioFile[]>
  deleteFile: (filePath: string) => Promise<boolean>
  /** 音声ファイルを data URL として読む。存在しない場合は NOT_FOUND */
  loadAudioFile: (filePath: string) => Promise<string>
  /**
   * ファイル全体を読み込む
   *
   * contextBridge を越えると Buffer は Uint8Array になる。Node の Buffer を
   * 返す型は嘘になるため、受け取る側の実体型で表現する。
   */
  readFile: (filePath: string) => Promise<Uint8Array>
  getWorkingDirectory: () => Promise<string>

  // ---- 設定 ----
  loadSettings: () => Promise<AppSettings>

  // ---- 文字起こしサーバー ----
  speechGetServerStatus: () => Promise<{ isRunning: boolean; pid?: number }>
  /** サーバーを起動する。起動できなかった場合は SERVER_UNAVAILABLE */
  speechStartServer: () => Promise<void>
  speechStopServer: () => Promise<void>
  speechTranscribe: (filePath: string) => Promise<TranscriptionResult>
  speechChangeModel: (modelName: string) => Promise<boolean>

  /** サーバー状態変化の通知（starting / running / stopped / failed / external） */
  onSpeechServerStatus: (callback: (status: { status: string; pid?: number }) => void) => void

  // ---- 文字起こしファイル ----
  loadTranscriptionFile: (transFilePath: string) => Promise<TranscriptionFile>
  checkTranscriptionExists: (audioFilePath: string) => Promise<boolean>
  getTranscriptionPath: (audioFilePath: string) => Promise<string>

  // ---- モデル管理 ----
  getModelsPath: () => Promise<string>
  getInstalledModels: () => Promise<string[]>
  downloadWhisperModel: (modelId: string) => Promise<void>
  cancelModelDownload: (modelId: string) => Promise<void>
  removeModel: (modelId: string) => Promise<void>

  // ---- ウィンドウ操作 ----
  windowMinimize: () => Promise<void>
  windowMaximize: () => Promise<void>
  windowClose: () => Promise<void>
  windowIsMaximized: () => Promise<boolean>

  // ---- 汎用イベント（モデルダウンロード進捗など） ----
  /**
   * 任意のチャンネルを購読する
   *
   * 型引数でペイロードを指定する（例: on<DownloadProgressPayload>('models:downloadProgress', cb)）。
   */
  on: <TArgs extends unknown[]>(
    channel: string,
    callback: (event: unknown, ...args: TArgs) => void
  ) => void

  removeListener: <TArgs extends unknown[]>(
    channel: string,
    callback: (event: unknown, ...args: TArgs) => void
  ) => void

  // ---- ログ ----
  /** main のアプリログへ1行追記する */
  logWrite: (message: string) => Promise<void>
}



