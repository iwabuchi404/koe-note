/**
 * sessions:* — v2 録音セッションの永続化
 *
 * すべて sessions/ ルート（workspaceRoot()/sessions）配下に限定。
 * fs 操作は services/sessionStore.ts に集約（テスト可能）。
 */
import path from 'path'
import type { CreateSessionParams, Session } from '@shared/session'
import { SESSIONS_DIR } from '@shared/session'
import type { TranscriptResult } from '@shared/transcript'
import type { SessionAppendChunkRequest, SessionUpdateRequest } from '@shared/ipcContract'
import { resolveWithinRoot } from '../core/paths'
import { toAppError } from '../core/errors'
import { workspaceRoot } from '../services/workspace'
import { writeLog } from '../services/appLog'
import {
  appendSessionChunk,
  createSessionOnDisk,
  listSessions,
  loadSession,
  loadSessionTranscript,
  saveSessionTranscript,
  updateSession
} from '../services/sessionStore'
import { handle } from './handle'

/** セッションルートを解決する（workspaceRoot 配下に固定） */
function sessionsRoot(): string {
  return resolveWithinRoot(workspaceRoot(), SESSIONS_DIR)
}

export function registerSessionsIpc(): void {
  // セッション作成（ディレクトリ + session.json）
  handle('sessions:create', async (event, meta: CreateSessionParams): Promise<{ id: string }> => {
    try {
      const session = createSessionOnDisk(sessionsRoot(), meta)
      writeLog(`セッション作成: ${session.id}`)
      return { id: session.id }
    } catch (error) {
      throw toAppError(error, 'セッションの作成に失敗しました')
    }
  })

  // チャンク保存（chunk ファイル → session.json 更新）
  handle(
    'sessions:appendChunk',
    async (event, req: SessionAppendChunkRequest): Promise<{ file: string }> => {
      try {
        const result = appendSessionChunk(sessionsRoot(), req)
        writeLog(
          `チャンク保存: ${req.sessionId}/${req.sourceId} -> ${result.file} (${req.data.length} bytes)`
        )
        return { file: result.file }
      } catch (error) {
        throw toAppError(error, 'チャンクの保存に失敗しました')
      }
    }
  )

  // 録音状態・transcript 参照の更新
  handle(
    'sessions:update',
    async (event, sessionId: string, patch: SessionUpdateRequest): Promise<void> => {
      try {
        updateSession(sessionsRoot(), sessionId, patch)
      } catch (error) {
        throw toAppError(error, 'セッションの更新に失敗しました')
      }
    }
  )

  // 文字起こし結果の保存（transcripts/<id>.json + 参照 upsert）
  handle(
    'sessions:saveTranscript',
    async (event, sessionId: string, transcript: TranscriptResult): Promise<void> => {
      try {
        saveSessionTranscript(sessionsRoot(), sessionId, transcript)
        writeLog(`transcript 保存: ${sessionId}/${transcript.id}`)
      } catch (error) {
        throw toAppError(error, 'transcript の保存に失敗しました')
      }
    }
  )

  // セッション一覧（新しい順）
  handle('sessions:list', async (): Promise<Session[]> => {
    try {
      return listSessions(sessionsRoot())
    } catch (error) {
      throw toAppError(error, 'セッション一覧の取得に失敗しました')
    }
  })

  // セッション読み込み
  handle('sessions:load', async (event, sessionId: string): Promise<Session> => {
    try {
      return loadSession(sessionsRoot(), sessionId)
    } catch (error) {
      throw toAppError(error, 'セッションの読み込みに失敗しました')
    }
  })

  // 文字起こし結果の読み込み
  handle(
    'sessions:loadTranscript',
    async (event, sessionId: string, transcriptId: string): Promise<TranscriptResult> => {
      try {
        return loadSessionTranscript(sessionsRoot(), sessionId, transcriptId)
      } catch (error) {
        throw toAppError(error, 'transcript の読み込みに失敗しました')
      }
    }
  )
}
