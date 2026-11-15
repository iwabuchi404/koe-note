/**
 * IpcSessionStore - SessionStore ポートの実装（window.electronAPI 経由）
 *
 * preload の session* メソッド（sessions:* IPC）を呼び出す。
 * usecase はこの実装を注入して使い、テストではインメモリ実装に差し替える。
 */
import type { SessionStore } from '../ports/SessionStore'
import type { CreateSessionParams } from '@shared/session'
import type { SessionUpdateRequest } from '@shared/ipcContract'
import type { SessionAppendChunkInput } from '@shared/types'
import type { TranscriptResult } from '@shared/transcript'

export class IpcSessionStore implements SessionStore {
  createSession(meta: CreateSessionParams): Promise<{ id: string }> {
    return window.electronAPI.sessionCreate(meta)
  }

  appendChunk(req: SessionAppendChunkInput): Promise<{ file: string }> {
    return window.electronAPI.sessionAppendChunk(req)
  }

  updateSession(sessionId: string, patch: SessionUpdateRequest): Promise<void> {
    return window.electronAPI.sessionUpdate(sessionId, patch)
  }

  saveTranscript(sessionId: string, transcript: TranscriptResult): Promise<void> {
    return window.electronAPI.sessionSaveTranscript(sessionId, transcript)
  }
}
