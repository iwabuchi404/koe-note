/**
 * プレーンテキスト専用ビューアーコンポーネント
 * VSCode風の行番号付きテキスト表示でプレーンテキストを表示
 */

import React, { useRef, useEffect, useState } from 'react'
import { TextSelection } from '../../types/TextDisplayTypes'

interface PlainTextViewerProps {
  content: string
  selectedLineNumbers?: number[]
  onLineSelect?: (lineNumbers: number[]) => void
  onTextSelect?: (selection: TextSelection) => void
  highlightedText?: string
  showLineNumbers?: boolean
  wordWrap?: boolean
  readOnly?: boolean
  className?: string
}

/**
 * プレーンテキストビューアーコンポーネント
 */
const PlainTextViewer: React.FC<PlainTextViewerProps> = ({
  content,
  selectedLineNumbers = [],
  onLineSelect,
  onTextSelect,
  highlightedText,
  showLineNumbers = true,
  wordWrap = true,
  readOnly = true,
  className = ''
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const lineNumbersRef = useRef<HTMLDivElement>(null)
  const textContentRef = useRef<HTMLDivElement>(null)
  const [activeLineNumber, setActiveLineNumber] = useState<number | null>(null)
  const [lines, setLines] = useState<string[]>([])
  
  // パフォーマンスモードの判定
  const isLargeFile = lines.length > 1000
  const hasLongLines = lines.some(line => line.length > 150)
  
  // コンテンツを行に分割
  useEffect(() => {
    const contentLines = content.split('\n')
    setLines(contentLines)
  }, [content])
  
  // 行高さの軽量同期（パフォーマンス最適化版）
  useEffect(() => {
    // 大量データでは同期をスキップ
    if (lines.length > 1000) {
      console.log('Large file detected, skipping dynamic height sync for performance')
      return
    }
    
    const syncRowHeights = () => {
      const textLines = textContentRef.current?.querySelectorAll('.text-line')
      const lineNumbers = lineNumbersRef.current?.querySelectorAll('.plain-text-line-number')
      
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
    
    // 遅延初期化を短く
    const timeoutId = setTimeout(syncRowHeights, 50)
    
    // ResizeObserverは必要な場合のみ使用（パフォーマンス重視）
    let resizeObserver: ResizeObserver | null = null
    if (lines.some(line => line.length > 100)) { // 長い行がある場合のみ
      if (textContentRef.current) {
        resizeObserver = new ResizeObserver(() => {
          // デバウンスでパフォーマンス最適化
          clearTimeout(timeoutId)
          setTimeout(syncRowHeights, 200)
        })
        resizeObserver.observe(textContentRef.current)
      }
    }
    
    return () => {
      clearTimeout(timeoutId)
      resizeObserver?.disconnect()
    }
  }, [lines])
  
  // 行選択ハンドラー
  const handleLineClick = (lineNumber: number, event: React.MouseEvent) => {
    if (!onLineSelect) return
    
    if (event.ctrlKey || event.metaKey) {
      // Ctrl/Cmd + クリック: 複数選択
      const newSelection = selectedLineNumbers.includes(lineNumber)
        ? selectedLineNumbers.filter(n => n !== lineNumber)
        : [...selectedLineNumbers, lineNumber]
      onLineSelect(newSelection)
    } else if (event.shiftKey && selectedLineNumbers.length > 0) {
      // Shift + クリック: 範囲選択
      const lastSelectedLine = selectedLineNumbers[selectedLineNumbers.length - 1]
      const rangeStart = Math.min(lastSelectedLine, lineNumber)
      const rangeEnd = Math.max(lastSelectedLine, lineNumber)
      const rangeLinesNumbers = Array.from(
        { length: rangeEnd - rangeStart + 1 }, 
        (_, i) => rangeStart + i
      )
      onLineSelect(rangeLinesNumbers)
    } else {
      // 通常クリック: 単一選択
      onLineSelect([lineNumber])
    }
  }
  
  // テキスト選択ハンドラー
  const handleTextSelection = () => {
    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0) return
    
    const selectedText = selection.toString().trim()
    if (!selectedText) return
    
    // 選択範囲に含まれる行を特定
    const range = selection.getRangeAt(0)
    const lineElements = containerRef.current?.querySelectorAll('.text-line')
    const relatedLineNumbers: number[] = []
    
    lineElements?.forEach((element) => {
      if (range.intersectsNode(element)) {
        const lineNumber = parseInt(element.getAttribute('data-line-number') || '0')
        if (lineNumber) {
          relatedLineNumbers.push(lineNumber)
        }
      }
    })
    
    const textSelection: TextSelection = {
      start: range.startOffset,
      end: range.endOffset,
      selectedText,
      lineNumbers: relatedLineNumbers.length > 0 ? relatedLineNumbers : undefined
    }
    
    onTextSelect?.(textSelection)
  }
  
  // スクロール同期（本文スクロール時に行番号も同期）
  useEffect(() => {
    const textContent = textContentRef.current
    const lineNumbers = lineNumbersRef.current
    
    if (!textContent || !lineNumbers) {
      console.warn('Scroll sync refs not available:', { textContent: !!textContent, lineNumbers: !!lineNumbers })
      return
    }
    
    const handleScroll = () => {
      // 本文エリアのスクロール位置を行番号エリアに同期
      const scrollTop = textContent.scrollTop
      lineNumbers.scrollTop = scrollTop
      
      // デバッグログ（開発時のみ）
      if (process.env.NODE_ENV === 'development') {
        console.log('Scroll sync:', { 
          textScrollTop: scrollTop, 
          lineNumbersScrollTop: lineNumbers.scrollTop,
          textContentHeight: textContent.scrollHeight,
          lineNumbersHeight: lineNumbers.scrollHeight
        })
      }
    }
    
    // スクロールイベントリスナーを追加
    textContent.addEventListener('scroll', handleScroll, { passive: true })
    
    // 初期位置の同期
    setTimeout(() => handleScroll(), 100) // 少し遅延を入れてDOM確実に構築済みにする
    
    return () => {
      textContent.removeEventListener('scroll', handleScroll)
    }
  }, [lines])
  
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
  
  return (
    <div className={`plain-text-viewer ${className}`} ref={containerRef}>
      <div className="text-content test">
        
        {/* 行番号カラム */}
        {showLineNumbers && (
          <div className="plain-text-line-numbers" ref={lineNumbersRef}>
            {lines.map((_, index) => {
              const lineNumber = index + 1
              const isSelected = selectedLineNumbers.includes(lineNumber)
              const isActive = activeLineNumber === lineNumber
              
              return (
                <div
                  key={`line-${lineNumber}`}
                  className={`plain-text-line-number ${isSelected ? 'selected' : ''} ${isActive ? 'active' : ''}`}
                  data-line-number={lineNumber}
                  onClick={(e) => handleLineClick(lineNumber, e)}
                  onMouseEnter={() => setActiveLineNumber(lineNumber)}
                  onMouseLeave={() => setActiveLineNumber(null)}
                >
                  {lineNumber.toString().padStart(3, '0')}
                </div>
              )
            })}
          </div>
        )}
        
        {/* メインテキストエリア */}
        <div 
          className={`plain-text-main-text-area ${wordWrap ? 'word-wrap' : 'no-wrap'} ${isLargeFile ? 'performance-mode' : ''}`} 
          ref={textContentRef}
        >
          {lines.map((line, index) => {
            const lineNumber = index + 1
            const isSelected = selectedLineNumbers.includes(lineNumber)
            const isActive = activeLineNumber === lineNumber
            
            return (
              <div
                key={lineNumber}
                className={`text-line ${isSelected ? 'selected' : ''} ${isActive ? 'active' : ''} ${isLargeFile ? 'fixed-height' : ''}`}
                data-line-number={lineNumber}
                onClick={(e) => handleLineClick(lineNumber, e)}
                onMouseEnter={() => !isLargeFile && setActiveLineNumber(lineNumber)} // 大ファイルではhover無効
                onMouseLeave={() => !isLargeFile && setActiveLineNumber(null)}
              >
                <span 
                  className={`line-content ${hasLongLines && !isLargeFile ? 'dynamic-height' : ''}`}
                  dangerouslySetInnerHTML={{ 
                    __html: highlightText(line || ' ') // 空行は1文字スペースで表示
                  }}
                />
              </div>
            )
          })}
        </div>
      </div>
      
      {/* フッター */}
      <div className="plain-text-footer">
        <div className="line-count">
          {lines.length} 行
          {selectedLineNumbers.length > 0 && (
            <span className="selection-count">
              ({selectedLineNumbers.length} 選択中)
            </span>
          )}
        </div>
        <div className="content-stats">
          {content.length} 文字 / {content.split(/\s+/).filter(w => w).length} 語
        </div>
      </div>
    </div>
  )
}

export default PlainTextViewer