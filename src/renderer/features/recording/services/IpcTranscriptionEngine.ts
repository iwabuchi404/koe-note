/**
 * IpcTranscriptionEngine - ライブ文字起こしの renderer 側エンジン
 *
 * Phase 2: renderer→WS 直結を廃止。WS は main の
 * LiveTranscriptionEngine が保持し、ここは transcription:* IPC と
 * push イベントを旧 TranscriptionWebSocketService と同じ面に写すだけの
 * アダプタ。呼び出し側（AudioWorkletRecordingService）は差し替えるだけで動く。
 */
import { LoggerFactory, LogCategories } from '@renderer/shared/utils/LoggerFactory'
import type {
  ChunkTranscriptionProgress,
  ChunkTranscriptionResult,
  TranscriptionChunk
} from '@shared/types'

export interface LiveTranscriptionCallbacks {
  onConnectionChange: (connected: boolean) => void
  onChunkTranscriptionResult: (result: ChunkTranscriptionResult) => void
  onChunkTranscriptionProgress: (progress: ChunkTranscriptionProgress) => void
  onError: (error: string) => void
}

const MAX_CHUNK_BYTES = 5 * 1024 * 1024

export class IpcTranscriptionEngine {
  private readonly serverUrl: string
  private readonly language: string
  private readonly callbacks: LiveTranscriptionCallbacks
  private readonly logger = LoggerFactory.getLogger(LogCategories.TRANSCRIPTION_WEBSOCKET)

  private isConnected = false
  private unsubscribes: Array<() => void> = []

  constructor(
    serverUrl: string = 'ws://localhost:8770',
    callbacks: LiveTranscriptionCallbacks,
    language: string = 'ja'
  ) {
    this.serverUrl = serverUrl
    this.callbacks = callbacks
    this.language = language
  }

  /**
   * 接続（push イベント購読 → main 側で WS open → 成否を返す）
   */
  async connect(): Promise<boolean> {
    try {
      this.logger.info('Whisperサーバーに接続中', { serverUrl: this.serverUrl })
      this.subscribeEvents()

      const connected = await window.electronAPI.transcriptionConnect(
        this.serverUrl,
        this.language
      )
      this.isConnected = connected
      if (!connected) {
        this.logger.warn('Whisperサーバーへの接続に失敗')
      }
      return connected
    } catch (error) {
      this.logger.error('文字起こし接続エラー:', error)
      this.isConnected = false
      return false
    }
  }

  /**
   * チャンクを文字起こしサーバーに送信する
   */
  async sendChunkForTranscription(chunk: TranscriptionChunk): Promise<boolean> {
    if (!this.isConnected) {
      this.logger.warn('未接続のためチャンク送信失敗')
      this.callbacks.onError('サーバーに接続されていません')
      return false
    }

    if (chunk.audioData.size > MAX_CHUNK_BYTES) {
      this.logger.warn(`チャンク#${chunk.chunkNumber} が大きすぎる (${chunk.audioData.size}bytes)`)
      this.callbacks.onError('チャンクサイズが大きすぎます')
      return false
    }

    try {
      return await window.electronAPI.transcriptionSendChunk({
        chunkNumber: chunk.chunkNumber,
        data: chunk.audioData,
        timestamp: chunk.timestamp
      })
    } catch (error) {
      this.logger.error(`チャンク#${chunk.chunkNumber} 送信エラー:`, error)
      this.callbacks.onError('チャンクの送信に失敗しました')
      return false
    }
  }

  /**
   * 接続を切る（意図的切断。main 側も再接続しない）
   */
  disconnect(): void {
    this.isConnected = false
    this.unsubscribeEvents()
    void window.electronAPI.transcriptionDisconnect().catch(() => undefined)
    this.callbacks.onConnectionChange(false)
    this.logger.info('文字起こし接続を切断しました')
  }

  getConnectionStatus(): boolean {
    return this.isConnected
  }

  private subscribeEvents(): void {
    if (this.unsubscribes.length > 0) return
    const api = window.electronAPI
    this.unsubscribes = [
      api.onTranscriptionConnection(({ connected }) => {
        this.isConnected = connected
        this.callbacks.onConnectionChange(connected)
      }),
      api.onTranscriptionResult((result) => {
        this.callbacks.onChunkTranscriptionResult(result)
      }),
      api.onTranscriptionProgress((progress) => {
        this.callbacks.onChunkTranscriptionProgress(progress)
      }),
      api.onTranscriptionError(({ message }) => {
        this.callbacks.onError(message)
      })
    ]
  }

  private unsubscribeEvents(): void {
    this.unsubscribes.forEach((unsubscribe) => unsubscribe())
    this.unsubscribes = []
  }
}
