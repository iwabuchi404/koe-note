import React, { useEffect } from 'react'
import { useAudioPlayer } from '../../hooks/useAudioPlayer'
import SeekBar from './SeekBar'
import PlaybackControls from './PlaybackControls'
import { useAppContext } from '../../App' 

interface AudioPlayerProps {
  filePath?: string
  fileName?: string
  className?: string
}

/**
 * 統合音声プレイヤーコンポーネント
 * 音声ファイルの再生制御とUI表示
 */
const AudioPlayer: React.FC<AudioPlayerProps> = ({
  filePath,
  fileName,
  className = ''
}) => {
  const { selectedFile, setIsPlaying } = useAppContext() // グローバルな状態から選択ファイルを取得
  const [audioState, audioControls] = useAudioPlayer()
  
  // ファイルが変更された時の処理
  useEffect(() => {
    if (selectedFile?.filepath) {
      audioControls.loadFile(selectedFile.filepath).catch(error => {
        console.error('AudioPlayer: ファイル読み込みエラー:', error)
      })
    } else {
      audioControls.stop() 
    }
  }, [selectedFile]) // 依存配列をselectedFileに変更

  // 再生状態をグローバルコンテキストに同期
  useEffect(() => {
    setIsPlaying(audioState.isPlaying)
  }, [audioState.isPlaying, setIsPlaying])
  
  // ファイルが選択されているかチェック
  const hasFile = Boolean(filePath)
  
  // デバッグ用ログ
  console.log('AudioPlayer render DEBUG:', JSON.stringify({
    filePath,
    fileName,
    hasFile,
    audioState: {
      isPlaying: audioState.isPlaying,
      currentTime: audioState.currentTime,
      duration: audioState.duration,
      loading: audioState.loading,
      error: audioState.error
    }
  }, null, 2))
  
  return (
    <div className={`audio-player ${className}`}>
      {/* プレイヤーヘッダー */}
      <div className="audio-player__header">
        <div className="audio-player__file-info">
          {hasFile ? (
            <>
              <div className="audio-player__file-name" title={fileName}>
                🎵 {fileName || 'Unknown'}
              </div>
              <div className="audio-player__file-path" title={filePath}>
                {filePath}
              </div>
            </>
          ) : (
            <div className="audio-player__no-file">
              ファイルが選択されていません
            </div>
          )}
        </div>
        
        {/* エラー表示 */}
        {audioState.error && (
          <div className="audio-player__error">
            ⚠️ {audioState.error}
          </div>
        )}
      </div>
      
      {/* シークバー */}
      <SeekBar
        currentTime={audioState.currentTime}
        duration={selectedFile?.duration ?? 0}
        loading={audioState.loading}
        onSeek={audioControls.seek}
        className="audio-player__seek-bar"
      />
      
      {/* 再生コントロール */}
      <PlaybackControls
        isPlaying={audioState.isPlaying}
        loading={audioState.loading}
        volume={audioState.volume}
        playbackRate={audioState.playbackRate}
        hasFile={hasFile}
        onPlay={audioControls.play}
        onPause={audioControls.pause}
        onStop={audioControls.stop}
        onVolumeChange={audioControls.setVolume}
        onPlaybackRateChange={audioControls.setPlaybackRate}
      />
    </div>
  )
}

export default AudioPlayer