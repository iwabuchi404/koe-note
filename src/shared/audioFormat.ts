/**
 * audioFormat - 録音音声のフォーマット定義とバイト⇔時間の換算（SSOT）
 *
 * 以前は換算が2系統あり、互いに食い違っていた:
 *   - transcriptFile.ts: MP3_BYTES_PER_SECOND = 16,000（128kbps として正確）
 *   - AudioChunkCalculator: 圧縮率 0.12 を仮定 → 約 10,585 B/s（約 35% ずれる）
 *
 * 実際のエンコーダ設定は lamejs の `Mp3Encoder(1, 44100, 128)`
 * （モノラル / 44.1kHz / 128kbps）なので、これを唯一の前提とする。
 * manifest・trans.txt・チャンクサイズ表示はすべてこの値を使う。
 */

export type AudioFormat = 'mp3' | 'wav'

export interface AudioEncoding {
  /** サンプルレート (Hz) */
  sampleRate: number
  /** チャンネル数（1=モノラル） */
  channels: number
  /** 量子化ビット深度（WAV のみ使用） */
  bitDepth: number
  /** MP3 のビットレート (kbps, CBR) */
  mp3BitrateKbps: number
}

/** 実際のエンコーダ設定（AudioWorkletRecordingService.initializeMp3Encoder と一致） */
export const DEFAULT_ENCODING: AudioEncoding = {
  sampleRate: 44100,
  channels: 1,
  bitDepth: 16,
  mp3BitrateKbps: 128
}

/** 1 秒あたりのバイト数 */
export function bytesPerSecond(
  format: AudioFormat,
  encoding: AudioEncoding = DEFAULT_ENCODING
): number {
  if (format === 'mp3') {
    // CBR 前提: kbps -> bit/s -> byte/s
    return Math.round((encoding.mp3BitrateKbps * 1000) / 8)
  }
  const bytesPerSample = encoding.bitDepth / 8
  return encoding.sampleRate * encoding.channels * bytesPerSample
}

/**
 * バイト数から再生時間（秒）を求める
 *
 * MP3 は CBR なのでフレーム境界の都合で数十ミリ秒の誤差が出る。
 * manifest ではこの値を「バイト数からの推定値」として扱い、
 * 録音時間で計測した durationSeconds（RecordingContext が持つ）を
 * 正とする。
 */
export function durationFromBytes(
  bytes: number,
  format: AudioFormat,
  encoding: AudioEncoding = DEFAULT_ENCODING
): number {
  if (bytes <= 0) {
    return 0
  }
  return roundSeconds(bytes / bytesPerSecond(format, encoding))
}

/** 再生時間（秒）からバイト数を求める */
export function bytesFromDuration(
  seconds: number,
  format: AudioFormat,
  encoding: AudioEncoding = DEFAULT_ENCODING
): number {
  if (seconds <= 0) {
    return 0
  }
  return Math.round(seconds * bytesPerSecond(format, encoding))
}

/**
 * 指定した時間幅になるチャンクのバイト数
 *
 * 最低 1 フレーム分（MP3 は 1 フレーム ≈ 26ms 分）を確保する。
 * 0 byte のチャンクを作ると後続の処理が壊れるため。
 */
export function chunkBytesForDuration(
  seconds: number,
  format: AudioFormat,
  encoding: AudioEncoding = DEFAULT_ENCODING
): number {
  const perSecond = bytesPerSecond(format, encoding)
  // MP3 の 1 フレームは 1152 サンプル = 26.12ms
  const minBytes = format === 'mp3' ? Math.round((perSecond * 1152) / 44100) : 1
  return Math.max(minBytes, bytesFromDuration(seconds, format, encoding))
}

/** 秒は小数第 3 位までに丸める（manifest と trans.txt で表記を揃える） */
export function roundSeconds(seconds: number): number {
  return Math.round(seconds * 1000) / 1000
}