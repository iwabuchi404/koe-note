/**
 * chunkReport - manifest と trans.txt から「チャンクの状況」を作る純粋ロジック
 *
 * Phase E で manifest（チャンクインデックス）と trans.txt（文字起こし）が
 * 別々に書かれるようになったため、UI ではこの2つを突き合わせて
 * 「どのチャンクが文字起こし済みか」を表示したい。
 *
 * このモジュールは I/O を持たない。manifest と trans.txt のパース結果を受け取り、
 * 表示用の行を返すだけにする。
 * 読み込み（IPC）や描画は呼び出し側の責務。
 */

import { validateManifest, type RecordingManifest, type ManifestChunk } from './recordingManifest'

/** チャンクの文字起こし状況 */
export type ChunkTranscriptionStatus =
  /** 文字起こし済み（trans.txt に行がある） */
  | 'transcribed'
  /** 文字起こしされていない（trans.txt に行が無い） */
  | 'missing'
  /**
   * 文字起こし済みだが manifest に無い（manifest が古いか、
   * 後から録音瀋自来った之类的）。不整合として扱う。
   */
  | 'orphaned'

export interface ChunkReportRow {
  chunkNumber: number
  /** manifest が持つチャンクならそのファイル名、無いなら null */
  file: string | null
  bytes: number | null
  /** バイト数からの推定長（秒）。manifest が無ければ算出不可なので null */
  durationSeconds: number | null
  /** manifest が持つなら開始位置（秒） */
  audioOffsetSeconds: number | null
  status: ChunkTranscriptionStatus
  /** trans.txt に書かれたテキスト（無ければ空文字） */
  text: string
}

export interface ChunkReport {
  rows: ChunkReportRow[]
  /** manifest の整合性の問題（空配列なら問題なし） */
  manifestProblems: string[]
  /** manifest が読めるか */
  hasManifest: boolean
  /** 文字起こし済みのチャンク数 */
  transcribedCount: number
  /** 文字起こしされていないチャンク数 */
  missingCount: number
  /** trans.txt にあるが manifest に無いチャンク番号（不整合） */
  orphanedChunkNumbers: number[]
}

/** trans.txt のセグメント行（transcriptFile.ts の parse 結果と同じ形） */
export interface TranscriptSegmentLike {
  chunkNumber: number
  audioOffsetSeconds: number
  text: string
}

/**
 * manifest と trans.txt のセグメントからチャンクレポートを作る
 *
 * manifest が無い録音（Phase E より前の録音）でも、
 * trans.txt 側だけでレポートできるようにしておく。
 */
export function buildChunkReport(
  manifest: RecordingManifest | null,
  segments: TranscriptSegmentLike[]
): ChunkReport {
  const problems = manifest ? validateManifest(manifest) : []
  const byChunkNumber = new Map<number, TranscriptSegmentLike>()
  for (const segment of segments) {
    // 同じチャンクが複数回来ても最初の1件だけ採用する（後で上書きしない）
    if (!byChunkNumber.has(segment.chunkNumber)) {
      byChunkNumber.set(segment.chunkNumber, segment)
    }
  }

  if (!manifest) {
    // manifest が無い場合: trans.txt のチャンクだけを並べる
    const rows: ChunkReportRow[] = [...byChunkNumber.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([chunkNumber, segment]) => ({
        chunkNumber,
        file: null,
        bytes: null,
        durationSeconds: null,
        audioOffsetSeconds: segment.audioOffsetSeconds,
        status: 'orphaned' as const,
        text: segment.text
      }))

    return {
      rows,
      manifestProblems: [],
      hasManifest: false,
      transcribedCount: 0,
      missingCount: 0,
      orphanedChunkNumbers: rows.map((r) => r.chunkNumber)
    }
  }

  const rows: ChunkReportRow[] = manifest.chunks.map((chunk: ManifestChunk) => {
    const segment = byChunkNumber.get(chunk.chunkNumber)
    return {
      chunkNumber: chunk.chunkNumber,
      file: chunk.file,
      bytes: chunk.bytes,
      durationSeconds: chunk.durationSeconds,
      audioOffsetSeconds: chunk.audioOffsetSeconds,
      status: segment ? ('transcribed' as const) : ('missing' as const),
      text: segment?.text ?? ''
    }
  })

  const manifestNumbers = new Set(manifest.chunks.map((c) => c.chunkNumber))
  const orphanedChunkNumbers = [...byChunkNumber.keys()]
    .filter((n) => !manifestNumbers.has(n))
    .sort((a, b) => a - b)

  return {
    rows,
    manifestProblems: problems,
    hasManifest: true,
    transcribedCount: rows.filter((r) => r.status === 'transcribed').length,
    missingCount: rows.filter((r) => r.status === 'missing').length,
    orphanedChunkNumbers
  }
}

/**
 * 文字起こしされていないチャンク番号を返す
 *
 * 「録音したまま放置した」ケースの再文字起こし 대상になる。
 */
export function selectMissingChunkNumbers(report: ChunkReport): number[] {
  return report.rows.filter((r) => r.status === 'missing').map((r) => r.chunkNumber)
}

/** 表示用のサマリ文言（UI と E2E の双方で使う） */
export function formatChunkReportSummary(report: ChunkReport): string {
  if (!report.hasManifest) {
    return `manifest なし（trans.txt のチャンク ${report.rows.length} 件のみ）`
  }
  const parts = [
    `チャンク ${report.rows.length} 件`,
    `文字起こし済 ${report.transcribedCount}`,
    `未 ${report.missingCount}`
  ]
  if (report.orphanedChunkNumbers.length > 0) {
    parts.push(`manifest に無い ${report.orphanedChunkNumbers.length}`)
  }
  if (report.manifestProblems.length > 0) {
    parts.push(`不整合 ${report.manifestProblems.length}`)
  }
  return parts.join(' / ')
}