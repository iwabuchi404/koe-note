import React, { useMemo } from 'react'
import { ExtendedAudioFile } from '../types'

interface FileMetadataPanelProps {
  selectedFile: ExtendedAudioFile | null
  showDetailedInfo?: boolean
}

/**
 * ファイルメタデータ表示パネルコンポーネント
 * 選択されたファイルの詳細情報を表示
 */
const FileMetadataPanel: React.FC<FileMetadataPanelProps> = ({
  selectedFile,
  showDetailedInfo = true
}) => {
  // ファイルサイズフォーマット関数
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // 時間フォーマット関数
  const formatDuration = (seconds: number): string => {
    if (seconds === 0) return '0:00'
    
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const remainingSeconds = Math.floor(seconds % 60)
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
    }
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  // 日付フォーマット関数
  const formatDate = (date: Date): string => {
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date(date))
  }

  // ファイル形式の詳細情報
  const getFormatDetails = useMemo(() => {
    if (!selectedFile) return null

    const formatMap: Record<string, { name: string; description: string; quality: string }> = {
      webm: {
        name: 'WebM',
        description: 'Web向けマルチメディアコンテナ',
        quality: '高品質・可変ビットレート'
      },
      wav: {
        name: 'WAV',
        description: '非圧縮音声フォーマット',
        quality: '最高品質・大容量'
      },
      mp3: {
        name: 'MP3',
        description: '圧縮音声フォーマット',
        quality: '標準品質・小容量'
      },
      mp4: {
        name: 'MP4',
        description: 'マルチメディアコンテナ',
        quality: '高品質・圧縮'
      }
    }

    return formatMap[selectedFile.format.toLowerCase()] || {
      name: selectedFile.format.toUpperCase(),
      description: '不明なフォーマット',
      quality: '不明'
    }
  }, [selectedFile])

  // ビットレート計算
  const estimatedBitrate = useMemo(() => {
    if (!selectedFile || !selectedFile.duration || selectedFile.duration === 0) return null
    
    const bitsPerSecond = (selectedFile.size * 8) / selectedFile.duration
    const kbps = Math.round(bitsPerSecond / 1000)
    
    return kbps
  }, [selectedFile])

  if (!selectedFile) {
    return (
      <div className="file-metadata-panel file-metadata-panel--empty">
        <div className="file-metadata-panel__empty">
          <div className="file-metadata-panel__empty-icon">📄</div>
          <div className="file-metadata-panel__empty-title">
            ファイルが選択されていません
          </div>
          <div className="file-metadata-panel__empty-description">
            ファイルを選択すると詳細情報がここに表示されます
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="file-metadata-panel">
      <div className="file-metadata-panel__header">
        <div className="file-metadata-panel__title">
          📋 ファイル詳細情報
        </div>
      </div>

      <div className="file-metadata-panel__content">
        {/* 基本情報 */}
        <div className="file-metadata-panel__section">
          <div className="file-metadata-panel__section-title">
            📄 基本情報
          </div>
          
          <div className="file-metadata-panel__info-grid">
            <div className="file-metadata-panel__info-item">
              <span className="file-metadata-panel__info-label">ファイル名:</span>
              <span className="file-metadata-panel__info-value" title={selectedFile.filename}>
                {selectedFile.filename}
              </span>
            </div>
            
            <div className="file-metadata-panel__info-item">
              <span className="file-metadata-panel__info-label">ファイルパス:</span>
              <span className="file-metadata-panel__info-value" title={selectedFile.filepath}>
                {selectedFile.filepath.length > 50 
                  ? '...' + selectedFile.filepath.slice(-47)
                  : selectedFile.filepath
                }
              </span>
            </div>
            
            <div className="file-metadata-panel__info-item">
              <span className="file-metadata-panel__info-label">ファイルID:</span>
              <span className="file-metadata-panel__info-value">
                {selectedFile.id}
              </span>
            </div>
          </div>
        </div>

        {/* ファイル属性 */}
        <div className="file-metadata-panel__section">
          <div className="file-metadata-panel__section-title">
            🏷️ ファイル属性
          </div>
          
          <div className="file-metadata-panel__info-grid">
            <div className="file-metadata-panel__info-item">
              <span className="file-metadata-panel__info-label">形式:</span>
              <span className="file-metadata-panel__info-value">
                {getFormatDetails?.name} ({selectedFile.format.toUpperCase()})
              </span>
            </div>
            
            <div className="file-metadata-panel__info-item">
              <span className="file-metadata-panel__info-label">サイズ:</span>
              <span className="file-metadata-panel__info-value">
                {formatFileSize(selectedFile.size)}
              </span>
            </div>
            
            <div className="file-metadata-panel__info-item">
              <span className="file-metadata-panel__info-label">再生時間:</span>
              <span className="file-metadata-panel__info-value">
                {formatDuration(selectedFile.duration || 0)}
              </span>
            </div>
            
            {estimatedBitrate && (
              <div className="file-metadata-panel__info-item">
                <span className="file-metadata-panel__info-label">推定ビットレート:</span>
                <span className="file-metadata-panel__info-value">
                  約 {estimatedBitrate} kbps
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 日時情報 */}
        <div className="file-metadata-panel__section">
          <div className="file-metadata-panel__section-title">
            📅 日時情報
          </div>
          
          <div className="file-metadata-panel__info-grid">
            <div className="file-metadata-panel__info-item">
              <span className="file-metadata-panel__info-label">作成日時:</span>
              <span className="file-metadata-panel__info-value">
                {formatDate(selectedFile.createdAt)}
              </span>
            </div>
            
            <div className="file-metadata-panel__info-item">
              <span className="file-metadata-panel__info-label">更新日時:</span>
              <span className="file-metadata-panel__info-value">
                {formatDate(selectedFile.createdAt)}
              </span>
            </div>
          </div>
        </div>

        {/* 状態情報 */}
        <div className="file-metadata-panel__section">
          <div className="file-metadata-panel__section-title">
            🔄 状態情報
          </div>
          
          <div className="file-metadata-panel__status-grid">
            <div className={`file-metadata-panel__status-item ${
              selectedFile.isRecording ? 'file-metadata-panel__status-item--active' : ''
            }`}>
              <span className="file-metadata-panel__status-icon">
                {selectedFile.isRecording ? '🔴' : '⚫'}
              </span>
              <span className="file-metadata-panel__status-label">
                {selectedFile.isRecording ? '録音中' : '録音完了'}
              </span>
            </div>
            
            <div className={`file-metadata-panel__status-item ${
              selectedFile.isSelected ? 'file-metadata-panel__status-item--active' : ''
            }`}>
              <span className="file-metadata-panel__status-icon">
                {selectedFile.isSelected ? '✅' : '⬜'}
              </span>
              <span className="file-metadata-panel__status-label">
                {selectedFile.isSelected ? '選択中' : '未選択'}
              </span>
            </div>
            
            <div className={`file-metadata-panel__status-item ${
              selectedFile.hasTranscriptionFile ? 'file-metadata-panel__status-item--active' : ''
            }`}>
              <span className="file-metadata-panel__status-icon">
                {selectedFile.hasTranscriptionFile ? '📋' : '📝'}
              </span>
              <span className="file-metadata-panel__status-label">
                {selectedFile.hasTranscriptionFile ? '文字起こし済み' : '文字起こし未実行'}
              </span>
            </div>
          </div>
        </div>

        {/* 文字起こし情報 */}
        {selectedFile.hasTranscriptionFile && selectedFile.transcriptionPath && (
          <div className="file-metadata-panel__section">
            <div className="file-metadata-panel__section-title">
              📋 文字起こし情報
            </div>
            
            <div className="file-metadata-panel__info-grid">
              <div className="file-metadata-panel__info-item">
                <span className="file-metadata-panel__info-label">文字起こしファイル:</span>
                <span className="file-metadata-panel__info-value" title={selectedFile.transcriptionPath}>
                  {selectedFile.transcriptionPath.split(/[\\/]/).pop()}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* 詳細技術情報 */}
        {showDetailedInfo && getFormatDetails && (
          <div className="file-metadata-panel__section">
            <div className="file-metadata-panel__section-title">
              🔧 技術情報
            </div>
            
            <div className="file-metadata-panel__info-grid">
              <div className="file-metadata-panel__info-item">
                <span className="file-metadata-panel__info-label">フォーマット詳細:</span>
                <span className="file-metadata-panel__info-value">
                  {getFormatDetails.description}
                </span>
              </div>
              
              <div className="file-metadata-panel__info-item">
                <span className="file-metadata-panel__info-label">品質:</span>
                <span className="file-metadata-panel__info-value">
                  {getFormatDetails.quality}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default FileMetadataPanel