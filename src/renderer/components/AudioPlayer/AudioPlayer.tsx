import React, { useEffect } from 'react'
import { useAudioPlayer } from '../../audio/hooks/useAudioPlayer'
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
  const audioPlayer = useAudioPlayer()
  
  // ファイルが変更された時の処理
  useEffect(() => {
    if (selectedFile?.filepath) {
      // 録音中のファイルかチェック
      if (selectedFile.isRecording) {
        console.log('AudioPlayer: 録音中のファイルのため読み込みスキップ:', selectedFile.filename)
        audioPlayer.stop()
        return
      }
      
      // 録音直後のファイル（今日作成されたrecording_*ファイル）の場合は少し遅延
      const fileName = selectedFile.filename
      const today = new Date().toISOString().split('T')[0].replace(/-/g, '')
      const isRecentRecording = fileName.startsWith('recording_') && fileName.includes(today)
      
      if (isRecentRecording) {
        console.log('AudioPlayer: 録音直後のファイルのため500ms遅延して読み込み:', fileName)
        setTimeout(() => {
          audioPlayer.loadAudio(selectedFile.filepath, selectedFile.duration).catch((error: any) => {
            console.error('AudioPlayer: 遅延ファイル読み込みエラー:', error)
          })
        }, 500)
      } else {
        audioPlayer.loadAudio(selectedFile.filepath, selectedFile.duration).catch((error: any) => {
          console.error('AudioPlayer: ファイル読み込みエラー:', error)
        })
      }
    } else {
      audioPlayer.stop() 
    }
  }, [selectedFile]) // 依存配列をselectedFileに変更

  // 再生状態をグローバルコンテキストに同期
  useEffect(() => {
    setIsPlaying(audioPlayer.isPlaying)
  }, [audioPlayer.isPlaying, setIsPlaying])
  
  // ファイルが選択されているかチェック（録音中のファイルは除外）
  const hasFile = Boolean(filePath) && !selectedFile?.isRecording
  
  // AudioPlayerレンダリング (デバッグログ削除済み)
  
  return (
    <div className={`audio-player ${className}`}>
      {/* プレイヤーヘッダー */}
      <div className="audio-player__header">
        <div className="audio-player__file-info">
          {selectedFile?.isRecording ? (
            <div className="audio-player__recording-file">
              🔴 録音中のファイル: {fileName || 'Unknown'}
              <div className="audio-player__recording-note">
                録音完了後に再生可能になります
              </div>
            </div>
          ) : hasFile ? (
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
        {audioPlayer.error && (
          <div className="audio-player__error">
            ⚠️ {audioPlayer.error.message}
            {audioPlayer.error.suggestedAction && (
              <div className="audio-player__error-suggestion">
                💡 {audioPlayer.error.suggestedAction}
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* シークバー */}
      <SeekBar
        currentTime={audioPlayer.currentTime}
        duration={selectedFile?.duration ?? 0}
        loading={audioPlayer.isLoading}
        onSeek={audioPlayer.seek}
        className="audio-player__seek-bar"
      />
      
      {/* 再生コントロール */}
      <PlaybackControls
        isPlaying={audioPlayer.isPlaying}
        loading={audioPlayer.isLoading}
        volume={audioPlayer.volume}
        playbackRate={audioPlayer.playbackRate}
        hasFile={hasFile}
        onPlay={audioPlayer.play}
        onPause={audioPlayer.pause}
        onStop={audioPlayer.stop}
        onVolumeChange={audioPlayer.setVolume}
        onPlaybackRateChange={audioPlayer.setPlaybackRate}
      />
    </div>
  )
}

export default AudioPlayer