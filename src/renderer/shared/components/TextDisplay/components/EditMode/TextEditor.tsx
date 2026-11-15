/**
 * テキスト編集コンポーネント
 * VSCode風のプレーンテキストエディター
 */

import React, { useRef, useEffect, useState, useCallback } from 'react'
import { TextSelection } from '../../types/TextDisplayTypes'

interface TextEditorProps {
  content: string
  onContentChange: (content: string) => void
  onTextSelect?: (selection: TextSelection) => void
  highlightedText?: string
  showLineNumbers?: boolean
  tabSize?: number
  insertSpaces?: boolean
  wordWrap?: boolean
  readOnly?: boolean
  placeholder?: string
  maxLength?: number
  className?: string
}

/**
 * テキストエディターコンポーネント
 */
const TextEditor: React.FC<TextEditorProps> = ({
  content,
  onContentChange,
  onTextSelect,
  highlightedText,
  showLineNumbers = true,
  tabSize = 2,
  insertSpaces = true,
  wordWrap = true,
  readOnly = false,
  placeholder = 'テキストを入力してください...',
  maxLength,
  className = ''
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lineNumbersRef = useRef<HTMLDivElement>(null)
  const [lines, setLines] = useState<string[]>([])
  const [currentLine, setCurrentLine] = useState<number>(1)
  const [currentColumn, setCurrentColumn] = useState<number>(1)
  const [selectionInfo, setSelectionInfo] = useState<{ start: number; end: number } | null>(null)
  
  // コンテンツを行に分割
  useEffect(() => {
    const contentLines = content.split('\n')
    setLines(contentLines)
  }, [content])
  
  // カーソル位置の更新
  const updateCursorPosition = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    
    const cursorPosition = textarea.selectionStart
    const textBeforeCursor = content.substring(0, cursorPosition)
    const lines = textBeforeCursor.split('\n')
    const lineNumber = lines.length
    const columnNumber = lines[lines.length - 1].length + 1
    
    setCurrentLine(lineNumber)
    setCurrentColumn(columnNumber)
  }, [content])
  
  // テキスト選択の更新
  const updateTextSelection = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    
    if (start !== end) {
      const selectedText = content.substring(start, end)
      const textBeforeStart = content.substring(0, start)
      const startLine = textBeforeStart.split('\n').length
      const textBeforeEnd = content.substring(0, end)
      const endLine = textBeforeEnd.split('\n').length
      
      const lineNumbers = Array.from(
        { length: endLine - startLine + 1 },
        (_, i) => startLine + i
      )
      
      const textSelection: TextSelection = {
        start,
        end,
        selectedText,
        lineNumbers
      }
      
      onTextSelect?.(textSelection)
      setSelectionInfo({ start, end })
    } else {
      setSelectionInfo(null)
    }
  }, [content, onTextSelect])
  
  // コンテンツ変更ハンドラー
  const handleContentChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = event.target.value
    
    // 最大文字数チェック
    if (maxLength && newContent.length > maxLength) {
      return
    }
    
    onContentChange(newContent)
  }
  
  // キーダウンハンドラー（タブ処理など）
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const textarea = textareaRef.current
    if (!textarea) return
    
    // Tabキーの処理
    if (event.key === 'Tab') {
      event.preventDefault()
      
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const tabChar = insertSpaces ? ' '.repeat(tabSize) : '\t'
      
      if (event.shiftKey) {
        // Shift+Tab: インデント削除
        const beforeCursor = content.substring(0, start)
        const lineStart = beforeCursor.lastIndexOf('\n') + 1
        const lineBeforeCursor = content.substring(lineStart, start)
        
        if (lineBeforeCursor.startsWith(tabChar)) {
          const newContent = 
            content.substring(0, lineStart) +
            lineBeforeCursor.substring(tabChar.length) +
            content.substring(start)
          
          onContentChange(newContent)
          
          setTimeout(() => {
            textarea.setSelectionRange(start - tabChar.length, end - tabChar.length)
          }, 0)
        }
      } else {
        // Tab: インデント追加
        const newContent = 
          content.substring(0, start) +
          tabChar +
          content.substring(end)
        
        onContentChange(newContent)
        
        setTimeout(() => {
          textarea.setSelectionRange(start + tabChar.length, start + tabChar.length)
        }, 0)
      }
    }
  }
  
  // スクロール同期
  const handleScroll = () => {
    const textarea = textareaRef.current
    const lineNumbers = lineNumbersRef.current
    if (textarea && lineNumbers) {
      lineNumbers.scrollTop = textarea.scrollTop
    }
  }
  
  // イベントリスナーの設定
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    
    const handleSelectionChange = () => {
      updateCursorPosition()
      updateTextSelection()
    }
    
    textarea.addEventListener('mouseup', handleSelectionChange)
    textarea.addEventListener('keyup', handleSelectionChange)
    textarea.addEventListener('focus', handleSelectionChange)
    
    return () => {
      textarea.removeEventListener('mouseup', handleSelectionChange)
      textarea.removeEventListener('keyup', handleSelectionChange)
      textarea.removeEventListener('focus', handleSelectionChange)
    }
  }, [updateCursorPosition, updateTextSelection])
  
  return (
    <div className={`text-editor ${className}`}>
      <div className="editor-content">
        
        {/* 行番号カラム */}
        {showLineNumbers && (
          <div 
            className="line-numbers"
            ref={lineNumbersRef}
          >
            {lines.map((_, index) => {
              const lineNumber = index + 1
              const isCurrentLine = lineNumber === currentLine
              
              return (
                <div
                  key={`line-${lineNumber}`}
                  className={`line-number ${isCurrentLine ? 'current' : ''}`}
                  data-line-number={lineNumber}
                >
                  {lineNumber.toString().padStart(3, '0')}
                </div>
              )
            })}
          </div>
        )}
        
        {/* メインテキストエリア */}
        <div 
          className={`main-editor-area ${wordWrap ? 'word-wrap' : 'no-wrap'}`}
        >
          <textarea
            ref={textareaRef}
            className="editor-textarea"
            value={content}
            onChange={handleContentChange}
            onKeyDown={handleKeyDown}
            onScroll={handleScroll}
            placeholder={placeholder}
            readOnly={readOnly}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            wrap={wordWrap ? 'soft' : 'off'}
            style={{
              tabSize: tabSize,
              MozTabSize: tabSize
            }}
          />
          
          {/* 検索ハイライト用オーバーレイ */}
          {highlightedText && (
            <div className="highlight-overlay">
              {/* 実装は複雑になるため省略、必要に応じて後で追加 */}
            </div>
          )}
        </div>
      </div>
      
      {/* エディターフッター */}
      <div className="editor-footer">
        <div className="cursor-info">
          行 {currentLine}, 列 {currentColumn}
        </div>
        <div className="editor-stats">
          {content.length}{maxLength && `/${maxLength}`} 文字
          {selectionInfo && (
            <span className="selection-info">
              ({selectionInfo.end - selectionInfo.start} 選択中)
            </span>
          )}
        </div>
        <div className="editor-settings">
          {insertSpaces ? `スペース: ${tabSize}` : 'タブ'}
          {wordWrap ? ' | 折り返し' : ' | 改行なし'}
        </div>
      </div>
    </div>
  )
}

export default TextEditor