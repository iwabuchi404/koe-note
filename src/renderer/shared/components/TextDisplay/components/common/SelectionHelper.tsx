/**
 * テキスト選択支援コンポーネント
 * 選択範囲の表示と操作支援
 */

import React from 'react'
import { TextSelection, TranscriptionSegment } from '../../types/TextDisplayTypes'

interface SelectionHelperProps {
  selection: TextSelection | null
  segments: TranscriptionSegment[]
  onClearSelection: () => void
  onSelectSegments: (segmentIds: number[]) => void
  onSelectAll: (fullText: string) => void
  fullText: string
  className?: string
}

/**
 * テキスト選択支援コンポーネント
 */
const SelectionHelper: React.FC<SelectionHelperProps> = ({
  selection,
  segments,
  onClearSelection,
  onSelectSegments,
  onSelectAll,
  fullText,
  className = ''
}) => {
  
  // 選択されたセグメント情報
  const selectedSegments = selection?.segmentIds 
    ? segments.filter(seg => selection.segmentIds!.includes(seg.id))
    : []
  
  // 関連セグメントの選択
  const handleSelectRelatedSegments = () => {
    if (selection?.segmentIds) {
      onSelectSegments(selection.segmentIds)
    }
  }
  
  // 全選択
  const handleSelectAll = () => {
    onSelectAll(fullText)
  }
  
  if (!selection) {
    return (
      <div className={`selection-helper no-selection ${className}`}>
        <div className="selection-info">
          <span className="info-text">テキストを選択してください</span>
          <button
            type="button"
            className="vscode-button outline"
            onClick={handleSelectAll}
            title="全文を選択"
          >
            <span className="icon">📄</span>
            <span>全選択</span>
          </button>
        </div>
      </div>
    )
  }
  
  return (
    <div className={`selection-helper has-selection ${className}`}>
      <div className="selection-info">
        <div className="selection-details">
          <span className="selected-text-preview">
            "
            {selection.selectedText.length > 50 
              ? `${selection.selectedText.substring(0, 50)}...`
              : selection.selectedText
            }
            "
          </span>
          <div className="selection-stats">
            <span className="stat">{selection.selectedText.length}文字</span>
            <span className="stat">{selection.selectedText.split(/\s+/).filter(w => w).length}語</span>
            {selectedSegments.length > 0 && (
              <span className="stat">{selectedSegments.length}セグメント</span>
            )}
          </div>
        </div>
        
        <div className="selection-actions">
          {/* 関連セグメント選択 */}
          {selection.segmentIds && selection.segmentIds.length > 0 && (
            <button
              type="button"
              className="vscode-button outline"
              onClick={handleSelectRelatedSegments}
              title={`関連する${selection.segmentIds.length}個のセグメントを選択`}
            >
              <span className="icon">🎯</span>
              <span>関連セグメント</span>
            </button>
          )}
          
          {/* 全選択 */}
          <button
            type="button"
            className="vscode-button outline"
            onClick={handleSelectAll}
            title="全文を選択"
          >
            <span className="icon">📄</span>
            <span>全選択</span>
          </button>
          
          {/* 選択クリア */}
          <button
            type="button"
            className="vscode-button outline"
            onClick={onClearSelection}
            title="選択を解除"
          >
            <span className="icon">✖️</span>
            <span>解除</span>
          </button>
        </div>
      </div>
      
      {/* 選択されたセグメント詳細 */}
      {selectedSegments.length > 0 && (
        <div className="selected-segments">
          <div className="segments-header">
            <span className="header-text">選択されたセグメント:</span>
          </div>
          <div className="segments-list">
            {selectedSegments.map(segment => (
              <div key={segment.id} className="segment-item">
                <span className="segment-id">#{segment.id}</span>
                <span className="segment-time">
                  {formatTime(segment.start)} - {formatTime(segment.end)}
                </span>
                {segment.speaker && (
                  <span className="segment-speaker">{segment.speaker}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * 時間フォーマット関数
 */
const formatTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60)
  const secs = (seconds % 60).toFixed(1)
  return `${minutes}:${secs.padStart(4, '0')}`
}

export default SelectionHelper