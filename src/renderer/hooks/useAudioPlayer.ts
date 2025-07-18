import { useState, useRef, useCallback, useEffect } from 'react'

// 音声プレイヤーの状態管理
export interface AudioPlayerState {
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  playbackRate: number
  loading: boolean
  error: string | null
}

// 音声プレイヤーコントロール
export interface AudioPlayerControls {
  play: () => void
  pause: () => void
  stop: () => void
  seek: (time: number) => void
  setVolume: (volume: number) => void
  setPlaybackRate: (rate: number) => void
  loadFile: (filePath: string, metadataDuration?: number) => Promise<void>
}

/**
 * 音声再生機能を提供するカスタムフック
 * HTMLAudioElementを使用した音声再生制御
 */
export const useAudioPlayer = (): [AudioPlayerState, AudioPlayerControls] => {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const currentFilePathRef = useRef<string | null>(null)
  
  // 再生状態
  const [state, setState] = useState<AudioPlayerState>({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 0.8,
    playbackRate: 1.0,
    loading: false,
    error: null
  })
  
  // 音声要素を初期化
  useEffect(() => {
    const audio = new Audio()
    audioRef.current = audio
    
    // イベントリスナー設定
    const handleLoadStart = () => {
      setState(prev => ({ ...prev, loading: true, error: null }))
    }
    
      const handleLoadedMetadata = () => {
      const audioDuration = audio.duration
      console.log('useAudioPlayer: loadedmetadata event, duration:', audioDuration);

      setState(prev => {
        // 既にメタデータから有効なdurationがセットされている場合は、それを上書きしない
        if (prev.duration > 0) {
          return { ...prev, loading: false }
        }

        // メタデータからのdurationがない場合、イベントから取得した値をフォールバックとして使用
        if (isFinite(audioDuration) && audioDuration > 0) {
          console.log('Fallback: Setting duration from loadedmetadata event:', audioDuration)
          return { ...prev, duration: audioDuration, loading: false }
        }

        // どちらも無効な場合は、ローディングを解除するだけ
        return { ...prev, loading: false }
      })
    }
    
    const handleCanPlay = () => {
      console.log('useAudioPlayer: canplay event', {
        audioDuration: audio.duration,
        isFiniteAudioDuration: isFinite(audio.duration),
        readyState: audio.readyState,
        networkState: audio.networkState
      })
    }
    
    const handleCanPlayThrough = () => {
      console.log('useAudioPlayer: canplaythrough event', {
        audioDuration: audio.duration,
        isFiniteAudioDuration: isFinite(audio.duration),
        readyState: audio.readyState,
        networkState: audio.networkState
      })
      
      // loadedmetadataでInfinityだった場合、ここで再度チェック
      if (isFinite(audio.duration) && audio.duration > 0) {
        setState(prev => {
          if (prev.duration === 0) {
            console.log('Updating duration from canplaythrough:', audio.duration)
            return { ...prev, duration: audio.duration }
          }
          return prev
        })
      }
    }
    
    
    const handleTimeUpdate = () => {
      const newCurrentTime = audio.currentTime
      setState(prev => ({ ...prev, currentTime: newCurrentTime }))
      
      // デバッグ用（頻繁すぎるので条件付き）
      if (Math.floor(newCurrentTime) % 5 === 0) {
        console.log('useAudioPlayer: time update', newCurrentTime)
      }
    }
    
    const handlePlay = () => {
      setState(prev => ({ ...prev, isPlaying: true }))
    }
    
    const handlePause = () => {
      setState(prev => ({ ...prev, isPlaying: false }))
    }
    
    const handleEnded = () => {
      // 終了時に、現在の時間を正確なdurationとして記録
      const actualDuration = audio.currentTime
      console.log('Audio ended, actual duration:', actualDuration)
      
      setState(prev => ({ 
        ...prev, 
        isPlaying: false, 
        currentTime: 0,
        // durationが0の場合、実際の長さで更新
        duration: prev.duration === 0 ? actualDuration : prev.duration
      }))
    }
    
    const handleError = () => {
      setState(prev => ({ 
        ...prev, 
        loading: false,
        isPlaying: false,
        error: '音声ファイルの読み込みに失敗しました'
      }))
    }
    
    const handleVolumeChange = () => {
      setState(prev => ({ ...prev, volume: audio.volume }))
    }
    
    const handleRateChange = () => {
      setState(prev => ({ ...prev, playbackRate: audio.playbackRate }))
    }
    
    // イベントリスナー登録
    audio.addEventListener('loadstart', handleLoadStart)
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('canplay', handleCanPlay)
    audio.addEventListener('canplaythrough', handleCanPlayThrough)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)
    audio.addEventListener('volumechange', handleVolumeChange)
    audio.addEventListener('ratechange', handleRateChange)
    
    // 初期設定
    audio.volume = state.volume
    audio.playbackRate = state.playbackRate
    
    // クリーンアップ
    return () => {
      audio.removeEventListener('loadstart', handleLoadStart)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('canplay', handleCanPlay)
      audio.removeEventListener('canplaythrough', handleCanPlayThrough)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleError)
      audio.removeEventListener('volumechange', handleVolumeChange)
      audio.removeEventListener('ratechange', handleRateChange)
      
      audio.pause()
      audio.src = ''
    }
  }, [])
  
  // 再生コントロール関数
  const play = useCallback(() => {
    if (audioRef.current && !state.loading) {
      console.log('Playing audio with src:', audioRef.current.src.substring(0, 100) + '...')
      audioRef.current.play().catch(error => {
        console.error('音声再生エラー詳細:', {
          error,
          errorName: error.name,
          errorMessage: error.message,
          audioSrc: audioRef.current?.src.substring(0, 100) + '...',
          audioReadyState: audioRef.current?.readyState,
          audioNetworkState: audioRef.current?.networkState,
          audioDuration: audioRef.current?.duration
        })
        setState(prev => ({ 
          ...prev, 
          error: '音声の再生に失敗しました',
          isPlaying: false 
        }))
      })
    }
  }, [state.loading])
  
  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
    }
  }, [])
  
  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
  }, [])
  
  const seek = useCallback((time: number) => {
    if (audioRef.current && state.duration > 0 && isFinite(state.duration)) {
      // 入力値の厳密なバリデーション
      if (!isFinite(time) || isNaN(time)) {
        console.warn('useAudioPlayer: Invalid seek time - not finite or NaN', time)
        return
      }
      
      const clampedTime = Math.max(0, Math.min(time, state.duration))
      
      // クランプ後も再度チェック
      if (!isFinite(clampedTime) || isNaN(clampedTime)) {
        console.warn('useAudioPlayer: Invalid clamped time', {
          originalTime: time,
          clampedTime,
          duration: state.duration
        })
        return
      }
      
      console.log('useAudioPlayer: Seeking to', clampedTime)
      
      try {
        audioRef.current.currentTime = clampedTime
      } catch (error) {
        console.error('useAudioPlayer: Seek error', error)
      }
    } else {
      console.warn('useAudioPlayer: Cannot seek', {
        hasAudio: !!audioRef.current,
        duration: state.duration,
        isFiniteDuration: isFinite(state.duration)
      })
    }
  }, [state.duration])
  
  const setVolume = useCallback((volume: number) => {
    if (audioRef.current) {
      const clampedVolume = Math.max(0, Math.min(1, volume))
      audioRef.current.volume = clampedVolume
    }
  }, [])
  
  const setPlaybackRate = useCallback((rate: number) => {
    if (audioRef.current) {
      const clampedRate = Math.max(0.25, Math.min(4, rate))
      audioRef.current.playbackRate = clampedRate
    }
  }, [])
  
  const loadFile = useCallback(async (filePath: string, metadataDuration?: number) => {
    if (!audioRef.current) return
    if (currentFilePathRef.current === filePath) {
      console.log('Audio File Already Loaded:', filePath)
      return
    }
    
    console.log('Audio File Loading:', { filePath, metadataDuration })
    
    // 録音中のファイルかチェック（ファイル名とタイムスタンプで判定）
    const fileName = filePath.split('\\').pop() || filePath.split('/').pop() || '';
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    
    if (fileName.startsWith('recording_') && fileName.includes(today)) {
      console.warn('録音中のファイルのため、読み込みをスキップ:', fileName);
      setState(prev => ({
        ...prev,
        currentTime: 0,
        duration: metadataDuration && isFinite(metadataDuration) ? metadataDuration : 0,
        isPlaying: false,
        error: '録音中のファイルは再生できません',
        loading: false
      }));
      return;
    }
    
    audioRef.current.pause()
    
    // 状態をリセットし、メタデータから渡されたdurationを即座にセットする
    setState(prev => ({
      ...prev,
      currentTime: 0,
      duration: (metadataDuration && isFinite(metadataDuration)) ? metadataDuration : 0,
      isPlaying: false,
      error: null,
      loading: true
    }))
    
    try {
      const dataUrl = await window.electronAPI.loadAudioFile(filePath)
      
      if (dataUrl) {
        audioRef.current.src = dataUrl
        audioRef.current.load() // load()を呼び出してイベントを発火させる
        currentFilePathRef.current = filePath
        console.log('Audio source set. Waiting for events...')
      } else {
        throw new Error('Main process returned an empty data URL.')
      }
    } catch (error) {
      console.error('Audio File Loading Error:', error)
      setState(prev => ({ 
        ...prev, 
        loading: false,
        error: 'オーディオファイルの読み込みに失敗しました。'
      }))
    }
  }, [])
  
  const controls: AudioPlayerControls = {
    play,
    pause,
    stop,
    seek,
    setVolume,
    setPlaybackRate,
    loadFile
  }
  
  return [state, controls]
}

// 時間をフォーマットする関数
export const formatTime = (seconds: number): string => {
  if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return '0:00'
  
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  
  // 念のため再度チェック
  if (!isFinite(mins) || !isFinite(secs) || mins < 0 || secs < 0) return '0:00'
  
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// 再生速度オプション
export const PLAYBACK_RATES = [
  { value: 0.5, label: '0.5x' },
  { value: 0.75, label: '0.75x' },
  { value: 1.0, label: '1x' },
  { value: 1.25, label: '1.25x' },
  { value: 1.5, label: '1.5x' },
  { value: 2.0, label: '2x' }
]