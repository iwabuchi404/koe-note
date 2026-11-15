/**
 * main 側ファイルシステム・セッションストアのテスト
 *
 * Electron 非依存（rootDir 注入）のため実ファイルで検証する。
 * 担保する不変条件:
 * - セッション作成・一覧・読み込みが roundtrip する
 * - チャンク保存がファイルと session.json の両方を更新する
 * - transcript 保存・読み込みが roundtrip する
 * - パストラバーサル（../ 等）は拒否する
 * - 不存在・破損ファイルは意味のあるエラーになる
 * - 'recording' 状態の読み出しは 'interrupted' に正規化されるが、
 *   書き込み系（appendChunk/update/saveTranscript）は state を汚染しない
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  appendSessionChunk,
  createSessionOnDisk,
  listSessions,
  loadSession,
  loadSessionTranscript,
  readSessionAudio,
  saveSessionTranscript,
  updateSession
} from '@main/services/sessionStore'
import { SESSIONS_DIR } from '@shared/session'
import { DEFAULT_ENCODING } from '@shared/audioFormat'
import type { TranscriptResult } from '@shared/transcript'

let rootDir: string
let sessionsDir: string

beforeEach(() => {
  rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'koenote-test-'))
  sessionsDir = path.join(rootDir, SESSIONS_DIR)
})

afterEach(() => {
  fs.rmSync(rootDir, { recursive: true, force: true })
})

const BASE_META = {
  sources: [
    {
      id: 'microphone',
      kind: 'microphone' as const,
      format: 'wav' as const,
      encoding: { ...DEFAULT_ENCODING }
    }
  ],
  meta: { title: 'テスト録音' }
}

const makeTranscript = (sessionId: string, id = 'live-001'): TranscriptResult => ({
  version: 1,
  id,
  sessionId,
  mode: 'live',
  engine: 'faster-whisper',
  model: 'small',
  sourceId: 'microphone',
  language: 'ja',
  status: 'completed',
  createdAt: '2026-11-15T13:42:00.000Z',
  edited: false,
  segments: [
    { id: 'seg-0000', start: 0, end: 1.5, text: 'こんにちは' }
  ]
})

const appendChunk = (sessionId: string, sourceId = 'microphone', offset = 0) =>
  appendSessionChunk(sessionsDir, {
    sessionId,
    sourceId,
    data: new Uint8Array([82, 73, 70, 70]),
    audioOffsetSeconds: offset,
    durationSeconds: 3,
    recordedAt: '2026-11-15T13:42:00.000Z'
  })

// =============================================================================
// セッション作成・読み込み
// =============================================================================

describe('createSessionOnDisk / loadSession', () => {
  it('セッションディレクトリと session.json を作成する', () => {
    const session = createSessionOnDisk(sessionsDir, BASE_META)
    expect(session.id).toMatch(/^\d{8}_\d{6}_[0-9a-z]{4}$/)
    expect(session.state).toBe('recording')

    const sessionDir = path.join(sessionsDir, session.id)
    expect(fs.existsSync(path.join(sessionDir, 'session.json'))).toBe(true)
  })

  it('ディスク上の session.json は作成時の内容と一致する', () => {
    const session = createSessionOnDisk(sessionsDir, BASE_META)
    const raw = fs.readFileSync(
      path.join(sessionsDir, session.id, 'session.json'),
      'utf-8'
    )
    expect(JSON.parse(raw)).toEqual(session)
  })

  it("読み出し時 'recording' は 'interrupted' に正規化される（クラッシュ復旧）", () => {
    const session = createSessionOnDisk(sessionsDir, BASE_META)
    const loaded = loadSession(sessionsDir, session.id)
    expect(loaded.state).toBe('interrupted')
    // 正規化は読み出しのみ — ディスク上は 'recording' のまま
    const raw = JSON.parse(
      fs.readFileSync(path.join(sessionsDir, session.id, 'session.json'), 'utf-8')
    )
    expect(raw.state).toBe('recording')
  })

  it('completed セッションは正規化されず roundtrip する', () => {
    const session = createSessionOnDisk(sessionsDir, BASE_META)
    updateSession(sessionsDir, session.id, {
      state: 'completed',
      endedAt: '2026-11-15T13:52:00.000Z',
      durationSeconds: 600
    })
    const loaded = loadSession(sessionsDir, session.id)
    expect(loaded.state).toBe('completed')
    expect(loaded.recording.endedAt).toBe('2026-11-15T13:52:00.000Z')
    expect(loaded.recording.durationSeconds).toBe(600)
  })

  it('存在しないセッションの読み込みはエラーになる', () => {
    expect(() => loadSession(sessionsDir, '20261115_134200_aaaa')).toThrow()
  })

  it('パストラバーサル形式の sessionId は拒否する', () => {
    for (const bad of ['../evil', 'a/b', '..\\evil', '20261115_134200_aaaa/../x']) {
      expect(() => loadSession(sessionsDir, bad)).toThrow()
    }
  })
})

// =============================================================================
// セッション一覧
// =============================================================================

describe('listSessions', () => {
  it('複数セッションを新しい順に列挙する', () => {
    const a = createSessionOnDisk(sessionsDir, BASE_META)
    const b = createSessionOnDisk(sessionsDir, BASE_META)
    const list = listSessions(sessionsDir)
    expect(list.map((s) => s.id)).toContain(a.id)
    expect(list.map((s) => s.id)).toContain(b.id)
    expect(list.length).toBe(2)
    expect(list[0].id >= list[1].id).toBe(true)
  })

  it('session.json のない孤立ディレクトリは一覧に含めない', () => {
    createSessionOnDisk(sessionsDir, BASE_META)
    fs.mkdirSync(path.join(sessionsDir, 'orphan_dir'), { recursive: true })
    const list = listSessions(sessionsDir)
    expect(list.length).toBe(1)
  })

  it('破損した session.json はスキップし他は列挙する', () => {
    const ok = createSessionOnDisk(sessionsDir, BASE_META)
    const broken = createSessionOnDisk(sessionsDir, BASE_META)
    fs.writeFileSync(
      path.join(sessionsDir, broken.id, 'session.json'),
      '{ broken json',
      'utf-8'
    )
    const list = listSessions(sessionsDir)
    expect(list.length).toBe(1)
    expect(list[0].id).toBe(ok.id)
  })

  it('sessions ディレクトリが未作成でも空配列を返す', () => {
    expect(listSessions(path.join(rootDir, 'nonexistent'))).toEqual([])
  })
})

// =============================================================================
// チャンク追記
// =============================================================================

describe('appendSessionChunk', () => {
  it('chunk ファイルを書き込み session.json の chunk 一覧を更新する', () => {
    const session = createSessionOnDisk(sessionsDir, BASE_META)
    const result = appendChunk(session.id)

    expect(result.file).toBe('audio/microphone/chunk_000.wav')

    const chunkPath = path.join(sessionsDir, session.id, result.file)
    expect(fs.readFileSync(chunkPath)).toEqual(Buffer.from([82, 73, 70, 70]))

    // ディスク上の session.json で検証（読み出し正規化の影響を避ける）
    const raw = JSON.parse(
      fs.readFileSync(path.join(sessionsDir, session.id, 'session.json'), 'utf-8')
    )
    const chunk = raw.sources[0].audio.chunks[0]
    expect(chunk.file).toBe('audio/microphone/chunk_000.wav')
    expect(chunk.audioOffsetSeconds).toBe(0)
    expect(chunk.durationSeconds).toBe(3)
    expect(chunk.bytes).toBe(4)
    // 録音時間はチャンクの終端まで伸びる
    expect(raw.recording.durationSeconds).toBe(3)
    // 書き込み経路が state を interrupted に汚染しない
    expect(raw.state).toBe('recording')
  })

  it('連続した chunk は連番になる', () => {
    const session = createSessionOnDisk(sessionsDir, BASE_META)
    for (let i = 0; i < 3; i++) {
      appendChunk(session.id, 'microphone', i * 3)
    }
    const raw = JSON.parse(
      fs.readFileSync(path.join(sessionsDir, session.id, 'session.json'), 'utf-8')
    )
    expect(raw.sources[0].audio.chunks.map((c: { file: string }) => c.file)).toEqual([
      'audio/microphone/chunk_000.wav',
      'audio/microphone/chunk_001.wav',
      'audio/microphone/chunk_002.wav'
    ])
    expect(raw.recording.durationSeconds).toBe(9)
  })

  it('複数 source はそれぞれ独立した連番になる', () => {
    const meta = {
      ...BASE_META,
      sources: [
        ...BASE_META.sources,
        {
          id: 'desktop',
          kind: 'desktop' as const,
          format: 'wav' as const,
          encoding: { ...DEFAULT_ENCODING, channels: 2 }
        }
      ]
    }
    const session = createSessionOnDisk(sessionsDir, meta)

    expect(appendChunk(session.id, 'microphone').file).toBe(
      'audio/microphone/chunk_000.wav'
    )
    expect(appendChunk(session.id, 'desktop').file).toBe('audio/desktop/chunk_000.wav')
    expect(appendChunk(session.id, 'microphone').file).toBe(
      'audio/microphone/chunk_001.wav'
    )

    const raw = JSON.parse(
      fs.readFileSync(path.join(sessionsDir, session.id, 'session.json'), 'utf-8')
    )
    expect(raw.sources[0].audio.chunks).toHaveLength(2)
    expect(raw.sources[1].audio.chunks).toHaveLength(1)
  })

  it('未定義の sourceId への追記はエラーになる', () => {
    const session = createSessionOnDisk(sessionsDir, BASE_META)
    expect(() => appendChunk(session.id, 'nonexistent')).toThrow()
  })
})

// =============================================================================
// transcript 保存・読み込み
// =============================================================================

describe('saveSessionTranscript / loadSessionTranscript', () => {
  it('transcript を transcripts/<id>.json に保存し参照を session.json に upsert する', () => {
    const session = createSessionOnDisk(sessionsDir, BASE_META)
    const transcript = makeTranscript(session.id)

    saveSessionTranscript(sessionsDir, session.id, transcript)

    const transcriptPath = path.join(
      sessionsDir,
      session.id,
      'transcripts',
      'live-001.json'
    )
    expect(fs.existsSync(transcriptPath)).toBe(true)

    const loaded = loadSession(sessionsDir, session.id)
    expect(loaded.transcripts).toHaveLength(1)
    expect(loaded.transcripts[0].id).toBe('live-001')
    expect(loaded.transcripts[0].file).toBe('transcripts/live-001.json')
    expect(loaded.transcripts[0].status).toBe('completed')

    expect(loadSessionTranscript(sessionsDir, session.id, 'live-001')).toEqual(
      transcript
    )
  })

  it('同じ id の再保存は参照を重複させない', () => {
    const session = createSessionOnDisk(sessionsDir, BASE_META)
    saveSessionTranscript(sessionsDir, session.id, makeTranscript(session.id))
    saveSessionTranscript(sessionsDir, session.id, {
      ...makeTranscript(session.id),
      edited: true
    })
    const loaded = loadSession(sessionsDir, session.id)
    expect(loaded.transcripts).toHaveLength(1)
    expect(
      loadSessionTranscript(sessionsDir, session.id, 'live-001').edited
    ).toBe(true)
  })

  it('sessionId が不一致の transcript は拒否する', () => {
    const session = createSessionOnDisk(sessionsDir, BASE_META)
    expect(() =>
      saveSessionTranscript(sessionsDir, session.id, makeTranscript('other'))
    ).toThrow()
  })

  it('存在しない transcript の読み込みはエラーになる', () => {
    const session = createSessionOnDisk(sessionsDir, BASE_META)
    expect(() =>
      loadSessionTranscript(sessionsDir, session.id, 'post-999')
    ).toThrow()
  })

  it('transcriptId のパストラバーサルは拒否する', () => {
    const session = createSessionOnDisk(sessionsDir, BASE_META)
    for (const bad of ['../x', 'a/b', '..\\x']) {
      expect(() =>
        loadSessionTranscript(sessionsDir, session.id, bad)
      ).toThrow()
    }
  })
})

// =============================================================================
// セッション更新
// =============================================================================

describe('updateSession', () => {
  it('state / endedAt / durationSeconds を部分更新する', () => {
    const session = createSessionOnDisk(sessionsDir, BASE_META)
    updateSession(sessionsDir, session.id, {
      state: 'completed',
      endedAt: '2026-11-15T13:52:00.000Z',
      durationSeconds: 600
    })
    const loaded = loadSession(sessionsDir, session.id)
    expect(loaded.state).toBe('completed')
    expect(loaded.recording.endedAt).toBe('2026-11-15T13:52:00.000Z')
    expect(loaded.recording.durationSeconds).toBe(600)
    expect(loaded.meta?.title).toBe('テスト録音')
  })

  it('transcript 参照の status/error を更新する', () => {
    const session = createSessionOnDisk(sessionsDir, BASE_META)
    saveSessionTranscript(sessionsDir, session.id, makeTranscript(session.id))

    updateSession(sessionsDir, session.id, {
      transcriptRef: { id: 'live-001', status: 'failed', error: 'asr failed' }
    })
    const loaded = loadSession(sessionsDir, session.id)
    expect(loaded.transcripts[0].status).toBe('failed')
    expect(loaded.transcripts[0].error).toBe('asr failed')
  })

  it('存在しない transcript 参照の更新は no-op（エラーにしない）', () => {
    const session = createSessionOnDisk(sessionsDir, BASE_META)
    updateSession(sessionsDir, session.id, {
      transcriptRef: { id: 'tr_missing', status: 'failed' }
    })
    expect(loadSession(sessionsDir, session.id).transcripts).toHaveLength(0)
  })

  it('空の patch でも session.json が壊れない', () => {
    const session = createSessionOnDisk(sessionsDir, BASE_META)
    updateSession(sessionsDir, session.id, {})
    const loaded = loadSession(sessionsDir, session.id)
    expect(loaded).toEqual({ ...session, state: 'interrupted' })
  })
})

// =============================================================================
// readSessionAudio（再生用のチャンク結合）
// =============================================================================

describe('readSessionAudio', () => {
  /** 44byte RIFF ヘッダ + PCM の最小 WAV を作る（テスト用） */
  const makeWavChunk = (pcm: number[]): Buffer => {
    const header = Buffer.alloc(44)
    header.write('RIFF', 0, 'ascii')
    header.writeUInt32LE(36 + pcm.length, 4)
    header.write('WAVE', 8, 'ascii')
    header.write('fmt ', 12, 'ascii')
    header.writeUInt32LE(16, 16)
    header.writeUInt16LE(1, 20)
    header.writeUInt16LE(1, 22)
    header.writeUInt32LE(44100, 24)
    header.writeUInt32LE(88200, 28)
    header.writeUInt16LE(2, 32)
    header.writeUInt16LE(16, 34)
    header.write('data', 36, 'ascii')
    header.writeUInt32LE(pcm.length, 40)
    return Buffer.concat([header, Buffer.from(pcm)])
  }

  it('mp3 チャンクはそのまま連結される', () => {
    const meta = {
      ...BASE_META,
      sources: [{ ...BASE_META.sources[0], format: 'mp3' as const }]
    }
    const session = createSessionOnDisk(sessionsDir, meta)
    appendSessionChunk(sessionsDir, {
      sessionId: session.id,
      sourceId: 'microphone',
      data: new Uint8Array([1, 2, 3]),
      audioOffsetSeconds: 0,
      durationSeconds: 1,
      recordedAt: '2026-11-15T13:42:00.000Z'
    })
    appendSessionChunk(sessionsDir, {
      sessionId: session.id,
      sourceId: 'microphone',
      data: new Uint8Array([4, 5]),
      audioOffsetSeconds: 1,
      durationSeconds: 1,
      recordedAt: '2026-11-15T13:42:01.000Z'
    })

    const audio = readSessionAudio(path.join(sessionsDir, session.id))
    expect(audio.mimeType).toBe('audio/mpeg')
    expect(Array.from(audio.data)).toEqual([1, 2, 3, 4, 5])
  })

  it('wav チャンクは PCM を結合し先頭ヘッダのサイズを書き換える', () => {
    const session = createSessionOnDisk(sessionsDir, BASE_META) // wav
    for (const pcm of [[1, 2], [3, 4, 5]]) {
      appendSessionChunk(sessionsDir, {
        sessionId: session.id,
        sourceId: 'microphone',
        data: new Uint8Array(makeWavChunk(pcm)),
        audioOffsetSeconds: 0,
        durationSeconds: 1,
        recordedAt: '2026-11-15T13:42:00.000Z'
      })
    }

    const audio = readSessionAudio(path.join(sessionsDir, session.id))
    expect(audio.mimeType).toBe('audio/wav')
    expect(audio.data.toString('ascii', 0, 4)).toBe('RIFF')
    // data サイズ = 2 + 3 = 5
    expect(audio.data.readUInt32LE(40)).toBe(5)
    expect(Array.from(audio.data.subarray(44))).toEqual([1, 2, 3, 4, 5])
  })

  it('チャンクのないセッションはエラーになる', () => {
    const session = createSessionOnDisk(sessionsDir, BASE_META)
    expect(() => readSessionAudio(path.join(sessionsDir, session.id))).toThrow()
  })
})
