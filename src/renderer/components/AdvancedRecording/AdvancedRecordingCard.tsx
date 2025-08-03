/**
 * AdvancedRecordingCard - 新録音システム用カードコンポーネント
 * AudioWorklet + lamejs + リアルタイム文字起こしシステム
 */

import React, { useState, useEffect } from 'react'
import { AdvancedRecordingTabData } from '../../types/TabTypes'
import { useAdvancedRecording, AdvancedRecordingConfig } from '../../hooks/useAdvancedRecording'
import { AudioChunkCalculator } from '../../utils/AudioChunkCalculator'
import './AdvancedRecordingCard.css'

interface AdvancedRecordingCardProps {
  tabId: string
  data: AdvancedRecordingTabData
}

const AdvancedRecordingCard: React.FC<AdvancedRecordingCardProps> = ({ tabId, data }) => {
  // 初期設定の準備
  const initialConfig: AdvancedRecordingConfig = {
    recordingSettings: data.recordingSettings || {
      source: 'microphone',
      deviceId: undefined,
      chunkSize: 64,
      chunkDuration: 3.0,
      chunkSizeMode: 'duration',
      format: 'mp3'
    },
    transcriptionSettings: data.transcriptionSettings || {
      enabled: true,
      serverUrl: 'ws://localhost:8770',
      language: 'ja',
      model: 'small'
    }
  }


  // 新録音システムHook
  const {
    recordingData,
    isRecording,
    startRecording,
    stopRecording,
    updateConfig,
    downloadChunk,
    downloadAllChunks,
    saveWithPreset,
    getTotalDuration,
    getTotalDataSize,
    getChunksCount,
    getErrorsCount,
    getTranscriptionCount,
    hasTranscriptionData
  } = useAdvancedRecording(initialConfig, {
    onError: (error) => {
      console.error('🚀 AdvancedRecording エラー:', error)
    },
    onChunkReady: (chunk) => {
      console.log('🚀 AdvancedRecording チャンク生成:', chunk)
    },
    onTranscriptionResult: (result) => {
      console.log('🚀 AdvancedRecording 文字起こし結果:', result)
    }
  })



  return (
    <div className="advanced-recording-card">
      <div className="card-header">
        <div className="header-title">
          <h2>🚀 新録音システム</h2>
          <p>AudioWorklet + lamejs + リアルタイム文字起こし</p>
        </div>
        <div className="header-status">
          <div className={`status-indicator ${isRecording ? 'recording' : 'idle'}`}>
            {isRecording ? '🔴 録音中' : '⭕ 待機中'}
          </div>
        </div>
      </div>

      <div className="card-body">
        {/* 設定セクション */}
        <div className="settings-section">
          <h3>📋 録音設定</h3>
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
              <label>チャンク設定モード:</label>
              <select 
                value={recordingData.recordingSettings.chunkSizeMode} 
                onChange={(e) => {
                  const mode = e.target.value as 'bytes' | 'duration'
                  const currentValue = mode === 'duration' 
                    ? recordingData.recordingSettings.chunkDuration 
                    : recordingData.recordingSettings.chunkSize
                  
                  updateConfig({
                    recordingSettings: {
                      ...recordingData.recordingSettings,
                      chunkSizeMode: mode
                    }
                  })
                }}
                disabled={isRecording}
                className="setting-select"
              >
                <option value="duration">⏱️ 秒数指定 (推奨)</option>
                <option value="bytes">💾 バイト指定</option>
              </select>
            </div>
            
            {recordingData.recordingSettings.chunkSizeMode === 'duration' ? (
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
                <span style={{ fontSize: '12px', color: '#888', marginLeft: '8px' }}>
                  ≈{AudioChunkCalculator.durationToBytes(recordingData.recordingSettings.chunkDuration)}KB
                </span>
              </div>
            ) : (
              <div className="setting-item">
                <label>チャンクサイズ:</label>
                <select 
                  value={recordingData.recordingSettings.chunkSize} 
                  onChange={(e) => {
                    const size = parseInt(e.target.value)
                    const calculatedDuration = AudioChunkCalculator.bytesToDuration(size)
                    
                    updateConfig({
                      recordingSettings: {
                        ...recordingData.recordingSettings,
                        chunkSize: size,
                        chunkDuration: calculatedDuration
                      }
                    })
                  }}
                  disabled={isRecording}
                  className="setting-select"
                >
                  <option value={32}>32KB</option>
                  <option value={64}>64KB</option>
                  <option value={128}>128KB</option>
                  <option value={256}>256KB</option>
                  <option value={512}>512KB</option>
                </select>
                <span style={{ fontSize: '12px', color: '#888', marginLeft: '8px' }}>
                  ≈{AudioChunkCalculator.bytesToDuration(recordingData.recordingSettings.chunkSize)}秒
                </span>
              </div>
            )}
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

        {/* 文字起こし設定セクション */}
        <div className="transcription-section">
          <h3>🔗 文字起こし設定</h3>
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
              <label>サーバー:</label>
              <input
                type="text"
                value={recordingData.transcriptionSettings.serverUrl}
                onChange={(e) => updateConfig({
                  transcriptionSettings: {
                    ...recordingData.transcriptionSettings,
                    serverUrl: e.target.value
                  }
                })}
                disabled={isRecording}
                className="setting-input"
                placeholder="ws://localhost:8770"
              />
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
                    model: e.target.value as 'small' | 'medium' | 'large'
                  }
                })}
                disabled={isRecording}
                className="setting-select"
              >
                <option value="small">Small (高速)</option>
                <option value="medium">Medium (バランス)</option>
                <option value="large">Large (高精度)</option>
              </select>
            </div>
          </div>
        </div>

        {/* リアルタイム文字起こし表示セクション */}
        {recordingData.transcriptionSettings.enabled && (
          <div className="realtime-transcription-section">
            <h3>📝 リアルタイム文字起こし</h3>
            <div className="realtime-transcription-display">
              {recordingData.chunks.length === 0 ? (
                <div className="transcription-placeholder">
                  録音を開始すると、文字起こし結果がここに表示されます...
                </div>
              ) : (
                <div className="transcription-timeline">
                  {recordingData.chunks.map((chunk) => (
                    <div key={chunk.id} className={`transcription-chunk ${chunk.transcriptionStatus}`}>
                      <div className="chunk-header">
                        <span className="chunk-time">
                          {new Date(chunk.timestamp).toLocaleTimeString()}
                        </span>
                        <span className={`chunk-status-badge ${chunk.transcriptionStatus}`}>
                          {chunk.transcriptionStatus === 'pending' && '⏳ 待機中'}
                          {chunk.transcriptionStatus === 'processing' && '⚡ 処理中'}
                          {chunk.transcriptionStatus === 'completed' && '✅ 完了'}
                          {chunk.transcriptionStatus === 'failed' && '❌ 失敗'}
                        </span>
                      </div>
                      <div className="chunk-transcription-text">
                        {chunk.transcriptionText ? (
                          chunk.transcriptionText
                        ) : chunk.transcriptionStatus === 'completed' ? (
                          <span className="no-text">(音声なし)</span>
                        ) : (
                          <span className="processing-text">処理中...</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {recordingData.chunks.length > 0 && (
              <div className="transcription-summary">
                <button 
                  className="copy-all-button"
                  onClick={() => {
                    const allText = recordingData.chunks
                      .filter(chunk => chunk.transcriptionText)
                      .map(chunk => chunk.transcriptionText)
                      .join('\n')
                    if (allText) {
                      navigator.clipboard.writeText(allText)
                      console.log('全文字起こし結果をクリップボードにコピーしました')
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

        {/* 統計情報セクション */}
        <div className="stats-section">
          <h3>📊 録音統計</h3>
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
              <span>{getTranscriptionCount()}/{getChunksCount()}</span>
            </div>
            <div className="stat-item">
              <label>文字起こし文字数:</label>
              <span>{recordingData.chunks.reduce((total, chunk) => total + (chunk.transcriptionText?.length || 0), 0)}文字</span>
            </div>
          </div>
        </div>

        {/* コントロールボタン */}
        <div className="controls-section">
          <div className="control-buttons">
            <button 
              className={`control-button ${isRecording ? 'stop' : 'start'}`}
              onClick={isRecording ? stopRecording : startRecording}
            >
              {isRecording ? '🛑 録音停止' : '🎬 録音開始'}
            </button>
            <button 
              className="control-button secondary" 
              disabled={isRecording}
              onClick={() => {
                // 設定変更モーダルを開く（今後実装）
                console.log('設定変更（今後実装）')
              }}
            >
              ⚙️ 設定変更
            </button>
            <button 
              className="control-button secondary" 
              disabled={getChunksCount() === 0}
              onClick={downloadAllChunks}
            >
              📥 統合ダウンロード ({getChunksCount()}チャンク)
            </button>
          </div>
        </div>

        {/* 自動保存情報 */}
        {getChunksCount() > 0 && (
          <div className="auto-save-info">
            <h3>💾 リアルタイム自動保存</h3>
            <div className="info-grid">
              <div className="info-item">
                <label>音声ファイル:</label>
                <span>チャンク毎に追記</span>
              </div>
              <div className="info-item">
                <label>文字起こし:</label>
                <span>完了時に追記</span>
              </div>
              <div className="info-item">
                <label>保存先:</label>
                <span>設定フォルダ</span>
              </div>
              <div className="info-item">
                <label>タイムスタンプ:</label>
                <span>有効</span>
              </div>
            </div>
          </div>
        )}

        {/* チャンク一覧セクション */}
        {recordingData.chunks.length > 0 && (
          <div className="chunks-section">
            <h3>🎯 生成チャンク ({recordingData.chunks.length}個)</h3>
            <div className="chunks-list">
              {recordingData.chunks.map((chunk) => (
                <div key={chunk.id} className="chunk-item">
                  <div className="chunk-info">
                    <span>チャンク #{chunk.id}</span>
                    <span>{(chunk.size / 1024).toFixed(1)}KB</span>
                    <span>{chunk.timestamp.toLocaleTimeString()}</span>
                  </div>
                  <div className={`chunk-status ${chunk.transcriptionStatus}`}>
                    {chunk.transcriptionStatus}
                  </div>
                  {chunk.transcriptionText && (
                    <div className="chunk-transcription">
                      {chunk.transcriptionText}
                    </div>
                  )}
                  <button 
                    className="chunk-download-button"
                    onClick={() => downloadChunk(chunk.id)}
                    title={`チャンク#${chunk.id}をダウンロード`}
                  >
                    📥
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* エラー表示セクション */}
        {recordingData.errors.length > 0 && (
          <div className="errors-section">
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

      {/* 実装完了メッセージ */}
      <div className="dev-notice" style={{ background: 'linear-gradient(135deg, #28a745, #20c997)' }}>
        <p>✅ <strong>実装完了:</strong> AudioWorklet + lamejs録音システムとリアルタイム文字起こしが利用可能です！</p>
      </div>
    </div>
  )
}

export default AdvancedRecordingCard