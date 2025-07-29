/**
 * SegmentList - セグメント一覧表示コンポーネント
 * 
 * 責務:
 * - 個別セグメントの表示
 * - 編集モードとの切り替え
 * - セグメント固有のUI表示
 */

import React from 'react'

interface Segment {
  start: number
  end: number
  text: string
  isEdited?: boolean
}

interface SegmentListProps {
  segments: Segment[]
  modifiedSegments: Set<number>
  editedSegmentTexts: Map<number, string>
  editingSegmentId: number | null
  editingText: string
  onSegmentDoubleClick: (segmentIndex: number, text: string) => void
  onTextChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  onSaveEdit: (segmentIndex: number) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>, index: number) => void
}

const SegmentList: React.FC<SegmentListProps> = ({
  segments,
  modifiedSegments,
  editedSegmentTexts,
  editingSegmentId,
  editingText,
  onSegmentDoubleClick,
  onTextChange,
  onSaveEdit,
  onKeyDown
}) => {
  // セグメント表示テキストの取得
  const getSegmentDisplayText = (segment: Segment, index: number): string => {
    // 編集済みテキストがある場合はそれを表示
    if (editedSegmentTexts.has(index)) {
      return editedSegmentTexts.get(index) || segment.text || ''
    }
    return segment.text || ''
  }

  return (
    <div style={{
      fontFamily: 'var(--font-family-mono)',
      fontSize: 'var(--font-size-md)',
      lineHeight: '1.6'
    }}>
      {segments.map((segment, index) => (
        <div 
          key={index}
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--color-border)',
            minHeight: '40px',
            backgroundColor: editingSegmentId === index 
              ? 'var(--color-bg-secondary)' 
              : 'transparent'
          }}
        >
          {/* 時間表示エリア（エディターの行数表示風） */}
          <div style={{ 
            width: '120px',
            minWidth: '120px',
            padding: '0 var(--spacing-md)',
            fontSize: 'var(--font-size-sm)', 
            color: 'var(--color-text-secondary)',
            fontFamily: 'var(--font-family-mono)',
            textAlign: 'right',
            backgroundColor: 'var(--color-bg-tertiary)',
            borderRight: '1px solid var(--color-border)',
            lineHeight: '1.6',
            userSelect: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end'
          }}>
            {segment.start ? segment.start.toFixed(1) : '0.0'}s
          </div>
          
          {/* テキスト表示エリア */}
          <div style={{ 
            flex: 1,
            padding: '0 var(--spacing-md)',
            fontSize: 'var(--font-size-md)',
            color: 'var(--color-text-primary)',
            lineHeight: '1.6',
            cursor: 'text',
            position: 'relative',
            display: 'flex',
            alignItems: 'center'
          }}>
            {editingSegmentId === index ? (
              <textarea
                value={editingText}
                onChange={onTextChange}
                onKeyDown={(e) => onKeyDown(e, index)}
                onBlur={() => onSaveEdit(index)}
                autoFocus
                style={{
                  width: '100%',
                  minHeight: '40px',
                  padding: '4px',
                  border: '1px solid var(--color-accent)',
                  borderRadius: '4px',
                  fontSize: 'var(--font-size-md)',
                  fontFamily: 'inherit',
                  lineHeight: '1.6',
                  backgroundColor: 'var(--color-bg-primary)',
                  color: 'var(--color-text-primary)',
                  resize: 'vertical'
                }}
              />
            ) : (
              <div
                onDoubleClick={() => onSegmentDoubleClick(index, getSegmentDisplayText(segment, index))}
                style={{
                  width: '100%',
                  minHeight: '24px',
                  padding: '4px',
                  borderRadius: '4px',
                  backgroundColor: modifiedSegments.has(index) 
                    ? 'rgba(255, 193, 7, 0.1)' 
                    : 'transparent',
                  border: modifiedSegments.has(index) 
                    ? '1px solid rgba(255, 193, 7, 0.3)' 
                    : '1px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  position: 'relative'
                }}
                onMouseEnter={(e) => {
                  if (!modifiedSegments.has(index)) {
                    e.currentTarget.style.backgroundColor = 'rgba(0, 123, 255, 0.05)'
                    e.currentTarget.style.border = '1px solid rgba(0, 123, 255, 0.2)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!modifiedSegments.has(index)) {
                    e.currentTarget.style.backgroundColor = 'transparent'
                    e.currentTarget.style.border = '1px solid transparent'
                  }
                }}
                title="ダブルクリックで編集"
              >
                {getSegmentDisplayText(segment, index)}
                {modifiedSegments.has(index) && (
                  <span style={{
                    position: 'absolute',
                    top: '-2px',
                    right: '-2px',
                    fontSize: '10px',
                    backgroundColor: 'var(--color-warning)',
                    color: 'white',
                    borderRadius: '50%',
                    width: '16px',
                    height: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold'
                  }}>
                    !
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export default SegmentList