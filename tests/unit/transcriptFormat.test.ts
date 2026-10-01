/**
 * transcriptFormat の契約テスト
 *
 * 修正前の挙動（実測で発見）:
 * - model: 'kotoba-whisper-medium' がハードコード（実際は small）
 * - duration: 0.000 / segment_count: 1 のまま
 * - coverage: 95.0 の仮値
 * - [HH:MM:SS.s] が結果の到着時刻（音声位置ではない）
 *
 * 実測値: 83秒の録音 → 20チャンク × 65,536バイト = 1,310,720バイト。
 * 128kbps = 16,000 B/s なので 65,536 / 16,000 = 4.096秒。
 */
import { describe, it, expect } from 'vitest'
import {
  formatAudioOffset,
  formatHeader,
  formatSegment,
  durationFromBytes,
  audioOffsetsFromChunkSizes,
  MP3_BYTES_PER_SECOND,
  type TranscriptHeader
} from '@renderer/services/transcription/transcriptFormat'

const makeHeader = (overrides: Partial<TranscriptHeader> = {}): TranscriptHeader => ({
  audioFile: 'recording_2026_10_01_0200.mp3',
  model: 'small',
  transcribedAt: '2026-10-01T02:00:13.937Z',
  durationSeconds: 81.92,
  segmentCount: 20,
  language: 'ja',
  speakers: [],
  ...overrides
})

describe('formatAudioOffset', () => {
  it('秒を HH:MM:SS.s に変換する', () => {
    expect(formatAudioOffset(0)).toBe('00:00:00.0')
    expect(formatAudioOffset(4.096)).toBe('00:00:04.0')
    expect(formatAudioOffset(65.5)).toBe('00:01:05.5')
    expect(formatAudioOffset(3661.25)).toBe('01:01:01.2')
  })

  it('負値は0に丸める', () => {
    expect(formatAudioOffset(-1)).toBe('00:00:00.0')
  })

  it('壁時計の時刻ではない（0から開始する経過位置）', () => {
    // 修正前は new Date() を渡しており 11:00:13.9 のような値になっていた
    expect(formatAudioOffset(0)).not.toMatch(/^1[12]:/)
  })
})

describe('durationFromBytes', () => {
  it('128kbps を 16,000 B/s として秒数に変換する', () => {
    expect(durationFromBytes(MP3_BYTES_PER_SECOND)).toBe(1)
    expect(durationFromBytes(65_536)).toBe(4.096)
    expect(durationFromBytes(1_310_720)).toBe(81.92)
  })

  it('バイト数が0なら0秒', () => {
    expect(durationFromBytes(0)).toBe(0)
  })

  it('バイトレートが0のとき無限大にしない', () => {
    expect(durationFromBytes(1000, 0)).toBe(0)
  })
})

describe('audioOffsetsFromChunkSizes', () => {
  it('累積バイト数から各チャンクの開始位置を求める', () => {
    const offsets = audioOffsetsFromChunkSizes([65_536, 65_536, 65_536])
    expect(offsets).toEqual([0, 4.096, 8.192])
  })

  it('異なるサイズのチャンクを扱える', () => {
    const offsets = audioOffsetsFromChunkSizes([16_000, 16_000, 32_000])
    expect(offsets).toEqual([0, 1, 2])
  })

  it('空配列では空配列', () => {
    expect(audioOffsetsFromChunkSizes([])).toEqual([])
  })
})

describe('formatHeader', () => {
  const header = makeHeader()

  it('YAMLフロントマター形式で出力する', () => {
    const lines = formatHeader(header).split('\n')
    expect(lines[0]).toBe('---')
    expect(lines[1]).toBe('audio_file: recording_2026_10_01_0200.mp3')
    expect(lines[2]).toBe('model: small')
    expect(lines[3]).toBe('transcribed_at: 2026-10-01T02:00:13.937Z')
    expect(lines[4]).toBe('duration: 81.920')
    expect(lines[5]).toBe('segment_count: 20')
    expect(lines[6]).toBe('language: ja')
    expect(lines[7]).toBe('speakers: []')
    expect(lines[8]).toBe('---')
  })

  it('実装のない coverage を出力しない', () => {
    // 修正前は 'coverage: 95.0 // 仮の値' が書き込まれていた
    expect(formatHeader(header)).not.toContain('coverage')
  })

  it('話者ラベルを引用符付きで出力する', () => {
    expect(formatHeader(makeHeader({ speakers: ['A', 'B'] }))).toContain('speakers: ["A", "B"]')
  })
})

describe('formatSegment', () => {
  it('音声位置付きの1行を返す', () => {
    expect(
      formatSegment({ chunkNumber: 3, audioOffsetSeconds: 8.192, text: 'テスト' })
    ).toBe('[00:00:08.1] テスト\n')
  })

  it('末尾の改行を必ず含める', () => {
    expect(formatSegment({ chunkNumber: 1, audioOffsetSeconds: 0, text: 'a' }).endsWith('\n')).toBe(true)
  })
})
