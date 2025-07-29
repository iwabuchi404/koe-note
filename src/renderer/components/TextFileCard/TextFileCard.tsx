/**
 * テキストファイルカード - オブジェクト指向UI
 * テキストファイルに関する全ての機能を統合したカードコンポーネント
 */

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useTabContext } from '../../contexts/TabContext'
import { TabStatus } from '../../types/TabTypes'
import { LoggerFactory, LogCategories } from '../../utils/LoggerFactory'
import './TextFileCard.css'

const logger = LoggerFactory.getLogger(LogCategories.FILE_TEXT_MANAGER)

interface TextFileCardProps {
  tabId: string
  data?: any
}

const TextFileCard: React.FC<TextFileCardProps> = ({ tabId, data }) => {
  const { updateTab } = useTabContext()
  
  // ファイル情報
  const [fileName] = useState(data?.fileName || '新規テキスト')
  const [filePath] = useState(data?.filePath || '')
  
  // テキスト状態
  const [content, setContent] = useState(data?.content || '')
  const [isEdited, setIsEdited] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  
  // UI状態
  const [showStats, setShowStats] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // 統計情報
  const [wordCount, setWordCount] = useState(0)
  const [characterCount, setCharacterCount] = useState(0)
  const [lineCount, setLineCount] = useState(1)
  
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // テキスト変更処理
  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value
    setContent(newContent)
    setIsEdited(true)
    
    // 自動保存タイマーリセット
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    
    // 3秒後に自動保存
    saveTimeoutRef.current = setTimeout(() => {
      handleSave(true) // 自動保存フラグ
    }, 3000)
  }, [])

  // 編集モード切り替え
  const handleEditToggle = useCallback(() => {
    setIsEditing(!isEditing)
    if (!isEditing && textareaRef.current) {
      setTimeout(() => textareaRef.current?.focus(), 0)
    }
  }, [isEditing])

  // ファイル保存
  const handleSave = useCallback(async (isAutoSave = false) => {
    try {
      setIsSaving(true)
      setError(null)
      
      // TODO: 実際のファイル保存API呼び出し
      // await window.electronAPI.saveTextFile(filePath, content)
      
      // モック: ファイル保存
      setTimeout(() => {
        setIsEdited(false)
        setLastSaved(new Date())
        setIsSaving(false)
        logger.info(isAutoSave ? 'テキスト自動保存完了' : 'テキスト保存完了', { 
          fileName, filePath, contentLength: content.length 
        })
      }, 500)
      
    } catch (error) {
      logger.error('テキストファイル保存エラー', error instanceof Error ? error : new Error(String(error)), { fileName, filePath })
      setError('ファイルの保存に失敗しました')
      setIsSaving(false)
    }
  }, [content, fileName, filePath])

  // 名前を付けて保存
  const handleSaveAs = useCallback(async () => {
    try {
      // TODO: ファイル保存ダイアログを開く
      logger.info('名前を付けて保存', { originalFileName: fileName })
    } catch (error) {
      logger.error('名前を付けて保存エラー', error instanceof Error ? error : new Error(String(error)))
    }
  }, [fileName])

  // エクスポート
  const handleExport = useCallback(async () => {
    try {
      // クリップボードにコピー
      await navigator.clipboard.writeText(content)
      logger.info('クリップボードにコピー', { contentLength: content.length })
      
      // 一時的な成功表示（実装の場合は適切な通知システムを使用）
      const originalError = error
      setError('クリップボードにコピーしました')
      setTimeout(() => setError(originalError), 2000)
    } catch (error) {
      logger.error('エクスポートエラー', error instanceof Error ? error : new Error(String(error)))
      setError('エクスポートに失敗しました')
    }
  }, [content, error])

  // 検索・置換
  const handleFind = useCallback(() => {
    if (textareaRef.current) {
      // TODO: 検索ダイアログの実装
      logger.info('テキスト検索')
    }
  }, [])

  // 統計情報更新
  useEffect(() => {
    const words = content.trim() ? content.trim().split(/\s+/).length : 0
    const characters = content.length
    const lines = content.split('\n').length
    
    setWordCount(words)
    setCharacterCount(characters)
    setLineCount(lines)
  }, [content])

  // ファイル読み込み
  useEffect(() => {
    const loadFileContent = async () => {
      if (filePath && !content) {
        try {
          logger.info('テキストファイル読み込み開始', { fileName, filePath })
          
          // ElectronAPIを使用してファイルを読み込み
          if (window.electronAPI?.readFile) {
            const fileContent = await window.electronAPI.readFile(filePath)
            const contentText = new TextDecoder().decode(fileContent)
            setContent(contentText)
            setIsEdited(false)
            setLastSaved(new Date())
            logger.info('テキストファイル読み込み完了', { fileName, filePath, contentLength: contentText.length })
          } else {
            // フォールバック: モックデータ
            const mockContent = `# ${fileName}\n\nファイルパス: ${filePath}\n\nここにファイルの内容が表示されます。\n\n編集ボタンを押すとテキストを編集できます。\n自動保存機能付きです。`
            setContent(mockContent)
            setIsEdited(false)
            setLastSaved(new Date())
            logger.info('テキストファイル読み込み完了（モック）', { fileName, filePath })
          }
        } catch (error) {
          logger.error('テキストファイル読み込みエラー', error instanceof Error ? error : new Error(String(error)), { fileName, filePath })
          const errorContent = `# ファイル読み込みエラー\n\nファイル: ${fileName}\nパス: ${filePath}\n\nエラー: ${error instanceof Error ? error.message : String(error)}`
          setContent(errorContent)
          setError('ファイルの読み込みに失敗しました')
        }
      }
    }
    
    loadFileContent()
  }, [filePath, content, fileName])

  // タブ状態更新
  useEffect(() => {
    const status = isSaving
      ? TabStatus.LOADING
      : isEdited
        ? TabStatus.EDITING
        : error && error !== 'クリップボードにコピーしました'
          ? TabStatus.ERROR
          : TabStatus.IDLE

    updateTab(tabId, { 
      status,
      data: {
        ...data,
        content,
        isEdited,
        metadata: { wordCount, characterCount, lastSaved: lastSaved || new Date() }
      }
    })
  }, [content, isEdited, isSaving, error, wordCount, characterCount, lastSaved, tabId, updateTab, data])

  // ショートカット処理
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 's':
            e.preventDefault()
            handleSave()
            break
          case 'f':
            e.preventDefault()
            handleFind()
            break
          case 'e':
            e.preventDefault()
            handleEditToggle()
            break
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleSave, handleFind, handleEditToggle])

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  return (
    <div className="text-file-card">
      {/* ファイル情報ヘッダー */}
      <div className="file-header">
        <div className="file-info">
          <div className="file-name">
            {fileName}
            {isEdited && <span className="edit-indicator">●</span>}
          </div>
          <div className="file-meta">
            {lastSaved && (
              <span>最終保存: {lastSaved.toLocaleTimeString()}</span>
            )}
            {isSaving && <span className="saving-indicator">保存中...</span>}
          </div>
        </div>
        
        <div className="header-actions">
          <button 
            className={`stats-toggle ${showStats ? 'active' : ''}`}
            onClick={() => setShowStats(!showStats)}
          >
            📊
          </button>
          
          <button 
            className={`edit-toggle ${isEditing ? 'active' : ''}`}
            onClick={handleEditToggle}
            title="編集モード (Ctrl+E)"
          >
            {isEditing ? '👁️' : '✏️'}
          </button>
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className={`message ${error === 'クリップボードにコピーしました' ? 'success' : 'error'}`}>
          <span className="message-icon">
            {error === 'クリップボードにコピーしました' ? '✅' : '⚠️'}
          </span>
          <span>{error}</span>
        </div>
      )}

      {/* 統計情報（展開式） */}
      {showStats && (
        <div className="stats-panel">
          <div className="stat-item">
            <span className="stat-label">文字数:</span>
            <span className="stat-value">{characterCount.toLocaleString()}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">単語数:</span>
            <span className="stat-value">{wordCount.toLocaleString()}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">行数:</span>
            <span className="stat-value">{lineCount.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* メインテキストエリア */}
      <div className="text-main">
        {isEditing ? (
          <textarea
            ref={textareaRef}
            className="text-editor"
            value={content}
            onChange={handleContentChange}
            placeholder="ここにテキストを入力してください..."
            spellCheck={false}
          />
        ) : (
          <div className="text-viewer">
            {content ? (
              <pre className="text-content">{content}</pre>
            ) : (
              <div className="placeholder">テキストがありません</div>
            )}
          </div>
        )}
      </div>

      {/* アクションボタン */}
      <div className="action-buttons">
        <button 
          className="action-button save"
          onClick={() => handleSave()}
          disabled={!isEdited || isSaving}
        >
          {isSaving ? '保存中...' : '保存'}
        </button>
        
        <button 
          className="action-button save-as"
          onClick={handleSaveAs}
        >
          名前を付けて保存
        </button>
        
        <button 
          className="action-button export"
          onClick={handleExport}
        >
          コピー
        </button>
        
        <button 
          className="action-button find"
          onClick={handleFind}
          title="検索 (Ctrl+F)"
        >
          🔍 検索
        </button>
      </div>
    </div>
  )
}

export default TextFileCard