/**
 * メタデータ表示パネル
 * 文字起こしファイルのメタデータを表示・管理
 */

import React, { useState, useMemo } from 'react'
import { DisplayMetadata, TranscriptionSegment } from '../../types/TextDisplayTypes'
import { TextFormatter } from '../../utils/TextFormatter'

interface MetadataPanelProps {
  metadata: DisplayMetadata
  segments?: TranscriptionSegment[]
  isCollapsed?: boolean
  onToggleCollapse?: (collapsed: boolean) => void
  className?: string
}

/**
 * メタデータパネルコンポーネント
 */
const MetadataPanel: React.FC<MetadataPanelProps> = ({
  metadata,
  segments = [],
  isCollapsed = false,
  onToggleCollapse,
  className = ''
}) => {
  const [localCollapsed, setLocalCollapsed] = useState(isCollapsed)
  
  // 実際の折りたたみ状態
  const collapsed = onToggleCollapse ? isCollapsed : localCollapsed
  
  // 折りたたみ切り替え
  const handleToggleCollapse = () => {
    const newCollapsed = !collapsed
    if (onToggleCollapse) {
      onToggleCollapse(newCollapsed)
    } else {
      setLocalCollapsed(newCollapsed)
    }
  }
  
  // 統計情報の計算
  const statistics = useMemo(() => {
    const stats = metadata.stats
    const transcription = metadata.transcription
    
    return {
      // 基本統計
      characters: stats.totalCharacters,
      words: stats.totalWords,
      lines: stats.totalLines,
      
      // 文字起こし固有統計
      duration: transcription?.duration || 0,
      segments: transcription?.segmentCount || segments.length,
      coverage: transcription?.coverage || 0,
      speakers: transcription?.speakers?.length || 0,
      
      // 計算統計
      wordsPerMinute: transcription?.duration ? 
        Math.round((stats.totalWords / transcription.duration) * 60) : 0,
      averageSegmentLength: transcription?.segmentCount ? 
        (transcription.duration / transcription.segmentCount) : 0
    }
  }, [metadata, segments])
  
  return (
    <div className={`metadata-panel ${collapsed ? 'collapsed' : 'expanded'} ${className}`}>
      {/* 折りたたみボタン - 常に情報表示 */}
      <button
        className={`metadata-toggle ${collapsed ? '' : 'expanded'}`}
        onClick={handleToggleCollapse}
        type="button"
        aria-expanded={!collapsed}
        title={collapsed ? 'ファイル情報を展開' : 'ファイル情報を折りたたむ'}
      >
        <span className={`arrow ${collapsed ? 'collapsed' : 'expanded'}`}>▶</span>
        <span>📊 ファイル情報</span>
        <span className="summary">
          {metadata.fileType === 'transcription' ? '文字起こし' : 'テキスト'} • 
          {TextFormatter.formatNumber(statistics.characters)}文字 • 
          {TextFormatter.formatNumber(statistics.words)}語
          {collapsed && ' • クリックで詳細表示'}
        </span>
      </button>
      
      {/* メタデータコンテンツ */}
      {!collapsed && (
        <div className="metadata-content">
          <div className="metadata-grid">
            
            {/* 基本情報セクション */}
            <div className="metadata-section">
              <h4 className="section-title">📄 基本情報</h4>
              <div className="metadata-items">
                <div className="metadata-item">
                  <span className="label">ファイル名:</span>
                  <span className="value">{metadata.sourceFile}</span>
                </div>
                <div className="metadata-item">
                  <span className="label">種類:</span>
                  <span className="value">
                    {metadata.fileType === 'transcription' ? '📋 文字起こし' : '📄 テキストファイル'}
                  </span>
                </div>
                <div className="metadata-item">
                  <span className="label">作成日時:</span>
                  <span className="value">{TextFormatter.formatDateTime(metadata.createdAt)}</span>
                </div>
                {metadata.modifiedAt && (
                  <div className="metadata-item">
                    <span className="label">更新日時:</span>
                    <span className="value">{TextFormatter.formatDateTime(metadata.modifiedAt)}</span>
                  </div>
                )}
                <div className="metadata-item">
                  <span className="label">エンコーディング:</span>
                  <span className="value">{metadata.stats.encoding}</span>
                </div>
              </div>
            </div>
            
            {/* 文字起こし情報セクション */}
            {metadata.transcription && (
              <div className="metadata-section">
                <h4 className="section-title">🎤 文字起こし情報</h4>
                <div className="metadata-items">
                  <div className="metadata-item">
                    <span className="label">音声ファイル:</span>
                    <span className="value">{metadata.transcription.audioFile}</span>
                  </div>
                  <div className="metadata-item">
                    <span className="label">使用モデル:</span>
                    <span className="value">{TextFormatter.formatModelName(metadata.transcription.model)}</span>
                  </div>
                  <div className="metadata-item">
                    <span className="label">言語:</span>
                    <span className="value">{TextFormatter.formatLanguage(metadata.transcription.language)}</span>
                  </div>
                  <div className="metadata-item">
                    <span className="label">文字起こし日時:</span>
                    <span className="value">{TextFormatter.formatDateTime(metadata.transcription.transcribedAt)}</span>
                  </div>
                  <div className="metadata-item">
                    <span className="label">音声時間:</span>
                    <span className="value">{TextFormatter.formatDuration(metadata.transcription.duration)}</span>
                  </div>
                  <div className="metadata-item">
                    <span className="label">カバレッジ:</span>
                    <span className="value">{TextFormatter.formatCoverage(metadata.transcription.coverage)}</span>
                  </div>
                  {metadata.transcription.qualityScore !== undefined && (
                    <div className="metadata-item">
                      <span className="label">品質スコア:</span>
                      <span className="value">{TextFormatter.formatQualityScore(metadata.transcription.qualityScore)}</span>
                    </div>
                  )}
                  {metadata.transcription.chunkCount && (
                    <div className="metadata-item">
                      <span className="label">チャンク数:</span>
                      <span className="value">{TextFormatter.formatNumber(metadata.transcription.chunkCount)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* 統計情報セクション */}
            <div className="metadata-section">
              <h4 className="section-title">📊 統計情報</h4>
              <div className="metadata-items">
                <div className="metadata-item">
                  <span className="label">総文字数:</span>
                  <span className="value">{TextFormatter.formatNumber(statistics.characters)}</span>
                </div>
                <div className="metadata-item">
                  <span className="label">総単語数:</span>
                  <span className="value">{TextFormatter.formatNumber(statistics.words)}</span>
                </div>
                <div className="metadata-item">
                  <span className="label">総行数:</span>
                  <span className="value">{TextFormatter.formatNumber(statistics.lines)}</span>
                </div>
                {statistics.segments > 0 && (
                  <div className="metadata-item">
                    <span className="label">セグメント数:</span>
                    <span className="value">{TextFormatter.formatNumber(statistics.segments)}</span>
                  </div>
                )}
                {statistics.wordsPerMinute > 0 && (
                  <div className="metadata-item">
                    <span className="label">話速:</span>
                    <span className="value">{statistics.wordsPerMinute} 語/分</span>
                  </div>
                )}
                {statistics.averageSegmentLength > 0 && (
                  <div className="metadata-item">
                    <span className="label">平均セグメント長:</span>
                    <span className="value">{statistics.averageSegmentLength.toFixed(1)}秒</span>
                  </div>
                )}
              </div>
            </div>
            
            {/* 話者情報セクション */}
            {metadata.transcription?.speakers && metadata.transcription.speakers.length > 0 && (
              <div className="metadata-section">
                <h4 className="section-title">👥 話者情報</h4>
                <div className="speakers-list">
                  {metadata.transcription.speakers.map((speaker, index) => (
                    <span key={index} className="speaker-tag">
                      {speaker}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default MetadataPanel