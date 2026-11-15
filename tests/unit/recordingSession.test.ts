/**
 * RecordingSession（v2 録音 usecase）の単体テスト
 *
 * SessionStore ポートにインメモリ実装を注入し、Electron/IPC を介さず
 * セッションの手続きを検証する:
 * - start でセッション作成 + transcript 初期化
 * - appendChunk で offset/duration を連続採番して保存
 * - appendTranscription がチャンク位置を持つセグメントになる
 * - タイミング未到着の結果はペンディング→appendChunk で後追い
 * - finalize で completed/endedAt/durationSeconds に締める
 */
import { RecordingSession } from '@renderer/features/recording/usecases/RecordingSession'
import type { SessionStore } from '@renderer/features/recording/ports/SessionStore'
import type { SessionAppendChunkInput } from '@shared/types'
import type { SessionUpdateRequest } from '@shared/ipcContract'
import type { CreateSessionParams } from '@shared/session'
import type { TranscriptResult } from '@shared/transcript'
import { DEFAULT_ENCODING } from '@shared/audioFormat'

/** 呼び出しを記録するインメモリ SessionStore */
class InMemoryStore implements SessionStore {
  created: CreateSessionParams | null = null
  chunks: SessionAppendChunkInput[] = []
  updates: Array<{ sessionId: string; patch: SessionUpdateRequest }> = []
  transcripts: Array<{ sessionId: string; transcript: TranscriptResult }> = []
  nextId = '20261115_134200_x4f2'

  async createSession(meta: CreateSessionParams): Promise<{ id: string }> {
    this.created = meta
    return { id: this.nextId }
  }
  async appendChunk(req: SessionAppendChunkInput): Promise<{ file: string }> {
    this.chunks.push(req)
    return { file: `audio/${req.sourceId}/chunk_000.wav` }
  }
  async updateSession(sessionId: string, patch: SessionUpdateRequest): Promise<void> {
    this.updates.push({ sessionId, patch })
  }
  async saveTranscript(sessionId: string, transcript: TranscriptResult): Promise<void> {
    this.transcripts.push({ sessionId, transcript })
  }
}

const BASE_CONFIG = {
  sourceId: 'microphone',
  sourceKind: 'microphone' as const,
  device: 'default',
  format: 'mp3' as const,
  encoding: { ...DEFAULT_ENCODING },
  transcription: { engine: 'faster-whisper', model: 'small', language: 'ja' },
  meta: { legacyBaseName: 'recording_2026_11_15_1342' }
}

const makeSession = () => {
  const store = new InMemoryStore()
  const session = new RecordingSession(store)
  return { store, session }
}

describe('RecordingSession', () => {
  it('start: セッションを作成し sources/transcription を渡す', async () => {
    const { store, session } = makeSession()
    const id = await session.start(BASE_CONFIG)

    expect(id).toBe('20261115_134200_x4f2')
    expect(session.id).toBe(id)
    expect(store.created?.sources).toEqual([
      expect.objectContaining({
        id: 'microphone',
        kind: 'microphone',
        device: 'default',
        format: 'mp3'
      })
    ])
    expect(store.created?.meta).toEqual({ legacyBaseName: 'recording_2026_11_15_1342' })
  })

  it('appendChunk: offset/duration を連続採番して保存する', async () => {
    const { store, session } = makeSession()
    await session.start(BASE_CONFIG)

    // mp3 CBR 128kbps → 16000 B/s。16000bytes = 1.0秒
    await session.appendChunk(1, new Uint8Array(16000).buffer, '2026-11-15T13:42:01.000Z')
    await session.appendChunk(2, new Uint8Array(32000).buffer, '2026-11-15T13:42:03.000Z')

    expect(store.chunks).toHaveLength(2)
    expect(store.chunks[0]).toMatchObject({
      sessionId: '20261115_134200_x4f2',
      sourceId: 'microphone',
      audioOffsetSeconds: 0,
      durationSeconds: 1
    })
    expect(store.chunks[1].audioOffsetSeconds).toBe(1)
    expect(store.chunks[1].durationSeconds).toBe(2)
  })

  it('appendTranscription: チャンク位置を持つセグメントとして保存する', async () => {
    const { store, session } = makeSession()
    await session.start(BASE_CONFIG)
    await session.appendChunk(1, new Uint8Array(16000).buffer, '2026-11-15T13:42:01.000Z')
    await session.appendTranscription(1, 'こんにちは')

    const saved = store.transcripts[store.transcripts.length - 1].transcript
    expect(saved.id).toBe('live-001')
    expect(saved.mode).toBe('live')
    expect(saved.segments).toHaveLength(1)
    expect(saved.segments[0]).toMatchObject({
      chunkNumber: 1,
      start: 0,
      end: 1,
      text: 'こんにちは'
    })
  })

  it('タイミング未到着の文字起こしはペンディングし appendChunk で後追いする', async () => {
    const { store, session } = makeSession()
    await session.start(BASE_CONFIG)

    // 先に結果が届く（WS 応答が chunk 保存より早いレース）
    await session.appendTranscription(1, '早すぎた結果')
    expect(store.transcripts).toHaveLength(0)

    // チャンクが来た時点で反映される
    await session.appendChunk(1, new Uint8Array(16000).buffer, '2026-11-15T13:42:01.000Z')
    const saved = store.transcripts[store.transcripts.length - 1].transcript
    expect(saved.segments).toHaveLength(1)
    expect(saved.segments[0].chunkNumber).toBe(1)
  })

  it('transcription 無効なら transcript を作らない', async () => {
    const { store, session } = makeSession()
    await session.start({ ...BASE_CONFIG, transcription: undefined })
    await session.appendChunk(1, new Uint8Array(16000).buffer, '2026-11-15T13:42:01.000Z')
    await session.appendTranscription(1, '文字起こし')

    expect(store.transcripts).toHaveLength(0)
  })

  it('finalize: transcript を completed にしセッションを締める', async () => {
    const { store, session } = makeSession()
    await session.start(BASE_CONFIG)
    await session.appendChunk(1, new Uint8Array(16000).buffer, '2026-11-15T13:42:01.000Z')
    await session.appendTranscription(1, 'こんにちは')
    await session.finalize('2026-11-15T13:52:00.000Z', 600)

    const lastTranscript = store.transcripts[store.transcripts.length - 1].transcript
    expect(lastTranscript.status).toBe('completed')
    expect(store.updates).toEqual([
      {
        sessionId: '20261115_134200_x4f2',
        patch: {
          state: 'completed',
          endedAt: '2026-11-15T13:52:00.000Z',
          durationSeconds: 600
        }
      }
    ])
  })

  it('start 前の appendChunk はエラーになる', async () => {
    const { session } = makeSession()
    await expect(
      session.appendChunk(1, new Uint8Array(1).buffer, '2026-11-15T13:42:01.000Z')
    ).rejects.toThrow()
  })

  it('ストアの失敗は呼び出し側に伝播する（握り潰さない）', async () => {
    const { store, session } = makeSession()
    await session.start(BASE_CONFIG)
    store.appendChunk = async () => {
      throw new Error('disk full')
    }
    await expect(
      session.appendChunk(1, new Uint8Array(16000).buffer, '2026-11-15T13:42:01.000Z')
    ).rejects.toThrow('disk full')
  })
})
