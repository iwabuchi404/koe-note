/**
 * TranscriptionWebSocketService の接続・送受信・再接続
 *
 * 録音中の文字起こしは WS 経由。過去の実害:
 * - chunkNumber が結果に無い場合に「推測」で誤紐付け → 落として onError へ
 * - 未接続での送信 / 切断時の振る舞い
 *
 * FakeWebSocket で実際の接続シーケンスを再現して検証する。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { TranscriptionWebSocketService } from '@renderer/features/recording/services/TranscriptionWebSocketService'
import type { ChunkTranscriptionResult, ChunkTranscriptionProgress } from '@shared/types'

class FakeWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances: FakeWebSocket[] = []

  readonly url: string
  readyState = FakeWebSocket.CONNECTING
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: ((event: { code: number; reason: string; wasClean: boolean }) => void) | null = null
  onerror: ((event: unknown) => void) | null = null

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(code = 1000, reason = ''): void {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.({ code, reason, wasClean: code === 1000 })
  }

  // ---- テスト用シミュレーション ----
  simulateOpen(): void {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.()
  }

  simulateMessage(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) })
  }

  simulateRawMessage(raw: string): void {
    this.onmessage?.({ data: raw })
  }

  simulateDrop(): void {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.({ code: 1006, reason: 'abnormal', wasClean: false })
  }
}

const makeCallbacks = () => ({
  onConnectionChange: vi.fn<(connected: boolean) => void>(),
  onChunkTranscriptionResult: vi.fn<(result: ChunkTranscriptionResult) => void>(),
  onChunkTranscriptionProgress: vi.fn<(progress: ChunkTranscriptionProgress) => void>(),
  onError: vi.fn<(error: string) => void>()
})

describe('TranscriptionWebSocketService', () => {
  let callbacks: ReturnType<typeof makeCallbacks>
  let service: TranscriptionWebSocketService

  const lastSocket = () => FakeWebSocket.instances[FakeWebSocket.instances.length - 1]

  const connectService = async (): Promise<FakeWebSocket> => {
    const promise = service.connect()
    // connect() は内部で setTimeout(checkConnection, 100) を回す。
    // open を即座に発火させてから promise を待つ。
    lastSocket().simulateOpen()
    await expect(promise).resolves.toBe(true)
    return lastSocket()
  }

  beforeEach(() => {
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket)
    callbacks = makeCallbacks()
    service = new TranscriptionWebSocketService('ws://test:8770', callbacks)
  })

  afterEach(() => {
    service.disconnect()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('接続成功で onConnectionChange(true) が呼ばれる', async () => {
    await connectService()
    expect(callbacks.onConnectionChange).toHaveBeenCalledWith(true)
    expect(lastSocket().url).toBe('ws://test:8770')
  })

  it('チャンクを transcribe_chunk 形式で送信する', async () => {
    const socket = await connectService()

    const chunk = {
      chunkNumber: 3,
      audioData: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mp3' }),
      timestamp: 12345
    }
    await expect(service.sendChunkForTranscription(chunk)).resolves.toBe(true)

    expect(socket.sent).toHaveLength(1)
    const message = JSON.parse(socket.sent[0])
    expect(message.type).toBe('transcribe_chunk')
    expect(message.chunkNumber).toBe(3)
    expect(message.timestamp).toBe(12345)
    expect(message.language).toBe('ja')
    expect(typeof message.audio_data).toBe('string')
  })

  it('未接続での送信は false + onError', async () => {
    const sent = await service.sendChunkForTranscription({
      chunkNumber: 1,
      audioData: new Blob([new Uint8Array(1)]),
      timestamp: 0
    })

    expect(sent).toBe(false)
    expect(callbacks.onError).toHaveBeenCalledWith('サーバーに接続されていません')
  })

  it('5MB 超のチャンクは送信しない', async () => {
    const socket = await connectService()

    const sent = await service.sendChunkForTranscription({
      chunkNumber: 1,
      audioData: new Blob([new Uint8Array(5 * 1024 * 1024 + 1)]),
      timestamp: 0
    })

    expect(sent).toBe(false)
    expect(socket.sent).toHaveLength(0)
    expect(callbacks.onError).toHaveBeenCalledWith('チャンクサイズが大きすぎます')
  })

  it('chunk_result(completed) を onChunkTranscriptionResult に中継する', async () => {
    const socket = await connectService()

    socket.simulateMessage({
      type: 'chunk_result',
      status: 'completed',
      chunkNumber: 7,
      timestamp: 999,
      result: {
        language: 'ja',
        duration: 3,
        segments: [
          { start: 0, end: 1, text: 'こんにちは' },
          { start: 1, end: 2, text: '世界' }
        ],
        created_at: 0,
        segment_count: 2
      }
    })

    expect(callbacks.onChunkTranscriptionResult).toHaveBeenCalledWith(
      expect.objectContaining({
        chunkNumber: 7,
        text: 'こんにちは 世界',
        timestamp: 999
      })
    )
  })

  it('chunk_result に chunkNumber が無い場合は落として onError（推測しない）', async () => {
    const socket = await connectService()

    socket.simulateMessage({
      type: 'chunk_result',
      status: 'completed',
      result: { language: 'ja', duration: 1, segments: [], created_at: 0, segment_count: 0 }
    })

    expect(callbacks.onChunkTranscriptionResult).not.toHaveBeenCalled()
    expect(callbacks.onError).toHaveBeenCalledWith(
      expect.stringContaining('chunkNumber')
    )
  })

  it('chunk_result(failed) は progress の failed として流す', async () => {
    const socket = await connectService()

    socket.simulateMessage({
      type: 'chunk_result',
      status: 'failed',
      chunkNumber: 2,
      message: 'decode error'
    })

    expect(callbacks.onChunkTranscriptionProgress).toHaveBeenCalledWith(
      expect.objectContaining({ chunkNumber: 2, status: 'failed' })
    )
    expect(callbacks.onChunkTranscriptionResult).not.toHaveBeenCalled()
  })

  it('chunk_progress を progress(processing) として流す', async () => {
    const socket = await connectService()

    socket.simulateMessage({
      type: 'chunk_progress',
      status: 'processing',
      data_size: 100,
      chunkNumber: 4
    })

    expect(callbacks.onChunkTranscriptionProgress).toHaveBeenCalledWith(
      expect.objectContaining({ chunkNumber: 4, status: 'processing' })
    )
  })

  it('サーバー error メッセージを onError に流す', async () => {
    const socket = await connectService()
    socket.simulateMessage({ type: 'error', message: 'model not loaded' })

    expect(callbacks.onError).toHaveBeenCalledWith('model not loaded')
  })

  it('壊れた JSON は onError（クラッシュしない）', async () => {
    const socket = await connectService()
    socket.simulateRawMessage('not json {')

    expect(callbacks.onError).toHaveBeenCalledWith('サーバーメッセージの解析に失敗しました')
  })

  it('disconnect 後は送信できない', async () => {
    await connectService()
    service.disconnect()

    const sent = await service.sendChunkForTranscription({
      chunkNumber: 1,
      audioData: new Blob([new Uint8Array(1)]),
      timestamp: 0
    })

    expect(sent).toBe(false)
    expect(callbacks.onConnectionChange).toHaveBeenLastCalledWith(false)
  })

  it('異常切断では自動再接続を試みる', async () => {
    // 接続確立は実タイマーで行い、再接続遅延だけ fake timers で制御する
    const socket = await connectService()
    vi.useFakeTimers()
    socket.simulateDrop()

    expect(FakeWebSocket.instances).toHaveLength(1)
    // reconnectDelay=2000ms 後に新しいソケットが作られる
    await vi.advanceTimersByTimeAsync(2100)
    expect(FakeWebSocket.instances).toHaveLength(2)

    // 新しいソケットが開けば再接続完了
    lastSocket().simulateOpen()
    expect(callbacks.onConnectionChange).toHaveBeenLastCalledWith(true)
  })
})
