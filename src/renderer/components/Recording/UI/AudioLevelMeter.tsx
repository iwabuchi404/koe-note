/**
 * AudioLevelMeter - 音声レベルメーターコンポーネント
 * 
 * 責務:
 * - リアルタイム音声レベルの視覚的表示
 * - 複数入力ソースの音量表示
 * - 音声品質インジケーター
 */

import React, { useEffect, useState } from 'react'

interface AudioLevel {
  level: number // 0-100の音声レベル
  peak: number  // ピークレベル
  rms: number   // RMS値
}

interface AudioLevelMeterProps {
  // マイクレベル
  microphoneLevel?: AudioLevel
  // デスクトップレベル
  desktopLevel?: AudioLevel
  // システム音声レベル
  systemLevel?: AudioLevel
  // 表示設定
  showMicrophone?: boolean
  showDesktop?: boolean
  showSystem?: boolean
  // 状態
  isActive?: boolean
  title?: string
}

const AudioLevelMeter: React.FC<AudioLevelMeterProps> = ({
  microphoneLevel = { level: 0, peak: 0, rms: 0 },
  desktopLevel = { level: 0, peak: 0, rms: 0 },
  systemLevel = { level: 0, peak: 0, rms: 0 },
  showMicrophone = false,
  showDesktop = false,
  showSystem = false,
  isActive = false,
  title = '音声レベル'
}) => {
  const [peakHold, setPeakHold] = useState<{[key: string]: number}>({})

  // ピークホールド機能（ピーク値を一定時間保持）
  useEffect(() => {
    const interval = setInterval(() => {
      setPeakHold(prev => {
        const updated = { ...prev }
        Object.keys(updated).forEach(key => {
          updated[key] = Math.max(0, updated[key] - 2) // ゆっくりピークを下げる
        })
        return updated
      })
    }, 50)

    return () => clearInterval(interval)
  }, [])

  // ピークホールドの更新
  useEffect(() => {
    if (showMicrophone && microphoneLevel.peak > (peakHold.microphone || 0)) {
      setPeakHold(prev => ({ ...prev, microphone: microphoneLevel.peak }))
    }
    if (showDesktop && desktopLevel.peak > (peakHold.desktop || 0)) {
      setPeakHold(prev => ({ ...prev, desktop: desktopLevel.peak }))
    }
    if (showSystem && systemLevel.peak > (peakHold.system || 0)) {
      setPeakHold(prev => ({ ...prev, system: systemLevel.peak }))
    }
  }, [microphoneLevel.peak, desktopLevel.peak, systemLevel.peak, showMicrophone, showDesktop, showSystem, peakHold])

  // レベルメーター描画関数
  const renderMeter = (
    label: string,
    level: AudioLevel,
    peakValue: number,
    color: string,
    icon: string
  ) => {
    const levelPercent = Math.min(100, Math.max(0, level.level))
    const peakPercent = Math.min(100, Math.max(0, peakValue))
    
    // 音量に応じた色分け
    const getLevelColor = (percent: number) => {
      if (percent >= 90) return '#ef4444' // 赤（クリッピング警告）
      if (percent >= 75) return '#f59e0b' // オレンジ（注意）
      if (percent >= 50) return '#10b981' // 緑（良好）
      return '#6b7280' // グレー（低音量）
    }

    return (
      <div key={label} style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--spacing-sm)',
        marginBottom: 'var(--spacing-xs)'
      }}>
        {/* ラベル */}
        <div style={{
          minWidth: '80px',
          fontSize: 'var(--font-size-xs)',
          color: 'var(--color-text-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-xs)'
        }}>
          <span>{icon}</span>
          <span>{label}</span>
        </div>

        {/* メーターバー */}
        <div style={{
          flex: 1,
          height: '16px',
          backgroundColor: 'var(--color-bg-tertiary)',
          borderRadius: '8px',
          position: 'relative',
          overflow: 'hidden',
          border: '1px solid var(--color-border)'
        }}>
          {/* レベルバー */}
          <div style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            width: `${levelPercent}%`,
            backgroundColor: getLevelColor(levelPercent),
            transition: 'width 0.1s ease-out',
            borderRadius: '7px'
          }} />

          {/* ピークインジケーター */}
          <div style={{
            position: 'absolute',
            left: `${peakPercent}%`,
            top: '2px',
            width: '2px',
            height: 'calc(100% - 4px)',
            backgroundColor: '#ffffff',
            boxShadow: '0 0 2px rgba(0,0,0,0.5)',
            transition: 'left 0.1s ease-out'
          }} />

          {/* クリッピング警告線 */}
          <div style={{
            position: 'absolute',
            left: '90%',
            top: 0,
            width: '1px',
            height: '100%',
            backgroundColor: '#ef4444',
            opacity: 0.5
          }} />
        </div>

        {/* 数値表示 */}
        <div style={{
          minWidth: '45px',
          fontSize: 'var(--font-size-xs)',
          color: levelPercent >= 90 ? '#ef4444' : 'var(--color-text-secondary)',
          textAlign: 'right',
          fontFamily: 'var(--font-family-mono)',
          fontWeight: levelPercent >= 90 ? 'bold' : 'normal'
        }}>
          {levelPercent.toFixed(0)}%
        </div>
      </div>
    )
  }

  // 表示する項目がない場合は非表示
  if (!showMicrophone && !showDesktop && !showSystem) {
    return null
  }

  return (
    <div style={{
      padding: 'var(--spacing-md)',
      backgroundColor: 'var(--color-bg-secondary)',
      borderRadius: '8px',
      border: '1px solid var(--color-border)',
      opacity: isActive ? 1 : 0.7,
      transition: 'opacity 0.3s ease'
    }}>
      {/* ヘッダー */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 'var(--spacing-sm)'
      }}>
        <h4 style={{
          fontSize: 'var(--font-size-sm)',
          fontWeight: 'bold',
          color: 'var(--color-text-primary)',
          margin: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-xs)'
        }}>
          <span>🎚️</span>
          {title}
        </h4>
        
        {/* アクティブ状態インジケーター */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-xs)',
          fontSize: 'var(--font-size-xs)',
          color: isActive ? 'var(--color-success)' : 'var(--color-text-secondary)'
        }}>
          <div style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: isActive ? 'var(--color-success)' : 'var(--color-text-secondary)',
            animation: isActive ? 'pulse 2s infinite' : 'none'
          }} />
          {isActive ? '監視中' : '停止中'}
        </div>
      </div>

      {/* メーター表示 */}
      <div style={{ minHeight: '50px' }}>
        {showMicrophone && renderMeter(
          'マイク',
          microphoneLevel,
          peakHold.microphone || 0,
          '#10b981',
          '🎤'
        )}
        
        {showDesktop && renderMeter(
          'デスクトップ',
          desktopLevel,
          peakHold.desktop || 0,
          '#3b82f6',
          '🖥️'
        )}
        
        {showSystem && renderMeter(
          'システム',
          systemLevel,
          peakHold.system || 0,
          '#8b5cf6',
          '🔊'
        )}
      </div>

      {/* 音量レベルガイド */}
      <div style={{
        marginTop: 'var(--spacing-sm)',
        padding: 'var(--spacing-xs)',
        backgroundColor: 'var(--color-bg-tertiary)',
        borderRadius: '4px',
        fontSize: 'var(--font-size-xs)',
        color: 'var(--color-text-tertiary)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span>💡 適正音量: 50-75%</span>
        <span style={{ color: '#ef4444' }}>90%以上: クリッピング注意</span>
      </div>

      {/* アニメーション定義 */}
      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}
      </style>
    </div>
  )
}

export default AudioLevelMeter