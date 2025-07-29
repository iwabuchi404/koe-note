/**
 * 音声ファイルカード - オブジェクト指向UI
 * 音声ファイルに関する全ての機能を統合したカードコンポーネント
 */

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useTabContext } from '../../contexts/TabContext'
import { TabStatus } from '../../types/TabTypes'
import { LoggerFactory, LogCategories } from '../../utils/LoggerFactory'
import './AudioFileCard.css'

const logger = LoggerFactory.getLogger(LogCategories.SERVICE_TRANSCRIPTION)

interface AudioFileCardProps {
  tabId: string
  data?: any
}

const AudioFileCard: React.FC<AudioFileCardProps> = ({ tabId, data }) => {
  const { updateTab } = useTabContext()
  
  // ファイル情報
  const [fileName] = useState(data?.fileName || '音声ファイル')
  const [filePath] = useState(data?.filePath || '')
  const [hasTranscriptionFile] = useState(data?.hasTranscriptionFile || false)
  const [transcriptionPath] = useState(data?.transcriptionPath || '')
  
  // 再生状態
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(data?.duration || 0)
  const [volume, setVolume] = useState(1.0)
  const [playbackRate, setPlaybackRate] = useState(1.0)
  
  // 文字起こし状態
  const [transcriptionText, setTranscriptionText] = useState('')
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcriptionProgress, setTranscriptionProgress] = useState(0)
  
  // UI状態
  const [showControls, setShowControls] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // 再生制御
  const handlePlayPause = useCallback(async () => {
    if (!audioRef.current) return

    try {
      if (isPlaying) {
        audioRef.current.pause()
        setIsPlaying(false)
        logger.info('音声一時停止', { fileName })
      } else {
        await audioRef.current.play()
        setIsPlaying(true)
        logger.info('音声再生開始', { fileName })
      }
    } catch (error) {
      logger.error('音声再生エラー', error instanceof Error ? error : new Error(String(error)), { fileName })
      setError('音声の再生に失敗しました')
    }
  }, [isPlaying, fileName])

  const handleSeek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time
      setCurrentTime(time)
    }
  }, [])

  const handleVolumeChange = useCallback((newVolume: number) => {
    if (audioRef.current) {
      audioRef.current.volume = newVolume
      setVolume(newVolume)
    }
  }, [])

  const handleRateChange = useCallback((rate: number) => {
    if (audioRef.current) {
      audioRef.current.playbackRate = rate
      setPlaybackRate(rate)
    }
  }, [])

  // 文字起こし開始
  const handleStartTranscription = useCallback(async () => {
    try {
      setIsTranscribing(true)
      setTranscriptionProgress(0)
      setTranscriptionText('')
      
      logger.info('文字起こし開始', { fileName, filePath })

      // モック: 進捗更新
      const progressInterval = setInterval(() => {
        setTranscriptionProgress(prev => {
          const next = prev + 10
          if (next >= 100) {
            clearInterval(progressInterval)
            setIsTranscribing(false)
            setTranscriptionText('文字起こしが完了しました。\n\nこちらはサンプルテキストです。実際の音声ファイルから文字起こしされたテキストが表示されます。音声の内容に応じて、正確な文字起こし結果が表示されます。')
            logger.info('文字起こし完了', { fileName })
            return 100
          }
          return next
        })
      }, 500)

    } catch (error) {
      logger.error('文字起こしエラー', error instanceof Error ? error : new Error(String(error)), { fileName })
      setIsTranscribing(false)
      setError('文字起こしに失敗しました')
    }
  }, [fileName, filePath])

  // 音声イベント
  const handleLoadedData = useCallback(() => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration)
      logger.info('音声ファイル読み込み完了', { fileName, duration: audioRef.current.duration })
    }
  }, [fileName])

  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime)
    }
  }, [])

  const handleEnded = useCallback(() => {
    setIsPlaying(false)
    setCurrentTime(0)
    logger.info('音声再生終了', { fileName })
  }, [fileName])

  const handleError = useCallback(() => {
    setError('音声ファイルの読み込みに失敗しました')
    logger.error('音声ファイル読み込みエラー', undefined, { fileName, filePath })
  }, [fileName, filePath])

  // ファイル読み込み
  useEffect(() => {
    if (filePath && audioRef.current) {
      audioRef.current.src = `file://${filePath}`
      audioRef.current.load()
    }
  }, [filePath])

  // 文字起こしファイル初期読み込み
  useEffect(() => {
    const loadExistingTranscription = async () => {
      if (hasTranscriptionFile && transcriptionPath) {
        try {
          logger.info('既存の文字起こしファイル読み込み開始', { fileName, transcriptionPath })
          
          if (window.electronAPI?.readFile) {
            const fileContent = await window.electronAPI.readFile(transcriptionPath)
            const contentText = new TextDecoder().decode(fileContent)
            setTranscriptionText(contentText)
            logger.info('既存の文字起こしファイル読み込み完了', { fileName, transcriptionPath, contentLength: contentText.length })
          }
        } catch (error) {
          logger.error('既存の文字起こしファイル読み込みエラー', error instanceof Error ? error : new Error(String(error)), { fileName, transcriptionPath })
        }
      }
    }
    
    loadExistingTranscription()
  }, [hasTranscriptionFile, transcriptionPath, fileName])

  // タブ状態更新
  useEffect(() => {
    const status = isTranscribing 
      ? TabStatus.TRANSCRIBING
      : isPlaying 
        ? TabStatus.PLAYING
        : error
          ? TabStatus.ERROR
          : TabStatus.IDLE

    updateTab(tabId, { 
      status,
      data: { ...data, isPlaying, currentTime, volume, playbackRate }
    })
  }, [isPlaying, currentTime, volume, playbackRate, isTranscribing, error, tabId, updateTab, data])

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="audio-file-card">
      {/* 非表示の音声要素 */}
      <audio
        ref={audioRef}
        onLoadedData={handleLoadedData}
        onError={handleError}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        preload="metadata"
      />

      {/* ファイル情報ヘッダー */}
      <div className="file-header">
        <div className="file-info">
          <div className="file-name">{fileName}</div>
          <div className="file-meta">
            {duration > 0 && <span>{formatTime(duration)}</span>}
            {error && <span className="error-indicator">エラー</span>}
          </div>
        </div>
        <button 
          className={`controls-toggle ${showControls ? 'active' : ''}`}
          onClick={() => setShowControls(!showControls)}
        >
          🎛️
        </button>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="error-message">
          <span className="error-icon">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* メイン再生コントロール */}
      <div className="playback-main">
        <button 
          className="play-button"
          onClick={handlePlayPause}
          disabled={!!error}
        >
          {isPlaying ? '⏸️' : '▶️'}
        </button>
        
        <div className="progress-area">
          <div className="time-display">
            <span className="current-time">{formatTime(currentTime)}</span>
            <span className="separator">/</span>
            <span className="total-time">{formatTime(duration)}</span>
          </div>
          
          <div className="progress-slider">
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={(e) => handleSeek(parseFloat(e.target.value))}
              disabled={!!error}
            />
          </div>
        </div>
        
        <button 
          className="transcribe-button"
          onClick={handleStartTranscription}
          disabled={isTranscribing || !!error}
        >
          {isTranscribing ? '処理中...' : '文字起こし'}
        </button>
      </div>

      {/* 詳細コントロール（展開式） */}
      {showControls && (
        <div className="detailed-controls">
          <div className="control-group">
            <label>音量:</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
            />
            <span>{Math.round(volume * 100)}%</span>
          </div>
          
          <div className="control-group">
            <label>速度:</label>
            <select
              value={playbackRate}
              onChange={(e) => handleRateChange(parseFloat(e.target.value))}
            >
              <option value={0.5}>0.5x</option>
              <option value={0.75}>0.75x</option>
              <option value={1.0}>1.0x</option>
              <option value={1.25}>1.25x</option>
              <option value={1.5}>1.5x</option>
              <option value={2.0}>2.0x</option>
            </select>
          </div>
          
          <div className="control-group">
            <button onClick={() => handleSeek(Math.max(0, currentTime - 10))}>
              ⏪ 10秒戻る
            </button>
            <button onClick={() => handleSeek(Math.min(duration, currentTime + 10))}>
              10秒進む ⏩
            </button>
          </div>
        </div>
      )}

      {/* 文字起こし進捗 */}
      {isTranscribing && (
        <div className="transcription-progress">
          <div className="progress-info">
            <span>文字起こし処理中... {transcriptionProgress}%</span>
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill"
              style={{ width: `${transcriptionProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* 文字起こし結果 */}
      {transcriptionText && (
        <div className="transcription-result">
          <div className="result-header">
            <span>文字起こし結果</span>
            <button className="copy-button" onClick={() => navigator.clipboard.writeText(transcriptionText)}>
              📋 コピー
            </button>
          </div>
          <div className="result-content">
            <div className="transcription-text">{transcriptionText}</div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AudioFileCard