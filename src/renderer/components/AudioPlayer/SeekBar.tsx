import React, { useCallback, useRef, useState, useEffect } from 'react'
import { formatTime } from '../../hooks/useAudioPlayer'

interface SeekBarProps {
  currentTime: number
  duration: number
  onSeek: (time: number) => void
  loading?: boolean
  className?: string
}

/**
 * 音声再生のシークバーコンポーネント
 * ドラッグ操作で再生位置を変更可能
 */
const SeekBar: React.FC<SeekBarProps> = ({
  currentTime,
  duration,
  onSeek,
  loading = false,
  className = ''
}) => {
  const [isDragging, setIsDragging] = useState(false)
  const [dragPosition, setDragPosition] = useState(0)
  const seekBarRef = useRef<HTMLDivElement>(null)
  const mouseMoveHandlerRef = useRef<((e: MouseEvent) => void) | null>(null)
  const mouseUpHandlerRef = useRef<((e: MouseEvent) => void) | null>(null)
  
  // 進捗率を計算（0-100%） - 安全な計算
  const progress = (duration > 0 && isFinite(duration))
    ? Math.min(100, (currentTime / duration) * 100)
    : 0

  // 表示用進捗率 - ドラッグ中でも有効な値のみ使用
  const displayProgress = isDragging ? dragPosition : progress
 
  // 時間表示（ドラッグ中は予想時間を表示）
  const displayTime = isDragging 
    ? (dragPosition / 100) * (duration || 0)
    : currentTime
    
  // SeekBarレンダリング (デバッグログ削除済み)
  
  // マウス位置から進捗率を計算
  const getProgressFromEvent = useCallback((event: MouseEvent | React.MouseEvent) => {
    if (!seekBarRef.current) return 0
    
    const rect = seekBarRef.current.getBoundingClientRect()
    const x = event.clientX - rect.left
    const progress = Math.max(0, Math.min(100, (x / rect.width) * 100))
    return progress
  }, [])
  
  // 既存のイベントリスナーをクリーンアップ
  const cleanupEventListeners = useCallback(() => {
    if (mouseMoveHandlerRef.current) {
      document.removeEventListener('mousemove', mouseMoveHandlerRef.current, true)
      mouseMoveHandlerRef.current = null
    }
    if (mouseUpHandlerRef.current) {
      document.removeEventListener('mouseup', mouseUpHandlerRef.current, true)
      mouseUpHandlerRef.current = null
    }
  }, [])

  // マウスダウン: ドラッグ開始
  const handleMouseDown = useCallback((event: React.MouseEvent) => {
    if (loading || duration <= 0) return
    
    event.preventDefault()
    event.stopPropagation()
    
    // 既存のイベントリスナーをクリーンアップ
    cleanupEventListeners()
    
    const progress = getProgressFromEvent(event)
    console.log('SeekBar: Drag Start at progress:', progress)
    
    setIsDragging(true)
    setDragPosition(progress)
    
    // マウスムーブハンドラー
    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault()
      
      if (seekBarRef.current) {
        const progress = getProgressFromEvent(e)
        setDragPosition(progress)
      }
    }
    
    // マウスアップハンドラー
    const handleMouseUp = (e: MouseEvent) => {
      e.preventDefault()
      
      console.log('SeekBar: Drag End')
      
      if (seekBarRef.current && duration > 0 && isFinite(duration)) {
        const finalProgress = getProgressFromEvent(e)
        const seekTime = (finalProgress / 100) * duration
        
        // 数値バリデーション
        if (isFinite(seekTime) && seekTime >= 0 && seekTime <= duration) {
          console.log('SeekBar: Seek Execute', seekTime)
          onSeek(seekTime)
        } else {
          console.warn('SeekBar: Invalid seek time', {
            seekTime,
            duration,
            finalProgress,
            isFiniteDuration: isFinite(duration),
            isFiniteSeekTime: isFinite(seekTime)
          })
        }
      } else {
        console.warn('SeekBar: Cannot seek - invalid duration', JSON.stringify({
          duration,
          isFiniteDuration: isFinite(duration),
          hasSeekBarRef: !!seekBarRef.current
        }, null, 2))
      }
      
      // ドラッグ状態を少し遅延してリセット（シーク完了を待つ）
      setTimeout(() => {
        setIsDragging(false)
        setDragPosition(0)
      }, 100)
      
      // イベントリスナーを削除
      cleanupEventListeners()
      
      console.log('SeekBar: Event Listeners Cleaned')
    }
    
    // refに保存
    mouseMoveHandlerRef.current = handleMouseMove
    mouseUpHandlerRef.current = handleMouseUp
    
    console.log('SeekBar: ドラッグ開始')
    
    // イベントリスナーを追加
    document.addEventListener('mousemove', handleMouseMove, true)
    document.addEventListener('mouseup', handleMouseUp, true)
  }, [loading, duration, getProgressFromEvent, onSeek, cleanupEventListeners])
  
  // クリック: 直接シーク
  const handleClick = useCallback((event: React.MouseEvent) => {
    if (loading || duration <= 0 || isDragging || !isFinite(duration)) return
    
    const progress = getProgressFromEvent(event)
    const seekTime = (progress / 100) * duration
    
    // 数値バリデーション
    if (isFinite(seekTime) && seekTime >= 0 && seekTime <= duration) {
      console.log('SeekBar: Click Seek Execute', seekTime)
      onSeek(seekTime)
    } else {
      console.warn('SeekBar: Invalid click seek time', {
        seekTime,
        duration,
        progress,
        isFiniteDuration: isFinite(duration),
        isFiniteSeekTime: isFinite(seekTime)
      })
    }
  }, [loading, duration, isDragging, getProgressFromEvent, onSeek])
  
  // コンポーネントアンマウント時のクリーンアップ
  useEffect(() => {
    return () => {
      console.log('SeekBar: コンポーネントアンマウント - イベントリスナーをクリーンアップ')
      cleanupEventListeners()
    }
  }, [cleanupEventListeners])
  
  return (
    <div className={`seek-bar ${className}`}>
      {/* 時間表示 */}
      <div className="seek-bar__time-display">
        <span className="seek-bar__current-time">
          {formatTime(displayTime)}
        </span>
        <span className="seek-bar__duration">
          {formatTime(duration)}
        </span>
      </div>
      
      {/* シークバー本体 */}
      <div 
        className={`seek-bar__track ${loading ? 'seek-bar__track--loading' : ''}`}
        ref={seekBarRef}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        style={{ cursor: loading || duration <= 0 ? 'default' : 'pointer' }}
      >
        {/* 背景バー */}
        <div className="seek-bar__background" />
        
        {/* 進捗バー */}
        <div 
          className={`seek-bar__progress ${isDragging ? 'seek-bar__progress--dragging' : ''}`}
          style={{ width: `${displayProgress}%` }}
        />
        
        {/* ドラッグハンドル */}
        {duration > 0 && (
          <div 
            className={`seek-bar__handle ${isDragging ? 'seek-bar__handle--dragging' : ''}`}
            style={{ left: `${displayProgress}%` }}
          />
        )}
        
        {/* ローディング表示 */}
        {loading && (
          <div className="seek-bar__loading">
            読み込み中...
          </div>
        )}
      </div>
    </div>
  )
}

export default SeekBar