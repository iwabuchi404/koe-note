/**
 * RecordingStatus - 録音状態表示コンポーネント
 * 
 * 責務:
 * - 録音時間の表示
 * - 録音状態インジケーター
 * - ファイル情報の表示
 * - エラー状態の表示
 */

import React, { useEffect, useState } from 'react'

interface RecordingStatusProps {
  // 録音状態
  isRecording: boolean
  isPaused: boolean
  isStopping: boolean
  hasError: boolean
  
  // 録音時間（秒）
  currentRecordingTime: number
  
  // ファイル情報
  recordingFileName?: string
  outputPath?: string
  
  // エラー情報
  errorMessage?: string
  
  // 設定情報
  enableRealtimeTranscription?: boolean
  selectedInputType?: string
}

const RecordingStatus: React.FC<RecordingStatusProps> = ({
  isRecording,
  isPaused,
  isStopping,
  hasError,
  currentRecordingTime,
  recordingFileName,
  outputPath,
  errorMessage,
  enableRealtimeTranscription = false,
  selectedInputType = 'microphone'
}) => {
  // 時間フォーマット関数
  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // 録音状態の表示テキストと色
  const getStatusInfo = () => {
    if (hasError) {
      return { text: 'エラー', color: '#ef4444', icon: '❌' }
    }
    if (isStopping) {
      return { text: '停止処理中', color: '#f59e0b', icon: '⏹️' }
    }
    if (isPaused) {
      return { text: '一時停止中', color: '#f59e0b', icon: '⏸️' }
    }
    if (isRecording) {
      return { text: '録音中', color: '#ef4444', icon: '⏺️' }
    }
    return { text: '待機中', color: '#6b7280', icon: '⭕' }
  }

  const statusInfo = getStatusInfo()

  return (
    <div style={{
      padding: 'var(--spacing-md)',
      backgroundColor: 'var(--color-bg-secondary)',
      borderRadius: '8px',
      border: '1px solid var(--color-border)'
    }}>
      {/* メイン状態表示 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 'var(--spacing-md)'
      }}>
        {/* 状態インジケーター */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-sm)'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-xs)'
          }}>
            <span style={{ fontSize: '16px' }}>{statusInfo.icon}</span>
            <span style={{
              fontSize: 'var(--font-size-md)',
              fontWeight: 'bold',
              color: statusInfo.color
            }}>
              {statusInfo.text}
            </span>
          </div>

          {/* 録音中の点滅アニメーション */}
          {isRecording && !isPaused && (
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: '#ef4444',
              animation: 'blink 1s infinite'
            }} />
          )}
        </div>

        {/* 録音時間表示 */}
        <div style={{
          fontSize: 'var(--font-size-lg)',
          fontFamily: 'var(--font-family-mono)',
          fontWeight: 'bold',
          color: isRecording ? '#ef4444' : 'var(--color-text-primary)',
          padding: '4px 8px',
          backgroundColor: 'var(--color-bg-tertiary)',
          borderRadius: '4px',
          minWidth: '80px',
          textAlign: 'center'
        }}>
          {formatTime(currentRecordingTime)}
        </div>
      </div>

      {/* 詳細情報 */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-xs)',
        fontSize: 'var(--font-size-sm)',
        color: 'var(--color-text-secondary)'
      }}>
        {/* ファイル名 */}
        {recordingFileName && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-xs)'
          }}>
            <span style={{ fontSize: '14px' }}>📁</span>
            <span>ファイル名:</span>
            <span style={{
              fontFamily: 'var(--font-family-mono)',
              color: 'var(--color-text-primary)',
              fontSize: 'var(--font-size-xs)'
            }}>
              {recordingFileName}
            </span>
          </div>
        )}

        {/* 入力タイプ */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-xs)'
        }}>
          <span style={{ fontSize: '14px' }}>🎚️</span>
          <span>入力:</span>
          <span style={{ color: 'var(--color-text-primary)' }}>
            {selectedInputType === 'microphone' && 'マイクロフォン'}
            {selectedInputType === 'desktop' && 'デスクトップ音声'}
            {selectedInputType === 'stereo-mix' && 'ステレオミックス'}
            {selectedInputType === 'mixing' && 'ミキシング'}
          </span>
        </div>

        {/* リアルタイム文字起こし状態 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-xs)'
        }}>
          <span style={{ fontSize: '14px' }}>📝</span>
          <span>リアルタイム文字起こし:</span>
          <span style={{
            color: enableRealtimeTranscription ? 'var(--color-success)' : 'var(--color-text-tertiary)',
            fontWeight: enableRealtimeTranscription ? 'bold' : 'normal'
          }}>
            {enableRealtimeTranscription ? '有効' : '無効'}
          </span>
        </div>

        {/* 出力パス */}
        {outputPath && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-xs)',
            marginTop: 'var(--spacing-xs)'
          }}>
            <span style={{ fontSize: '14px' }}>💾</span>
            <span>保存先:</span>
            <span style={{
              fontFamily: 'var(--font-family-mono)',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-tertiary)',
              wordBreak: 'break-all'
            }}>
              {outputPath}
            </span>
          </div>
        )}
      </div>

      {/* エラーメッセージ */}
      {hasError && errorMessage && (
        <div style={{
          marginTop: 'var(--spacing-md)',
          padding: 'var(--spacing-sm)',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid #ef4444',
          borderRadius: '4px',
          color: '#ef4444',
          fontSize: 'var(--font-size-sm)'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-xs)',
            marginBottom: 'var(--spacing-xs)'
          }}>
            <span>⚠️</span>
            <span style={{ fontWeight: 'bold' }}>エラーが発生しました</span>
          </div>
          <div style={{
            fontSize: 'var(--font-size-xs)',
            opacity: 0.9
          }}>
            {errorMessage}
          </div>
        </div>
      )}

      {/* 録音中の注意事項 */}
      {isRecording && (
        <div style={{
          marginTop: 'var(--spacing-md)',
          padding: 'var(--spacing-sm)',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid #10b981',
          borderRadius: '4px',
          fontSize: 'var(--font-size-xs)',
          color: '#059669'
        }}>
          💡 録音中です。ブラウザタブを閉じたり、PCをスリープしないでください。
        </div>
      )}

      {/* アニメーション定義 */}
      <style>
        {`
          @keyframes blink {
            0%, 50% { opacity: 1; }
            51%, 100% { opacity: 0; }
          }
        `}
      </style>
    </div>
  )
}

export default RecordingStatus