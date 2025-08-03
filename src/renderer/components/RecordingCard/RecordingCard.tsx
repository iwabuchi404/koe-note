/**
 * 録音カード - オブジェクト指向UI
 * 録音に関する全ての機能を統合したカードコンポーネント
 * useRecordingControlを使用してRealTimeTranscriptionProcessorと連携
 */

import React, { useState, useCallback, useEffect } from 'react'
import { useTabContext } from '../../contexts/TabContext'
import { TabStatus } from '../../types/TabTypes'
import { useDeviceManager } from '../../hooks/useDeviceManager'
import { useSettings } from '../../contexts/SettingsContext'
import { useRecordingControl } from '../../hooks/useRecordingControl'
import { ToneRecorderTest } from '../ToneRecorderTest/ToneRecorderTest'
import { AudioWorkletTest } from '../AudioWorkletTest/AudioWorkletTest'
import './RecordingCard.css'

interface RecordingCardProps {
  tabId: string
  data?: any
}

const RecordingCard: React.FC<RecordingCardProps> = ({ tabId, data }) => {
  // AudioWorklet WAV テストモードの場合は専用コンポーネントを表示
  if (data?.isToneTest) {
    return (
      <div className="recording-card" data-testid="tone-test-card">
        <div className="test-header">
          <h3>🎶 AudioWorklet WAV録音テスト</h3>
          <p>AudioWorkletNode使用、WAV録音テスト</p>
        </div>
        <ToneRecorderTest />
      </div>
    )
  }

  // AudioWorklet + lamejs テストモードの場合は専用コンポーネントを表示
  if (data?.isAudioWorkletTest) {
    return (
      <div className="recording-card" data-testid="audioworklet-test-card">
        <div className="test-header">
          <h3>🔬 AudioWorklet + MP3録音テスト</h3>
          <p>AudioWorklet + lamejsリアルタイムMP3エンコード</p>
        </div>
        <AudioWorkletTest />
      </div>
    )
  }

  const { updateTab } = useTabContext()
  const deviceManager = useDeviceManager()
  const { settings } = useSettings()
  
  // 設定状態
  const [localSettings, setLocalSettings] = useState({
    source: data?.recordingSettings?.source || 'microphone',
    quality: data?.recordingSettings?.quality || 'high',
    enableTranscription: data?.isRealTimeTranscription || true,
    model: data?.recordingSettings?.model || 'medium',
    chunkDurationSeconds: 20
  })
  
  // UI状態
  const [transcriptionText, setTranscriptionText] = useState(data?.transcriptionText || '')
  const [error, setError] = useState<string | null>(null)
  const [audioLevel, setAudioLevel] = useState(0)
  const [showSettings, setShowSettings] = useState(false)
  
  // useRecordingControlを使用（USE_NEW_CHUNK_GENERATOR=trueで新しいAudioChunkGenerator + WebMHeaderProcessor）
  const recordingControl = useRecordingControl({
    onRecordingStart: () => {
      console.log('🎙️ RecordingCard: 録音開始コールバック')
      setTranscriptionText('音声認識を開始しました...\n\n')
    },
    onRecordingStopped: () => {
      console.log('🛑 RecordingCard: 録音停止コールバック')
    },
    onError: (error) => {
      console.error('❌ RecordingCard: 録音エラー', error)
      setError(error.message)
    },
    onTranscriptionUpdate: (newText) => {
      console.log('📝 RecordingCard: 文字起こし更新', { textLength: newText.length, preview: newText.substring(0, 100) })
      setTranscriptionText(newText)
    }
  })
  
  // useRecordingControlから状態を取得
  const {
    isRecording,
    isPaused,
    currentRecordingTime: recordingTime,
    hasError,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording
  } = recordingControl
  
  // 録音制御関数
  const handleRecord = useCallback(async () => {
    try {
      setError(null)
      
      if (!isRecording) {
        // 録音開始
        console.log('🎙️ RecordingCard: 録音開始', { localSettings })
        
        const config = {
          inputType: localSettings.source as 'microphone' | 'desktop' | 'stereo-mix' | 'mixing',
          selectedDevice: deviceManager.selectedDevice || 'default',
          selectedDesktopSource: deviceManager.selectedDesktopSource,
          enableRealtimeTranscription: localSettings.enableTranscription
        }
        
        await startRecording(config)
        
      } else if (isPaused) {
        // 再開
        await resumeRecording()
      } else {
        // 一時停止
        await pauseRecording()
      }
    } catch (error) {
      console.error('❌ RecordingCard: 録音制御エラー', error)
      setError('録音制御でエラーが発生しました')
    }
  }, [isRecording, isPaused, localSettings, deviceManager, startRecording, resumeRecording, pauseRecording])

  const handleStop = useCallback(async () => {
    try {
      setError(null)
      console.log('🛑 RecordingCard: 録音停止', { duration: recordingTime })
      await stopRecording()
    } catch (error) {
      console.error('❌ RecordingCard: 録音停止エラー', error)
      setError('録音の停止に失敗しました')
    }
  }, [recordingTime, stopRecording])

  // 音声レベル更新（簡易実装）
  useEffect(() => {
    let levelInterval: NodeJS.Timeout | null = null
    
    if (isRecording && !isPaused) {
      levelInterval = setInterval(() => {
        // ランダムな音声レベル（実際の実装では recordingManager から取得）
        setAudioLevel(Math.random() * 100)
      }, 100)
    } else {
      setAudioLevel(0)
    }

    return () => {
      if (levelInterval) clearInterval(levelInterval)
    }
  }, [isRecording, isPaused])

  // タブ状態更新
  useEffect(() => {
    const status = isRecording 
      ? (isPaused ? TabStatus.IDLE : TabStatus.RECORDING)
      : TabStatus.IDLE

    updateTab(tabId, { 
      status,
      data: { ...data, recordingTime, audioLevel, transcriptionText, recordingSettings: localSettings }
    })
  }, [isRecording, isPaused, recordingTime, audioLevel, transcriptionText, localSettings, tabId, updateTab, data])

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const getStatusText = () => {
    if (isRecording) {
      return isPaused ? '一時停止中' : '録音中'
    }
    return '待機中'
  }

  const getStatusColor = () => {
    if (isRecording) {
      return isPaused ? 'warning' : 'recording'
    }
    return 'idle'
  }

  return (
    <div className="recording-card" data-testid="recording-card">
      {/* エラー表示 */}
      {error && (
        <div className="error-message" data-testid="error-message">
          <span className="error-icon">⚠️</span>
          <span className="error-text">{error}</span>
          <button className="error-close" onClick={() => setError(null)}>×</button>
        </div>
      )}
      
      {/* メインコントロールエリア */}
      <div className="recording-main" data-testid="recording-controls">
        {/* 左側: 状態とコントロール */}
        <div className="recording-control">
          <div className="status-display">
            <div className={`status-indicator ${getStatusColor()}`} data-testid="recording-indicator" />
            <div className="status-info">
              <div className="status-text" data-testid="status-text">{getStatusText()}</div>
              <div className="recording-time" data-testid="recording-time">{formatTime(recordingTime)}</div>
            </div>
          </div>
          
          <div className="control-buttons">
            <button 
              className={`main-button ${isRecording ? 'recording' : 'start'}`}
              onClick={handleRecord}
              data-testid="record-button"
            >
              {!isRecording ? '録音開始' : isPaused ? '再開' : '一時停止'}
            </button>
            
            {isRecording && (
              <button className="stop-button" onClick={handleStop} data-testid="stop-button">
                停止
              </button>
            )}
          </div>
        </div>

        {/* 右側: 音声レベルと設定 */}
        <div className="recording-side">
          {/* 音声レベル */}
          <div className="audio-level" data-testid="audio-level">
            <div className="level-meter">
              <div className="level-bar" style={{ width: `${audioLevel}%` }} data-testid="audio-level-bar" />
            </div>
            <div className="level-text" data-testid="audio-level-text">{Math.round(audioLevel)}%</div>
          </div>
          
          {/* 設定ボタン */}
          <button 
            className={`settings-toggle ${showSettings ? 'active' : ''}`}
            onClick={() => setShowSettings(!showSettings)}
            disabled={isRecording}
            data-testid="settings-button"
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* 設定パネル（展開式） */}
      {showSettings && (
        <div className="settings-panel" data-testid="settings-panel">
          <div className="setting-row">
            <label>音声源:</label>
            <select 
              value={localSettings.source}
              onChange={(e) => setLocalSettings({...localSettings, source: e.target.value as any})}
              disabled={isRecording}
              data-testid="audio-source-select"
            >
              <option value="microphone">マイクロフォン</option>
              <option value="desktop">デスクトップ音声</option>
              <option value="mix">ミックス</option>
            </select>
          </div>
          
          <div className="setting-row">
            <label>品質:</label>
            <select 
              value={localSettings.quality}
              onChange={(e) => setLocalSettings({...localSettings, quality: e.target.value as any})}
              disabled={isRecording}
              data-testid="audio-quality-select"
            >
              <option value="high">高品質</option>
              <option value="medium">標準</option>
              <option value="low">省容量</option>
            </select>
          </div>
          
          <div className="setting-row">
            <label>
              <input
                type="checkbox"
                checked={localSettings.enableTranscription}
                onChange={(e) => setLocalSettings({...localSettings, enableTranscription: e.target.checked})}
                disabled={isRecording}
                data-testid="realtime-transcription-toggle"
              />
              リアルタイム文字起こし
            </label>
          </div>
          
          {localSettings.enableTranscription && (
            <div className="setting-row">
              <label>AIモデル:</label>
              <select 
                value={localSettings.model}
                onChange={(e) => setLocalSettings({...localSettings, model: e.target.value as any})}
                disabled={isRecording}
                data-testid="ai-model-select"
              >
                <option value="large">高精度</option>
                <option value="medium">標準</option>
                <option value="small">高速</option>
              </select>
            </div>
          )}
        </div>
      )}

      {/* 文字起こし結果 */}
      {localSettings.enableTranscription && (
        <div className="transcription-result" data-testid="transcription-result">
          <div className="result-header">
            <span>文字起こし結果</span>
            {isRecording && <div className="processing-indicator" data-testid="transcription-progress">処理中...</div>}
          </div>
          <div className="result-content">
            {transcriptionText ? (
              <div className="transcription-text" data-testid="transcription-text">{transcriptionText}</div>
            ) : (
              <div className="placeholder">録音を開始すると文字起こし結果が表示されます</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default RecordingCard