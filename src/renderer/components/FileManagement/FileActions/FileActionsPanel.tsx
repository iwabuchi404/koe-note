import React, { useState } from 'react'
import { ExtendedAudioFile, FileAction, FileContextMenuItem } from '../types'

interface FileActionsPanelProps {
  selectedFile: ExtendedAudioFile | null
  selectedFolder: string
  onFolderSelect: () => Promise<void>
  onFileAction: (action: FileAction, fileId?: string) => void
  onRefreshFiles: () => void
  isLoading?: boolean
}

/**
 * ファイル操作パネルコンポーネント
 * フォルダ選択、ファイル操作、リフレッシュ等の機能を提供
 */
const FileActionsPanel: React.FC<FileActionsPanelProps> = ({
  selectedFile,
  selectedFolder,
  onFolderSelect,
  onFileAction,
  onRefreshFiles,
  isLoading = false
}) => {
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false)
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 })

  // コンテキストメニュー項目
  const getContextMenuItems = (): FileContextMenuItem[] => {
    if (!selectedFile) return []

    return [
      {
        id: 'select',
        label: '選択',
        icon: '👆',
        disabled: false
      },
      {
        id: 'delete',
        label: '削除',
        icon: '🗑️',
        disabled: selectedFile.isRecording
      },
      {
        id: 'showInFolder',
        label: 'フォルダで表示',
        icon: '📂',
        disabled: false,
        separator: true
      },
      {
        id: 'export',
        label: 'エクスポート',
        icon: '📤',
        disabled: false
      },
      {
        id: 'duplicate',
        label: '複製',
        icon: '📋',
        disabled: selectedFile.isRecording
      },
      {
        id: 'rename',
        label: '名前変更',
        icon: '✏️',
        disabled: selectedFile.isRecording
      }
    ]
  }

  // コンテキストメニューを表示
  const showContextMenu = (event: React.MouseEvent) => {
    event.preventDefault()
    setContextMenuPosition({ x: event.clientX, y: event.clientY })
    setIsContextMenuOpen(true)
  }

  // コンテキストメニューを閉じる
  const hideContextMenu = () => {
    setIsContextMenuOpen(false)
  }

  // コンテキストメニュー項目クリック
  const handleContextMenuClick = (action: FileAction) => {
    if (selectedFile) {
      onFileAction(action, selectedFile.id)
    }
    hideContextMenu()
  }

  // フォルダパスを短縮表示
  const getDisplayPath = (path: string, maxLength: number = 30) => {
    if (!path) return '選択されていません'
    if (path.length <= maxLength) return path
    return '...' + path.slice(-(maxLength - 3))
  }

  return (
    <div className="file-actions-panel">
      {/* フォルダ選択セクション */}
      <div className="file-actions-panel__section">
        <div className="file-actions-panel__section-title">
          📁 作業フォルダ
        </div>
        
        <div className="file-actions-panel__folder-selector">
          <div className="file-actions-panel__folder-path" title={selectedFolder}>
            {getDisplayPath(selectedFolder, 25)}
          </div>
          <button
            className="file-actions-panel__folder-button"
            onClick={onFolderSelect}
            disabled={isLoading}
          >
            📂 選択
          </button>
        </div>
      </div>

      {/* ファイル操作セクション */}
      <div className="file-actions-panel__section">
        <div className="file-actions-panel__section-title">
          🔧 ファイル操作
        </div>
        
        <div className="file-actions-panel__action-grid">
          <button
            className="file-actions-panel__action-button"
            onClick={onRefreshFiles}
            disabled={isLoading}
            title="ファイル一覧を更新"
          >
            {isLoading ? '🔄' : '🔃'} 更新
          </button>
          
          <button
            className="file-actions-panel__action-button"
            onClick={() => selectedFile && onFileAction('delete', selectedFile.id)}
            disabled={!selectedFile || selectedFile.isRecording || isLoading}
            title="選択したファイルを削除"
          >
            🗑️ 削除
          </button>
          
          <button
            className="file-actions-panel__action-button"
            onClick={() => selectedFile && onFileAction('export', selectedFile.id)}
            disabled={!selectedFile || isLoading}
            title="選択したファイルをエクスポート"
          >
            📤 エクスポート
          </button>
          
          <button
            className="file-actions-panel__action-button"
            onClick={() => selectedFile && onFileAction('showInFolder', selectedFile.id)}
            disabled={!selectedFile || isLoading}
            title="ファイルをフォルダで表示"
          >
            📂 表示
          </button>
        </div>
      </div>

      {/* 選択ファイル情報セクション */}
      {selectedFile && (
        <div className="file-actions-panel__section">
          <div className="file-actions-panel__section-title">
            📄 選択中のファイル
          </div>
          
          <div className="file-actions-panel__selected-file">
            <div className="file-actions-panel__selected-file-icon">
              {selectedFile.isRecording ? '🔴' : '🎵'}
            </div>
            
            <div className="file-actions-panel__selected-file-info">
              <div className="file-actions-panel__selected-file-name">
                {selectedFile.filename}
              </div>
              
              <div className="file-actions-panel__selected-file-meta">
                <span className="file-actions-panel__selected-file-format">
                  {selectedFile.format.toUpperCase()}
                </span>
                {selectedFile.hasTranscriptionFile && (
                  <span className="file-actions-panel__selected-file-transcription">
                    📋 文字起こし済み
                  </span>
                )}
                {selectedFile.isRecording && (
                  <span className="file-actions-panel__selected-file-recording">
                    🔴 録音中
                  </span>
                )}
              </div>
            </div>
            
            <button
              className="file-actions-panel__selected-file-menu"
              onClick={showContextMenu}
              disabled={isLoading}
              title="ファイルメニューを表示"
            >
              ⋮
            </button>
          </div>
        </div>
      )}

      {/* 統計情報セクション */}
      <div className="file-actions-panel__section">
        <div className="file-actions-panel__section-title">
          📊 統計情報
        </div>
        
        <div className="file-actions-panel__stats">
          <div className="file-actions-panel__stat">
            <span className="file-actions-panel__stat-label">総ファイル数:</span>
            <span className="file-actions-panel__stat-value">-</span>
          </div>
          <div className="file-actions-panel__stat">
            <span className="file-actions-panel__stat-label">総容量:</span>
            <span className="file-actions-panel__stat-value">-</span>
          </div>
          <div className="file-actions-panel__stat">
            <span className="file-actions-panel__stat-label">総再生時間:</span>
            <span className="file-actions-panel__stat-value">-</span>
          </div>
        </div>
      </div>

      {/* コンテキストメニュー */}
      {isContextMenuOpen && (
        <>
          <div 
            className="file-actions-panel__context-overlay" 
            onClick={hideContextMenu}
          />
          <div 
            className="file-actions-panel__context-menu"
            style={{ 
              left: contextMenuPosition.x, 
              top: contextMenuPosition.y 
            }}
          >
            {getContextMenuItems().map((item, index) => (
              <React.Fragment key={item.id}>
                <button
                  className={`file-actions-panel__context-item ${
                    item.disabled ? 'file-actions-panel__context-item--disabled' : ''
                  }`}
                  onClick={() => !item.disabled && handleContextMenuClick(item.id)}
                  disabled={item.disabled}
                >
                  <span className="file-actions-panel__context-icon">
                    {item.icon}
                  </span>
                  <span className="file-actions-panel__context-label">
                    {item.label}
                  </span>
                </button>
                {item.separator && (
                  <div className="file-actions-panel__context-separator" />
                )}
              </React.Fragment>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default FileActionsPanel