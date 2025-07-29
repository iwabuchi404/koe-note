/**
 * SimpleFileList - シンプルなファイル一覧表示コンポーネント
 * FileListPanelの代替として、基本的な機能のみを提供
 */

import React from 'react'
import { ExtendedAudioFile } from '../FileManagement/types'

interface SimpleFileListProps {
  files: ExtendedAudioFile[]
  selectedFileId: string | null
  expandedFiles: Set<string>
  onFileSelect: (fileId: string) => void
  onFileAction: (action: string, fileId: string) => void
  onToggleExpand: (fileId: string) => void
  isLoading?: boolean
  error?: string
}

const SimpleFileList: React.FC<SimpleFileListProps> = ({
  files,
  selectedFileId,
  expandedFiles,
  onFileSelect,
  onFileAction,
  onToggleExpand,
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

  // ローディング状態
  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '200px',
        color: 'var(--color-text-secondary)'
      }}>
        <div>📁 ファイル一覧を読み込み中...</div>
      </div>
    )
  }

  // エラー状態
  if (error) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '200px',
        color: 'var(--color-error)',
        textAlign: 'center',
        padding: 'var(--spacing-md)'
      }}>
        <div style={{ fontSize: '24px', marginBottom: '8px' }}>❌</div>
        <div style={{ marginBottom: '8px' }}>{error}</div>
        <button 
          onClick={() => window.location.reload()}
          style={{
            padding: '4px 8px',
            fontSize: 'var(--font-size-xs)',
            backgroundColor: 'var(--color-accent)',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          再試行
        </button>
      </div>
    )
  }

  // ファイルが存在しない場合
  if (files.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        height: '200px',
        color: 'var(--color-text-secondary)',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📁</div>
        <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>ファイルがありません</div>
        <div style={{ fontSize: 'var(--font-size-sm)' }}>録音を開始するとファイルがここに表示されます</div>
      </div>
    )
  }

  // ソート済みファイル一覧
  const sortedFiles = [...files].sort((a, b) => {
    // 録音中ファイルを最上位に
    if (a.isRecording && !b.isRecording) return -1
    if (!a.isRecording && b.isRecording) return 1
    
    // 作成日時で降順ソート（新しいファイルが上）
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  return (
    <div style={{
      padding: 'var(--spacing-sm)',
      height: '100%',
      overflowY: 'auto'
    }}>
      {/* ヘッダー */}
      <div style={{
        padding: 'var(--spacing-sm)',
        borderBottom: '1px solid var(--color-border)',
        marginBottom: 'var(--spacing-sm)',
        fontSize: 'var(--font-size-sm)',
        fontWeight: 'bold',
        color: 'var(--color-text-primary)'
      }}>
        📁 ファイル一覧 ({sortedFiles.length})
      </div>

      {/* ファイル一覧 */}
      {sortedFiles.map((file) => (
        <div key={file.id} style={{ marginBottom: 'var(--spacing-sm)' }}>
          {/* メイン音声ファイル */}
          <div
            onClick={() => onFileSelect(file.id)}
            style={{
              padding: 'var(--spacing-sm)',
              border: '1px solid var(--color-border)',
              borderRadius: '4px',
              backgroundColor: selectedFileId === file.id 
                ? 'var(--color-accent-light, #e3f2fd)' 
                : 'var(--color-bg-secondary)',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              ...(file.isRecording && {
                borderColor: '#ff4444',
                backgroundColor: '#fff5f5'
              })
            }}
            onMouseEnter={(e) => {
              if (selectedFileId !== file.id) {
                e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary, #f5f5f5)'
              }
            }}
            onMouseLeave={(e) => {
              if (selectedFileId !== file.id) {
                e.currentTarget.style.backgroundColor = 'var(--color-bg-secondary, #fafafa)'
              }
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacing-sm)'
            }}>
              {/* ファイルアイコン */}
              <div style={{ fontSize: '18px' }}>
                {file.isRecording ? '🔴' : '🎬'}
              </div>
              
              {/* ファイル情報 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontWeight: 'bold',
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--color-text-primary)',
                  marginBottom: '2px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {file.filename}
                  {file.isRecording && (
                    <span style={{
                      marginLeft: '8px',
                      padding: '2px 6px',
                      fontSize: 'var(--font-size-xs)',
                      backgroundColor: '#ff4444',
                      color: 'white',
                      borderRadius: '12px'
                    }}>
                      録音中
                    </span>
                  )}
                </div>
                
                <div style={{
                  display: 'flex',
                  gap: 'var(--spacing-sm)',
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-secondary)'
                }}>
                  <span>⏱️ {formatDuration(file.duration || 0)}</span>
                  <span>📊 {formatFileSize(file.size)}</span>
                  <span>{file.format.toUpperCase()}</span>
                </div>
                
                <div style={{
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-tertiary)',
                  marginTop: '2px'
                }}>
                  📅 {new Date(file.createdAt).toLocaleString('ja-JP')}
                </div>
              </div>

              {/* 文字起こし展開ボタン */}
              {file.hasTranscriptionFile && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleExpand(file.id)
                  }}
                  style={{
                    padding: '4px 8px',
                    fontSize: '14px',
                    backgroundColor: 'transparent',
                    border: '1px solid var(--color-border)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  title={expandedFiles.has(file.id) ? '文字起こしを折りたたむ' : '文字起こしを表示'}
                >
                  {expandedFiles.has(file.id) ? '📄' : '📋'}
                </button>
              )}
            </div>

            {/* 文字起こしファイル表示エリア */}
            {file.hasTranscriptionFile && expandedFiles.has(file.id) && (
              <div style={{
                marginTop: 'var(--spacing-sm)',
                padding: 'var(--spacing-sm)',
                backgroundColor: 'var(--color-bg-primary)',
                borderRadius: '4px',
                border: '1px solid var(--color-border)'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 'var(--spacing-xs)'
                }}>
                  <span style={{
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-text-secondary)',
                    fontWeight: 'bold'
                  }}>
                    📋 文字起こし結果
                  </span>
                  {file.transcriptionPath && (
                    <span style={{
                      fontSize: 'var(--font-size-xs)',
                      color: 'var(--color-text-tertiary)'
                    }}>
                      {file.transcriptionPath.split(/[\\/]/).pop()}
                    </span>
                  )}
                </div>
                
                <div style={{
                  display: 'flex',
                  gap: 'var(--spacing-xs)'
                }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onFileAction('toggleTranscription', file.id)
                    }}
                    style={{
                      padding: '4px 8px',
                      fontSize: 'var(--font-size-xs)',
                      backgroundColor: 'var(--color-accent)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    👁️ 表示
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onFileAction('export', file.id)
                    }}
                    style={{
                      padding: '4px 8px',
                      fontSize: 'var(--font-size-xs)',
                      backgroundColor: 'var(--color-bg-tertiary)',
                      color: 'var(--color-text-primary)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '4px',
                      cursor: 'pointer'
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
  )
}

export default SimpleFileList