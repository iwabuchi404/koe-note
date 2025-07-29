/**
 * TranscriptionViewer - 文字起こし結果の読み取り専用表示コンポーネント
 * 
 * 責務:
 * - 文字起こし結果の表示
 * - セグメント一覧の表示
 * - 編集インターフェースへの橋渡し
 */

import React from 'react'
import { TranscriptionResult } from '../../../../preload/preload'
import SegmentList from './SegmentList'
import TimestampDisplay from './TimestampDisplay'

interface TranscriptionViewerProps {
  transcriptionResult: TranscriptionResult | null
  transcriptionDisplayData: TranscriptionResult | null
  modifiedSegments: Set<number>
  editedSegmentTexts: Map<number, string>
  editingSegmentId: number | null
  editingText: string
  onSegmentDoubleClick: (segmentIndex: number, text: string) => void
  onTextChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  onSaveEdit: (segmentIndex: number) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>, index: number) => void
}

const TranscriptionViewer: React.FC<TranscriptionViewerProps> = ({
  transcriptionResult,
  transcriptionDisplayData,
  modifiedSegments,
  editedSegmentTexts,
  editingSegmentId,
  editingText,
  onSegmentDoubleClick,
  onTextChange,
  onSaveEdit,
  onKeyDown
}) => {
  // 表示用データの決定
  const data = transcriptionDisplayData || transcriptionResult
  
  if (!data || !data.segments || data.segments.length === 0) {
    return (
      <div style={{
        padding: 'var(--spacing-xl)',
        textAlign: 'center',
        color: 'var(--color-text-secondary)',
        fontSize: 'var(--font-size-md)'
      }}>
        文字起こし結果がありません
      </div>
    )
  }

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* ヘッダー情報 */}
      <div style={{
        padding: 'var(--spacing-md)',
        borderBottom: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-bg-secondary)',
        fontSize: 'var(--font-size-sm)',
        color: 'var(--color-text-secondary)'
      }}>
        <div style={{ display: 'flex', gap: 'var(--spacing-lg)' }}>
          <span>セグメント数: {data.segments.length}</span>
          <span>言語: {data.language || '不明'}</span>
          <TimestampDisplay duration={data.duration} />
          {modifiedSegments.size > 0 && (
            <span style={{ color: 'var(--color-warning)' }}>
              編集済み: {modifiedSegments.size}個
            </span>
          )}
        </div>
      </div>

      {/* セグメント一覧 */}
      <div style={{
        flex: 1,
        overflow: 'auto'
      }}>
        <SegmentList
          segments={data.segments}
          modifiedSegments={modifiedSegments}
          editedSegmentTexts={editedSegmentTexts}
          editingSegmentId={editingSegmentId}
          editingText={editingText}
          onSegmentDoubleClick={onSegmentDoubleClick}
          onTextChange={onTextChange}
          onSaveEdit={onSaveEdit}
          onKeyDown={onKeyDown}
        />
      </div>
    </div>
  )
}

export default TranscriptionViewer