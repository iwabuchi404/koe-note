/**
 * sessionStore - sessions/<session-id>/ 以下の fs 永続化
 *
 * Electron 非依存（rootDir と fs のみ）。テストでは tmp ディレクトリを渡す。
 * IPC 層は workspaceRoot()/sessions を rootDir として渡す。
 *
 * 書き込みの不変条件（doc/v2-phase0-design.md §6）:
 *   - チャンクファイル → session.json の順で書く
 *   - session.json / transcript の JSON は tmp 書き込み→rename で原子化する
 *   - sessionId / transcriptId はファイル名安全文字のみ（パストラバーサル防止）
 */

import fs from 'fs'
import path from 'path'
import {
  addTranscriptRef,
  appendChunkToSource,
  createSession,
  formatSession,
  parseSession,
  transcriptFilePath,
  updateTranscriptRef,
  withRecordingEnded,
  withSessionState,
  type CreateSessionParams,
  type Session,
  type SessionTranscriptRef
} from '@shared/session'
import {
  formatTranscript,
  parseTranscript,
  type TranscriptResult
} from '@shared/transcript'
import type { SessionAppendChunkRequest, SessionUpdateRequest } from '@shared/ipcContract'

/** ID に許す文字（sessionId・transcriptId・sourceId の検証に使う） */
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

function assertSafeId(value: string, what: string): void {
  if (!SAFE_ID.test(value)) {
    throw new Error(`${what} が不正です: ${value}`)
  }
}

/** JSON を一時ファイル経由で原子的に書き込む */
function writeJsonAtomic(filePath: string, content: string): void {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  const tmp = `${filePath}.tmp`
  fs.writeFileSync(tmp, content, 'utf8')
  fs.renameSync(tmp, filePath)
}

function sessionDir(rootDir: string, sessionId: string): string {
  assertSafeId(sessionId, 'sessionId')
  return path.join(rootDir, sessionId)
}

function sessionFilePath(rootDir: string, sessionId: string): string {
  return path.join(sessionDir(rootDir, sessionId), 'session.json')
}

/** session.json をそのまま読む（正規化なし。書き込み系の内部処理から使う） */
function loadSessionRaw(rootDir: string, sessionId: string): Session {
  const filePath = sessionFilePath(rootDir, sessionId)
  if (!fs.existsSync(filePath)) {
    throw new Error(`セッションが見つかりません: ${sessionId}`)
  }
  return parseSession(fs.readFileSync(filePath, 'utf8'))
}

/**
 * session.json を読む。存在しない/壊れているものは投げる
 *
 * 読み出し側には 'recording'/'finalizing' のまま残った session を
 * 'interrupted' として見せる（書き戻さない・読み時正規化）。
 * 書き込み系は loadSessionRaw を使うこと（正規化した state を
 * 書き戻すと録音中のセッションが interrupted に汚染される）。
 */
export function loadSession(rootDir: string, sessionId: string): Session {
  return normalizeInterrupted(loadSessionRaw(rootDir, sessionId))
}

/**
 * クラッシュ復旧: 前回プロセスが 'recording'/'finalizing' のまま終了した
 * セッションは 'interrupted' として読み出す（書き戻さない・読み時正規化）。
 *
 * 進行中の録音は同一プロセス内で完結するため、main 側から見て
 * recording 状態の session.json は「前プロセスの残骸」と判断できる。
 */
function normalizeInterrupted(session: Session): Session {
  if (session.state === 'recording' || session.state === 'finalizing') {
    return { ...session, state: 'interrupted' }
  }
  return session
}

/**
 * セッションを作成する（ディレクトリ + session.json）
 *
 * id 指定時にディレクトリが既に存在すればエラー（上書きしない）。
 */
export function createSessionOnDisk(rootDir: string, meta: CreateSessionParams): Session {
  const session = createSession(meta)
  assertSafeId(session.id, 'sessionId')

  const dir = sessionDir(rootDir, session.id)
  if (fs.existsSync(dir)) {
    throw new Error(`セッション ${session.id} は既に存在します`)
  }
  fs.mkdirSync(dir, { recursive: true })

  writeJsonAtomic(sessionFilePath(rootDir, session.id), formatSession(session))
  return session
}

/**
 * チャンクを保存し session.json を更新する
 *
 * 書き込み順: chunk ファイル（tmp→rename）→ session.json 更新。
 * session.json 更新に失敗してもチャンクファイルは原本として残る。
 */
export function appendSessionChunk(
  rootDir: string,
  req: SessionAppendChunkRequest
): { file: string; session: Session } {
  const session = loadSessionRaw(rootDir, req.sessionId)
  assertSafeId(req.sourceId, 'sourceId')

  const source = session.sources.find((s) => s.id === req.sourceId)
  if (!source) {
    throw new Error(`セッション ${req.sessionId} にソース ${req.sourceId} がありません`)
  }

  // 1) チャンクファイルを書く（不変ファイル。tmp→rename）
  const chunkIndex = source.audio.chunks.length
  const fileName = `chunk_${String(chunkIndex).padStart(3, '0')}.${source.audio.format}`
  const chunkPath = path.join(sessionDir(rootDir, req.sessionId), source.audio.dir, fileName)
  const chunkDir = path.dirname(chunkPath)
  if (!fs.existsSync(chunkDir)) {
    fs.mkdirSync(chunkDir, { recursive: true })
  }
  const tmp = `${chunkPath}.tmp`
  fs.writeFileSync(tmp, req.data)
  fs.renameSync(tmp, chunkPath)

  // 2) session.json を更新
  const next = appendChunkToSource(session, req.sourceId, {
    bytes: req.data.length,
    audioOffsetSeconds: req.audioOffsetSeconds,
    durationSeconds: req.durationSeconds,
    recordedAt: req.recordedAt
  })
  writeJsonAtomic(sessionFilePath(rootDir, req.sessionId), formatSession(next))

  // session 相対パスはスキーマどおり POSIX 区切りで返す
  return { file: `${source.audio.dir}/${fileName}`, session: next }
}

/** 録音状態・transcript 参照の部分更新 */
export function updateSession(
  rootDir: string,
  sessionId: string,
  patch: SessionUpdateRequest
): Session {
  let session = loadSessionRaw(rootDir, sessionId)

  if (patch.state) {
    session = withSessionState(session, patch.state)
  }
  if (patch.endedAt !== undefined || patch.durationSeconds !== undefined) {
    session = withRecordingEnded(
      session,
      patch.endedAt ?? session.recording.endedAt ?? new Date().toISOString(),
      patch.durationSeconds
    )
  }
  if (patch.transcriptRef) {
    session = updateTranscriptRef(session, patch.transcriptRef.id, {
      status: patch.transcriptRef.status,
      error: patch.transcriptRef.error
    })
  }

  writeJsonAtomic(sessionFilePath(rootDir, sessionId), formatSession(session))
  return session
}

/**
 * 文字起こし結果を保存する
 *
 * transcripts/<id>.json を書き、session.json の transcripts[] に
 * 参照を upsert する（無ければ追加、あれば status/error を更新）。
 */
export function saveSessionTranscript(
  rootDir: string,
  sessionId: string,
  transcript: TranscriptResult
): Session {
  if (transcript.sessionId !== sessionId) {
    throw new Error(
      `transcript の sessionId ${transcript.sessionId} と対象セッション ${sessionId} が一致しません`
    )
  }
  assertSafeId(transcript.id, 'transcriptId')

  // 1) 結果ファイルを書く
  const dir = sessionDir(rootDir, sessionId)
  const filePath = path.join(dir, transcriptFilePath(transcript.id))
  writeJsonAtomic(filePath, formatTranscript(transcript))

  // 2) session.json の参照を upsert
  let session = loadSessionRaw(rootDir, sessionId)
  const existing = session.transcripts.find((t) => t.id === transcript.id)
  if (existing) {
    session = updateTranscriptRef(session, transcript.id, {
      status: transcript.status
    })
  } else {
    const ref: Omit<SessionTranscriptRef, 'file'> = {
      id: transcript.id,
      mode: transcript.mode,
      engine: transcript.engine,
      model: transcript.model,
      sourceId: transcript.sourceId,
      language: transcript.language,
      status: transcript.status,
      createdAt: transcript.createdAt
    }
    session = addTranscriptRef(session, ref)
  }

  writeJsonAtomic(sessionFilePath(rootDir, sessionId), formatSession(session))
  return session
}

/** transcripts/<id>.json を読む */
export function loadSessionTranscript(
  rootDir: string,
  sessionId: string,
  transcriptId: string
): TranscriptResult {
  assertSafeId(transcriptId, 'transcriptId')
  const filePath = path.join(sessionDir(rootDir, sessionId), transcriptFilePath(transcriptId))
  if (!fs.existsSync(filePath)) {
    throw new Error(`transcript が見つかりません: ${sessionId}/${transcriptId}`)
  }
  return parseTranscript(fs.readFileSync(filePath, 'utf8'))
}

/**
 * セッション一覧を返す（session.json を持つディレクトリのみ）
 *
 * 壊れた session.json はスキップしてログに残さない（呼び出し側が
 * 個別に load して診断する）。大量セッションでの一覧性能は
 * 後続フェーズで要再検討（計画§6.4 のメタデータ管理）。
 */
export function listSessions(rootDir: string): Session[] {
  if (!fs.existsSync(rootDir)) {
    return []
  }

  const sessions: Session[] = []
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue
    }
    const filePath = path.join(rootDir, entry.name, 'session.json')
    if (!fs.existsSync(filePath)) {
      continue
    }
    try {
      const session = parseSession(fs.readFileSync(filePath, 'utf8'))
      sessions.push(normalizeInterrupted(session))
    } catch {
      // 壊れた session.json は一覧から外す
    }
  }

  // 新しい順（id は日時ソート可能）
  sessions.sort((a, b) => b.id.localeCompare(a.id))
  return sessions
}
