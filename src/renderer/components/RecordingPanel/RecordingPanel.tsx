/**
 * 録音パネルコンポーネント
 * 録音制御とリアルタイム文字起こし機能を提供
 */

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useTabContext } from '../../contexts/TabContext'
import { TabStatus, RecordingTabData } from '../../types/TabTypes'
import { LoggerFactory, LogCategories } from '../../utils/LoggerFactory'
import './RecordingPanel.css'

// ログ取得
const logger = LoggerFactory.getLogger(LogCategories.SERVICE_RECORDING)

interface RecordingPanelProps {
  tabId: string
  data: RecordingTabData
}

const RecordingPanel: React.FC<RecordingPanelProps> = ({ tabId, data }) => {
  const { updateTab } = useTabContext()
  
  // 録音状態
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const [audioLevel, setAudioLevel] = useState(0)
  const [transcriptionText, setTranscriptionText] = useState(data?.transcriptionText || '')
  const [isPaused, setIsPaused] = useState(false)
  
  // リアルタイム設定
  const [isRealTimeTranscription, setIsRealTimeTranscription] = useState(data?.isRealTimeTranscription || false)
  const [recordingSettings, setRecordingSettings] = useState(data?.recordingSettings || {
    source: 'microphone',
    quality: 'high',
    model: 'medium'
  })

  // タイマー参照
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const audioLevelRef = useRef<NodeJS.Timeout | null>(null)

  // 録音時間更新
  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [isRecording, isPaused])

  // 音声レベル監視（モック）
  useEffect(() => {
    if (isRecording && !isPaused) {
      audioLevelRef.current = setInterval(() => {
        // モック: ランダムな音声レベル
        setAudioLevel(Math.random() * 100)
      }, 100)
    } else {
      if (audioLevelRef.current) {
        clearInterval(audioLevelRef.current)
        audioLevelRef.current = null
      }
      setAudioLevel(0)
    }

    return () => {
      if (audioLevelRef.current) {
        clearInterval(audioLevelRef.current)
      }
    }
  }, [isRecording, isPaused])

  // タブ状態更新
  useEffect(() => {
    const status = isRecording 
      ? (isPaused ? TabStatus.IDLE : TabStatus.RECORDING)
      : TabStatus.IDLE

    updateTab(tabId, { 
      status,
      data: {
        ...data,
        duration: recordingTime,
        audioLevel,
        transcriptionText
      }
    })
  }, [isRecording, isPaused, recordingTime, audioLevel, transcriptionText, tabId, updateTab, data])

  // 録音開始
  const handleStartRecording = useCallback(async () => {
    try {
      logger.info('録音開始', { 
        isRealTimeTranscription, 
        recordingSettings 
      })

      // TODO: 実際の録音API呼び出し
      setIsRecording(true)
      setIsPaused(false)
      setRecordingTime(0)
      setTranscriptionText('')

      // モック: リアルタイム文字起こし
      if (isRealTimeTranscription) {
        setTimeout(() => {
          setTranscriptionText('音声認識が開始されました...')
        }, 2000)
      }

    } catch (error) {
      logger.error('録音開始エラー', error instanceof Error ? error : new Error(String(error)))
    }
  }, [isRealTimeTranscription, recordingSettings])

  // 録音停止
  const handleStopRecording = useCallback(async () => {
    try {
      logger.info('録音停止', { duration: recordingTime })

      setIsRecording(false)
      setIsPaused(false)
      
      // TODO: 録音ファイル保存処理
      
    } catch (error) {
      logger.error('録音停止エラー', error instanceof Error ? error : new Error(String(error)))
    }
  }, [recordingTime])

  // 録音一時停止/再開
  const handleTogglePause = useCallback(() => {
    setIsPaused(prev => {
      const newPaused = !prev
      logger.info(newPaused ? '録音一時停止' : '録音再開')
      return newPaused
    })
  }, [])

  // 時間フォーマット
  const formatTime = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    
    if (hrs > 0) {
      return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="recording-panel">
      {/* ヘッダー */}
      <div className="recording-header">
        <h2 className="panel-title">音声録音</h2>
        <div className="recording-status">
          {isRecording ? (
            isPaused ? (
              <span className="status-badge paused">一時停止中</span>
            ) : (
              <span className="status-badge recording">録音中</span>
            )
          ) : (
            <span className="status-badge idle">待機中</span>
          )}
        </div>
      </div>

      {/* 録音設定 */}
      <div className="recording-settings">
        <h3>録音設定</h3>
        <div className="settings-grid">
          <div className="setting-item">
            <label className="setting-label">音声源:</label>
            <select 
              className="setting-select"
              value={recordingSettings.source}
              onChange={(e) => setRecordingSettings({...recordingSettings, source: e.target.value as any})}
              disabled={isRecording}
            >
              <option value="microphone">マイクロフォン</option>
              <option value="desktop">デスクトップ音声</option>
              <option value="mix">ミックス</option>
            </select>
          </div>
          <div className="setting-item">
            <label className="setting-label">品質:</label>
            <select 
              className="setting-select"
              value={recordingSettings.quality}
              onChange={(e) => setRecordingSettings({...recordingSettings, quality: e.target.value as any})}
              disabled={isRecording}
            >
              <option value="high">高品質</option>
              <option value="medium">標準</option>
              <option value="low">省容量</option>
            </select>
          </div>
          <div className="setting-item">
            <label className="setting-label">文字起こし:</label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={isRealTimeTranscription}
                onChange={(e) => setIsRealTimeTranscription(e.target.checked)}
                disabled={isRecording}
              />
              リアルタイム文字起こし
            </label>
          </div>
          {isRealTimeTranscription && (
            <div className="setting-item">
              <label className="setting-label">AIモデル:</label>
              <select 
                className="setting-select"
                value={recordingSettings.model}
                onChange={(e) => setRecordingSettings({...recordingSettings, model: e.target.value as any})}
                disabled={isRecording}
              >
                <option value="large">高精度</option>
                <option value="medium">標準</option>
                <option value="small">高速</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* 録音コントロール */}
      <div className="recording-controls">
        <div className="control-row">
          {!isRecording ? (
            <button 
              className="control-button start"
              onClick={handleStartRecording}
            >
              録音開始
            </button>
          ) : (
            <>
              <button 
                className="control-button pause"
                onClick={handleTogglePause}
              >
                {isPaused ? '再開' : '一時停止'}
              </button>
              
              <button 
                className="control-button stop"
                onClick={handleStopRecording}
              >
                停止
              </button>
            </>
          )}
        </div>

        {/* 録音時間と音声レベル */}
        <div className="recording-info">
          <div className="recording-time">
            <span className="time-label">録音時間:</span>
            <span className="time-value">{formatTime(recordingTime)}</span>
          </div>
          
          <div className="audio-level">
            <span className="level-label">音声レベル:</span>
            <div className="level-meter">
              <div 
                className="level-bar"
                style={{ width: `${audioLevel}%` }}
              />
            </div>
            <span className="level-value">{Math.round(audioLevel)}%</span>
          </div>
        </div>
      </div>

      {/* 設定表示 */}
      <div className="recording-settings">
        <h3>録音設定</h3>
        <div className="settings-grid">
          <div className="setting-item">
            <span className="setting-label">音声源:</span>
            <span className="setting-value">
              {recordingSettings.source === 'microphone' ? 'マイクロフォン' :
               recordingSettings.source === 'desktop' ? 'デスクトップ音声' : 'ミックス'}
            </span>
          </div>
          <div className="setting-item">
            <span className="setting-label">品質:</span>
            <span className="setting-value">
              {recordingSettings.quality === 'high' ? '高品質' :
               recordingSettings.quality === 'medium' ? '標準' : '省容量'}
            </span>
          </div>
          <div className="setting-item">
            <span className="setting-label">AIモデル:</span>
            <span className="setting-value">
              {recordingSettings.model === 'large' ? '高精度' :
               recordingSettings.model === 'medium' ? '標準' : '高速'}
            </span>
          </div>
        </div>
      </div>

      {/* リアルタイム文字起こし表示 */}
      {isRealTimeTranscription && (
        <div className="transcription-area">
          <h3>リアルタイム文字起こし</h3>
          <div className="transcription-content">
            {transcriptionText ? (
              <div className="transcription-text">{transcriptionText}</div>
            ) : (
              <div className="transcription-placeholder">
                文字起こしを開始するには録音を開始してください
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default RecordingPanel