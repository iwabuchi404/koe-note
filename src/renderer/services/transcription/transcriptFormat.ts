/**
 * .trans.txt のフォーマット（純粋関数）
 *
 * 実測で判明していた問題:
 * - model が 'kotoba-whisper-medium' でハードコードされ、実際のモデルと
 *   一致しない（Whisper Small のつもりが medium と書かれていた）
 * - duration が 0.000、segment_count が 1 のまま
 * - coverage が 95.0 の仮値のまま
 * - [HH:MM:SS.s] が「結果が届いた時刻」であり、音声上の位置ではない
 *   （文字起こしに1.5〜4秒かかるため、位置がずれる）
 *
 * ここでは「ヘッダー行の生成」と「音声位置の計算」だけを扱い、
 * ファイルI/Oは呼び出し側の責務とする。Phase C で shared/ へ移す前提。
 */

/** 128kbps モノラル MP3 の実バイトレート */
export const MP3_BYTES_PER_SECOND = 16_000

export interface TranscriptHeader {
  /** 元音声ファイル名 */
  audioFile: string
  /** 実際に使用したモデル（UIで選択されたもの） */
  model: string
  /** 文字起こし開始時刻（ISO8601） */
  transcribedAt: string
  /** 録音済み音声の長さ（秒） */
  durationSeconds: number
  /** 追記されたセグメント数 */
  segmentCount: number
  language: string
  /** 話者ラベル。話者分離が未実装のため常に空配列 */
  speakers: string[]
}

export interface TranscriptSegment {
  chunkNumber: number
  /** 音声上での開始位置（秒） */
  audioOffsetSeconds: number
  text: string
}

/**
 * 秒を HH:MM:SS.s 形式にする
 *
 * 音声位置专用。壁時計の時刻ではない点に注意。
 */
export function formatAudioOffset(offsetSeconds: number): string {
  const safe = Math.max(0, offsetSeconds)
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = Math.floor(safe % 60)
  const tenths = Math.floor((safe * 10) % 10)
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}.${tenths}`
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0')
}

/**
 * 累積バイト数から音声の長さ（秒）を求める
 */
export function durationFromBytes(totalBytes: number, bytesPerSecond = MP3_BYTES_PER_SECOND): number {
  if (bytesPerSecond <= 0) return 0
  return totalBytes / bytesPerSecond
}

/**
 * 各チャンクの音声開始位置（秒）を求める
 *
 * バイト数でチャンクを区切っているため、累積バイト数から位置を逆算できる。
 *
 * @param chunkSizes チャンク順のバイト数
 * @param bytesPerSecond 実バイトレート
 * @returns チャンク順の音声開始位置（秒）
 */
export function audioOffsetsFromChunkSizes(
  chunkSizes: number[],
  bytesPerSecond = MP3_BYTES_PER_SECOND
): number[] {
  let cumulative = 0
  return chunkSizes.map((size) => {
    const offset = durationFromBytes(cumulative, bytesPerSecond)
    cumulative += size
    return offset
  })
}

/**
 * メタデータヘッダーを生成する
 *
 * coverage は実装が無いため出力しない（根拠のない数値を書かない）。
 * 末尾は空行2つ（'---\n\n'）で終える。追記時に本文との境界を
 * 検索できるよう、この形を前提としている。
 */
export function formatHeader(header: TranscriptHeader): string {
  const lines = [
    '---',
    `audio_file: ${header.audioFile}`,
    `model: ${header.model}`,
    `transcribed_at: ${header.transcribedAt}`,
    `duration: ${header.durationSeconds.toFixed(3)}`,
    `segment_count: ${header.segmentCount}`,
    `language: ${header.language}`,
    `speakers: [${header.speakers.map((s) => `"${s}"`).join(', ')}]`,
    '---'
  ]
  return `${lines.join('\n')}\n\n`
}

/**
 * セグメント1行を生成する
 */
export function formatSegment(segment: TranscriptSegment): string {
  return `[${formatAudioOffset(segment.audioOffsetSeconds)}] ${segment.text}\n`
}
