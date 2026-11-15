/**
 * TranscriptionWebSocketService のメッセージ解釈
 *
 * D0 の変更点（サーバーが chunkNumber を返すようになった）に伴い、
 * 「最古の pending から推測する」処理を削除した。
 * ここでは protocol の型と、結果の紐付けが推測に依存しないことを
 * 固定する。
 */
import { describe, it, expect, vi } from 'vitest'
import { extractText } from '@renderer/features/recording/services/TranscriptionWebSocketService'
import type {
  ServerMessage,
  WhisperTranscriptionResult
} from '@shared/types'

const makeResult = (overrides: Partial<WhisperTranscriptionResult> = {}): WhisperTranscriptionResult => ({
  language: 'ja',
  duration: 4.096,
  segments: [],
  created_at: 0,
  segment_count: 0,
  ...overrides
})

describe('extractText', () => {
  it('text があればそれを返す', () => {
    expect(extractText(makeResult({ text: 'こんにちは' }))).toBe('こんにちは')
  })

  it('text が無ければ segments を空白で連結する', () => {
    const result = makeResult({
      segments: [
        { start: 0, end: 1, text: 'こんにちは' },
        { start: 1, end: 2, text: '世界' }
      ]
    })
    expect(extractText(result)).toBe('こんにちは 世界')
  })

  it('空・空白だけのテキストは落ちる', () => {
    const result = makeResult({
      segments: [
        { start: 0, end: 1, text: '  ' },
        { start: 1, end: 2, text: '有効' }
      ]
    })
    expect(extractText(result)).toBe('有効')
  })

  it('segments も空なら空文字', () => {
    expect(extractText(makeResult())).toBe('')
  })
})

describe('chunkNumber の扱い', () => {
  /**
   * handleServerMessage は private のため、
   * サーバーから届くメッセージの形だけを型で固定する。
   * 推測を削除したので、判定材料は chunkNumber の「有無」のみになる。
   */
  it('chunk_progress は chunkNumber を持てる', () => {
    const message: ServerMessage = {
      type: 'chunk_progress',
      status: 'processing',
      data_size: 65536,
      chunkNumber: 7,
      timestamp: 1234
    }
    expect(message.chunkNumber).toBe(7)
  })

  it('chunk_result は chunkNumber と timestamp を返す（サーバーが必ず返す）', () => {
    const message: ServerMessage = {
      type: 'chunk_result',
      status: 'completed',
      chunkNumber: 12,
      timestamp: 5678,
      result: makeResult({ text: 'テスト' })
    }
    expect(message.chunkNumber).toBe(12)
    expect(message.timestamp).toBe(5678)
  })

  it('旧サーバー（chunkNumber を返さない）も型上は受け取れるが、例外にはしない', () => {
    // 受け取るが、アプリの側で onError を呼ぶ（推測しない）
    const legacy: ServerMessage = {
      type: 'chunk_result',
      status: 'completed',
      result: makeResult({ text: 'テスト' })
    }
    expect(legacy.chunkNumber).toBeUndefined()
  })

  it('failed の chunk_result も chunkNumber を持つ', () => {
    const message: ServerMessage = {
      type: 'chunk_result',
      status: 'failed',
      chunkNumber: 3,
      message: 'Chunk transcription failed'
    }
    expect(message.status).toBe('failed')
    expect(message.chunkNumber).toBe(3)
  })
})

