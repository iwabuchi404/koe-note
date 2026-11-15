/**
 * session - session.json のスキーマと構築ロジック
 *
 * 旧 manifest との差分が壊れやすいところを固定する:
 *   - chunk の file 名・audioOffsetSeconds は実値を保持する（推測しない）
 *   - 派生値（合計バイト・durationSeconds）は保持せず計算する
 *   - sources は複数を表現できるが Phase 1 は1つで運用する
 */
import { describe, it, expect } from 'vitest'
import {
  SESSION_VERSION,
  appendChunkToSource,
  addTranscriptRef,
  createSession,
  findSource,
  formatSession,
  generateSessionId,
  parseSession,
  sessionChunkFileName,
  sessionTotalBytes,
  sourceAudioDir,
  sourceTotalBytes,
  transcriptFilePath,
  updateTranscriptRef,
  validateSession,
  withRecordingEnded,
  withSessionState
} from '../../src/shared/session'
import { DEFAULT_ENCODING } from '../../src/shared/audioFormat'

const CREATED = '2026-11-15T13:42:00.000Z'

function newSession() {
  return createSession({
    id: '20261115_134200_x4f2',
    createdAt: CREATED,
    sources: [
      { id: 'microphone', kind: 'microphone', format: 'wav', encoding: DEFAULT_ENCODING }
    ]
  })
}

/** 3秒チャンク（WAV 44.1kHz 16bit mono = 88,200B/s ≈ 264,600B）を1件追記 */
function appendWavChunk(
  session: ReturnType<typeof newSession>,
  offset = 0,
  recordedAt = CREATED
) {
  return appendChunkToSource(session, 'microphone', {
    bytes: 264_600,
    audioOffsetSeconds: offset,
    durationSeconds: 3.0,
    recordedAt
  })
}

describe('セッション ID', () => {
  it('YYYYMMDD_HHMMSS_<rand4> 形式', () => {
    const id = generateSessionId(new Date('2026-11-15T13:42:07'), () => 'ab12')
    expect(id).toBe('20261115_134207_ab12')
  })

  it('デフォルトの rand4 は 0-9a-z の4文字', () => {
    const id = generateSessionId(new Date('2026-11-15T13:42:07'))
    expect(id).toMatch(/^20261115_134207_[0-9a-z]{4}$/)
  })

  it('同一秒でも rand4 で衝突を避けられる形式になっている', () => {
    const a = generateSessionId(new Date('2026-11-15T13:42:07'))
    const b = generateSessionId(new Date('2026-11-15T13:42:07'))
    // rand4 が偶然一致する可能性は低いが、形式として衝突回避の余地があることを確認
    expect(a).not.toBe(b)
  })
})

describe('createSession', () => {
  it('state=recording・endedAt=null・chunks空で作る', () => {
    const s = newSession()
    expect(s.version).toBe(SESSION_VERSION)
    expect(s.state).toBe('recording')
    expect(s.recording.startedAt).toBe(CREATED)
    expect(s.recording.endedAt).toBeNull()
    expect(s.recording.durationSeconds).toBe(0)
    expect(s.sources).toHaveLength(1)
    expect(s.sources[0].audio.chunks).toHaveLength(0)
    expect(s.transcripts).toHaveLength(0)
  })

  it('source の audio.dir は audio/<sourceId> 規則に従う', () => {
    const s = newSession()
    expect(s.sources[0].audio.dir).toBe('audio/microphone')
  })

  it('複数ソースを表現できる（Phase 2 の desktop 個別トラック用）', () => {
    const s = createSession({
      createdAt: CREATED,
      sources: [
        { id: 'microphone', kind: 'microphone', format: 'wav', encoding: DEFAULT_ENCODING },
        { id: 'desktop', kind: 'desktop', format: 'wav', encoding: DEFAULT_ENCODING }
      ]
    })
    expect(s.sources.map((x) => x.id)).toEqual(['microphone', 'desktop'])
  })
})

describe('appendChunkToSource', () => {
  it('チャンクを追記すると file は audio/<src>/chunk_NNN.<format> で作られる', () => {
    const s = appendWavChunk(newSession())
    const chunk = s.sources[0].audio.chunks[0]
    expect(chunk.file).toBe('audio/microphone/chunk_000.wav')
  })

  it('audioOffsetSeconds は実値を保持する（推定しない）', () => {
    let s = appendWavChunk(newSession(), 0)
    s = appendWavChunk(s, 3.0)
    s = appendWavChunk(s, 6.5) // 不規則な間隔でもそのまま記録する
    const chunks = s.sources[0].audio.chunks
    expect(chunks[1].audioOffsetSeconds).toBe(3.0)
    expect(chunks[2].audioOffsetSeconds).toBe(6.5)
    expect(chunks[1].file).toBe('audio/microphone/chunk_001.wav')
    expect(chunks[2].file).toBe('audio/microphone/chunk_002.wav')
  })

  it('recording.durationSeconds はチャンクの終端の最大値になる', () => {
    let s = appendWavChunk(newSession(), 0)
    s = appendWavChunk(s, 3.0)
    expect(s.recording.durationSeconds).toBe(6.0)
    // 後から短いオフセットを追記しても減らない
    s = appendWavChunk(s, 2.0)
    expect(s.recording.durationSeconds).toBe(6.0)
  })

  it('存在しないソースへの追記は例外', () => {
    expect(() =>
      appendChunkToSource(newSession(), 'desktop', {
        bytes: 1,
        audioOffsetSeconds: 0,
        durationSeconds: 1,
        recordedAt: CREATED
      })
    ).toThrow('desktop')
  })

  it('元の session は変えない（イミュータブル）', () => {
    const before = newSession()
    appendWavChunk(before)
    expect(before.sources[0].audio.chunks).toHaveLength(0)
  })
})

describe('状態遷移', () => {
  it('recording → finalizing → completed → endedAt を記録', () => {
    let s = appendWavChunk(newSession())
    s = withSessionState(s, 'finalizing')
    s = withRecordingEnded(s, '2026-11-15T13:45:00.000Z')
    s = withSessionState(s, 'completed')
    expect(s.state).toBe('completed')
    expect(s.recording.endedAt).toBe('2026-11-15T13:45:00.000Z')
    expect(validateSession(s)).toEqual([])
  })

  it('completed なのに endedAt が無いと検証で検出する', () => {
    const s = withSessionState(newSession(), 'completed')
    expect(validateSession(s).some((p) => p.includes('endedAt'))).toBe(true)
  })
})

describe('transcript 参照', () => {
  it('追加すると file は transcripts/<id>.json で作られる', () => {
    const s = addTranscriptRef(newSession(), {
      id: 'live-001',
      mode: 'live',
      engine: 'faster-whisper',
      model: 'kotoba-whisper-v2.0-faster',
      sourceId: 'microphone',
      language: 'ja',
      status: 'running',
      createdAt: CREATED
    })
    expect(s.transcripts[0].file).toBe('transcripts/live-001.json')
    expect(validateSession(s)).toEqual([])
  })

  it('同じ id の二重登録は例外', () => {
    const s = addTranscriptRef(newSession(), {
      id: 'live-001',
      mode: 'live',
      engine: 'faster-whisper',
      model: 'm',
      sourceId: 'microphone',
      language: 'ja',
      status: 'running',
      createdAt: CREATED
    })
    expect(() =>
      addTranscriptRef(s, {
        id: 'live-001',
        mode: 'live',
        engine: 'faster-whisper',
        model: 'm',
        sourceId: 'microphone',
        language: 'ja',
        status: 'running',
        createdAt: CREATED
      })
    ).toThrow('live-001')
  })

  it('status の更新と failed 時の error 記録', () => {
    let s = addTranscriptRef(newSession(), {
      id: 'post-001',
      mode: 'post',
      engine: 'speech.cpp',
      model: 'parakeet-tdt_ctc-0.6b-ja',
      sourceId: 'microphone',
      language: 'ja',
      status: 'running',
      createdAt: CREATED
    })
    s = updateTranscriptRef(s, 'post-001', { status: 'failed', error: 'engine crashed' })
    expect(s.transcripts[0].status).toBe('failed')
    expect(s.transcripts[0].error).toBe('engine crashed')
    expect(validateSession(s)).toEqual([])
  })

  it('sources に無い sourceId の参照は検証で検出する', () => {
    const s = {
      ...newSession(),
      transcripts: [
        {
          id: 'post-001',
          file: 'transcripts/post-001.json',
          mode: 'post' as const,
          engine: 'x',
          model: 'y',
          sourceId: 'desktop',
          language: 'ja',
          status: 'running' as const,
          createdAt: CREATED
        }
      ]
    }
    expect(validateSession(s).some((p) => p.includes('desktop'))).toBe(true)
  })
})

describe('派生値', () => {
  it('sourceTotalBytes/sessionTotalBytes は chunks から計算する', () => {
    let s = appendWavChunk(newSession(), 0)
    s = appendWavChunk(s, 3.0)
    const src = findSource(s, 'microphone')!
    expect(sourceTotalBytes(src)).toBe(529_200)
    expect(sessionTotalBytes(s)).toBe(529_200)
  })
})

describe('ファイル名規則', () => {
  it('chunk 名は3桁ゼロ埋め', () => {
    expect(sessionChunkFileName(0, 'wav')).toBe('chunk_000.wav')
    expect(sessionChunkFileName(7, 'wav')).toBe('chunk_007.wav')
    expect(sessionChunkFileName(1234, 'wav')).toBe('chunk_1234.wav')
  })

  it('ソース dir と transcript パス', () => {
    expect(sourceAudioDir('desktop')).toBe('audio/desktop')
    expect(transcriptFilePath('live-001')).toBe('transcripts/live-001.json')
  })
})

describe('parseSession / formatSession', () => {
  it('往復で復元できる', () => {
    let s = appendWavChunk(newSession())
    s = addTranscriptRef(s, {
      id: 'live-001',
      mode: 'live',
      engine: 'faster-whisper',
      model: 'm',
      sourceId: 'microphone',
      language: 'ja',
      status: 'completed',
      createdAt: CREATED
    })
    const restored = parseSession(formatSession(s))
    expect(restored).toEqual(s)
    expect(validateSession(restored)).toEqual([])
  })

  it('壊れた JSON は投げる', () => {
    expect(() => parseSession('{{{')).toThrow('JSON')
  })

  it('version が無い・新しすぎるものは投げる', () => {
    expect(() => parseSession('{}')).toThrow('version')
    const future = { ...newSession(), version: SESSION_VERSION + 1 }
    expect(() => parseSession(JSON.stringify(future))).toThrow('version')
  })

  it('sources / transcripts 配列が無いものは投げる', () => {
    const noSources = { ...newSession(), sources: undefined }
    expect(() => parseSession(JSON.stringify(noSources))).toThrow('sources')
  })
})

describe('validateSession', () => {
  it('順序異常な audioOffsetSeconds を検出する', () => {
    let s = appendWavChunk(newSession(), 6.0)
    s = appendWavChunk(s, 3.0)
    expect(validateSession(s).some((p) => p.includes('audioOffsetSeconds'))).toBe(true)
  })

  it('bytes<=0 を検出する', () => {
    const s = appendChunkToSource(newSession(), 'microphone', {
      bytes: 0,
      audioOffsetSeconds: 0,
      durationSeconds: 1,
      recordedAt: CREATED
    })
    expect(validateSession(s).some((p) => p.includes('bytes'))).toBe(true)
  })
})
