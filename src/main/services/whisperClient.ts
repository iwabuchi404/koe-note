/**
 * Whisper サーバーへの1往復リクエスト（WS）
 *
 * transcribe / changeModel で「接続 → 送信 → 応答待ち → timeout/切断」の
 * 足回りが2つに複写されていたので集約する。
 * 終了時は必ずソケットを閉じる（此前の経路では未クローズのまま残り得た）。
 */
import { writeLog } from './appLog'
import { WHISPER_PORT } from './whisperServer'

const WS_URL = `ws://127.0.0.1:${WHISPER_PORT}`

/** サーバーからの1メッセージ */
export interface WhisperResponse {
  type?: string
  status?: string
  message?: string
  result?: unknown
  [key: string]: unknown
}

export type WhisperOutcome<T> =
  | { type: 'resolve'; value: T }
  | { type: 'reject'; message: string }

export interface WhisperCallOptions<T> {
  /** 接続確立後に送るリクエスト */
  request: Record<string, unknown>
  timeoutMs: number
  timeoutMessage: string
  /** リクエスト送信失敗時のエラーメッセージ */
  sendFailureMessage: string
  /** サーバーが接続を閉じたときのエラーメッセージ */
  closeMessage: string
  /** ws の error イベントをアプリ向けエラーに変換 */
  mapError: (error: Error) => Error
  /** 応答1件を処理。確定したら outcome を返す */
  onResponse: (response: WhisperResponse) => WhisperOutcome<T> | void
}

export function whisperCall<T>(options: WhisperCallOptions<T>): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const WebSocket = require('ws')
  const ws = new WebSocket(WS_URL)

  return new Promise<T>((resolve, reject) => {
    let settled = false

    const finish = (error?: Error, value?: T): void => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      try {
        ws.close()
      } catch (closeError) {
        writeLog(`WebSocket close error: ${closeError}`)
      }
      if (error) {
        reject(error)
      } else {
        resolve(value as T)
      }
    }

    const timeoutId = setTimeout(() => {
      writeLog(`Whisper要求タイムアウト (${options.timeoutMs / 1000}秒)`)
      finish(new Error(options.timeoutMessage))
    }, options.timeoutMs)

    ws.on('open', () => {
      try {
        ws.send(JSON.stringify(options.request))
      } catch (error) {
        writeLog(`リクエスト送信エラー: ${error}`)
        finish(new Error(options.sendFailureMessage))
      }
    })

    ws.on('message', (data: Buffer) => {
      let response: WhisperResponse
      try {
        response = JSON.parse(data.toString())
      } catch (parseError) {
        writeLog(`WebSocketレスポンス解析エラー: ${parseError}`)
        return
      }
      writeLog(`WebSocketメッセージ受信: ${response.type}, status: ${response.status}`)
      const outcome = options.onResponse(response)
      if (!outcome) return
      if (outcome.type === 'resolve') {
        finish(undefined, outcome.value)
      } else {
        finish(new Error(outcome.message))
      }
    })

    ws.on('error', (error: Error) => {
      writeLog(`WebSocketエラー: ${error.message}`)
      finish(options.mapError(error))
    })

    ws.on('close', () => {
      writeLog('WebSocket接続終了')
      finish(new Error(options.closeMessage))
    })
  })
}
