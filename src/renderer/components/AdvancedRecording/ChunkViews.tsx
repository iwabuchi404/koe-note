/**
 * ChunkViews - 録音チャンクの一覧表示部品
 *
 * 録音中はチャンクが数秒ごとに追加され、文字起こし結果の
 * 到着ごとにそのチャンクだけが更新される。全チャンクを毎回そのまま
 * レンダリングすると O(N^2) になり、長時間録音するとレンダラの
 * main thread が飽和して停止ボタンのクリックすら処理されなくなる
 * （実際に 353 チャンクで停止できなくなった）。
 *
 * 対策:
 *   1. 1 行 = 1 メモ化コンポーネント（React.memo）
 *      → 変化していないチャンクは再レンダリングされない
 *   2. 時刻表示はその行がレンダリングされる時だけ計算する
 *      （toLocaleTimeString は Intl を通すため 1 回あたりのコストが大きい）
 *   3. 表示は最新 MAX_VISIBLE_CHUNKS 件に制限する
 *      → DOM 数が無限に膨らまない
 */

import React, { useMemo } from 'react'
import { AdvancedRecordingTabData } from '../../types/TabTypes'

type AudioChunk = AdvancedRecordingTabData['chunks'][number]

/** 一覧に表示する最大件数。これを超える分は「最新N件」とだけ表示する */
export const MAX_VISIBLE_CHUNKS = 200

/**
 * 最新 MAX_VISIBLE_CHUNKS 件だけを取り出す。
 * 録音中は新しいチャンクが末尾に追加されるため、末尾を新しい順として扱う。
 */
export function selectVisibleChunks<T>(chunks: T[]): T[] {
  if (chunks.length <= MAX_VISIBLE_CHUNKS) {
    return chunks
  }
  return chunks.slice(chunks.length - MAX_VISIBLE_CHUNKS)
}

/** 省略された件数を返す */
export function countHiddenChunks<T>(chunks: T[]): number {
  return Math.max(0, chunks.length - MAX_VISIBLE_CHUNKS)
}

const STATUS_LABELS: Record<AudioChunk['transcriptionStatus'], string> = {
  pending: '⏳ 待機中',
  processing: '⚡ 処理中',
  completed: '✅ 完了',
  failed: '❌ キャンセル'
}

/** 文字起こし結果の1行。変化していないチャンクは再レンダリングされない */
export const TranscriptChunkRow = React.memo(function TranscriptChunkRow({ chunk }: { chunk: AudioChunk }) {
  return (
    <div className={`transcription-chunk ${chunk.transcriptionStatus}`}>
      <div className="chunk-header">
        <span className="chunk-time">{chunk.timestamp.toLocaleTimeString()}</span>
        <span className={`chunk-status-badge ${chunk.transcriptionStatus}`}>
          {STATUS_LABELS[chunk.transcriptionStatus]}
        </span>
      </div>
      <div className="chunk-transcription-text">
        {chunk.transcriptionText ? (
          chunk.transcriptionText
        ) : chunk.transcriptionStatus === 'completed' ? (
          <span className="no-text">(音声なし)</span>
        ) : chunk.transcriptionStatus === 'failed' ? (
          <span className="no-text">(キャンセルされました)</span>
        ) : (
          <span className="processing-text">処理中...</span>
        )}
      </div>
    </div>
  )
})

/** チャンクログの1行 */
export const ChunkLogRow = React.memo(function ChunkLogRow({
  chunk,
  onDownload
}: {
  chunk: AudioChunk
  onDownload: (chunkId: number) => void
}) {
  const timeLabel = useMemo(() => chunk.timestamp.toLocaleTimeString(), [chunk.timestamp])
  return (
    <div className="chunk-item">
      <div className="chunk-info">
        <span className="chunk-id">チャンク #{chunk.id}</span>
        <span className="chunk-size">{(chunk.size / 1024).toFixed(1)}KB</span>
        <span className="chunk-time">{timeLabel}</span>
      </div>
      <div className={`chunk-status ${chunk.transcriptionStatus}`}>{chunk.transcriptionStatus}</div>
      <button
        className="chunk-download-button"
        onClick={() => onDownload(chunk.id)}
        title={`チャンク#${chunk.id}をダウンロード`}
      >
        📥
      </button>
    </div>
  )
})

/** 「最新200件を表示（全 N 件）」の注記 */
export const TruncationNotice: React.FC<{ total: number }> = ({ total }) => {
  if (total <= MAX_VISIBLE_CHUNKS) {
    return null
  }
  return (
    <div className="transcription-placeholder">
      性能保護のため最新 {MAX_VISIBLE_CHUNKS} 件のみ表示しています（全 {total} 件）
    </div>
  )
}
