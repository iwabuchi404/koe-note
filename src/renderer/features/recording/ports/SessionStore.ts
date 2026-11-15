/**
 * SessionStore - 録音セッション永続化のポート（v2）
 *
 * renderer 側の実装は IpcSessionStore（window.electronAPI 経由で
 * main の sessions:* ハンドラに届く）。usecase はこのポートにのみ
 * 依存するため、テストではインメモリ実装を注入できる。
 */
import type { CreateSessionParams } from '@shared/session'
import type { SessionUpdateRequest } from '@shared/ipcContract'
import type { SessionAppendChunkInput } from '@shared/types'
import type { TranscriptResult } from '@shared/transcript'

export interface SessionStore {
  /** セッションを作成し、生成された id を返す */
  createSession(meta: CreateSessionParams): Promise<{ id: string }>
  /** チャンクを保存し、session.json のインデックスを更新する */
  appendChunk(req: SessionAppendChunkInput): Promise<{ file: string }>
  /** 録音状態・transcript 参照の部分更新 */
  updateSession(sessionId: string, patch: SessionUpdateRequest): Promise<void>
  /** 文字起こし結果を保存する（全体書き換え・冪等） */
  saveTranscript(sessionId: string, transcript: TranscriptResult): Promise<void>
}
