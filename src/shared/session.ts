/**
 * session - v2 の録音セッションスキーマ（session.json の SSOT）
 *
 * 録音は「セッション」単位で保存する（doc/v2-phase0-design.md §3）。
 * 旧形式（<base>.mp3 + .trans.txt + .manifest.json）は読み込みのみ継続し、
 * 新規録音はすべてこの形式で sessions/<session-id>/ に書く。
 *
 * 配置:
 *   sessions/<session-id>/
 *   ├── session.json          … このスキーマ
 *   ├── audio/<sourceId>/chunk_NNN.<format>
 *   ├── transcripts/<transcript-id>.json   … shared/transcript.ts
 *   └── work/                 … 一時・復旧領域
 *
 * recordingManifest.ts と同じ方針で書く:
 *   - 純粋関数のみ（fs・Electron に触れない）
 *   - 更新はイミュータブルに新オブジェクトを返す
 *   - 派生値（合計バイト数等）は保持せず計算する
 */

import type { AudioEncoding, AudioFormat } from './audioFormat'
import { roundSeconds } from './audioFormat'

export const SESSION_VERSION = 1

/** セッションディレクトリの親 */
export const SESSIONS_DIR = 'sessions'

export type SessionState = 'recording' | 'finalizing' | 'completed' | 'interrupted'

export type SessionSourceKind = 'microphone' | 'desktop' | 'mixed'

export type TranscriptStatus = 'running' | 'completed' | 'failed'

export interface SessionChunk {
  /** ソースディレクトリ内の相対パス（POSIX 区切り。例: audio/microphone/chunk_000.wav） */
  file: string
  /** 実測サイズ（バイト） */
  bytes: number
  /** セッション開始からの位置（秒）。録音側が持つ実値（旧 manifest のような推定値ではない） */
  audioOffsetSeconds: number
  /** このチャンクの長さ（秒） */
  durationSeconds: number
  /** チャンクが確定した時刻（ISO8601） */
  recordedAt: string
}

export interface SessionAudio {
  /** チャンクの配置ディレクトリ（session 相対。例: audio/microphone） */
  dir: string
  format: AudioFormat
  encoding: AudioEncoding
  chunks: SessionChunk[]
}

export interface SessionSource {
  /** ソース識別子（例: 'microphone'）。同一セッション内で一意 */
  id: string
  kind: SessionSourceKind
  /** 録音時のデバイス識別（mic deviceId 等。任意） */
  device?: string
  enabled: boolean
  audio: SessionAudio
}

/** transcripts/ 内の結果ファイルへの参照（session.json 側のインデックス） */
export interface SessionTranscriptRef {
  /** transcript ファイル名から拡張子を除いたもの（例: 'live-001'） */
  id: string
  /** session 相対パス（例: transcripts/live-001.json） */
  file: string
  mode: 'live' | 'post'
  /** エンジン識別子（'faster-whisper' | 'speech.cpp' 等） */
  engine: string
  model: string
  /** 対象音声ソース */
  sourceId: string
  language: string
  status: TranscriptStatus
  createdAt: string
  /** status='failed' の理由 */
  error?: string
}

export interface SessionRecording {
  startedAt: string
  endedAt: string | null
  /** 録音時間（秒）。進行中は逐次更新、完了時に確定 */
  durationSeconds: number
}

export interface Session {
  version: number
  /** ディレクトリ名でもある（例: 20261115_134200_x4f2） */
  id: string
  createdAt: string
  state: SessionState
  recording: SessionRecording
  sources: SessionSource[]
  transcripts: SessionTranscriptRef[]
  meta?: Record<string, unknown>
}

/* ---------- ID・ファイル名 ---------- */

/**
 * セッション ID を生成する（`YYYYMMDD_HHMMSS_<rand4>` 形式）
 *
 * 日時ソート可能・可読・同一秒衝突は rand4 で回避。
 * rand4 は 0-9a-z の4文字。テストでは randSource を差し替えて決定的にできる。
 */
export function generateSessionId(
  date: Date = new Date(),
  randSource: () => string = defaultRand4
): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp =
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  return `${stamp}_${randSource()}`
}

function defaultRand4(): string {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz'
  let out = ''
  for (let i = 0; i < 4; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return out
}

/** ソース内チャンクファイル名（例: chunk_007.wav） */
export function sessionChunkFileName(chunkIndex: number, format: AudioFormat): string {
  return `chunk_${String(chunkIndex).padStart(3, '0')}.${format}`
}

/** ソースのチャンク配置ディレクトリ（例: audio/microphone） */
export function sourceAudioDir(sourceId: string): string {
  return `audio/${sourceId}`
}

/** transcript 参照からファイルパスを作る（例: transcripts/live-001.json） */
export function transcriptFilePath(transcriptId: string): string {
  return `transcripts/${transcriptId}.json`
}

/* ---------- 生成・更新（すべてイミュータブル） ---------- */

export interface CreateSessionParams {
  id?: string
  createdAt?: string
  sources: Array<{
    id: string
    kind: SessionSourceKind
    device?: string
    format: AudioFormat
    encoding: AudioEncoding
  }>
  meta?: Record<string, unknown>
}

/**
 * 録音開始時点の session を作る（chunks は空、state='recording'）
 *
 * recording のサンプルレート等はソースの encoding に記録されるため
 * ここでは時刻と長さだけを持つ。
 */
export function createSession(params: CreateSessionParams): Session {
  const createdAt = params.createdAt ?? new Date().toISOString()
  const sources: SessionSource[] = params.sources.map((s) => ({
    id: s.id,
    kind: s.kind,
    device: s.device,
    enabled: true,
    audio: {
      dir: sourceAudioDir(s.id),
      format: s.format,
      encoding: s.encoding,
      chunks: []
    }
  }))

  return {
    version: SESSION_VERSION,
    id: params.id ?? generateSessionId(new Date(createdAt)),
    createdAt,
    state: 'recording',
    recording: {
      startedAt: createdAt,
      endedAt: null,
      durationSeconds: 0
    },
    sources,
    transcripts: [],
    meta: params.meta
  }
}

/**
 * ソースにチャンクを1件追記した次の session を返す
 *
 * chunkIndex はそのソース内での通し番号（0 始まり、追記順）。
 * file 名は chunkIndex から生成する。呼び出し側が chunk の実値
 * （bytes・audioOffsetSeconds・durationSeconds）を与えること。
 */
export function appendChunkToSource(
  session: Session,
  sourceId: string,
  chunk: Omit<SessionChunk, 'file'>
): Session {
  const source = session.sources.find((s) => s.id === sourceId)
  if (!source) {
    throw new Error(`セッションにソース ${sourceId} がありません`)
  }

  const chunkIndex = source.audio.chunks.length
  const file = `${source.audio.dir}/${sessionChunkFileName(chunkIndex, source.audio.format)}`
  const nextChunk: SessionChunk = { ...chunk, file }

  const nextAudio: SessionAudio = {
    ...source.audio,
    chunks: [...source.audio.chunks, nextChunk]
  }

  const newEnd = roundSeconds(chunk.audioOffsetSeconds + chunk.durationSeconds)

  return {
    ...session,
    recording: {
      ...session.recording,
      durationSeconds: Math.max(session.recording.durationSeconds, newEnd)
    },
    sources: session.sources.map((s) =>
      s.id === sourceId ? { ...s, audio: nextAudio } : s
    )
  }
}

/** 状態遷移（recording → finalizing → completed / interrupted） */
export function withSessionState(session: Session, state: SessionState): Session {
  return { ...session, state }
}

/** 録音終了を記録する（endedAt と確定 durationSeconds） */
export function withRecordingEnded(
  session: Session,
  endedAt: string,
  durationSeconds?: number
): Session {
  return {
    ...session,
    recording: {
      ...session.recording,
      endedAt,
      durationSeconds: durationSeconds ?? session.recording.durationSeconds
    }
  }
}

/** transcript 参照を追加する（ファイル生成のインデックス） */
export function addTranscriptRef(
  session: Session,
  ref: Omit<SessionTranscriptRef, 'file'>
): Session {
  if (session.transcripts.some((t) => t.id === ref.id)) {
    throw new Error(`transcript id ${ref.id} は既に存在します`)
  }
  return {
    ...session,
    transcripts: [
      ...session.transcripts,
      { ...ref, file: transcriptFilePath(ref.id) }
    ]
  }
}

/** transcript 参照の状態を更新する（running → completed/failed） */
export function updateTranscriptRef(
  session: Session,
  transcriptId: string,
  patch: Partial<Pick<SessionTranscriptRef, 'status' | 'error'>>
): Session {
  return {
    ...session,
    transcripts: session.transcripts.map((t) =>
      t.id === transcriptId ? { ...t, ...patch } : t
    )
  }
}

/* ---------- 派生値（保持しないで計算する） ---------- */

export function sourceTotalBytes(source: SessionSource): number {
  return source.audio.chunks.reduce((total, c) => total + c.bytes, 0)
}

export function sessionTotalBytes(session: Session): number {
  return session.sources.reduce((total, s) => total + sourceTotalBytes(s), 0)
}

export function findSource(session: Session, sourceId: string): SessionSource | undefined {
  return session.sources.find((s) => s.id === sourceId)
}

/* ---------- シリアライズ ---------- */

export function formatSession(session: Session): string {
  return JSON.stringify(session, null, 2) + '\n'
}

/**
 * session.json のパース
 *
 * 壊れた session を黙って無視しない（manifest と同じ方針）。
 * 復旧系の処理は呼び出し側が例外を補足して判断する。
 */
export function parseSession(text: string): Session {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new Error(
      `session.json を JSON として解釈できません: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('session.json のトップレベルがオブジェクトではありません')
  }

  const session = parsed as Partial<Session>
  if (typeof session.version !== 'number') {
    throw new Error('session.json に version がありません')
  }
  if (session.version > SESSION_VERSION) {
    throw new Error(
      `session.json の version ${session.version} は このアプリの対応 version ${SESSION_VERSION} より新しいです`
    )
  }
  if (typeof session.id !== 'string' || session.id.length === 0) {
    throw new Error('session.json に id がありません')
  }
  if (!Array.isArray(session.sources)) {
    throw new Error('session.json に sources 配列がありません')
  }
  if (!Array.isArray(session.transcripts)) {
    throw new Error('session.json に transcripts 配列がありません')
  }

  return session as Session
}

/** session.json の整合性検証（テスト・診断用） */
export function validateSession(session: Session): string[] {
  const problems: string[] = []

  const ids = new Set<string>()
  for (const source of session.sources) {
    if (ids.has(source.id)) {
      problems.push(`ソース id ${source.id} が重複しています`)
    }
    ids.add(source.id)

    if (source.audio.dir !== sourceAudioDir(source.id)) {
      problems.push(
        `ソース ${source.id} の audio.dir ${source.audio.dir} が規則 ${sourceAudioDir(source.id)} と一致しません`
      )
    }
    source.audio.chunks.forEach((chunk, index) => {
      const expected = `${source.audio.dir}/${sessionChunkFileName(index, source.audio.format)}`
      if (chunk.file !== expected) {
        problems.push(
          `ソース ${source.id} の chunks[${index}].file ${chunk.file} が規則 ${expected} と一致しません`
        )
      }
      if (chunk.bytes <= 0) {
        problems.push(`ソース ${source.id} の chunks[${index}].bytes が不正です: ${chunk.bytes}`)
      }
      if (chunk.durationSeconds < 0 || !Number.isFinite(chunk.durationSeconds)) {
        problems.push(
          `ソース ${source.id} の chunks[${index}].durationSeconds が不正です: ${chunk.durationSeconds}`
        )
      }
      if (index > 0) {
        const previous = source.audio.chunks[index - 1]
        if (chunk.audioOffsetSeconds < previous.audioOffsetSeconds) {
          problems.push(
            `ソース ${source.id} の chunks[${index}].audioOffsetSeconds が前のチャンクより小さいです（順序異常）`
          )
        }
      }
    })
  }

  for (const ref of session.transcripts) {
    if (!ids.has(ref.sourceId)) {
      problems.push(`transcript ${ref.id} の sourceId ${ref.sourceId} が sources に存在しません`)
    }
    if (ref.file !== transcriptFilePath(ref.id)) {
      problems.push(
        `transcript ${ref.id} の file ${ref.file} が規則 ${transcriptFilePath(ref.id)} と一致しません`
      )
    }
    if (ref.status === 'failed' && !ref.error) {
      problems.push(`transcript ${ref.id} が failed ですが error がありません`)
    }
  }

  if (session.state === 'completed' && session.recording.endedAt === null) {
    problems.push('state が completed ですが recording.endedAt がありません')
  }

  return problems
}
