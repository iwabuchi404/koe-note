/**
 * AdvancedRecordingCard - 新録音システム用カードコンポーネント
 * AudioWorklet + lamejs + リアルタイム文字起こしシステム
 * グローバル録音状態を使用してタブ切り替え時も状態を維持
 */

import { LoggerFactory, LogCategories } from '@renderer/shared/utils/LoggerFactory'
import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { AdvancedRecordingTabData } from '@renderer/features/tabs/TabTypes'
import { useRecordingContext, AdvancedRecordingConfig } from '@renderer/features/recording/RecordingContext'
import { AudioChunkCalculator } from '@renderer/shared/utils/AudioChunkCalculator'
import { modelDownloadService } from '@renderer/features/models/ModelDownloadService'
import type { ModelInfo } from '@renderer/features/models/ModelTypes'
import {
  ChunkLogRow,
  TranscriptChunkRow,
  TruncationNotice,
  countHiddenChunks,
  selectVisibleChunks
} from './ChunkViews'
import './AdvancedRecordingCard.css'

const logger = LoggerFactory.getLogger(LogCategories.UI_SETTINGS)

interface AdvancedRecordingCardProps {
  tabId: string
  data: AdvancedRecordingTabData
}

const AdvancedRecordingCard: React.FC<AdvancedRecordingCardProps> = ({ tabId, data }) => {
  // アコーディオン状態管理
  const [settingsExpanded, setSettingsExpanded] = useState(false)
  const [statsExpanded, setStatsExpanded] = useState(false)
  const [installedModels, setInstalledModels] = useState<ModelInfo[]>([])

  useEffect(() => {
    const loadInstalled = async () => {
      try {
        const models = await modelDownloadService.getInstalledModels()
        setInstalledModels(models)
      } catch (e) {
        logger.warn('インストール済みモデル取得失敗:', e)
      }
    }
    loadInstalled()
    const interval = setInterval(loadInstalled, 5000)
    return () => clearInterval(interval)
  }, [])
  const [chunksExpanded, setChunksExpanded] = useState(false)

  // グローバル録音状態を使用
  const {
    recordingData,
    isRecording,
    startRecording: globalStartRecording,
    stopRecording,
    updateConfig,
    downloadChunk,
    downloadAllChunks,
    getTotalDuration,
    getTotalDataSize,
    getErrorsCount,
    hasTranscriptionData
  } = useRecordingContext()

  // チャンク一覧は上限付きで切り出す。
  // 全件を描画すると録音時間が長くなるほど O(N^2) になり、
  // レンダラの main thread が飽和して録音ボタンが反応しなくなるため。
  const visibleChunks = useMemo(
    () => selectVisibleChunks(recordingData.chunks),
    [recordingData.chunks]
  )
  const hiddenChunkCount = useMemo(
    () => countHiddenChunks(recordingData.chunks),
    [recordingData.chunks]
  )
  const { count: transcribedChunkCount, chars: transcribedCharCount } = useMemo(
    () =>
      recordingData.chunks.reduce(
        (acc, chunk) => {
          if (chunk.transcriptionText) {
            acc.count += 1
            acc.chars += chunk.transcriptionText.length
          }
          return acc
        },
        { count: 0, chars: 0 }
      ),
    [recordingData.chunks]
  )

  // 録音開始（グローバル状態を使用）
  const startRecording = useCallback(async () => {
    const config: AdvancedRecordingConfig = {
      recordingSettings: recordingData.recordingSettings,
      transcriptionSettings: recordingData.transcriptionSettings
    }
    
    try {
      await globalStartRecording(config)
      logger.debug('🚀 AdvancedRecording 録音開始完了')
    } catch (error) {
      logger.error('🚀 AdvancedRecording 録音開始エラー:', error)
    }
  }, [globalStartRecording, recordingData.recordingSettings, recordingData.transcriptionSettings])



  return (
    <div className="advanced-recording-card">
      <div className="card-body">
        {/* 録音ボタンとメーター */}
        <div className="recording-control">
          <button 
            className={`record-button ${isRecording ? 'recording' : 'idle'}`}
            onClick={isRecording ? stopRecording : startRecording}
          >
            <span className="button-icon">
              {isRecording ? '🛑' : '🎬'}
            </span>
            <span className="button-text">
              {isRecording ? '録音停止' : '録音開始'}
            </span>
          </button>
          
          {/* レベルメーターと録音情報 */}
          <div className="recording-info">
            <div className="level-meter">
              <div className="level-bar">
                <div 
                  className="level-fill"
                  style={{ width: `${Math.min(recordingData.audioLevel * 100, 100)}%` }}
                ></div>
              </div>
              <span className="level-text">音量</span>
            </div>
            <div className="recording-stats">
              <div className="stat-item">
                <span className="stat-label">録音時間:</span>
                <span className="stat-value">{recordingData.duration.toFixed(1)}秒</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">処理チャンク:</span>
                <span className="stat-value">{recordingData.stats.totalChunks}個</span>
              </div>
            </div>
          </div>
        </div>

        {/* 設定 */}
        <div className="settings-section">
          <h3 
            className="accordion-header"
            onClick={() => setSettingsExpanded(!settingsExpanded)}
          >
            ⚙️ 設定
            <span className={`accordion-icon ${settingsExpanded ? 'expanded' : ''}`}>▼</span>
          </h3>
          {settingsExpanded && (
            <div className="accordion-content">
              {/* 録音設定 */}
              <div className="setting-group">
                <h4>📋 録音設定</h4>
                <div className="settings-grid">
                  <div className="setting-item">
                    <label>音声ソース:</label>
                    <select 
                      value={recordingData.recordingSettings.source} 
                      onChange={(e) => updateConfig({
                        recordingSettings: {
                          ...recordingData.recordingSettings,
                          source: e.target.value as 'microphone' | 'desktop' | 'mix'
                        }
                      })}
                      disabled={isRecording}
                      className="setting-select"
                    >
                      <option value="microphone">🎤 マイクロフォン</option>
                      <option value="desktop">🖥️ デスクトップ音声</option>
                      <option value="mix">🎧 マイク + デスクトップ</option>
                    </select>
                  </div>
                  <div className="setting-item">
                    <label>チャンク時間:</label>
                    <select 
                      value={recordingData.recordingSettings.chunkDuration} 
                      onChange={(e) => {
                        const duration = parseFloat(e.target.value)
                        const calculatedSize = AudioChunkCalculator.durationToBytes(duration)
                        
                        updateConfig({
                          recordingSettings: {
                            ...recordingData.recordingSettings,
                            chunkDuration: duration,
                            chunkSize: calculatedSize
                          }
                        })
                      }}
                      disabled={isRecording}
                      className="setting-select"
                    >
                      <option value={1.0}>1秒 (超高速)</option>
                      <option value={2.0}>2秒 (高速)</option>
                      <option value={3.0}>3秒 (推奨)</option>
                      <option value={5.0}>5秒 (バランス)</option>
                      <option value={10.0}>10秒 (高精度)</option>
                      <option value={15.0}>15秒 (最高精度)</option>
                    </select>
                    <span className="setting-hint">
                      ≈{AudioChunkCalculator.durationToBytes(recordingData.recordingSettings.chunkDuration)}KB
                    </span>
                  </div>
                  <div className="setting-item">
                    <label>エンコード形式:</label>
                    <select 
                      value={recordingData.recordingSettings.format} 
                      onChange={(e) => updateConfig({
                        recordingSettings: {
                          ...recordingData.recordingSettings,
                          format: e.target.value as 'mp3' | 'wav'
                        }
                      })}
                      disabled={isRecording}
                      className="setting-select"
                    >
                      <option value="mp3">MP3 (lamejs)</option>
                      <option value="wav">WAV (フォールバック)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* 文字起こし設定 */}
              <div className="setting-group">
                <h4>🔗 文字起こし設定</h4>
                <div className="settings-grid">
                  <div className="setting-item">
                    <label>有効:</label>
                    <label className="setting-toggle">
                      <input
                        type="checkbox"
                        checked={recordingData.transcriptionSettings.enabled}
                        onChange={(e) => updateConfig({
                          transcriptionSettings: {
                            ...recordingData.transcriptionSettings,
                            enabled: e.target.checked
                          }
                        })}
                        disabled={isRecording}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                  <div className="setting-item">
                    <label>言語:</label>
                    <select 
                      value={recordingData.transcriptionSettings.language} 
                      onChange={(e) => updateConfig({
                        transcriptionSettings: {
                          ...recordingData.transcriptionSettings,
                          language: e.target.value as 'ja' | 'en' | 'auto'
                        }
                      })}
                      disabled={isRecording}
                      className="setting-select"
                    >
                      <option value="ja">🇯🇵 日本語</option>
                      <option value="en">🇺🇸 英語</option>
                      <option value="auto">🌐 自動検出</option>
                    </select>
                  </div>
                  <div className="setting-item">
                    <label>モデル:</label>
                    <select 
                      value={recordingData.transcriptionSettings.model} 
                      onChange={(e) => updateConfig({
                        transcriptionSettings: {
                          ...recordingData.transcriptionSettings,
                          model: e.target.value
                        }
                      })}
                      disabled={isRecording || installedModels.length === 0}
                      className="setting-select"
                    >
                      {installedModels.length > 0 ? (
                        installedModels.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.name || m.id}
                          </option>
                        ))
                      ) : (
                        <option value="" disabled>モデルをダウンロードしてください</option>
                      )}
                    </select>
                    {installedModels.length === 0 && (
                      <div style={{
                        marginTop: '4px',
                        fontSize: '12px',
                        color: 'var(--color-text-secondary)',
                        fontStyle: 'italic'
                      }}>
                        📥 モデル管理タブからモデルをダウンロードしてください
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 録音統計 */}
        <div className="stats-section">
          <h3 
            className="accordion-header"
            onClick={() => setStatsExpanded(!statsExpanded)}
          >
            📊 録音統計
            <span className={`accordion-icon ${statsExpanded ? 'expanded' : ''}`}>▼</span>
          </h3>
          {statsExpanded && (
            <div className="accordion-content">
              <div className="stats-grid">
                <div className="stat-item">
                  <label>録音時間:</label>
                  <span>{recordingData.duration.toFixed(1)}秒</span>
                </div>
                <div className="stat-item">
                  <label>生成チャンク数:</label>
                  <span>{recordingData.stats.totalChunks}</span>
                </div>
                <div className="stat-item">
                  <label>総データサイズ:</label>
                  <span>{(recordingData.stats.totalDataSize / 1024).toFixed(1)}KB</span>
                </div>
                <div className="stat-item">
                  <label>現在のビットレート:</label>
                  <span>{(recordingData.stats.currentBitrate / 1000).toFixed(1)}kbps</span>
                </div>
                <div className="stat-item">
                  <label>文字起こし完了:</label>
                  <span>{transcribedChunkCount}/{recordingData.chunks.length}</span>
                </div>
                <div className="stat-item">
                  <label>文字起こし文字数:</label>
                  <span>{transcribedCharCount}文字</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 文字起こし結果（常に表示） */}
        {recordingData.transcriptionSettings.enabled && (
          <div className="transcription-results">
            <h3 style={{ color: 'var(--color-text-primary)' }}>📝 文字起こし結果</h3>
            <div className="transcription-display">
              {recordingData.chunks.length === 0 ? (
                <div className="transcription-placeholder">
                  録音を開始すると、文字起こし結果がここに表示されます...
                </div>
              ) : (
                <div className="transcription-timeline">
                  {visibleChunks.map((chunk) => (
                    <TranscriptChunkRow key={chunk.id} chunk={chunk} />
                  ))}
                  <TruncationNotice total={recordingData.chunks.length} />
                </div>
              )}
            </div>
            {recordingData.chunks.length > 0 && (
              <div className="transcription-actions">
                <button 
                  className="copy-all-button"
                  onClick={() => {
                    const allText = recordingData.chunks
                      .filter(chunk => chunk.transcriptionText)
                      .map(chunk => chunk.transcriptionText)
                      .join('\n')
                    if (allText) {
                      navigator.clipboard.writeText(allText)
                      logger.debug('全文字起こし結果をクリップボードにコピーしました')
                    }
                  }}
                  disabled={!recordingData.chunks.some(chunk => chunk.transcriptionText)}
                >
                  📋 全文コピー
                </button>
              </div>
            )}
          </div>
        )}

        {/* チャンクログ */}
        {recordingData.chunks.length > 0 && (
          <div className="chunks-section">
            <h3 
              className="accordion-header"
              onClick={() => setChunksExpanded(!chunksExpanded)}
            >
              🎯 チャンクログ ({recordingData.chunks.length}個)
              <span className={`accordion-icon ${chunksExpanded ? 'expanded' : ''}`}>▼</span>
            </h3>
            {chunksExpanded && (
              <div className="accordion-content">
                <div className="chunks-list">
                  {visibleChunks.map((chunk) => (
                    <ChunkLogRow key={chunk.id} chunk={chunk} onDownload={downloadChunk} />
                  ))}
                  <TruncationNotice total={recordingData.chunks.length} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* エラー表示 */}
        {recordingData.errors.length > 0 && (
          <div className="error-section">
            <h3>❌ エラー情報</h3>
            <div className="errors-list">
              {recordingData.errors.map((error, index) => (
                <div key={index} className="error-item">
                  <div className="error-time">
                    {error.timestamp.toLocaleTimeString()}
                  </div>
                  <div className="error-type">
                    {error.type}
                  </div>
                  <div className="error-message">
                    {error.message}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  )
}

export default AdvancedRecordingCard