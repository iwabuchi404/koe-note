import React from 'react'
import { PLAYBACK_RATES } from '../../hooks/useAudioPlayer'

interface PlaybackControlsProps {
  isPlaying: boolean
  loading: boolean
  volume: number
  playbackRate: number
  hasFile: boolean
  onPlay: () => void
  onPause: () => void
  onStop: () => void
  onVolumeChange: (volume: number) => void
  onPlaybackRateChange: (rate: number) => void
}

/**
 * 音声再生コントロールコンポーネント
 * 再生/停止、音量、再生速度などの制御
 */
const PlaybackControls: React.FC<PlaybackControlsProps> = ({
  isPlaying,
  loading,
  volume,
  playbackRate,
  hasFile,
  onPlay,
  onPause,
  onStop,
  onVolumeChange,
  onPlaybackRateChange
}) => {
  // 再生/一時停止の切り替え
  const handlePlayPause = () => {
    if (isPlaying) {
      onPause()
    } else {
      onPlay()
    }
  }
  
  // 音量アイコンの決定
  const getVolumeIcon = () => {
    if (volume === 0) return '🔇'
    if (volume < 0.5) return '🔉'
    return '🔊'
  }
  
  return (
    <div className="playback-controls">
      {/* メイン再生コントロール */}
      <div className="playback-controls__main">
        {/* 再生/一時停止ボタン */}
        <button
          className={`btn playback-controls__play-pause ${
            isPlaying ? 'btn--warning' : 'btn--primary'
          }`}
          onClick={handlePlayPause}
          disabled={!hasFile || loading}
          title={isPlaying ? '一時停止' : '再生'}
        >
          {loading ? (
            '⏳'
          ) : isPlaying ? (
            '⏸️'
          ) : (
            '▶️'
          )}
          <span className="playback-controls__button-text">
            {loading ? '読み込み中' : isPlaying ? '一時停止' : '再生'}
          </span>
        </button>
        
        {/* 停止ボタン */}
        <button
          className="btn playback-controls__stop"
          onClick={onStop}
          disabled={!hasFile || loading}
          title="停止"
        >
          ⏹️
        </button>
      </div>
      
      {/* 音量コントロール */}
      <div className="playback-controls__volume">
        <label className="playback-controls__volume-label" title="音量">
          {getVolumeIcon()}
        </label>
        <input
          type="range"
          className="playback-controls__volume-slider"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
          disabled={!hasFile}
        />
        <span className="playback-controls__volume-value">
          {Math.round(volume * 100)}%
        </span>
      </div>
      
      {/* 再生速度コントロール */}
      <div className="playback-controls__rate">
        <label className="playback-controls__rate-label">
          速度:
        </label>
        <select
          className="select playback-controls__rate-select"
          value={playbackRate}
          onChange={(e) => onPlaybackRateChange(parseFloat(e.target.value))}
          disabled={!hasFile}
        >
          {PLAYBACK_RATES.map(rate => (
            <option key={rate.value} value={rate.value}>
              {rate.label}
            </option>
          ))}
        </select>
      </div>
      
      {/* ファイル未選択時のメッセージ */}
      {!hasFile && (
        <div className="playback-controls__no-file">
          ファイルを選択してください
        </div>
      )}
    </div>
  )
}

export default PlaybackControls