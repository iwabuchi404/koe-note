/**
 * chunkReport - manifest と trans.txt の突き合わせロジック
 *
 * Phase E で manifest（チャンクインデックス）と trans.txt（文字起こし）が
 * 別に書かれるようになったため、UI ではこの 2 つをつき合わせる。
 * 「どのチャンクが文字起こし済みか」を表示する。
 */
import { describe, it, expect } from 'vitest'
import {
  buildChunkReport,
  formatChunkReportSummary,
  selectMissingChunkNumbers,
  type TranscriptSegmentLike
} from '../../src/shared/chunkReport'
import {
  appendChunkToManifest,
  createManifest,
  type RecordingManifest
} from '../../src/shared/recordingManifest'

const BASE = 'recording_20261004_125800'

function manifestOf(count: number, bytes = 16_000): RecordingManifest {
  let m = createManifest({
    baseName: BASE,
    format: 'mp3',
    createdAt: '2026-10-04T12:58:00.000Z'
  })
  for (let i = 0; i < count; i++) {
    m = appendChunkToManifest(m, {
      chunkNumber: i + 1,
      bytes,
      recordedAt: `2026-10-04T12:58:0${i}.000Z`
    })
  }
  return m
}

function segments(...chunkNumbers: number[]): TranscriptSegmentLike[] {
  return chunkNumbers.map((n, i) => ({
    chunkNumber: n,
    audioOffsetSeconds: i,
    text: `chunk ${n} の文字起こし`
  }))
}

describe('buildChunkReport', () => {
  it('manifest のチャンクを行として返す', () => {
    const report = buildChunkReport(manifestOf(3), [])
    expect(report.rows).toHaveLength(3)
    expect(report.rows.map((r) => r.chunkNumber)).toEqual([1, 2, 3])
    expect(report.hasManifest).toBe(true)
  })

  it('各行に manifest の値が入る', () => {
    const report = buildChunkReport(manifestOf(2, 32_000), [])
    const first = report.rows[0]
    expect(first.file).toBe('chunk_001.mp3')
    expect(first.bytes).toBe(32_000)
    expect(first.durationSeconds).toBe(2) // 32000 / 16000
    expect(first.audioOffsetSeconds).toBe(0)
  })

  it('trans.txt に 있는チャンクは transcribed', () => {
    const report = buildChunkReport(manifestOf(3), segments(1, 2))
    expect(report.rows.map((r) => r.status)).toEqual(['transcribed', 'transcribed', 'missing'])
    expect(report.transcribedCount).toBe(2)
    expect(report.missingCount).toBe(1)
  })

  it('trans.txt のテキストが行に入る', () => {
    const report = buildChunkReport(manifestOf(1), segments(1))
    expect(report.rows[0].text).toBe('chunk 1 の文字起こし')
  })

  it('文字起こしされていないチャンクのテキストは空文字', () => {
    const report = buildChunkReport(manifestOf(2), segments(1))
    expect(report.rows[1].text).toBe('')
  })

  it('manifest に無いチャンクが trans.txt にあると orphaned として列挙する', () => {
    const report = buildChunkReport(manifestOf(2), segments(1, 2, 9))
    expect(report.orphanedChunkNumbers).toEqual([9])
    // manifest 側の行は orphaned にならず missing のまま
    expect(report.rows.every((r) => r.status !== 'orphaned')).toBe(true)
  })

  it('manifest の不整合が problems 入る', () => {
    const m = manifestOf(2)
    m.recording.totalBytes = 999
    const report = buildChunkReport(m, [])
    expect(report.manifestProblems.some((p) => p.includes('totalBytes'))).toBe(true)
  })

  it('整合していれば不整合は空', () => {
    expect(buildChunkReport(manifestOf(3), segments(1, 2, 3)).manifestProblems).toEqual([])
  })

  it('manifest が無い録音でも trans.txt だけでレポートできる', () => {
    const report = buildChunkReport(null, segments(3, 1, 2))
    expect(report.hasManifest).toBe(false)
    // チャンク番号順に並ぶ
    expect(report.rows.map((r) => r.chunkNumber)).toEqual([1, 2, 3])
    expect(report.manifestProblems).toEqual([])
  })

  it('manifest が無い場合、manifest 由来の列は null になる（推測しない）', () => {
    const report = buildChunkReport(null, segments(1))
    expect(report.rows[0].file).toBeNull()
    expect(report.rows[0].bytes).toBeNull()
    expect(report.rows[0].durationSeconds).toBeNull()
    expect(report.rows[0].audioOffsetSeconds).toBe(0) // trans.txt 側の値は使える
  })

  it('manifest が無い場合、全行が orphaned になる', () => {
    const report = buildChunkReport(null, segments(1, 2))
    expect(report.orphanedChunkNumbers).toEqual([1, 2])
  })

  it('同じチャンクが複数回来ても1行にまとめる', () => {
    const report = buildChunkReport(manifestOf(1), [
      { chunkNumber: 1, audioOffsetSeconds: 0, text: '最初のもの' },
      { chunkNumber: 1, audioOffsetSeconds: 0, text: '後のもの' }
    ])
    expect(report.rows).toHaveLength(1)
    expect(report.rows[0].text).toBe('最初のもの')
  })

  it('manifest も trans.txt も空なら空のレポート', () => {
    const report = buildChunkReport(manifestOf(0), [])
    expect(report.rows).toEqual([])
    expect(report.transcribedCount).toBe(0)
    expect(report.missingCount).toBe(0)
  })
})

describe('selectMissingChunkNumbers', () => {
  it('未文字起こしのチャンク番号だけを返す', () => {
    const report = buildChunkReport(manifestOf(4), segments(2, 4))
    expect(selectMissingChunkNumbers(report)).toEqual([1, 3])
  })

  it('全部文字起こし済みなら空配列', () => {
    const report = buildChunkReport(manifestOf(2), segments(1, 2))
    expect(selectMissingChunkNumbers(report)).toEqual([])
  })

  it('manifest が無い場合は空（対象を確定できない）', () => {
    expect(selectMissingChunkNumbers(buildChunkReport(null, segments(1)))).toEqual([])
  })
})

describe('formatChunkReportSummary', () => {
  it('件数を 要約する', () => {
    const summary = formatChunkReportSummary(buildChunkReport(manifestOf(3), segments(1)))
    expect(summary).toContain('チャンク 3 件')
    expect(summary).toContain('文字起こし済 1')
    expect(summary).toContain('未 2')
  })

  it('manifest なしはそう書く', () => {
    const summary = formatChunkReportSummary(buildChunkReport(null, segments(1, 2)))
    expect(summary).toContain('manifest なし')
  })

  it('不整合があれば件数を出す', () => {
    const m = manifestOf(2)
    m.recording.chunkCount = 99
    expect(formatChunkReportSummary(buildChunkReport(m, []))).toContain('不整合 1')
  })
})