/**
 * transcription:connect / sendChunk / disconnect — ライブ文字起こし
 *
 * Phase 2: renderer→WS 直結を廃止し、WS は main 側
 * LiveTranscriptionEngine が保持する。renderer はこの IPC 経由で
 * チャンクを送り、結果は push イベント（transcription:result 等）で受ける。
 *
 * ライブ文字起こしは同時に1接続のみ（録音自体が1系統のため）。
 */
import type { WebContents } from 'electron'
import type { IpcEvents } from '@shared/ipcContract'
import { LiveTranscriptionEngine } from '../services/liveTranscription'
import { writeLog } from '../services/appLog'
import { handle } from './handle'

let engine: LiveTranscriptionEngine | null = null

/** window が生きている時だけ push する（終了後の送信を防ぐ） */
const sendTo = <E extends keyof IpcEvents>(
  sender: WebContents,
  channel: E,
  payload: IpcEvents[E]
): void => {
  if (!sender.isDestroyed()) sender.send(channel, payload)
}

export function registerLiveTranscriptionIpc(): void {
  handle('transcription:connect', async (event, serverUrl, language) => {
    // 既存接続が残っていれば破棄（録音停止漏れ等の後始末）
    engine?.disconnect()

    const sender = event.sender
    engine = new LiveTranscriptionEngine({
      serverUrl,
      language,
      callbacks: {
        onConnectionChange: (connected) =>
          sendTo(sender, 'transcription:connection', { connected }),
        onChunkResult: (result) => sendTo(sender, 'transcription:result', result),
        onChunkProgress: (progress) => sendTo(sender, 'transcription:progress', progress),
        onError: (message) => sendTo(sender, 'transcription:error', { message })
      }
    })

    writeLog(`ライブ文字起こし 接続要求: ${serverUrl}`)
    return engine.connect()
  })

  handle('transcription:sendChunk', (_event, chunk) => {
    // 未接続はエラーではなく「送信できなかった」として false を返す
    // （旧 renderer 実装の sendChunkForTranscription と同じ契約）
    if (!engine) return false
    return engine.sendChunk(chunk)
  })

  handle('transcription:disconnect', () => {
    engine?.disconnect()
    engine = null
  })
}

/** アプリ終了時の後始末用 */
export function disposeLiveTranscription(): void {
  engine?.disconnect()
  engine = null
}
