/**
 * LiveTranscriptionEngine - ライブ文字起こしの main 側エンジン
 *
 * Phase 2 移行: renderer の TranscriptionWebSocketService が担っていた
 * 「永続 WS + transcribe_chunk プロトコル」を main 側へ移したもの。
 * Electron に依存しない設計で、createSocket を注入してテストできる。
 * speech.cpp 等の別エンジンへ置き換える際のアダプタ実装のひとつ。
 *
 * プロトコル上の不変条件（旧実装から継承）:
 *   - 送信形式: { type:'transcribe_chunk', audio_data:base64, language,
 *     chunkNumber, timestamp }
 *   - chunk_progress / chunk_result は chunkNumber が必須。
 *     無い応答は別チャンクへ誤紐付けする恐れがあるため落として明示エラーにする
 */
import type {
  ChunkTranscriptionProgress,
  ChunkTranscriptionResult,
  ServerMessage,
  WhisperTranscriptionResult
} from '@shared/types'
import type { LiveTranscriptionChunkRequest } from '@shared/ipcContract'
import { writeLog } from './appLog'

/** サーバー応答から本文を取り出す（旧 renderer 実装から移管） */
export function extractText(result: WhisperTranscriptionResult): string {
  if (result.text) return result.text
  return result.segments
    .map((segment) => segment.text)
    .filter((text) => text && text.trim())
    .join(' ')
    .trim()
}

/** ws 互換の最小ソケットIF（テストで偽装するための注入点） */
export interface TranscriptionSocket {
  send(data: string): void
  close(code?: number, reason?: string): void
  on(event: 'open', listener: () => void): void
  on(event: 'message', listener: (data: Buffer | string) => void): void
  on(event: 'error', listener: (error: Error) => void): void
  on(event: 'close', listener: (code: number, reason: Buffer | string) => void): void
}

export interface LiveTranscriptionCallbacks {
  onConnectionChange(connected: boolean): void
  onChunkResult(result: ChunkTranscriptionResult): void
  onChunkProgress(progress: ChunkTranscriptionProgress): void
  onError(message: string): void
}

export interface LiveTranscriptionOptions {
  serverUrl: string
  language?: string
  callbacks: LiveTranscriptionCallbacks
  /** ソケット生成（既定: ws パッケージ）。テストでは偽装する */
  createSocket?: (url: string) => TranscriptionSocket
  maxReconnectAttempts?: number
  reconnectDelayMs?: number
  connectTimeoutMs?: number
}

export class LiveTranscriptionEngine {
  private socket: TranscriptionSocket | null = null
  private isConnected = false
  private reconnectAttempts = 0
  private intentionalClose = false
  private readonly pendingChunks = new Set<number>()

  private readonly serverUrl: string
  private readonly language: string
  private readonly callbacks: LiveTranscriptionCallbacks
  private readonly createSocket: (url: string) => TranscriptionSocket
  private readonly maxReconnectAttempts: number
  private readonly reconnectDelayMs: number
  private readonly connectTimeoutMs: number

  constructor(options: LiveTranscriptionOptions) {
    this.serverUrl = options.serverUrl
    this.language = options.language ?? 'ja'
    this.callbacks = options.callbacks
    this.maxReconnectAttempts = options.maxReconnectAttempts ?? 5
    this.reconnectDelayMs = options.reconnectDelayMs ?? 2000
    this.connectTimeoutMs = options.connectTimeoutMs ?? 10_000
    this.createSocket =
      options.createSocket ??
      ((url) => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { WebSocket } = require('ws')
        return new WebSocket(url)
      })
  }

  /** 接続（open / close / タイムアウトのどれかで確定） */
  connect(): Promise<boolean> {
    return new Promise((resolve) => {
      this.intentionalClose = false

      let settled = false
      const finish = (ok: boolean): void => {
        if (settled) return
        settled = true
        clearTimeout(timeoutId)
        resolve(ok)
      }

      const timeoutId = setTimeout(() => {
        writeLog(`ライブ文字起こし 接続タイムアウト (${this.connectTimeoutMs / 1000}秒)`)
        finish(false)
      }, this.connectTimeoutMs)

      const socket = this.createSocket(this.serverUrl)
      this.socket = socket

      socket.on('open', () => {
        writeLog('ライブ文字起こし サーバー接続')
        this.isConnected = true
        this.reconnectAttempts = 0
        this.callbacks.onConnectionChange(true)
        finish(true)
      })

      socket.on('message', (data) => {
        try {
          const raw = typeof data === 'string' ? data : data.toString()
          this.handleServerMessage(JSON.parse(raw) as ServerMessage)
        } catch (error) {
          writeLog(`ライブ文字起こし メッセージ解析失敗: ${error}`)
          this.callbacks.onError('サーバーメッセージの解析に失敗しました')
        }
      })

      socket.on('error', (error) => {
        writeLog(`ライブ文字起こし WebSocketエラー: ${error.message}`)
        this.callbacks.onError('WebSocket接続エラーが発生しました')
      })

      socket.on('close', (code, reason) => {
        const reasonText = typeof reason === 'string' ? reason : reason.toString()
        writeLog(`ライブ文字起こし 接続切断 code=${code} reason=${reasonText}`)
        const wasConnected = this.isConnected
        this.isConnected = false
        this.callbacks.onConnectionChange(false)

        // 意図的切断・正常終了（1000）以外は再接続を試みる
        if (
          !this.intentionalClose &&
          code !== 1000 &&
          this.reconnectAttempts < this.maxReconnectAttempts
        ) {
          this.reconnectAttempts++
          writeLog(`ライブ文字起こし 再接続試行 ${this.reconnectAttempts}/${this.maxReconnectAttempts}`)
          setTimeout(() => {
            void this.connect()
          }, this.reconnectDelayMs)
        }

        finish(wasConnected)
      })
    })
  }

  /**
   * チャンクを文字起こしサーバーに送信する
   *
   * 送信済みは pendingChunks に記録する（監視用。紐付けには使わない）。
   */
  sendChunk(req: LiveTranscriptionChunkRequest): boolean {
    if (!this.isConnected || !this.socket) {
      writeLog('ライブ文字起こし 未接続のため送信失敗')
      this.callbacks.onError('サーバーに接続されていません')
      return false
    }

    if (req.data.length > 5 * 1024 * 1024) {
      writeLog(`ライブ文字起こし チャンク#${req.chunkNumber} が大きすぎる`)
      this.callbacks.onError('チャンクサイズが大きすぎます')
      return false
    }

    try {
      this.pendingChunks.add(req.chunkNumber)
      this.socket.send(
        JSON.stringify({
          type: 'transcribe_chunk',
          audio_data: Buffer.from(req.data).toString('base64'),
          language: this.language,
          chunkNumber: req.chunkNumber,
          timestamp: req.timestamp
        })
      )
      return true
    } catch (error) {
      writeLog(`ライブ文字起こし チャンク送信エラー: ${error}`)
      this.callbacks.onError('チャンクの送信に失敗しました')
      return false
    }
  }

  /** 接続を切る（意図的切断。再接続はしない） */
  disconnect(): void {
    this.intentionalClose = true
    if (this.socket) {
      try {
        this.socket.close(1000, 'Client disconnecting')
      } catch (error) {
        writeLog(`ライブ文字起こし 切断エラー: ${error}`)
      }
      this.socket = null
    }
    this.isConnected = false
    this.pendingChunks.clear()
    this.callbacks.onConnectionChange(false)
  }

  get connected(): boolean {
    return this.isConnected
  }

  /**
   * サーバーメッセージ処理
   *
   * サーバーは chunk_progress / chunk_result に必ず chunkNumber を返す。
   * 返ってきた値をそのまま使う（推測しない）。返っていない場合は
   * 黙って別のチャンクに紐付けるのではなく、落として明示的にエラーにする。
   */
  private handleServerMessage(data: ServerMessage): void {
    switch (data.type) {
      case 'connection':
        writeLog(`ライブ文字起こし 接続確認: ${data.message}`)
        break

      case 'chunk_progress': {
        if (typeof data.chunkNumber !== 'number') {
          writeLog('ライブ文字起こし chunk_progress に chunkNumber がありません')
          return
        }
        this.callbacks.onChunkProgress({
          chunkNumber: data.chunkNumber,
          status: 'processing',
          message: data.status
        })
        break
      }

      case 'chunk_result': {
        if (typeof data.chunkNumber !== 'number') {
          writeLog('ライブ文字起こし chunk_result に chunkNumber がありません')
          this.callbacks.onError(
            'サーバーから chunkNumber が返されませんでした。' +
              'KoeNote と Whisper サーバーのバージョンが一致していません。'
          )
          return
        }

        this.pendingChunks.delete(data.chunkNumber)

        if (data.status === 'completed' && data.result) {
          this.callbacks.onChunkResult({
            chunkNumber: data.chunkNumber,
            text: extractText(data.result),
            segments: data.result.segments ?? [],
            timestamp: data.timestamp ?? Date.now()
          })
        } else {
          writeLog(`ライブ文字起こし 失敗: chunk=${data.chunkNumber} ${data.message ?? ''}`)
          this.callbacks.onChunkProgress({
            chunkNumber: data.chunkNumber,
            status: 'failed',
            message: data.message || 'チャンク文字起こしに失敗しました'
          })
        }
        break
      }

      case 'error':
        writeLog(`ライブ文字起こし サーバーエラー: ${data.message}`)
        this.callbacks.onError(data.message)
        break

      default:
        writeLog('ライブ文字起こし 未知のメッセージタイプ')
    }
  }
}
