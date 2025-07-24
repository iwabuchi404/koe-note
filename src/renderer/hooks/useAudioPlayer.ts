import { useState, useRef, useCallback, useEffect } from 'react'

// 型安全な音声再生状態をインポート
import { AudioFileInfo } from '../state/ApplicationState'

// 音声再生ステータス（型安全）
export type AudioPlayerStatus = 
  | 'idle'       // 待機中
  | 'loading'    // 読み込み中
  | 'ready'      // 再生準備完了
  | 'playing'    // 再生中
  | 'paused'     // 一時停止中
  | 'ended'      // 再生終了
  | 'error'      // エラー状態

// 音声プレイヤーエラー情報（型安全）
export interface AudioPlayerError {
  type: 'load_error' | 'play_error' | 'seek_error' | 'format_error' | 'network_error' | 'unknown_error'
  message: string
  details?: any
  timestamp: Date
  recoverable: boolean
  suggestedAction?: string
}

// 音声プレイヤーの状態管理（型安全化）
export interface AudioPlayerState {
  status: AudioPlayerStatus
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  playbackRate: number
  loading: boolean
  error: AudioPlayerError | null
  
  // 追加情報
  currentFile: AudioFileInfo | null
  buffered: number           // バッファリング進捗（0-1）
  networkState: number       // HTMLMediaElement.networkState
  readyState: number         // HTMLMediaElement.readyState
  
  // メタデータ
  lastUpdate: Date
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
  
  // 型安全な初期状態を作成
  const createInitialState = (): AudioPlayerState => ({
    status: 'idle',
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 0.8,
    playbackRate: 1.0,
    loading: false,
    error: null,
    currentFile: null,
    buffered: 0,
    networkState: 0,
    readyState: 0,
    lastUpdate: new Date()
  })

  const [state, setState] = useState<AudioPlayerState>(createInitialState())
  
  // 型安全なエラー作成ヘルパー
  const createAudioError = (
    type: AudioPlayerError['type'],
    message: string,
    details?: any,
    recoverable: boolean = true,
    suggestedAction?: string
  ): AudioPlayerError => ({
    type,
    message,
    details,
    timestamp: new Date(),
    recoverable,
    suggestedAction
  })

  // 音声要素を初期化
  useEffect(() => {
    const audio = new Audio()
    audioRef.current = audio
    
    // イベントリスナー設定（型安全化）
    const handleLoadStart = () => {
      setState(prev => ({ 
        ...prev, 
        status: 'loading',
        loading: true, 
        error: null,
        lastUpdate: new Date()
      }))
    }
    
    const handleLoadedMetadata = () => {
      const audioDuration = audio.duration

      setState(prev => {
        // 既にメタデータから有効なdurationがセットされている場合は、それを上書きしない
        if (prev.duration > 0) {
          return { 
            ...prev, 
            status: 'ready',
            loading: false,
            networkState: audio.networkState,
            readyState: audio.readyState,
            lastUpdate: new Date()
          }
        }

        // メタデータからのdurationがない場合、イベントから取得した値をフォールバックとして使用
        if (isFinite(audioDuration) && audioDuration > 0) {
          return { 
            ...prev, 
            status: 'ready',
            duration: audioDuration, 
            loading: false,
            networkState: audio.networkState,
            readyState: audio.readyState,
            lastUpdate: new Date()
          }
        }

        // どちらも無効な場合は、ローディングを解除するだけ
        return { 
          ...prev, 
          status: 'ready',
          loading: false,
          networkState: audio.networkState,
          readyState: audio.readyState,
          lastUpdate: new Date()
        }
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
      
      // loadedmetadataでInfinityだった場合、ここで再度チェック（型安全化）
      if (isFinite(audio.duration) && audio.duration > 0) {
        setState(prev => {
          if (prev.duration === 0) {
            console.log('Updating duration from canplaythrough:', audio.duration)
            return { 
              ...prev, 
              duration: audio.duration,
              networkState: audio.networkState,
              readyState: audio.readyState,
              lastUpdate: new Date()
            }
          }
          return { 
            ...prev,
            networkState: audio.networkState,
            readyState: audio.readyState,
            lastUpdate: new Date()
          }
        })
      }
    }
    
    
    const handleTimeUpdate = () => {
      const newCurrentTime = audio.currentTime
      const bufferedRanges = audio.buffered
      let bufferedProgress = 0
      
      // バッファリング進捗を計算
      if (bufferedRanges.length > 0 && audio.duration > 0) {
        const bufferedEnd = bufferedRanges.end(bufferedRanges.length - 1)
        bufferedProgress = Math.min(1, bufferedEnd / audio.duration)
      }
      
      setState(prev => ({ 
        ...prev, 
        currentTime: newCurrentTime,
        buffered: bufferedProgress,
        networkState: audio.networkState,
        readyState: audio.readyState,
        lastUpdate: new Date()
      }))
      
    }
    
    const handlePlay = () => {
      setState(prev => ({ 
        ...prev, 
        status: 'playing',
        isPlaying: true,
        lastUpdate: new Date()
      }))
    }
    
    const handlePause = () => {
      setState(prev => ({ 
        ...prev, 
        status: 'paused',
        isPlaying: false,
        lastUpdate: new Date()
      }))
    }
    
    const handleEnded = () => {
      // 終了時に、現在の時間を正確なdurationとして記録
      const actualDuration = audio.currentTime
      console.log('Audio ended, actual duration:', actualDuration)
      
      setState(prev => ({ 
        ...prev, 
        status: 'ended',
        isPlaying: false, 
        currentTime: 0,
        // durationが0の場合、実際の長さで更新
        duration: prev.duration === 0 ? actualDuration : prev.duration,
        lastUpdate: new Date()
      }))
    }
    
    const handleError = (event: Event) => {
      const audioError = (event.target as HTMLAudioElement)?.error
      let errorType: AudioPlayerError['type'] = 'unknown_error'
      let errorMessage = '音声ファイルの読み込みに失敗しました'
      let suggestedAction = 'ファイルの形式を確認するか、別のファイルをお試しください'
      
      // MediaErrorの詳細を分析
      if (audioError) {
        switch (audioError.code) {
          case MediaError.MEDIA_ERR_ABORTED:
            errorType = 'load_error'
            errorMessage = '音声の読み込みが中断されました'
            break
          case MediaError.MEDIA_ERR_NETWORK:
            errorType = 'network_error'
            errorMessage = 'ネットワークエラーが発生しました'
            suggestedAction = 'インターネット接続を確認してください'
            break
          case MediaError.MEDIA_ERR_DECODE:
            errorType = 'format_error'
            errorMessage = '音声ファイルの形式がサポートされていません'
            suggestedAction = 'サポートされている形式（MP3、WAV、WebM）のファイルをお使いください'
            break
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
            errorType = 'format_error'
            errorMessage = '音声ファイルの形式または内容がサポートされていません'
            break
        }
      }
      
      const playerError = createAudioError(
        errorType,
        errorMessage,
        audioError,
        true,
        suggestedAction
      )
      
      setState(prev => ({ 
        ...prev, 
        status: 'error',
        loading: false,
        isPlaying: false,
        error: playerError,
        lastUpdate: new Date()
      }))
    }
    
    const handleVolumeChange = () => {
      setState(prev => ({ 
        ...prev, 
        volume: audio.volume,
        lastUpdate: new Date()
      }))
    }
    
    const handleRateChange = () => {
      setState(prev => ({ 
        ...prev, 
        playbackRate: audio.playbackRate,
        lastUpdate: new Date()
      }))
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
        
        const playError = createAudioError(
          'play_error',
          '音声の再生に失敗しました',
          error,
          true,
          '音声ファイルを再読み込みするか、別のファイルをお試しください'
        )
        
        setState(prev => ({ 
          ...prev, 
          status: 'error',
          error: playError,
          isPlaying: false,
          lastUpdate: new Date()
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
        
        const seekError = createAudioError(
          'seek_error',
          'シーク操作に失敗しました',
          error,
          true,
          '音声が完全に読み込まれてからシークしてください'
        )
        
        setState(prev => ({
          ...prev,
          error: seekError,
          lastUpdate: new Date()
        }))
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
    
    audioRef.current.pause()
    
    // ファイル情報を作成（型安全）
    const fileInfo: AudioFileInfo = {
      id: `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      fileName: filePath.split(/[\\/]/).pop() || 'unknown.audio',
      filePath: filePath,
      size: 0, // 実際のサイズは取得できないためデフォルト
      duration: (metadataDuration && isFinite(metadataDuration)) ? metadataDuration : 0,
      format: filePath.split('.').pop()?.toLowerCase() || 'unknown',
      createdAt: new Date(),
      modifiedAt: new Date(),
      isRecording: false,
      isSelected: true,
      isPlaying: false
    }
    
    // 状態をリセットし、メタデータから渡されたdurationを即座にセットする（型安全化）
    setState(prev => ({
      ...prev,
      status: 'loading',
      currentTime: 0,
      duration: fileInfo.duration,
      isPlaying: false,
      error: null,
      loading: true,
      currentFile: fileInfo,
      buffered: 0,
      networkState: 0,
      readyState: 0,
      lastUpdate: new Date()
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
      
      const loadError = createAudioError(
        'load_error',
        'オーディオファイルの読み込みに失敗しました',
        error,
        true,
        'ファイルパスを確認するか、別のファイルを選択してください'
      )
      
      setState(prev => ({ 
        ...prev, 
        status: 'error',
        loading: false,
        error: loadError,
        lastUpdate: new Date()
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