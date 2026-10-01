/**
 * .trans.txt フォーマット（src/shared/transcriptFile.ts）の契約テスト
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
  parseAudioOffset,
  formatTranscriptHeader,
  formatTranscriptSegment,
  formatTranscriptFile,
  parseTranscriptFile,
  parseTranscriptHeader,
  parseTranscriptSegments,
  parseSpeakerList,
  durationFromBytes,
  audioOffsetsFromChunkSizes,
  MP3_BYTES_PER_SECOND,
  type TranscriptHeader,
  type TranscriptSegmentLine
} from '@shared/transcriptFile'

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

describe('formatTranscriptHeader', () => {
  const header = makeHeader()

  it('YAMLフロントマター形式で出力する', () => {
    const lines = formatTranscriptHeader(header).split('\n')
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
    expect(formatTranscriptHeader(header)).not.toContain('coverage')
  })

  it('話者ラベルを引用符付きで出力する', () => {
    expect(formatTranscriptHeader(makeHeader({ speakers: ['A', 'B'] }))).toContain('speakers: ["A", "B"]')
  })
})

describe('formatTranscriptSegment', () => {
  it('音声位置付きの1行を返す', () => {
    expect(
      formatTranscriptSegment({ chunkNumber: 3, audioOffsetSeconds: 8.192, text: 'テスト' })
    ).toBe('[00:00:08.1] テスト\n')
  })

  it('末尾の改行を必ず含める', () => {
    expect(formatTranscriptSegment({ chunkNumber: 1, audioOffsetSeconds: 0, text: 'a' }).endsWith('\n')).toBe(true)
  })
})



describe('parseAudioOffset', () => {
  it('HH:MM:SS.s を秒に変換する', () => {
    expect(parseAudioOffset('00:00:00.0')).toBe(0)
    expect(parseAudioOffset('00:00:04.0')).toBe(4)
    expect(parseAudioOffset('00:00:08.1')).toBeCloseTo(8.1, 5)
    expect(parseAudioOffset('01:01:01.2')).toBeCloseTo(3661.2, 5)
  })

  it('小数が無くても解釈する', () => {
    expect(parseAudioOffset('00:00:05')).toBe(5)
  })

  it('形式が不正なら null', () => {
    expect(parseAudioOffset('invalid')).toBeNull()
    expect(parseAudioOffset('1:2:3')).toBeNull()
  })
})

describe('parseSpeakerList', () => {
  it('引用符付きリストを解釈する', () => {
    expect(parseSpeakerList('["A", "B"]')).toEqual(['A', 'B'])
  })

  it('空なら空配列', () => {
    expect(parseSpeakerList('[]')).toEqual([])
    expect(parseSpeakerList(undefined)).toEqual([])
  })

  it('引用符なしも許容する', () => {
    expect(parseSpeakerList('[A, B]')).toEqual(['A', 'B'])
  })
})

describe('writer と parser の往復', () => {
  const header = makeHeader()

  it('書き出して読み戻すとヘッダーが一致する', () => {
    expect(parseTranscriptHeader(formatTranscriptHeader(header))).toEqual(header)
  })

  it('書き出して読み戻すとセグメントが一致する', () => {
    const segments: TranscriptSegmentLine[] = [
      { audioOffsetSeconds: 0, text: '最初の行' },
      { audioOffsetSeconds: 4.096, text: '次の行' },
      { audioOffsetSeconds: 8.192, speaker: 'A', text: '発話' }
    ]
    const parsed = parseTranscriptFile(formatTranscriptFile(header, segments))

    expect(parsed.header).toEqual(header)
    expect(parsed.segments).toHaveLength(3)
    expect(parsed.segments[0]).toEqual({ audioOffsetSeconds: 0, speaker: undefined, text: '最初の行' })
    // フォーマットは小数1位（0.1秒）までの分解能しかないため、往復で丸まる
    expect(parsed.segments[1].audioOffsetSeconds).toBeCloseTo(4.096, 0)
    expect(parsed.segments[2].speaker).toBe('A')
  })

  it('位置の分解能は0.1秒（フォーマット互換の制約）', () => {
    expect(formatAudioOffset(4.096)).toBe('00:00:04.0')
    expect(parseAudioOffset('00:00:04.0')).toBe(4)
  })
})

describe('過去の変種ヘッダーの読み込み', () => {
  it('coverage / chunk_count があっても無視する', () => {
    const legacy = [
      '---',
      'audio_file: a.mp3',
      'model: kotoba-whisper-medium',
      'transcribed_at: 2025-01-01T00:00:00.000Z',
      'duration: 10',
      'segment_count: 1',
      'language: ja',
      'speakers: []',
      'coverage: 95.0',
      'chunk_count: 3',
      '---',
      '',
      '[00:00:00.0] テスト',
      ''
    ].join('\n')

    const parsed = parseTranscriptFile(legacy)
    expect(parsed.header?.model).toBe('kotoba-whisper-medium')
    expect(parsed.header?.durationSeconds).toBe(10)
    expect(parsed.header?.speakers).toEqual([])
    expect(parsed.segments).toHaveLength(1)
  })

  it('ヘッダー無しのプレーンテキストは header が null', () => {
    const parsed = parseTranscriptFile('ただのテキスト\n2行目\n')
    expect(parsed.header).toBeNull()
    expect(parsed.segments).toEqual([])
  })
})

