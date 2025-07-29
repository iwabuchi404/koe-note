/**
 * TranscriptionProgressIndicator - 文字起こし進捗表示コンポーネント
 * 
 * 責務:
 * - 文字起こし進捗の表示
 * - エラー状態の表示
 * - 処理状態の可視化
 */

import React from 'react'

interface TranscriptionProgressIndicatorProps {
  isProcessing: boolean
  progress?: number
  currentStatus?: string
  error?: string
  showChunkDisplay?: boolean
}

const TranscriptionProgressIndicator: React.FC<TranscriptionProgressIndicatorProps> = ({
  isProcessing,
  progress = 0,
  currentStatus,
  error,
  showChunkDisplay = false
}) => {
  if (!isProcessing && !error && !showChunkDisplay) {
    return null
  }

  return (
    <div style={{
      padding: 'var(--spacing-md)',
      backgroundColor: error ? 'rgba(220, 53, 69, 0.1)' : 'rgba(0, 123, 255, 0.1)',
      border: `1px solid ${error ? 'var(--color-error)' : 'var(--color-accent)'}`,
      borderRadius: '4px',
      margin: 'var(--spacing-md)'
    }}>
      {/* エラー表示 */}
      {error && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-sm)',
          color: 'var(--color-error)',
          fontSize: 'var(--font-size-sm)',
          fontWeight: 'bold'
        }}>
          <span>⚠️</span>
          <span>エラー: {error}</span>
        </div>
      )}

      {/* 処理中表示 */}
      {isProcessing && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--spacing-sm)'
        }}>
          {/* ステータステキスト */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-sm)',
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-primary)'
          }}>
            <div style={{
              width: '16px',
              height: '16px',
              border: '2px solid var(--color-accent)',
              borderTop: '2px solid transparent',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
            <span>{currentStatus || '文字起こし処理中...'}</span>
          </div>

          {/* プログレスバー */}
          {progress > 0 && (
            <div style={{
              width: '100%',
              height: '4px',
              backgroundColor: 'var(--color-bg-tertiary)',
              borderRadius: '2px',
              overflow: 'hidden'
            }}>
              <div style={{
                width: `${Math.min(progress, 100)}%`,
                height: '100%',
                backgroundColor: 'var(--color-accent)',
                transition: 'width 0.3s ease',
                borderRadius: '2px'
              }} />
            </div>
          )}

          {/* 進捗パーセンテージ */}
          {progress > 0 && (
            <div style={{
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-secondary)',
              textAlign: 'right'
            }}>
              {Math.round(progress)}%
            </div>
          )}
        </div>
      )}

      {/* チャンク分割表示中 */}
      {showChunkDisplay && !isProcessing && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-sm)',
          fontSize: 'var(--font-size-sm)',
          color: 'var(--color-accent)',
          fontWeight: 'bold'
        }}>
          <span>📋</span>
          <span>チャンク分割文字起こし表示中</span>
        </div>
      )}

      {/* スピンアニメーション用CSS */}
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>
    </div>
  )
}

export default TranscriptionProgressIndicator