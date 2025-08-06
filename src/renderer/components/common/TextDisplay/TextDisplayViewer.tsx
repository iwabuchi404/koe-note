/**
 * TextDisplayViewer - メインのテキスト表示コンポーネント
 * すべてのサブコンポーネントを統合し、テキスト表示機能を提供
 */

import React, { useState, useEffect, useMemo } from 'react'
import { DisplayMode, TextFileType, TextSelection, TranscriptionSegment } from './types/TextDisplayTypes'

// コンポーネントのインポート
import TranscriptionViewer from './components/ViewMode/TranscriptionViewer'
import PlainTextViewer from './components/ViewMode/PlainTextViewer'
import TextEditor from './components/EditMode/TextEditor'
import MetadataPanel from './components/ViewMode/MetadataPanel'
import ModeToggle from './components/common/ModeToggle'
import CopyButton from './components/common/CopyButton'
import SelectionHelper from './components/common/SelectionHelper'

// ユーティリティとHooksのインポート
import { TextTypeDetector } from './utils/TextTypeDetector'
import { MetadataParser } from './utils/MetadataParser'
import { useTextDisplayMode } from './hooks/useTextDisplayMode'
import { useTextSelection } from './hooks/useTextSelection'
import { useTextCopy } from './hooks/useTextCopy'

// スタイルのインポート
import './styles/VSCodeTheme.css'
import './styles/TextDisplayViewer.css'
import './components/ViewMode/TranscriptionViewer.css'
import './components/ViewMode/PlainTextViewer.css'
import './components/EditMode/TextEditor.css'

interface TextDisplayViewerProps {
  /** 表示するテキストコンテンツ */
  content: string
  /** ファイルパス（メタデータ解析用） */
  filePath?: string
  /** コンテンツ変更時のコールバック */
  onContentChange?: (newContent: string) => void
  /** ファイル保存時のコールバック */
  onSave?: (content: string) => Promise<boolean>
  /** 初期表示モード */
  initialMode?: DisplayMode
  /** テキストタイプを強制指定 */
  forceFileType?: TextFileType
  /** 読み取り専用モード */
  readOnly?: boolean
  /** 行番号表示 */
  showLineNumbers?: boolean
  /** メタデータパネル表示 */
  showMetadata?: boolean
  /** 検索ハイライトテキスト */
  highlightedText?: string
  /** CSSクラス名 */
  className?: string
}

/**
 * TextDisplayViewerコンポーネント
 */
const TextDisplayViewer: React.FC<TextDisplayViewerProps> = ({
  content,
  filePath = '',
  onContentChange,
  onSave,
  initialMode = 'view',
  forceFileType,
  readOnly = false,
  showLineNumbers = true,
  showMetadata = true,
  highlightedText,
  className = ''
}) => {
  // 状態管理
  const [currentContent, setCurrentContent] = useState(content)
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<number[]>([])
  const [selectedLineNumbers, setSelectedLineNumbers] = useState<number[]>([])
  const [isMetadataCollapsed, setIsMetadataCollapsed] = useState(false)
  
  // カスタムHooksの使用
  const {
    currentMode,
    canSwitchMode,
    hasUnsavedChanges,
    switchMode,
    saveChanges,
    discardChanges
  } = useTextDisplayMode({
    initialMode,
    readOnly,
    onSave: async (content: string) => onSave ? await onSave(content) : true
  })
  
  const {
    textSelection,
    clearSelection,
    selectAll
  } = useTextSelection()
  
  const {
    copySelection,
    copyFullText,
    copySegments
  } = useTextCopy()
  
  // テキストタイプの検出と解析
  const fileAnalysis = useMemo(() => {
    const detectedType = forceFileType || TextTypeDetector.detectFileType(currentContent, filePath)
    
    if (detectedType === 'transcription') {
      return MetadataParser.parseTranscriptionFile(currentContent, filePath)
    } else {
      return {
        metadata: MetadataParser.parseMetadata(currentContent, filePath),
        segments: [] as TranscriptionSegment[],
        rawText: currentContent
      }
    }
  }, [currentContent, filePath, forceFileType])
  
  // コンテンツ変更の同期
  useEffect(() => {
    if (content !== currentContent) {
      setCurrentContent(content)
    }
  }, [content])
  
  // コンテンツ変更ハンドラー
  const handleContentChange = (newContent: string) => {
    setCurrentContent(newContent)
    onContentChange?.(newContent)
  }
  
  // モード変更ハンドラー
  const handleModeChange = async (mode: DisplayMode) => {
    if (mode === 'edit' && hasUnsavedChanges) {
      const confirmed = window.confirm('未保存の変更があります。破棄して続行しますか？')
      if (!confirmed) return
    }
    
    await switchMode(mode, currentContent)
  }
  
  // セグメント選択ハンドラー
  const handleSegmentSelect = (segmentIds: number[]) => {
    setSelectedSegmentIds(segmentIds)
    setSelectedLineNumbers([]) // セグメント選択時は行選択をクリア
  }
  
  // 行選択ハンドラー
  const handleLineSelect = (lineNumbers: number[]) => {
    setSelectedLineNumbers(lineNumbers)
    setSelectedSegmentIds([]) // 行選択時はセグメント選択をクリア
  }
  
  // テキスト選択ハンドラー
  const handleTextSelect = (selection: TextSelection) => {
    // useTextSelectionフックを通じて選択状態を更新
    // 実装の詳細はHook内で管理
  }
  
  // 選択関連のハンドラー
  const handleClearSelection = () => {
    clearSelection()
    setSelectedSegmentIds([])
    setSelectedLineNumbers([])
  }
  
  const handleSelectAll = (fullText: string) => {
    selectAll(fullText)
  }
  
  const handleSelectSegments = (segmentIds: number[]) => {
    setSelectedSegmentIds(segmentIds)
  }
  
  // 表示コンテンツの決定
  const renderMainContent = () => {
    if (currentMode === 'edit') {
      return (
        <TextEditor
          content={currentContent}
          onContentChange={handleContentChange}
          onTextSelect={handleTextSelect}
          highlightedText={highlightedText}
          showLineNumbers={showLineNumbers}
          readOnly={readOnly}
          className="main-editor"
        />
      )
    }
    
    // 表示モード
    if (fileAnalysis.metadata.fileType === 'transcription' && fileAnalysis.segments.length > 0) {
      return (
        <TranscriptionViewer
          segments={fileAnalysis.segments}
          selectedSegmentIds={selectedSegmentIds}
          onSegmentSelect={handleSegmentSelect}
          onTextSelect={handleTextSelect}
          highlightedText={highlightedText}
          showLineNumbers={showLineNumbers}
          className="main-viewer"
        />
      )
    } else {
      return (
        <PlainTextViewer
          content={fileAnalysis.rawText}
          selectedLineNumbers={selectedLineNumbers}
          onLineSelect={handleLineSelect}
          onTextSelect={handleTextSelect}
          highlightedText={highlightedText}
          showLineNumbers={showLineNumbers}
          className="main-viewer"
        />
      )
    }
  }
  
  return (
    <div className={`text-display-viewer ${className}`}>
      
      {/* ヘッダーツールバー */}
      <div className="text-display-header">
        <div className="text-display-header-left">
          <div className="text-display-filename">
            <span className="file-icon">
              {fileAnalysis.metadata.fileType === 'transcription' ? '🎤' : '📄'}
            </span>
            {fileAnalysis.metadata.sourceFile}
            {hasUnsavedChanges && <span className="unsaved-indicator">●</span>}
          </div>
        </div>
        
        <div className="text-display-header-right">
          <ModeToggle
            currentMode={currentMode}
            canSwitchMode={canSwitchMode}
            hasUnsavedChanges={hasUnsavedChanges}
            onModeChange={handleModeChange}
          />
          
          <CopyButton
            selection={textSelection}
            fullText={fileAnalysis.rawText}
            segments={fileAnalysis.segments}
            variant="selection"
            onCopySelection={copySelection}
            onCopyFullText={copyFullText}
            onCopySegments={copySegments}
            size="small"
            className="action-button"
          />
          <CopyButton
            fullText={fileAnalysis.rawText}
            variant="full-text"
            onCopyFullText={copyFullText}
            size="small"
            className="action-button"
          />
        </div>
      </div>
      
      {/* メタデータパネル - コンパクト表示 */}
      {showMetadata && (
        <MetadataPanel
          metadata={fileAnalysis.metadata}
          segments={fileAnalysis.segments}
          isCollapsed={isMetadataCollapsed}
          onToggleCollapse={setIsMetadataCollapsed}
          className="compact-metadata"
        />
      )}
      
      {/* デバッグ情報 */}
      {process.env.NODE_ENV === 'development' && showMetadata && (
        <div style={{ padding: '8px', fontSize: '12px', background: '#333', color: '#fff' }}>
          <strong>Debug:</strong> fileType: {fileAnalysis.metadata.fileType}, 
          showMetadata: {showMetadata.toString()}, 
          hasTranscription: {!!fileAnalysis.metadata.transcription}
        </div>
      )}
      
      {/* メインコンテンツエリア */}
      <div className="text-display-content">
        {currentMode === 'view' ? (
          <div className="view-mode-container">
            {renderMainContent()}
          </div>
        ) : (
          <div className="edit-mode-container">
            {renderMainContent()}
          </div>
        )}
      </div>
    </div>
  )
}

export default TextDisplayViewer