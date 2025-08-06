/**
 * コピーボタンコンポーネント
 * テキストのクリップボードコピー機能
 */

import React from 'react'
import { TextSelection, TranscriptionSegment } from '../../types/TextDisplayTypes'

interface CopyButtonProps {
  // コピー対象
  selection?: TextSelection | null
  fullText?: string
  segments?: TranscriptionSegment[]
  
  // コピー機能
  onCopySelection?: (selection: TextSelection) => Promise<boolean>
  onCopyFullText?: (text: string) => Promise<boolean>
  onCopySegments?: (segments: TranscriptionSegment[], format?: 'plain' | 'formatted') => Promise<boolean>
  
  // UI設定
  variant?: 'selection' | 'full-text' | 'segments'
  format?: 'plain' | 'formatted'
  disabled?: boolean
  size?: 'small' | 'medium' | 'large'
  showLabel?: boolean
  className?: string
}

/**
 * コピーボタンコンポーネント
 */
const CopyButton: React.FC<CopyButtonProps> = ({
  selection,
  fullText,
  segments = [],
  onCopySelection,
  onCopyFullText,
  onCopySegments,
  variant = 'selection',
  format = 'plain',
  disabled = false,
  size = 'medium',
  showLabel = true,
  className = ''
}) => {
  
  // コピー処理
  const handleCopy = async () => {
    if (disabled) return
    
    try {
      switch (variant) {
        case 'selection':
          if (selection && onCopySelection) {
            await onCopySelection(selection)
          }
          break
          
        case 'full-text':
          if (fullText && onCopyFullText) {
            await onCopyFullText(fullText)
          }
          break
          
        case 'segments':
          if (segments.length > 0 && onCopySegments) {
            await onCopySegments(segments, format)
          }
          break
      }
    } catch (error) {
      console.error('コピーエラー:', error)
    }
  }
  
  // ボタンの有効性チェック
  const canCopy = (() => {
    if (disabled) return false
    
    switch (variant) {
      case 'selection':
        return !!(selection?.selectedText)
      case 'full-text':
        return !!(fullText?.trim())
      case 'segments':
        return segments.length > 0
      default:
        return false
    }
  })()
  
  // ボタンのラベルとアイコン
  const getButtonContent = () => {
    const icons = {
      'selection': '📋',
      'full-text': '📄',
      'segments': '📊'
    }
    
    const labels = {
      'selection': '選択部分をコピー',
      'full-text': '全文をコピー',
      'segments': format === 'formatted' ? '整形してコピー' : 'セグメントをコピー'
    }
    
    const shortLabels = {
      'selection': 'コピー',
      'full-text': '全文',
      'segments': format === 'formatted' ? '整形' : 'セグメント'
    }
    
    return {
      icon: icons[variant],
      label: labels[variant],
      shortLabel: shortLabels[variant]
    }
  }
  
  const { icon, label, shortLabel } = getButtonContent()
  
  // ツールチップテキスト
  const getTooltip = () => {
    if (!canCopy) {
      switch (variant) {
        case 'selection':
          return 'コピーするテキストを選択してください'
        case 'full-text':
          return 'コピーできるテキストがありません'
        case 'segments':
          return 'コピーできるセグメントがありません'
        default:
          return 'コピーできません'
      }
    }
    
    const extra = format === 'formatted' ? ' (整形済み)' : ''
    switch (variant) {
      case 'selection':
        const length = selection?.selectedText?.length || 0
        return `選択されたテキスト (${length}文字) をコピー${extra}`
      case 'full-text':
        const textLength = fullText?.length || 0
        return `全文 (${textLength}文字) をコピー${extra}`
      case 'segments':
        return `${segments.length}個のセグメントをコピー${extra}`
      default:
        return label
    }
  }
  
  return (
    <button
      type="button"
      className={`vscode-button action-button copy-button copy-button-${variant} copy-button-${size} ${!canCopy ? 'disabled' : ''} ${className}`}
      onClick={handleCopy}
      disabled={!canCopy}
      title={getTooltip()}
      aria-label={label}
    >
      <span className="icon">{icon}</span>
      {showLabel && (
        <span className="label">
          {size === 'small' ? shortLabel : label}
        </span>
      )}
      {variant === 'selection' && selection && (
        <span className="selection-info">
          ({selection.selectedText.length})
        </span>
      )}
    </button>
  )
}

export default CopyButton