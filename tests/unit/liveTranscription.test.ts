/**
 * LiveTranscriptionEngine（main 側）の接続・送受信・再接続
 *
 * Phase 2 で renderer の TranscriptionWebSocketService から移植。
 * 録音中の文字起こしは WS 経由。過去の実害:
 * - chunkNumber が結果に無い場合に「推測」で誤紐付け → 落として onError へ
 * - 未接続での送信 / 切断時の振る舞い
 *
 * FakeSocket（ws 互換の on/send/close）で実際の接続シーケンスを再現して検証する。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('../../src/main/services/appLog', () => ({ writeLog: vi.fn() }))

import {
  LiveTranscriptionEngine,
  type TranscriptionSocket
} from '@main/services/liveTranscription'
import type { ChunkTranscriptionResult, ChunkTranscriptionProgress } from '@shared/types'

class FakeSocket implements TranscriptionSocket {
  static instances: FakeSocket[] = []

  readonly url: string
  sent: string[] = []
  closed = false
  private readonly handlers = new Map<string, Array<(...args: any[]) => void>>()

  constructor(url: string) {
    this.url = url
    FakeSocket.instances.push(this)
  }

  on(event: 'open', listener: () => void): void
  on(event: 'message', listener: (data: string | Buffer) => void): void
  on(event: 'error', listener: (error: Error) => void): void
  on(event: 'close', listener: (code: number, reason: string | Buffer) => void): void
  on(event: string, listener: (...args: any[]) => void): void {
    const list = this.handlers.get(event) ?? []
    list.push(listener)
    this.handlers.set(event, list)
  }

  send(data: string): void {
    this.sent.push(data)
  }

  close(code = 1000, reason: Buffer | string = ''): void {
    this.closed = true
    this.emit('close', code, reason)
  }

  private emit(event: string, ...args: any[]): void {
    this.handlers.get(event)?.forEach((listener) => listener(...args))
  }

  // ---- テスト用シミュレーション ----
  simulateOpen(): void {
    this.emit('open')
  }

  simulateMessage(data: unknown): void {
    this.emit('message', Buffer.from(JSON.stringify(data)))
  }

  simulateRawMessage(raw: string): void {
    this.emit('message', Buffer.from(raw))
  }

  simulateDrop(): void {
    this.emit('close', 1006, Buffer.from('abnormal'))
  }

  simulateError(message = 'boom'): void {
    this.emit('error', new Error(message))
  }
}

const makeCallbacks = () => ({
  onConnectionChange: vi.fn<(connected: boolean) => void>(),
  onChunkResult: vi.fn<(result: ChunkTranscriptionResult) => void>(),
  onChunkProgress: vi.fn<(progress: ChunkTranscriptionProgress) => void>(),
  onError: vi.fn<(message: string) => void>()
})

describe('LiveTranscriptionEngine', () => {
  let callbacks: ReturnType<typeof makeCallbacks>
  let engine: LiveTranscriptionEngine

  const lastSocket = () => FakeSocket.instances[FakeSocket.instances.length - 1]

  const connectEngine = async (): Promise<FakeSocket> => {
    const promise = engine.connect()
    lastSocket().simulateOpen()
    await expect(promise).resolves.toBe(true)
    return lastSocket()
  }

  beforeEach(() => {
    FakeSocket.instances = []
    callbacks = makeCallbacks()
    engine = new LiveTranscriptionEngine({
      serverUrl: 'ws://test:8770',
      callbacks,
      createSocket: (url) => new FakeSocket(url)
    })
  })

  afterEach(() => {
    engine.disconnect()
    vi.useRealTimers()
  })

  it('接続成功で onConnectionChange(true) が呼ばれる', async () => {
    await connectEngine()
    expect(callbacks.onConnectionChange).toHaveBeenCalledWith(true)
    expect(lastSocket().url).toBe('ws://test:8770')
  })

  it('チャンクを transcribe_chunk 形式で送信する', async () => {
    const socket = await connectEngine()

    const sent = engine.sendChunk({
      chunkNumber: 3,
      data: new Uint8Array([1, 2, 3]),
      timestamp: 12345
    })
    expect(sent).toBe(true)

    expect(socket.sent).toHaveLength(1)
    const message = JSON.parse(socket.sent[0])
    expect(message.type).toBe('transcribe_chunk')
    expect(message.chunkNumber).toBe(3)
    expect(message.timestamp).toBe(12345)
    expect(message.language).toBe('ja')
    expect(message.audio_data).toBe('AQID') // base64 of [1,2,3]
  })

  it('language オプションが送信メッセージに反映される', async () => {
    const enEngine = new LiveTranscriptionEngine({
      serverUrl: 'ws://test:8770',
      language: 'en',
      callbacks: makeCallbacks(),
      createSocket: (url) => new FakeSocket(url)
    })
    const promise = enEngine.connect()
    lastSocket().simulateOpen()
    await promise

    enEngine.sendChunk({ chunkNumber: 1, data: new Uint8Array([0]), timestamp: 0 })

    expect(JSON.parse(lastSocket().sent[0]).language).toBe('en')
    enEngine.disconnect()
  })

  it('未接続での送信は false + onError', () => {
    const sent = engine.sendChunk({
      chunkNumber: 1,
      data: new Uint8Array(1),
      timestamp: 0
    })

    expect(sent).toBe(false)
    expect(callbacks.onError).toHaveBeenCalledWith('サーバーに接続されていません')
  })

  it('5MB 超のチャンクは送信しない', async () => {
    const socket = await connectEngine()

    const sent = engine.sendChunk({
      chunkNumber: 1,
      data: new Uint8Array(5 * 1024 * 1024 + 1),
      timestamp: 0
    })

    expect(sent).toBe(false)
    expect(socket.sent).toHaveLength(0)
    expect(callbacks.onError).toHaveBeenCalledWith('チャンクサイズが大きすぎます')
  })

  it('chunk_result(completed) を onChunkResult に中継する', async () => {
    const socket = await connectEngine()

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

    expect(callbacks.onChunkResult).toHaveBeenCalledWith(
      expect.objectContaining({
        chunkNumber: 7,
        text: 'こんにちは 世界',
        timestamp: 999
      })
    )
  })

  it('chunk_result に chunkNumber が無い場合は落として onError（推測しない）', async () => {
    const socket = await connectEngine()

    socket.simulateMessage({
      type: 'chunk_result',
      status: 'completed',
      result: { language: 'ja', duration: 1, segments: [], created_at: 0, segment_count: 0 }
    })

    expect(callbacks.onChunkResult).not.toHaveBeenCalled()
    expect(callbacks.onError).toHaveBeenCalledWith(expect.stringContaining('chunkNumber'))
  })

  it('chunk_result(failed) は progress の failed として流す', async () => {
    const socket = await connectEngine()

    socket.simulateMessage({
      type: 'chunk_result',
      status: 'failed',
      chunkNumber: 2,
      message: 'decode error'
    })

    expect(callbacks.onChunkProgress).toHaveBeenCalledWith(
      expect.objectContaining({ chunkNumber: 2, status: 'failed' })
    )
    expect(callbacks.onChunkResult).not.toHaveBeenCalled()
  })

  it('chunk_progress を progress(processing) として流す', async () => {
    const socket = await connectEngine()

    socket.simulateMessage({
      type: 'chunk_progress',
      status: 'processing',
      data_size: 100,
      chunkNumber: 4
    })

    expect(callbacks.onChunkProgress).toHaveBeenCalledWith(
      expect.objectContaining({ chunkNumber: 4, status: 'processing' })
    )
  })

  it('chunk_progress に chunkNumber が無い場合は黙って落とす', async () => {
    const socket = await connectEngine()

    socket.simulateMessage({
      type: 'chunk_progress',
      status: 'processing',
      data_size: 100
    })

    expect(callbacks.onChunkProgress).not.toHaveBeenCalled()
    expect(callbacks.onError).not.toHaveBeenCalled()
  })

  it('サーバー error メッセージを onError に流す', async () => {
    const socket = await connectEngine()
    socket.simulateMessage({ type: 'error', message: 'model not loaded' })

    expect(callbacks.onError).toHaveBeenCalledWith('model not loaded')
  })

  it('壊れた JSON は onError（クラッシュしない）', async () => {
    const socket = await connectEngine()
    socket.simulateRawMessage('not json {')

    expect(callbacks.onError).toHaveBeenCalledWith('サーバーメッセージの解析に失敗しました')
  })

  it('disconnect 後は送信できない', async () => {
    await connectEngine()
    engine.disconnect()

    const sent = engine.sendChunk({
      chunkNumber: 1,
      data: new Uint8Array(1),
      timestamp: 0
    })

    expect(sent).toBe(false)
    expect(callbacks.onConnectionChange).toHaveBeenLastCalledWith(false)
  })

  it('意図的切断（code=1000）は再接続しない', async () => {
    const socket = await connectEngine()
    socket.close(1000, 'server shutdown')

    expect(FakeSocket.instances).toHaveLength(1)
  })

  it('異常切断では自動再接続を試みる', async () => {
    // 接続確立は実タイマーで行い、再接続遅延だけ fake timers で制御する
    const socket = await connectEngine()
    vi.useFakeTimers()
    socket.simulateDrop()

    expect(FakeSocket.instances).toHaveLength(1)
    // reconnectDelayMs=2000 後に新しいソケットが作られる
    await vi.advanceTimersByTimeAsync(2100)
    expect(FakeSocket.instances).toHaveLength(2)

    // 新しいソケットが開けば再接続完了
    lastSocket().simulateOpen()
    expect(callbacks.onConnectionChange).toHaveBeenLastCalledWith(true)
  })

  it('接続タイムアウトは false を返す', async () => {
    vi.useFakeTimers()
    const promise = engine.connect()
    await vi.advanceTimersByTimeAsync(11_000)

    await expect(promise).resolves.toBe(false)
  })
})
