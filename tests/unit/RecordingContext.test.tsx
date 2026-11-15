/**
 * RecordingContext の録音オーケストレーション
 *
 * 録音周りで過去に壊れた経路を担保する:
 * - 開始時にセッション作成 → サービス起動 → isRecording/recordingFile 設定
 * - チャンク到着 → セッション保存（失敗しても録音は継続する）
 * - 文字起こし結果 → transcript 反映（失敗は transcription エラー、録音は継続）
 * - 停止 → pending チャンクをキャンセル扱い、状態クリア
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'
import type { AudioWorkletRecordingService } from '@renderer/features/recording/services/AudioWorkletRecordingService'
import type { ChunkReadyEvent, RecordingStats } from '@renderer/features/recording/services/AudioWorkletRecordingService'
import type { ChunkTranscriptionResult } from '@shared/types'
import {
  RecordingProvider,
  useRecordingContext,
  type AdvancedRecordingConfig
} from '@renderer/features/recording/RecordingContext'
import React from 'react'

// ---- AudioWorkletRecordingService のモック ----
const serviceState = vi.hoisted(() => ({
  instances: [] as Array<{
    onChunkReady: (event: ChunkReadyEvent) => Promise<void>
    onError: (error: Error) => void
    onStatsUpdate: (stats: RecordingStats) => void
    onTranscriptionResult: (result: ChunkTranscriptionResult) => Promise<void>
    onTranscriptionProgress: (progress: unknown) => void
    setTranscriptionConfig: ReturnType<typeof vi.fn>
    setChunkSizeThreshold: ReturnType<typeof vi.fn>
    startWithConfig: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
  }>
}))

vi.mock('@renderer/features/recording/services/AudioWorkletRecordingService', () => ({
  AudioWorkletRecordingService: class {
    onChunkReady: (event: ChunkReadyEvent) => Promise<void>
    onError: (error: Error) => void
    onStatsUpdate: (stats: RecordingStats) => void
    onTranscriptionResult: (result: ChunkTranscriptionResult) => Promise<void>
    onTranscriptionProgress: (progress: unknown) => void
    setTranscriptionConfig = vi.fn()
    setChunkSizeThreshold = vi.fn()
    startWithConfig = vi.fn().mockResolvedValue(undefined)
    stop = vi.fn().mockResolvedValue(new Blob(['final']))

    constructor(
      onChunkReady: (event: ChunkReadyEvent) => Promise<void>,
      onError: (error: Error) => void,
      onStatsUpdate: (stats: RecordingStats) => void,
      onTranscriptionResult: (result: ChunkTranscriptionResult) => Promise<void>,
      onTranscriptionProgress: (progress: unknown) => void
    ) {
      this.onChunkReady = onChunkReady
      this.onError = onError
      this.onStatsUpdate = onStatsUpdate
      this.onTranscriptionResult = onTranscriptionResult
      this.onTranscriptionProgress = onTranscriptionProgress
      serviceState.instances.push(this)
    }
  }
}))

// ---- IpcSessionStore（v2 セッション永続化）のモック ----
const sessionStore = vi.hoisted(() => ({
  createSession: vi.fn(),
  appendChunk: vi.fn(),
  updateSession: vi.fn(),
  saveTranscript: vi.fn()
}))

vi.mock('@renderer/features/recording/services/IpcSessionStore', () => ({
  IpcSessionStore: class {
    createSession = sessionStore.createSession
    appendChunk = sessionStore.appendChunk
    updateSession = sessionStore.updateSession
    saveTranscript = sessionStore.saveTranscript
  }
}))

type Ctx = ReturnType<typeof useRecordingContext>
const probe: { ctx: Ctx | null } = { ctx: null }

const Probe: React.FC = () => {
  probe.ctx = useRecordingContext()
  return null
}

const renderProvider = async () => {
  await act(async () => {
    render(
      <RecordingProvider>
        <Probe />
      </RecordingProvider>
    )
  })
}

const makeConfig = (overrides: Partial<AdvancedRecordingConfig> = {}): AdvancedRecordingConfig => ({
  recordingSettings: {
    source: 'microphone',
    deviceId: undefined,
    chunkSize: 64,
    chunkDuration: 3.0,
    chunkSizeMode: 'duration',
    format: 'mp3'
  },
  transcriptionSettings: {
    enabled: true,
    serverUrl: 'ws://localhost:8770',
    language: 'ja',
    model: 'small'
  },
  ...overrides
})

const lastService = () => serviceState.instances[serviceState.instances.length - 1]

const emitChunk = async (chunkNumber: number, size = 100) => {
  await act(async () => {
    await lastService().onChunkReady({
      chunk: new Blob([new Uint8Array(size)]),
      chunkNumber,
      timestamp: Date.now(),
      size
    })
  })
}

const emitTranscription = async (chunkNumber: number, text = 'テスト') => {
  await act(async () => {
    await lastService().onTranscriptionResult({
      chunkNumber,
      text,
      segments: [],
      timestamp: Date.now()
    })
  })
}

describe('RecordingContext', () => {
  beforeEach(() => {
    serviceState.instances = []
    vi.clearAllMocks()
    sessionStore.createSession.mockResolvedValue({ id: '20261115_134200_x4f2' })
    sessionStore.appendChunk.mockResolvedValue({ file: 'audio/microphone/chunk_000.wav' })
    sessionStore.updateSession.mockResolvedValue(undefined)
    sessionStore.saveTranscript.mockResolvedValue(undefined)
    probe.ctx = null
  })

  it('開始: セッション作成 → サービス起動 → isRecording/recordingFile 設定', async () => {
    await renderProvider()

    await act(async () => {
      await probe.ctx!.startRecording(makeConfig())
    })

    expect(probe.ctx!.isRecording).toBe(true)
    expect(probe.ctx!.recordingFile?.isRecording).toBe(true)
    // 録音中マーカーはセッション ID を表示名にする
    // （停止後にライブラリへ現れる項目と一致する）
    expect(probe.ctx!.recordingFile?.filename).toBe('20261115_134200_x4f2')
    expect(probe.ctx!.recordingFile?.isSession).toBe(true)
    expect(probe.ctx!.recordingFile?.transcriptionPath).toBe('transcripts/live-001.json')

    expect(lastService().setTranscriptionConfig).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: true, serverUrl: 'ws://localhost:8770' })
    )
    expect(lastService().setChunkSizeThreshold).toHaveBeenCalledWith(64 * 1024)
    expect(lastService().startWithConfig).toHaveBeenCalledWith({ type: 'microphone' })
  })

  it('二重開始はしない', async () => {
    await renderProvider()
    await act(async () => {
      await probe.ctx!.startRecording(makeConfig())
    })
    await act(async () => {
      await probe.ctx!.startRecording(makeConfig())
    })

    expect(serviceState.instances).toHaveLength(1)
  })

  it('チャンク到着でセッションに保存され、一覧に追加される', async () => {
    await renderProvider()
    await act(async () => {
      await probe.ctx!.startRecording(makeConfig())
    })

    await emitChunk(1)
    await emitChunk(2, 200)

    expect(probe.ctx!.recordingData.chunks).toHaveLength(2)
    expect(sessionStore.appendChunk).toHaveBeenCalledTimes(2)
    expect(sessionStore.appendChunk).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ sessionId: '20261115_134200_x4f2' })
    )
  })

  it('文字起こし結果で transcript 保存 + チャンク completed', async () => {
    await renderProvider()
    await act(async () => {
      await probe.ctx!.startRecording(makeConfig())
    })
    await emitChunk(1)
    await emitTranscription(1, 'こんにちは')

    await waitFor(() => {
      expect(sessionStore.saveTranscript).toHaveBeenCalled()
    })
    expect(probe.ctx!.recordingData.chunks[0].transcriptionStatus).toBe('completed')
    expect(probe.ctx!.recordingData.chunks[0].transcriptionText).toBe('こんにちは')
  })

  it('transcript 保存の失敗は transcription エラーになり録音は継続する', async () => {
    sessionStore.saveTranscript.mockRejectedValueOnce(new Error('write failed'))
    await renderProvider()
    await act(async () => {
      await probe.ctx!.startRecording(makeConfig())
    })
    await emitChunk(1)
    await emitTranscription(1)

    await waitFor(() => {
      expect(probe.ctx!.recordingData.errors.some((e) => e.type === 'transcription')).toBe(true)
    })
    expect(probe.ctx!.isRecording).toBe(true)
  })

  it('録音中のサービスエラーは recording エラーとして記録する', async () => {
    await renderProvider()
    await act(async () => {
      await probe.ctx!.startRecording(makeConfig())
    })
    await act(async () => {
      lastService().onError(new Error('mic lost'))
    })

    expect(probe.ctx!.recordingData.errors.some((e) => e.type === 'recording' && e.message === 'mic lost')).toBe(true)
  })

  it('停止: pending チャンクはキャンセル扱い、状態をクリアする', async () => {
    await renderProvider()
    await act(async () => {
      await probe.ctx!.startRecording(makeConfig())
    })
    await emitChunk(1)

    await act(async () => {
      await probe.ctx!.stopRecording()
    })

    expect(lastService().stop).toHaveBeenCalled()
    expect(probe.ctx!.isRecording).toBe(false)
    expect(probe.ctx!.recordingFile).toBeNull()
    expect(probe.ctx!.recordingData.chunks[0].transcriptionStatus).toBe('failed')
    expect(probe.ctx!.recordingData.chunks[0].transcriptionText).toBe('録音停止によりキャンセル')
  })

  it('完了済みチャンクは停止時にキャンセルへ書き換えない', async () => {
    await renderProvider()
    await act(async () => {
      await probe.ctx!.startRecording(makeConfig())
    })
    await emitChunk(1)
    await emitTranscription(1, '確定済み')

    await waitFor(() => {
      expect(probe.ctx!.recordingData.chunks[0].transcriptionStatus).toBe('completed')
    })

    await act(async () => {
      await probe.ctx!.stopRecording()
    })

    expect(probe.ctx!.recordingData.chunks[0].transcriptionStatus).toBe('completed')
    expect(probe.ctx!.recordingData.chunks[0].transcriptionText).toBe('確定済み')
  })

  it('未開始での停止は null を返しエラーを記録する', async () => {
    await renderProvider()

    let result: Blob | null = null as unknown as Blob
    await act(async () => {
      result = await probe.ctx!.stopRecording()
    })

    expect(result).toBeNull()
    expect(probe.ctx!.recordingData.errors.some((e) => e.type === 'recording')).toBe(true)
  })

  // ---- v2 セッション（dual-write） ----

  it('開始: セッションを作成し sources/format/transcription を正しく渡す', async () => {
    await renderProvider()

    await act(async () => {
      await probe.ctx!.startRecording(makeConfig())
    })

    expect(sessionStore.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: [
          expect.objectContaining({
            id: 'microphone',
            kind: 'microphone',
            format: 'mp3'
          })
        ]
      })
    )
  })

  it('開始: mix ソースは kind=mixed のソースを作る', async () => {
    await renderProvider()

    await act(async () => {
      await probe.ctx!.startRecording(
        makeConfig({
          recordingSettings: {
            ...makeConfig().recordingSettings,
            source: 'mix'
          }
        })
      )
    })

    expect(sessionStore.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: [expect.objectContaining({ id: 'mixed', kind: 'mixed' })]
      })
    )
  })

  it('開始: セッション作成に失敗しても録音は継続する', async () => {
    sessionStore.createSession.mockRejectedValueOnce(new Error('session create failed'))
    await renderProvider()

    await act(async () => {
      await probe.ctx!.startRecording(makeConfig())
    })

    expect(probe.ctx!.isRecording).toBe(true)
    expect(probe.ctx!.recordingData.errors.some((e) => e.type === 'recording')).toBe(true)
  })

  it('チャンク到着でセッションにも保存する', async () => {
    await renderProvider()
    await act(async () => {
      await probe.ctx!.startRecording(makeConfig())
    })

    await emitChunk(1)
    await emitChunk(2, 200)

    expect(sessionStore.appendChunk).toHaveBeenCalledTimes(2)
    expect(sessionStore.appendChunk).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sessionId: '20261115_134200_x4f2',
        sourceId: 'microphone',
        audioOffsetSeconds: expect.any(Number),
        durationSeconds: expect.any(Number)
      })
    )
    // 2つ目のチャンクは1つ目の終端から始まる（連続 offset）
    const first = sessionStore.appendChunk.mock.calls[0][0]
    const second = sessionStore.appendChunk.mock.calls[1][0]
    expect(second.audioOffsetSeconds).toBeGreaterThanOrEqual(
      first.audioOffsetSeconds + first.durationSeconds
    )
  })

  it('セッション保存の失敗も録音は継続する（error 記録のみ）', async () => {
    sessionStore.appendChunk.mockRejectedValueOnce(new Error('session disk full'))
    await renderProvider()
    await act(async () => {
      await probe.ctx!.startRecording(makeConfig())
    })

    await emitChunk(1)

    await waitFor(() => {
      expect(probe.ctx!.recordingData.errors.some((e) => e.type === 'recording')).toBe(true)
    })
    expect(probe.ctx!.isRecording).toBe(true)
    // 失敗してもチャンク自体は state に残る
    expect(probe.ctx!.recordingData.chunks).toHaveLength(1)
  })

  it('文字起こし結果はセッション transcript にも保存する', async () => {
    await renderProvider()
    await act(async () => {
      await probe.ctx!.startRecording(makeConfig())
    })
    await emitChunk(1)
    await emitTranscription(1, 'こんにちは')

    await waitFor(() => {
      expect(sessionStore.saveTranscript).toHaveBeenCalledWith(
        '20261115_134200_x4f2',
        expect.objectContaining({
          id: 'live-001',
          segments: expect.arrayContaining([
            expect.objectContaining({ chunkNumber: 1, text: 'こんにちは' })
          ])
        })
      )
    })
  })

  it('停止: セッションを completed で締める', async () => {
    await renderProvider()
    await act(async () => {
      await probe.ctx!.startRecording(makeConfig())
    })
    await emitChunk(1)

    await act(async () => {
      await probe.ctx!.stopRecording()
    })

    expect(sessionStore.updateSession).toHaveBeenCalledWith(
      '20261115_134200_x4f2',
      expect.objectContaining({
        state: 'completed',
        endedAt: expect.any(String),
        durationSeconds: expect.any(Number)
      })
    )
  })
})
