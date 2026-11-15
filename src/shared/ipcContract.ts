/**
 * IPC のワイヤ契約（Single Source of Truth）
 *
 * - IpcContract: renderer → main の invoke チャンネルごとの引数・戻り値
 * - IpcEvents:   main → renderer の push イベントごとのペイロード
 *
 * main 側は ipc/handle.ts の handle() がこの契約に従ってハンドラを型検査し、
 * preload 側は invoke/subscribe ヘルパが同じ契約で呼び出しを型検査する。
 * チャンネル名のタイポや片側だけのシグネチャ変更はコンパイルエラーになる。
 *
 * 注意: ElectronAPI（types.ts）は「renderer から見える API」、こちらは
 * 「ケーブルの上を流れる形」。preload は Blob→Uint8Array 等の変換を担うため
 * 両者は一致しない部分がある（ファイル先頭のコメント参照）。
 */
import type {
  AppSettings,
  AudioFile,
  TranscriptionFile,
  TranscriptionResult,
} from './types'
import type {
  CreateSessionParams,
  Session,
  SessionState,
  SessionTranscriptRef
} from './session'
import type { TranscriptResult } from './transcript'

/** ファイル選択ダイアログのフィルタ */
export interface FileFilter {
  name: string
  extensions: string[]
}

/** dialog:selectFile の戻り値 */
export interface SelectedFileResult {
  path: string
  name: string
}

/** speech:getServerStatus の戻り値。pid=-1 は外部サーバーを示す */
export interface SpeechServerStatus {
  isRunning: boolean
  pid?: number
}

/**
 * invoke チャンネル → { req: 引数タプル, res: 戻り値 }
 *
 * バイナリは Uint8Array で表現する（preload が Buffer.from したものを送るが、
 * Buffer は Uint8Array の部分型なので、wire 型は Uint8Array で正しい）。
 */
export interface IpcContract {
  // ---- ダイアログ ----
  'dialog:selectFolder': { req: []; res: string | null }
  'dialog:selectFile': { req: [filters?: FileFilter[]]; res: SelectedFileResult | null }

  // ---- ファイル操作 ----
  'file:save': { req: [buffer: Uint8Array, filename: string, subfolder?: string]; res: string }
  'file:read': { req: [filePath: string]; res: Uint8Array }
  'file:getList': { req: [folderPath: string]; res: AudioFile[] }
  'file:delete': { req: [filePath: string]; res: boolean }
  'file:loadAudio': { req: [filePath: string]; res: string }
  'file:saveText': { req: [filePath: string, content: string]; res: boolean }
  'file:saveToPath': { req: [filePath: string, data: Uint8Array]; res: boolean }
  'file:getWorkingDirectory': { req: []; res: string }

  // ---- 設定 ----
  'settings:load': { req: []; res: AppSettings }

  // ---- 文字起こしサーバー ----
  'speech:getServerStatus': { req: []; res: SpeechServerStatus }
  'speech:startServer': { req: []; res: void }
  'speech:stopServer': { req: []; res: void }
  'speech:transcribe': { req: [filePath: string]; res: TranscriptionResult }
  'speech:changeModel': { req: [modelName: string]; res: boolean }

  // ---- 文字起こしファイル ----
  'transcription:load': { req: [transFilePath: string]; res: TranscriptionFile }
  'transcription:exists': { req: [audioFilePath: string]; res: boolean }
  'transcription:getPath': { req: [audioFilePath: string]; res: string }

  // ---- モデル管理 ----
  'models:getModelsPath': { req: []; res: string }
  'models:getInstalledModels': { req: []; res: string[] }
  /** 注意: 実引数はモデルIDではなく削除対象のディレクトリパス */
  'models:removeModel': { req: [modelPath: string]; res: void }
  'models:downloadWhisperModel': { req: [modelId: string]; res: void }
  'models:cancelDownload': { req: [modelId: string]; res: void }

  // ---- セッション（v2 録音保存形式） ----
  'sessions:create': { req: [meta: CreateSessionParams]; res: { id: string } }
  'sessions:appendChunk': { req: [req: SessionAppendChunkRequest]; res: { file: string } }
  'sessions:update': { req: [sessionId: string, patch: SessionUpdateRequest]; res: void }
  'sessions:saveTranscript': { req: [sessionId: string, transcript: TranscriptResult]; res: void }
  'sessions:list': { req: []; res: Session[] }
  'sessions:load': { req: [sessionId: string]; res: Session }
  'sessions:loadTranscript': { req: [sessionId: string, transcriptId: string]; res: TranscriptResult }

  // ---- ウィンドウ操作 ----
  'window:minimize': { req: []; res: void }
  'window:maximize': { req: []; res: void }
  'window:close': { req: []; res: void }
  'window:isMaximized': { req: []; res: boolean }

  // ---- ログ ----
  'log:write': { req: [message: string]; res: void }
}

/** Whisper サーバー状態変化の通知 */
export interface SpeechServerStatusEvent {
  status: string
  pid?: number
}

/** モデルダウンロード進捗の通知（main が送る実際の形） */
export interface ModelDownloadProgressEvent {
  modelId: string
  percent: number
  message?: string
  bytesDownloaded?: number
  totalBytes?: number
  speed?: number
  eta?: number
  /** ダウンロード後の検証結果。未検証の進捗通知では省略される */
  verified?: boolean
  errors?: string[]
}

/** sessions:appendChunk の引数 */
export interface SessionAppendChunkRequest {
  sessionId: string
  sourceId: string
  /** チャンクのバイナリ（WAV/PCM 等。wire 型は Uint8Array） */
  data: Uint8Array
  audioOffsetSeconds: number
  durationSeconds: number
  recordedAt: string
}

/** sessions:update の patch（明示フィールドのみ更新可能） */
export interface SessionUpdateRequest {
  state?: SessionState
  endedAt?: string
  durationSeconds?: number
  /** transcript 参照の部分更新（status/error のみ） */
  transcriptRef?: { id: string } & Partial<Pick<SessionTranscriptRef, 'status' | 'error'>>
}

/** push イベントチャンネル → ペイロード */
export interface IpcEvents {
  'speech:serverStatus': SpeechServerStatusEvent
  'models:downloadProgress': ModelDownloadProgressEvent
}
