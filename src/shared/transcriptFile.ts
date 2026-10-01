/**
 * .trans.txt のフォーマット定義（main / renderer 共通の SSOT）
 *
 * 此前は同一フォーマットに対して writer/parser が3組あった。
 *   - main.ts: generateTranscriptionFileContent / parseTranscriptionFileContent
 *   - renderer: MetadataParser
 *   - renderer: TextTypeDetector.parseTranscriptionMetadata
 * 3つとも微妙にデフォルト値が違い、たとえば:
 *   - coverage の既定値が 0 / 100 / undefined でバラバラ
 *   - segment_count を数える対象が header 値 / 実セグメント数 でバラバラ
 *   - 話者ラベルのパースの有無がバラバラ
 * 加えて3組の writer が微妙に違う内容を出力していた（実測では
 * model が 'kotoba-whisper-medium' で固定されていた）。
 *
 * 方針:
 * - canonical な writer/parser はこのファイルに1組だけ置く
 * - 過去の変種を含む「寛容なフォールバック」は renderer 側の
 *   TextDisplay/utils/MetadataParser.ts が擔当する
 *
 * フォーマット:
 *   ---
 *   audio_file: recording_20261001_0200.mp3
 *   model: small
 *   transcribed_at: 2026-10-01T02:00:13.937Z
 *   duration: 81.920
 *   segment_count: 20
 *   language: ja
 *   speakers: []
 *   ---
 *
 *   [00:00:00.0] テキスト
 *   [00:00:04.0] Speaker: テキスト
 */

/** 128kbps モノラル MP3 の実バイトレート */
export const MP3_BYTES_PER_SECOND = 16_000

/** ヘッダーと本文の境界 */
export const TRANSCRIPT_HEADER_BOUNDARY = '---\n\n'

/** .trans.txt のヘッダーに記録されるメタデータ */
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
  /** 話者ラベル。話者分離が未実装のため空配列 */
  speakers: string[]
}

/** .trans.txt の1行（音声上の位置を持つ） */
export interface TranscriptSegmentLine {
  chunkNumber?: number
  /** 音声上での開始位置（秒）。壁時計の時刻ではない */
  audioOffsetSeconds: number
  /** 話者ラベル（あれば） */
  speaker?: string
  text: string
}

/** 解析結果 */
export interface ParsedTranscriptFile {
  /** ヘッダーが無ければ null */
  header: TranscriptHeader | null
  segments: TranscriptSegmentLine[]
  /** ヘッダーを除いた本文 */
  body: string
}

// =============================================================================
// 時刻
// =============================================================================

/**
 * 秒を HH:MM:SS.s 形式にする
 *
 * 壁時計ではなく「録音開始からの経過位置」を表す。
 */
export function formatAudioOffset(offsetSeconds: number): string {
  const safe = Math.max(0, offsetSeconds)
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = Math.floor(safe % 60)
  const tenths = Math.floor((safe * 10) % 10)
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}.${tenths}`
}

/**
 * HH:MM:SS.s を秒に変換する。形式が不正なら null
 */
export function parseAudioOffset(value: string): number | null {
  const match = value.match(/^(\d{1,2}):(\d{2}):(\d{2})(?:\.(\d))?$/)
  if (!match) return null
  const [, hours, minutes, seconds, tenths] = match
  return (
    Number(hours) * 3600 +
    Number(minutes) * 60 +
    Number(seconds) +
    (tenths ? Number(tenths) / 10 : 0)
  )
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0')
}

// =============================================================================
// バイト数 → 音声長
// =============================================================================

/** 累積バイト数から音声の長さ（秒）を求める */
export function durationFromBytes(totalBytes: number, bytesPerSecond = MP3_BYTES_PER_SECOND): number {
  if (bytesPerSecond <= 0) return 0
  return totalBytes / bytesPerSecond
}

/**
 * 各チャンクの音声開始位置（秒）を求める
 *
 * バイト数でチャンクを区切っているため、累積バイト数から位置を逆算できる。
 * 実測: 64KBチャンク / 16,000 B/s = 4.096秒（サーバーログの
 * `Audio duration: 4.1s` と一致）。
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

// =============================================================================
// writer
// =============================================================================

/**
 * メタデータヘッダーを生成する
 *
 * - coverage は話者分離・品質評価が未実装のため出力しない
 *   （根拠のない数値を書かない）
 * - 末尾は空行2つ（'---\n\n'）で終える。parser が本文との境界を
 *   検索できるよう、この形を前提にしている
 */
export function formatTranscriptHeader(header: TranscriptHeader): string {
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

/** セグメント1行を生成する */
export function formatTranscriptSegment(segment: TranscriptSegmentLine): string {
  const speaker = segment.speaker ? `${segment.speaker}: ` : ''
  return `[${formatAudioOffset(segment.audioOffsetSeconds)}] ${speaker}${segment.text}\n`
}

/** ヘッダー + セグメント行をまとめて生成する */
export function formatTranscriptFile(header: TranscriptHeader, segments: TranscriptSegmentLine[]): string {
  return formatTranscriptHeader(header) + segments.map(formatTranscriptSegment).join('')
}

// =============================================================================
// parser
// =============================================================================

/**
 * ヘッダーの key: value を解釈する
 *
 * 過去のファイルには存在しないキー（coverage / chunk_count / quality_score）
 * が混在しているため、未知のキーは読み飛ばす。
 */
function parseHeaderFields(yaml: string): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const line of yaml.split('\n')) {
    const match = line.match(/^([a-z_]+):\s*(.*)$/)
    if (match) {
      fields[match[1]] = match[2].trim()
    }
  }
  return fields
}

/** speakers: ["A", "B"] を ['A','B'] に */
export function parseSpeakerList(value: string | undefined): string[] {
  if (!value) return []
  const quoted = value.match(/"([^"]*)"/g)
  if (quoted) return quoted.map((s) => s.slice(1, -1))
  // 引用符なし（pastの [A, B] 形式）を許容
  const bare = value.replace(/^\[|\]$/g, '').trim()
  return bare ? bare.split(',').map((s) => s.trim()).filter(Boolean) : []
}

/**
 * ヘッダーを解釈する
 *
 * @returns ヘッダーが無ければ null
 */
export function parseTranscriptHeader(content: string): TranscriptHeader | null {
  if (!content.startsWith('---')) return null

  const boundaryIndex = content.indexOf(TRANSCRIPT_HEADER_BOUNDARY)
  if (boundaryIndex < 0) return null

  const yaml = content.slice(3, boundaryIndex)
  const fields = parseHeaderFields(yaml)
  if (!fields.model && !fields.audio_file) return null

  return {
    audioFile: fields.audio_file ?? '',
    model: fields.model ?? '',
    transcribedAt: fields.transcribed_at ?? '',
    durationSeconds: Number(fields.duration ?? 0),
    segmentCount: Number(fields.segment_count ?? 0),
    language: fields.language ?? 'ja',
    speakers: parseSpeakerList(fields.speakers)
  }
}

/**
 * 本文からセグメント行を解釈する
 *
 * 受理する形式:
 *   [HH:MM:SS.s] テキスト
 *   [HH:MM:SS.s] Speaker: テキスト
 *
 * 話者ラベルは「空白を含まない1トークンの後にコロンが続く場合」と判定する。
 * テキスト自身がコロンを含んでも話者と誤判定しない。
 */
export function parseTranscriptSegments(body: string): TranscriptSegmentLine[] {
  const segments: TranscriptSegmentLine[] = []

  for (const line of body.split('\n')) {
    const match = line.match(/^\[(\d{1,2}:\d{2}:\d{2}(?:\.\d)?)\]\s+(.+)$/)
    if (!match) continue

    const offset = parseAudioOffset(match[1])
    if (offset === null) continue

    let speaker: string | undefined
    let text = match[2].trim()

    const speakerMatch = text.match(/^([^\s:]{1,32}):\s+(.*)$/)
    if (speakerMatch) {
      speaker = speakerMatch[1]
      text = speakerMatch[2].trim()
    }

    segments.push({ audioOffsetSeconds: offset, speaker, text })
  }

  return segments
}

/**
 * .trans.txt 全体を解釈する
 */
export function parseTranscriptFile(content: string): ParsedTranscriptFile {
  const header = parseTranscriptHeader(content)
  const boundaryIndex = content.indexOf(TRANSCRIPT_HEADER_BOUNDARY)
  const body =
    boundaryIndex >= 0 ? content.slice(boundaryIndex + TRANSCRIPT_HEADER_BOUNDARY.length) : content

  return {
    header,
    segments: parseTranscriptSegments(body),
    body
  }
}