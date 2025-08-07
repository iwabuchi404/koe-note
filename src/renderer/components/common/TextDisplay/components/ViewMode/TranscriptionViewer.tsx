/**
 * 文字起こし専用ビューアーコンポーネント
 * VSCode風の行番号付きテキスト表示で文字起こしセグメントを表示
 */

import React, { useRef, useEffect, useState } from 'react'
import { TranscriptionSegment, TextSelection } from '../../types/TextDisplayTypes'
import { MetadataParser } from '../../utils/MetadataParser'

interface TranscriptionViewerProps {
  segments: TranscriptionSegment[]
  selectedSegmentIds?: number[]
  onSegmentSelect?: (segmentIds: number[]) => void
  onTextSelect?: (selection: TextSelection) => void
  highlightedText?: string
  showLineNumbers?: boolean
  showTimestamps?: boolean
  showSpeakers?: boolean
  className?: string
}

/**
 * 文字起こしビューアーコンポーネント
 */
const TranscriptionViewer: React.FC<TranscriptionViewerProps> = ({
  segments,
  selectedSegmentIds = [],
  onSegmentSelect,
  onTextSelect,
  highlightedText,
  showLineNumbers = true,
  showTimestamps = true,
  showSpeakers = true,
  className = ''
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const lineNumbersRef = useRef<HTMLDivElement>(null)
  const textContentRef = useRef<HTMLDivElement>(null)
  const [activeLineId, setActiveLineId] = useState<number | null>(null)
  
  // セグメント選択ハンドラー
  const handleSegmentClick = (segmentId: number, event: React.MouseEvent) => {
    if (event.ctrlKey || event.metaKey) {
      // Ctrl/Cmd + クリック: 複数選択
      const newSelection = selectedSegmentIds.includes(segmentId)
        ? selectedSegmentIds.filter(id => id !== segmentId)
        : [...selectedSegmentIds, segmentId]
      onSegmentSelect?.(newSelection)
    } else if (event.shiftKey && selectedSegmentIds.length > 0) {
      // Shift + クリック: 範囲選択
      const lastSelectedId = selectedSegmentIds[selectedSegmentIds.length - 1]
      const startIndex = segments.findIndex(seg => seg.id === lastSelectedId)
      const endIndex = segments.findIndex(seg => seg.id === segmentId)
      
      if (startIndex !== -1 && endIndex !== -1) {
        const rangeStart = Math.min(startIndex, endIndex)
        const rangeEnd = Math.max(startIndex, endIndex)
        const rangeSegmentIds = segments.slice(rangeStart, rangeEnd + 1).map(seg => seg.id)
        onSegmentSelect?.(rangeSegmentIds)
      }
    } else {
      // 通常クリック: 単一選択
      onSegmentSelect?.([segmentId])
    }
  }
  
  // テキスト選択ハンドラー
  const handleTextSelection = () => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return
    
    const selectedText = selection.toString().trim()
    if (!selectedText) return
    
    // 選択範囲に含まれるセグメントを特定
    const range = selection.getRangeAt(0)
    const segmentElements = containerRef.current?.querySelectorAll('.transcription-line')
    const relatedSegmentIds: number[] = []
    
    segmentElements?.forEach((element) => {
      if (range.intersectsNode(element)) {
        const segmentId = parseInt(element.getAttribute('data-segment-id') || '0')
        if (segmentId) {
          relatedSegmentIds.push(segmentId)
        }
      }
    })
    
    const textSelection: TextSelection = {
      start: range.startOffset,
      end: range.endOffset,
      selectedText,
      segmentIds: relatedSegmentIds.length > 0 ? relatedSegmentIds : undefined
    }
    
    onTextSelect?.(textSelection)
  }
  
  // スクロール同期と高さ同期（PlainTextViewerと同じ実装）
  useEffect(() => {
    const textContent = textContentRef.current
    const lineNumbers = lineNumbersRef.current
    
    if (!textContent || !lineNumbers) {
      console.warn('Scroll sync refs not available:', { textContent: !!textContent, lineNumbers: !!lineNumbers })
      return
    }
    
    // 行高さの軽量同期（パフォーマンス最適化版）
    const syncRowHeights = () => {
      const textLines = textContent?.querySelectorAll('.transcription-line')
      const lineNumbers = lineNumbersRef.current?.querySelectorAll('.transcription-line-number')
      
      if (!textLines || !lineNumbers) return
      
      // requestAnimationFrameでパフォーマンス最適化
      requestAnimationFrame(() => {
        // バッチ処理でDOM操作を最小限に
        const heights: number[] = []
        
        // 先に全ての高さを測定
        textLines.forEach((textLine) => {
          heights.push(textLine.getBoundingClientRect().height)
        })
        
        // 一括で高さを設定
        lineNumbers.forEach((lineNumber, index) => {
          if (heights[index]) {
            const element = lineNumber as HTMLElement
            const height = `${heights[index]}px`
            element.style.height = height
            element.style.minHeight = height
          }
        })
      })
    }
    
    const handleScroll = () => {
      // 本文エリアのスクロール位置を行番号エリアに同期
      const scrollTop = textContent.scrollTop
      lineNumbers.scrollTop = scrollTop
    }
    
    // スクロールイベントリスナーを追加
    textContent.addEventListener('scroll', handleScroll, { passive: true })
    
    // 初期初期化と高さ同期
    const timeoutId = setTimeout(() => {
      handleScroll()
      syncRowHeights()
    }, 50)
    
    // ResizeObserverは必要な場合のみ使用（パフォーマンス重視）
    let resizeObserver: ResizeObserver | null = null
    const hasLongText = segments.some(segment => segment.text.length > 100)
    if (hasLongText) {
      resizeObserver = new ResizeObserver(() => {
        // デバウンスでパフォーマンス最適化
        clearTimeout(timeoutId)
        setTimeout(syncRowHeights, 200)
      })
      resizeObserver.observe(textContent)
    }
    
    return () => {
      textContent.removeEventListener('scroll', handleScroll)
      if (resizeObserver) {
        resizeObserver.disconnect()
      }
      clearTimeout(timeoutId)
    }
  }, [segments])

  // 行番号エリアのスクロールを無効化
  useEffect(() => {
    const lineNumbers = lineNumbersRef.current
    if (!lineNumbers) return
    
    const preventScroll = (e: WheelEvent) => {
      e.preventDefault()
      e.stopPropagation()
      // ホイールイベントを本文エリアに転送
      if (textContentRef.current) {
        textContentRef.current.scrollTop += e.deltaY
      }
    }
    
    const preventTouch = (e: TouchEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }
    
    // ホイールやタッチスクロールを無効化
    lineNumbers.addEventListener('wheel', preventScroll, { passive: false })
    lineNumbers.addEventListener('touchmove', preventTouch, { passive: false })
    
    return () => {
      lineNumbers.removeEventListener('wheel', preventScroll)
      lineNumbers.removeEventListener('touchmove', preventTouch)
    }
  }, [])

  // マウスアップイベント（テキスト選択用）
  useEffect(() => {
    const handleMouseUp = () => {
      setTimeout(handleTextSelection, 10)
    }
    
    const container = containerRef.current
    if (container) {
      container.addEventListener('mouseup', handleMouseUp)
      return () => container.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])
  
  // ハイライト処理
  const highlightText = (text: string): string => {
    if (!highlightedText || !highlightedText.trim()) return text
    
    const regex = new RegExp(`(${escapeRegExp(highlightedText)})`, 'gi')
    return text.replace(regex, '<mark class="search-highlight">$1</mark>')
  }
  
  const escapeRegExp = (string: string): string => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  
  // 時間フォーマット（独自実装で不要な.00を削除）
  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    const decimal = seconds - Math.floor(seconds)
    
    // 時間表示を構築
    let timeString = ''
    if (hours > 0) {
      timeString = `${hours.toString().padStart(2, '0')}:`
    }
    timeString += `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    
    // 有意な小数点がある場合のみ追加（1桁のみ）
    if (decimal >= 0.1) {
      timeString += `.${Math.floor(decimal * 10)}`
    }
    
    return timeString
  }
  
  return (
    <div className={`transcription-viewer ${className}`} ref={containerRef}>
      <div className="transcription-content">
        
        {/* メインコンテンツ */}
        <div className="text-content">
          {/* 行番号カラム */}
          {showLineNumbers && (
            <div className="transcription-line-numbers" ref={lineNumbersRef}>
              {segments.map((segment) => (
                <div
                  key={`line-${segment.id}`}
                  className={`transcription-line-number ${selectedSegmentIds.includes(segment.id) ? 'selected' : ''} ${activeLineId === segment.id ? 'active' : ''}`}
                  data-line-number={segment.id}
                >
                  {segment.id.toString().padStart(3, '0')}
                </div>
              ))}
            </div>
          )}
          
          {/* 本文エリア */}
          <div className="transcription-main-text-area" ref={textContentRef}>
            {segments.map((segment) => {
            const isSelected = selectedSegmentIds.includes(segment.id)
            const isActive = activeLineId === segment.id
            
            return (
              <div
                key={segment.id}
                className={`transcription-line ${isSelected ? 'selected' : ''} ${isActive ? 'active' : ''}`}
                data-segment-id={segment.id}
                onClick={(e) => handleSegmentClick(segment.id, e)}
                onMouseEnter={() => setActiveLineId(segment.id)}
                onMouseLeave={() => setActiveLineId(null)}
              >
                
                {/* タイムスタンプカラム */}
                {showTimestamps && (
                  <div className="timestamp-column">
                    <span className="timestamp">
                      {formatTime(segment.start)}
                    </span>
                  </div>
                )}
                
                {/* テキストコンテンツ */}
                <div className="text-column">
                  
                  {/* 話者ラベル */}
                  {showSpeakers && segment.speaker && (
                    <span className="speaker-label">
                      {segment.speaker}:
                    </span>
                  )}
                  
                  {/* テキスト内容 */}
                  <span 
                    className="segment-text"
                    dangerouslySetInnerHTML={{ 
                      __html: highlightText(segment.text) 
                    }}
                  />
                  
                  {/* 編集済みマーカー */}
                  {segment.isEdited && (
                    <span className="edited-marker" title="編集済み">
                      ✏️
                    </span>
                  )}
                </div>
              </div>
            )
          })}
          </div>
        </div>
      </div>
      
      {/* セグメント数表示 */}
      <div className="transcription-footer">
        <div className="segment-count">
          {segments.length} セグメント
          {selectedSegmentIds.length > 0 && (
            <span className="selection-count">
              ({selectedSegmentIds.length} 選択中)
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export default TranscriptionViewer