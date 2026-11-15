/**
 * transcript - v2 の構造化文字起こし結果スキーマ（transcripts/*.json の SSOT）
 *
 * 旧形式の .trans.txt（ヘッダ+行形式）とは別に、複数エンジン・複数結果を
 * 同一構造で保持する（doc/v2-phase0-design.md §3）。
 *
 * - タイムスタンプはセッション開始からの相対秒で統一
 * - segments はイミュータブルに追記する
 * - 手動修正（edited）はモデル生成結果と別領域で管理する目印
 * - session.ts と同じく純粋関数のみ（fs・Electron に触れない）
 */

import type { TranscriptStatus } from './session'

export const TRANSCRIPT_VERSION = 1

export type TranscriptMode = 'live' | 'post'

export interface TranscriptSegment {
  /** 'seg-0001' のような連番 ID（appendTranscriptSegment が採番） */
  id: string
  /** 旧 manifest との対応付け用（Live チャンク由来の場合のみ） */
  chunkNumber?: number
  /** セッション開始からの開始位置（秒） */
  start: number
  /** セッション開始からの終了位置（秒） */
  end: number
  text: string
  /** 話者 ID（diarization 結果。未取得は undefined） */
  speakerId?: string | null
  /** モデルが返す信頼度 0-1（未取得は undefined） */
  confidence?: number | null
}

export interface TranscriptResult {
  version: number
  /** 'live-001' / 'post-001' のような ID（session.json の transcripts[].id と一致） */
  id: string
  sessionId: string
  mode: TranscriptMode
  /** エンジン識別子（'faster-whisper' | 'speech.cpp' 等） */
  engine: string
  model: string
  /** 対象音声ソース */
  sourceId: string
  language: string
  status: TranscriptStatus
  createdAt: string
  /** ユーザーが手動修正したか（修正内容は別領域に保持する運用） */
  edited: boolean
  segments: TranscriptSegment[]
}

/** セグメント ID の採番（seg-0001, seg-0002, …） */
export function transcriptSegmentId(index: number): string {
  return `seg-${String(index).padStart(4, '0')}`
}

export interface CreateTranscriptParams {
  id: string
  sessionId: string
  mode: TranscriptMode
  engine: string
  model: string
  sourceId: string
  language: string
  createdAt?: string
}

/** 空の文字起こし結果を作る（status='running'、segments は空） */
export function createTranscript(params: CreateTranscriptParams): TranscriptResult {
  return {
    version: TRANSCRIPT_VERSION,
    id: params.id,
    sessionId: params.sessionId,
    mode: params.mode,
    engine: params.engine,
    model: params.model,
    sourceId: params.sourceId,
    language: params.language,
    status: 'running',
    createdAt: params.createdAt ?? new Date().toISOString(),
    edited: false,
    segments: []
  }
}

/** セグメントを1件追記した次の結果を返す（id はこちらで採番） */
export function appendTranscriptSegment(
  transcript: TranscriptResult,
  segment: Omit<TranscriptSegment, 'id'>
): TranscriptResult {
  const next: TranscriptSegment = {
    ...segment,
    id: transcriptSegmentId(transcript.segments.length)
  }
  return { ...transcript, segments: [...transcript.segments, next] }
}

/** ステータス更新（running → completed / failed） */
export function withTranscriptStatus(
  transcript: TranscriptResult,
  status: TranscriptStatus
): TranscriptResult {
  return { ...transcript, status }
}

/** 手動修正フラグを立てる */
export function markTranscriptEdited(transcript: TranscriptResult): TranscriptResult {
  return { ...transcript, edited: true }
}

/* ---------- シリアライズ ---------- */

export function formatTranscript(transcript: TranscriptResult): string {
  return JSON.stringify(transcript, null, 2) + '\n'
}

/**
 * transcripts/*.json のパース
 *
 * session.json と同じ方針: 壊れたファイルは投げ、黙って無視しない。
 */
export function parseTranscript(text: string): TranscriptResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new Error(
      `transcript json を JSON として解釈できません: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('transcript のトップレベルがオブジェクトではありません')
  }

  const transcript = parsed as Partial<TranscriptResult>
  if (typeof transcript.version !== 'number') {
    throw new Error('transcript に version がありません')
  }
  if (transcript.version > TRANSCRIPT_VERSION) {
    throw new Error(
      `transcript の version ${transcript.version} は このアプリの対応 version ${TRANSCRIPT_VERSION} より新しいです`
    )
  }
  if (typeof transcript.id !== 'string' || transcript.id.length === 0) {
    throw new Error('transcript に id がありません')
  }
  if (typeof transcript.sessionId !== 'string' || transcript.sessionId.length === 0) {
    throw new Error('transcript に sessionId がありません')
  }
  if (!Array.isArray(transcript.segments)) {
    throw new Error('transcript に segments 配列がありません')
  }

  return transcript as TranscriptResult
}

/** transcript の整合性検証（テスト・診断用） */
export function validateTranscript(transcript: TranscriptResult): string[] {
  const problems: string[] = []

  transcript.segments.forEach((segment, index) => {
    const expectedId = transcriptSegmentId(index)
    if (segment.id !== expectedId) {
      problems.push(
        `segments[${index}].id ${segment.id} が採番規則 ${expectedId} と一致しません`
      )
    }
    if (!(segment.end >= segment.start)) {
      problems.push(
        `segments[${index}] の end ${segment.end} が start ${segment.start} より小さいです`
      )
    }
    if (index > 0 && segment.start < transcript.segments[index - 1].start) {
      problems.push(`segments[${index}] の start が前のセグメントより小さいです（順序異常）`)
    }
    if (segment.confidence != null && (segment.confidence < 0 || segment.confidence > 1)) {
      problems.push(`segments[${index}].confidence が範囲外です: ${segment.confidence}`)
    }
  })

  if (transcript.mode !== 'live' && transcript.mode !== 'post') {
    problems.push(`mode が不正です: ${String(transcript.mode)}`)
  }

  return problems
}
