/**
 * TextDisplayViewer - メインのテキスト表示コンポーネント
 * 変更点
 *  - isMetadataCollapsed をルールに合わせて isMetadataCollapsedState / setIsMetadataCollapsedState にリネーム
 *  - 初期状態を true の定数 METADATA_COLLAPSED_INITIAL で定義
 *  - マウント時に state をリセットする useEffect を追加
 *  - JSX で参照箇所をすべて更新
 */

import React, { useState, useEffect, useMemo } from 'react'
import { DisplayMode, TextFileType, TextSelection, TranscriptionSegment } from './types/TextDisplayTypes'
import TranscriptionViewer from './components/ViewMode/TranscriptionViewer'
import PlainTextViewer from './components/ViewMode/PlainTextViewer'
import TextEditor from './components/EditMode/TextEditor'
import MetadataPanel from './components/ViewMode/MetadataPanel'
import ModeToggle from './components/common/ModeToggle'
import CopyButton from './components/common/CopyButton'
import { TextTypeDetector } from './utils/TextTypeDetector'
import { MetadataParser } from './utils/MetadataParser'
import { useTextDisplayMode } from './hooks/useTextDisplayMode'
import { useTextSelection } from './hooks/useTextSelection'
import { useTextCopy } from './hooks/useTextCopy'
import './styles/VSCodeTheme.css'
import './styles/TextDisplayViewer.css'
import './components/ViewMode/TranscriptionViewer.css'
import './components/ViewMode/PlainTextViewer.css'
import './components/EditMode/TextEditor.css'

interface TextDisplayViewerProps {
  content: string
  filePath?: string
  onContentChange?: (newContent: string) => void
  onSave?: (content: string) => Promise<boolean>
  initialMode?: DisplayMode
  forceFileType?: TextFileType
  readOnly?: boolean
  showLineNumbers?: boolean
  showMetadata?: boolean
  highlightedText?: string
  className?: string
}
const METADATA_COLLAPSED_INITIAL = true

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
  const [currentContent, setCurrentContent] = useState(content)
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<number[]>([])
  const [selectedLineNumbers, setSelectedLineNumbers] = useState<number[]>([])
  const [isMetadataCollapsedState, setIsMetadataCollapsedState] = useState(METADATA_COLLAPSED_INITIAL)

  useEffect(() => {
    setIsMetadataCollapsedState(METADATA_COLLAPSED_INITIAL)
  }, [])

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

  const { textSelection, clearSelection, selectAll } = useTextSelection()
  const { copySelection, copyFullText, copySegments } = useTextCopy()

  const fileAnalysis = useMemo(() => {
    const detectedType = forceFileType || TextTypeDetector.detectFileType(currentContent, filePath)
    if (detectedType === 'transcription') {
      return MetadataParser.parseTranscriptionFile(currentContent, filePath)
    }
    return {
      metadata: MetadataParser.parseMetadata(currentContent, filePath),
      segments: [] as TranscriptionSegment[],
      rawText: currentContent
    }
  }, [currentContent, filePath, forceFileType])

  useEffect(() => {
    if (content !== currentContent) setCurrentContent(content)
  }, [content])

  const handleContentChange = (newContent: string) => {
    setCurrentContent(newContent)
    onContentChange?.(newContent)
  }

  const handleModeChange = async (mode: DisplayMode) => {
    if (mode === 'edit' && hasUnsavedChanges) {
      if (!window.confirm('未保存の変更があります。破棄して続行しますか？')) return
    }
    await switchMode(mode, currentContent)
  }

  const handleSegmentSelect = (segmentIds: number[]) => {
    setSelectedSegmentIds(segmentIds)
    setSelectedLineNumbers([])
  }

  const handleLineSelect = (lineNumbers: number[]) => {
    setSelectedLineNumbers(lineNumbers)
    setSelectedSegmentIds([])
  }

  const handleClearSelection = () => {
    clearSelection()
    setSelectedSegmentIds([])
    setSelectedLineNumbers([])
  }

  const renderMainContent = () => {
    if (currentMode === 'edit') {
      return (
        <TextEditor
          content={currentContent}
          onContentChange={handleContentChange}
          onTextSelect={() => {}}
          highlightedText={highlightedText}
          showLineNumbers={showLineNumbers}
          readOnly={readOnly}
          className="main-editor"
        />
      )
    }
    if (
      fileAnalysis.metadata.fileType === 'transcription' &&
      fileAnalysis.segments.length > 0
    ) {
      return (
        <TranscriptionViewer
          segments={fileAnalysis.segments}
          selectedSegmentIds={selectedSegmentIds}
          onSegmentSelect={handleSegmentSelect}
          onTextSelect={() => {}}
          highlightedText={highlightedText}
          showLineNumbers={showLineNumbers}
          className="main-viewer"
        />
      )
    }
    return (
      <PlainTextViewer
        content={MetadataParser.extractRawTextWithTimestamps(content)}
        selectedLineNumbers={selectedLineNumbers}
        onLineSelect={handleLineSelect}
        onTextSelect={() => {}}
        highlightedText={highlightedText}
        showLineNumbers={showLineNumbers}
        className="main-viewer"
      />
    )
  }

  return (
    <div className={`text-display-viewer ${className}`}>
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
        </div>
      </div>
      {showMetadata && (
        <MetadataPanel
          metadata={fileAnalysis.metadata}
          segments={fileAnalysis.segments}
          isCollapsed={isMetadataCollapsedState}
          onToggleCollapse={setIsMetadataCollapsedState}
          className="compact-metadata"
        />
      )}
      <div className="text-display-content">
        {currentMode === 'view' ? (
          <div className="view-mode-container">{renderMainContent()}</div>
        ) : (
          <div className="edit-mode-container">{renderMainContent()}</div>
        )}
      </div>
    </div>
  )
}

export default TextDisplayViewer
