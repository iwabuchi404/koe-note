/**
 * TimestampDisplay - タイムスタンプ表示コンポーネント
 * 
 * 責務:
 * - 継続時間の表示
 * - 時間フォーマットの統一
 */

import React from 'react'

interface TimestampDisplayProps {
  duration?: number
}

const TimestampDisplay: React.FC<TimestampDisplayProps> = ({ duration }) => {
  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`
  }

  if (!duration) {
    return <span>継続時間: 不明</span>
  }

  return (
    <span>
      継続時間: {formatDuration(duration)}
    </span>
  )
}

export default TimestampDisplay