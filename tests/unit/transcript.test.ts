/**
 * transcript - 構造化文字起こし結果のスキーマと構築ロジック
 *
 * 複数エンジン・複数結果を同一構造で扱うための基本型。
 * タイムスタンプはセッション相対秒に統一する。
 */
import { describe, it, expect } from 'vitest'
import {
  TRANSCRIPT_VERSION,
  appendTranscriptSegment,
  createTranscript,
  formatTranscript,
  markTranscriptEdited,
  parseTranscript,
  transcriptSegmentId,
  validateTranscript,
  withTranscriptStatus
} from '../../src/shared/transcript'

const PARAMS = {
  id: 'live-001',
  sessionId: '20261115_134200_x4f2',
  mode: 'live' as const,
  engine: 'faster-whisper',
  model: 'kotoba-whisper-v2.0-faster',
  sourceId: 'microphone',
  language: 'ja',
  createdAt: '2026-11-15T13:42:00.000Z'
}

describe('createTranscript', () => {
  it('status=running・segments空・edited=false で作る', () => {
    const t = createTranscript(PARAMS)
    expect(t.version).toBe(TRANSCRIPT_VERSION)
    expect(t.status).toBe('running')
    expect(t.segments).toHaveLength(0)
    expect(t.edited).toBe(false)
    expect(t.sessionId).toBe('20261115_134200_x4f2')
    expect(t.mode).toBe('live')
  })
})

describe('appendTranscriptSegment', () => {
  it('id を seg-0001 形式で採番する', () => {
    let t = createTranscript(PARAMS)
    t = appendTranscriptSegment(t, { start: 0, end: 2.87, text: 'こんにちは' })
    t = appendTranscriptSegment(t, { start: 3.0, end: 5.5, text: '世界' })
    expect(t.segments[0].id).toBe('seg-0000')
    expect(t.segments[1].id).toBe('seg-0001')
  })

  it('chunkNumber・speakerId・confidence を保持できる（任意項目）', () => {
    const t = appendTranscriptSegment(createTranscript(PARAMS), {
      chunkNumber: 3,
      start: 9.0,
      end: 11.2,
      text: 'テスト',
      speakerId: 'speaker-1',
      confidence: 0.92
    })
    const seg = t.segments[0]
    expect(seg.chunkNumber).toBe(3)
    expect(seg.speakerId).toBe('speaker-1')
    expect(seg.confidence).toBe(0.92)
  })

  it('元の transcript は変えない（イミュータブル）', () => {
    const before = createTranscript(PARAMS)
    appendTranscriptSegment(before, { start: 0, end: 1, text: 'x' })
    expect(before.segments).toHaveLength(0)
  })
})

describe('status / edited', () => {
  it('running → completed', () => {
    const t = withTranscriptStatus(createTranscript(PARAMS), 'completed')
    expect(t.status).toBe('completed')
  })

  it('edited フラグを立てられる', () => {
    const t = markTranscriptEdited(createTranscript(PARAMS))
    expect(t.edited).toBe(true)
  })
})

describe('segment id 採番', () => {
  it('seg-NNNN 形式', () => {
    expect(transcriptSegmentId(0)).toBe('seg-0000')
    expect(transcriptSegmentId(12)).toBe('seg-0012')
    expect(transcriptSegmentId(12345)).toBe('seg-12345')
  })
})

describe('parseTranscript / formatTranscript', () => {
  it('往復で復元できる', () => {
    let t = createTranscript(PARAMS)
    t = appendTranscriptSegment(t, { start: 0, end: 2.87, text: 'では会議を始めましょう' })
    t = appendTranscriptSegment(t, { start: 2.9, end: 5.0, text: 'はい' })
    t = withTranscriptStatus(t, 'completed')
    const restored = parseTranscript(formatTranscript(t))
    expect(restored).toEqual(t)
    expect(validateTranscript(restored)).toEqual([])
  })

  it('壊れた JSON は投げる', () => {
    expect(() => parseTranscript('not json')).toThrow('JSON')
  })

  it('必須フィールドが無いものは投げる', () => {
    expect(() => parseTranscript('{}')).toThrow('version')
    const noSession = { ...createTranscript(PARAMS), sessionId: undefined }
    expect(() => parseTranscript(JSON.stringify(noSession))).toThrow('sessionId')
    const noSegs = { ...createTranscript(PARAMS), segments: undefined }
    expect(() => parseTranscript(JSON.stringify(noSegs))).toThrow('segments')
  })

  it('version が新しすぎるものは投げる', () => {
    const future = { ...createTranscript(PARAMS), version: TRANSCRIPT_VERSION + 1 }
    expect(() => parseTranscript(JSON.stringify(future))).toThrow('version')
  })
})

describe('validateTranscript', () => {
  it('end < start を検出する', () => {
    const t = appendTranscriptSegment(createTranscript(PARAMS), {
      start: 5,
      end: 2,
      text: 'x'
    })
    expect(validateTranscript(t).some((p) => p.includes('end'))).toBe(true)
  })

  it('start が前セグメントより小さい順序異常を検出する', () => {
    let t = appendTranscriptSegment(createTranscript(PARAMS), {
      start: 5,
      end: 6,
      text: 'a'
    })
    t = appendTranscriptSegment(t, { start: 3, end: 4, text: 'b' })
    expect(validateTranscript(t).some((p) => p.includes('順序異常'))).toBe(true)
  })

  it('confidence の範囲外を検出する', () => {
    const t = appendTranscriptSegment(createTranscript(PARAMS), {
      start: 0,
      end: 1,
      text: 'x',
      confidence: 1.5
    })
    expect(validateTranscript(t).some((p) => p.includes('confidence'))).toBe(true)
  })

  it('正常な結果は問題なし', () => {
    let t = createTranscript(PARAMS)
    t = appendTranscriptSegment(t, { start: 0, end: 2.87, text: 'a' })
    t = appendTranscriptSegment(t, { start: 2.9, end: 5.0, text: 'b', chunkNumber: 1 })
    expect(validateTranscript(t)).toEqual([])
  })
})
