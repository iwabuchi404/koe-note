/**
 * TranscriptionViewer - 文字起こし結果の読み取り専用表示コンポーネント
 * 
 * 責務:
 * - 文字起こし結果の表示
 * - セグメント一覧の表示
 * - 編集インターフェースへの橋渡し
 */

import React, { useState } from 'react'
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
  const [isHeaderOpen, setIsHeaderOpen] = useState(false)

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
      {/* 折りたたみ可能なヘッダー情報 - デフォルトで閉じる */}
      <div style={{
        borderBottom: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-bg-secondary)'
      }}>
        <button
          onClick={() => setIsHeaderOpen(prev => !prev)}
          style={{
            width: '100%',
            padding: 'var(--spacing-sm) var(--spacing-md)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-sm)',
            textAlign: 'left'
          }}
        >
          <span>ファイル情報</span>
          <span style={{ marginLeft: 'auto', fontSize: '10px' }}>
            {isHeaderOpen ? '▼' : '▶'}
          </span>
        </button>
        
        <div style={{
          height: isHeaderOpen ? 'auto' : '0',
          overflow: 'hidden',
          transition: 'height 0.2s ease-out'
        }}>
          <div style={{
            padding: 'var(--spacing-md)',
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-secondary)',
            borderTop: '1px solid var(--color-border)'
          }}>
            <div style={{ display: 'flex', gap: 'var(--spacing-lg)', flexWrap: 'wrap' }}>
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