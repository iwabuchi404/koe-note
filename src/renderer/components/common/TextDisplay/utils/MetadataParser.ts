/**
 * TextDisplay が .trans.txt を表示用に解釈する層
 *
 * 正規のフォーマット解釈は src/shared/transcriptFile.ts に集約してある。
 * ここでは表示に必要な「派生情報」（ファイル統計・表示用メタデータ）と、
 * 過去に書き出された変種フォーマットへの寛容なフォールバックだけを持つ。
 *
 * 旧ファイルには以下の変種が存在する:
 *   - ヘッダーの coverage / chunk_count / quality_score（現在は writer が書かない）
 *   - "1 | 00:00:05 - 00:00:10 | テキスト" 形式（行番号つき）
 *   - タイムスタンプなしのプレーンテキスト行
 * いずれも読み取れるが、書き戻すときは shared の writer が使う
 * canonical 形式に揃える。
 */
import {
  formatAudioOffset,
  parseTranscriptFile,
  parseTranscriptSegments
} from '@shared/transcriptFile'
import type {
  TextSelection,
  FileStats,
  TextFileType,
  DisplayMetadata,
  TextTypeDetectionResult
} from '../types/TextDisplayTypes'

export class MetadataParser {
  /**
   * 文字起こしファイル全体を解析する
   */
  static parseTranscriptionFile(
    content: string,
    filePath: string
  ): { metadata: DisplayMetadata; segments: DisplaySegment[]; rawText: string } {
    const { header, segments, body } = parseTranscriptFile(content)
    const stats = calculateContentStats(body)

    if (header) {
      return {
        metadata: {
          sourceFile: getFileName(filePath),
          fileType: 'transcription',
          createdAt: header.transcribedAt || new Date().toISOString(),
          transcription: {
            audioFile: header.audioFile,
            model: header.model || 'unknown',
            transcribedAt: header.transcribedAt,
            duration: header.durationSeconds,
            segmentCount: header.segmentCount,
            language: header.language,
            speakers: header.speakers
          },
          stats
        },
        segments: toDisplaySegments(segments),
        rawText: body
      }
    }

    // ヘッダーが無い場合はプレーンテキストとして扱う
    return {
      metadata: {
        sourceFile: getFileName(filePath),
        fileType: 'plain-text',
        createdAt: new Date().toISOString(),
        stats
      },
      segments: parseLegacySegments(body),
      rawText: body
    }
  }

  /**
   * ファイル種別を判定する
   *
   * ヘッダーの有無で判定する（从前は特徴量のスコアで判定していて
   * 同じファイルでも結果が変わる，并有蓋）。
   */
  static detectTextType(content: string, filePath: string): TextTypeDetectionResult {
    const { header, body } = parseTranscriptFile(content)

    if (header) {
      return {
        fileType: 'transcription',
        confidence: 1,
        metadata: {
          sourceFile: getFileName(filePath),
          fileType: 'transcription',
          createdAt: header.transcribedAt || new Date().toISOString(),
          transcription: {
            audioFile: header.audioFile,
            model: header.model || 'unknown',
            transcribedAt: header.transcribedAt,
            duration: header.durationSeconds,
            segmentCount: header.segmentCount,
            language: header.language,
            speakers: header.speakers
          },
          stats: calculateContentStats(body)
        }
      }
    }

    return {
      fileType: 'plain-text',
      confidence: 0.5,
      metadata: {
        sourceFile: getFileName(filePath),
        fileType: 'plain-text',
        createdAt: new Date().toISOString(),
        stats: calculateContentStats(body)
      }
    }
  }

  /**
   * ヘッダーと本文_statistics を解析する
   *
   * 旧: MetadataParser.parseMetadata。ヘッダーが無い場合は
   * プレーンテキストとして扱う。
   */
  static parseMetadata(content: string, filePath: string): DisplayMetadata {
    return this.parseTranscriptionFile(content, filePath).metadata
  }

  /**
   * 本文を「タイムスタンプ付き行」として取り出す
   *
   * ヘッダーを除いた本文を返す。タイムスタンプが無い行は
   * 1行ずつ estimates した位置を付与する。
   */
  static extractRawTextWithTimestamps(content: string): string {
    const { header, body } = parseTranscriptFile(content)
    if (header) return body
    return parseLegacySegments(body)
      .map((segment) => `[${formatAudioOffset(segment.start)}] ${segment.text}`)
      .join('\n')
  }

  /** 秒を HH:MM:SS.s 形式にする */
  static secondsToTime(seconds: number): string {
    return formatAudioOffset(seconds)
  }

  /**
   * 選択範囲からセグメントIDを引く
   */
  static getSelectedSegmentIds(
    selection: TextSelection,
    segments: DisplaySegment[]
  ): number[] {
    return segments
      .filter((segment) => {
        const lineText = segment.text
        return selection.selectedText.includes(lineText.slice(0, 10))
      })
      .map((segment) => segment.id)
  }
}

/** 表示用セグメント（行番号を持つ） */
export interface DisplaySegment {
  id: number
  start: number
  end: number
  text: string
  speaker?: string
  isEdited?: boolean
}

/**
 * shared のセグメントを表示用に変換する
 *
 * 終了時刻は次のセグメントの開始時刻で決める。最終セグメントは
 * テキスト長から推定する（3秒〜の緩衝）。
 */
function toDisplaySegments(
  segments: ReturnType<typeof parseTranscriptSegments>
): DisplaySegment[] {
  return segments.map((segment, index) => {
    const next = segments[index + 1]
    const estimated = Math.max(3, segment.text.length * 0.2)
    return {
      id: index + 1,
      start: segment.audioOffsetSeconds,
      end: next ? next.audioOffsetSeconds : segment.audioOffsetSeconds + estimated,
      text: segment.text,
      speaker: segment.speaker
    }
  })
}

/**
 * 正規形式でない本文からのフォールバック解析
 *
 * 1. "1 | 00:00:05 - 00:00:10 | テキスト"
 * 2. "[00:00:05] テキスト"（shared の解釈で取れない場合）
 * 3. タイムスタンプなし行
 */
function parseLegacySegments(body: string): DisplaySegment[] {
  const structured = body
    .split('\n')
    .map((line) =>
      line.match(/^(\d+)\s*\|\s*(\d+:\d+:\d+(?:\.\d+)?)\s*-\s*(\d+:\d+:\d+(?:\.\d+)?)\s*\|\s*(.+)$/)
    )
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => ({
      id: Number(m[1]),
      start: toSeconds(m[2]),
      end: toSeconds(m[3]),
      text: m[4].trim()
    }))

  if (structured.length > 0) return structured

  const timestamped = parseTranscriptSegments(body)
  if (timestamped.length > 0) {
    return toDisplaySegments(timestamped)
  }

  return body
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line, index) => ({
      id: index + 1,
      start: index * 5,
      end: (index + 1) * 5,
      text: line.trim()
    }))
}

function toSeconds(value: string): number {
  const parts = value.split(':').map(Number)
  if (parts.length !== 3) return 0
  return parts[0] * 3600 + parts[1] * 60 + parts[2]
}

/** 本文の文字数・行数 */
export function calculateContentStats(content: string): FileStats {
  const lines = content.split('\n')
  return {
    totalCharacters: content.length,
    totalWords: content.split(/\s+/).filter((w) => w.length > 0).length,
    totalLines: lines.length,
    encoding: 'utf-8'
  }
}

function getFileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath
}

export type { TextFileType }
