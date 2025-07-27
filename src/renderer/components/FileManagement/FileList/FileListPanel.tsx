import React, { useMemo } from 'react'
import { ExtendedAudioFile, FileManagementProps } from '../types'
import { LoadingSpinner, EmptyState, Button } from '../../common'

interface FileListPanelProps extends FileManagementProps {
  expandedFiles: Set<string>
  onToggleExpand: (fileId: string) => void
  onContextMenu: (event: React.MouseEvent, file: ExtendedAudioFile) => void
}

/**
 * ファイル一覧表示パネルコンポーネント
 * 音声ファイルと文字起こしファイルの一覧を表示
 */
const FileListPanel: React.FC<FileListPanelProps> = ({
  files,
  selectedFileId,
  expandedFiles,
  onFileSelect,
  onFileAction,
  onToggleExpand,
  onContextMenu,
  isLoading = false,
  error
}) => {
  // 時間フォーマット関数
  const formatDuration = (seconds: number): string => {
    if (seconds === 0) return '--:--'
    
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = Math.floor(seconds % 60)
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  // ファイルサイズフォーマット関数
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  // ファイル形式のアイコンを取得
  const getFormatIcon = (format: string): string => {
    switch (format.toLowerCase()) {
      case 'webm': return '🎬'
      case 'wav': return '🎵'
      case 'mp3': return '🎶'
      case 'mp4': return '📹'
      default: return '📄'
    }
  }

  // ソート済みファイル一覧
  const sortedFiles = useMemo(() => {
    return [...files].sort((a, b) => {
      // 録音中ファイルを最上位に
      if (a.isRecording && !b.isRecording) return -1
      if (!a.isRecording && b.isRecording) return 1
      
      // 作成日時で降順ソート（新しいファイルが上）
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  }, [files])

  // ローディング状態
  if (isLoading) {
    return (
      <div className="file-list-panel file-list-panel--loading">
        <LoadingSpinner 
          message="ファイル一覧を読み込み中..."
          size="medium"
        />
      </div>
    )
  }

  // エラー状態
  if (error) {
    return (
      <div className="file-list-panel file-list-panel--error">
        <div className="file-list-panel__error">
          <div className="file-list-panel__error-icon">❌</div>
          <div className="file-list-panel__error-message">
            {error}
          </div>
          <button 
            className="file-list-panel__error-retry"
            onClick={() => window.location.reload()}
          >
            再試行
          </button>
        </div>
      </div>
    )
  }

  // ファイルが存在しない場合
  if (sortedFiles.length === 0) {
    return (
      <div className="file-list-panel file-list-panel--empty">
        <EmptyState
          icon="📁"
          title="ファイルがありません"
          description="録音を開始するとファイルがここに表示されます"
        />
      </div>
    )
  }

  return (
    <div className="file-list-panel">
      <div className="file-list-panel__header">
        <div className="file-list-panel__title">
          📁 ファイル一覧 ({sortedFiles.length})
        </div>
        <div className="file-list-panel__stats">
          音声: {sortedFiles.filter(f => !f.filename.endsWith('.txt')).length} |
          文字起こし: {sortedFiles.filter(f => f.hasTranscriptionFile).length}
        </div>
      </div>

      <div className="file-list-panel__content">
        {sortedFiles.map((file) => (
          <div key={file.id} className="file-list-panel__file-group">
            {/* メイン音声ファイル */}
            <div
              className={`file-list-panel__file-item ${
                selectedFileId === file.id ? 'file-list-panel__file-item--selected' : ''
              } ${
                file.isRecording ? 'file-list-panel__file-item--recording' : ''
              }`}
              onClick={() => onFileSelect(file.id)}
              onContextMenu={(e) => onContextMenu(e, file)}
            >
              {/* ファイル情報 */}
              <div className="file-list-panel__file-main">
                <div className="file-list-panel__file-icon">
                  {file.isRecording ? '🔴' : getFormatIcon(file.format)}
                </div>
                
                <div className="file-list-panel__file-info">
                  <div className="file-list-panel__file-name">
                    {file.filename}
                    {file.isRecording && (
                      <span className="file-list-panel__recording-badge">録音中</span>
                    )}
                  </div>
                  
                  <div className="file-list-panel__file-meta">
                    <span className="file-list-panel__file-duration">
                      ⏱️ {formatDuration(file.duration || 0)}
                    </span>
                    <span className="file-list-panel__file-size">
                      📊 {formatFileSize(file.size)}
                    </span>
                    <span className="file-list-panel__file-format">
                      {file.format.toUpperCase()}
                    </span>
                  </div>
                  
                  <div className="file-list-panel__file-date">
                    📅 {new Date(file.createdAt).toLocaleString('ja-JP')}
                  </div>
                </div>

                {/* 文字起こし展開ボタン */}
                {file.hasTranscriptionFile && (
                  <button
                    className={`file-list-panel__expand-button ${
                      expandedFiles.has(file.id) ? 'file-list-panel__expand-button--expanded' : ''
                    }`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleExpand(file.id)
                    }}
                    title={expandedFiles.has(file.id) ? '文字起こしを折りたたむ' : '文字起こしを表示'}
                  >
                    {expandedFiles.has(file.id) ? '📄' : '📋'}
                  </button>
                )}
              </div>

              {/* 文字起こしファイル表示エリア */}
              {file.hasTranscriptionFile && expandedFiles.has(file.id) && (
                <div className="file-list-panel__transcription">
                  <div className="file-list-panel__transcription-header">
                    <span className="file-list-panel__transcription-icon">📋</span>
                    <span className="file-list-panel__transcription-label">
                      文字起こし結果
                    </span>
                    {file.transcriptionPath && (
                      <span className="file-list-panel__transcription-path">
                        {file.transcriptionPath.split(/[\\/]/).pop()}
                      </span>
                    )}
                  </div>
                  
                  <div className="file-list-panel__transcription-actions">
                    <button
                      className="file-list-panel__transcription-action"
                      onClick={(e) => {
                        e.stopPropagation()
                        onFileAction('toggleTranscription', file.id)
                      }}
                    >
                      👁️ 表示
                    </button>
                    <button
                      className="file-list-panel__transcription-action"
                      onClick={(e) => {
                        e.stopPropagation()
                        onFileAction('export', file.id)
                      }}
                    >
                      📤 エクスポート
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default FileListPanel