/**
 * TranscriptionProgressPanel - 文字起こし進捗表示パネル
 * 
 * 責務:
 * - 文字起こし進捗の視覚化
 * - エラー状態の表示
 * - 統計情報の表示
 */

import React from 'react'
import { ChunkProgress } from '../../../../preload/preload'

interface TranscriptionProgressPanelProps {
  progress: ChunkProgress
  transcriptionProgress: string
  error: string
  isTranscribing: boolean
}

const TranscriptionProgressPanel: React.FC<TranscriptionProgressPanelProps> = ({
  progress,
  transcriptionProgress,
  error,
  isTranscribing
}) => {
  // 進捗率の計算
  const progressPercentage = progress.totalChunks > 0 
    ? Math.round((progress.processedChunks / progress.totalChunks) * 100)
    : 0

  // 残り時間のフォーマット
  const formatRemainingTime = (seconds: number): string => {
    if (seconds <= 0) return '--'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // エラー表示がある場合
  if (error) {
    return (
      <div style={{
        padding: 'var(--spacing-md)',
        backgroundColor: 'var(--color-error-light, #fee)',
        borderRadius: '8px',
        border: '1px solid var(--color-error)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-sm)',
          marginBottom: 'var(--spacing-sm)'
        }}>
          <span style={{ fontSize: '18px' }}>❌</span>
          <h4 style={{
            fontSize: 'var(--font-size-md)',
            fontWeight: 'bold',
            color: 'var(--color-error)',
            margin: 0
          }}>
            エラーが発生しました
          </h4>
        </div>
        <div style={{
          fontSize: 'var(--font-size-sm)',
          color: 'var(--color-error)',
          backgroundColor: 'white',
          padding: 'var(--spacing-sm)',
          borderRadius: '4px',
          border: '1px solid var(--color-error)',
          fontFamily: 'monospace',
          wordBreak: 'break-word'
        }}>
          {error}
        </div>
      </div>
    )
  }

  // 処理中でない場合は何も表示しない
  if (!isTranscribing && !progress.isTranscribing) {
    return null
  }

  return (
    <div style={{
      padding: 'var(--spacing-md)',
      backgroundColor: 'var(--color-bg-secondary)',
      borderRadius: '8px',
      border: '1px solid var(--color-border)'
    }}>
      {/* ヘッダー */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--spacing-sm)',
        marginBottom: 'var(--spacing-md)'
      }}>
        <span style={{ 
          fontSize: '18px',
          animation: 'pulse 1.5s ease-in-out infinite'
        }}>
          ⚡
        </span>
        <h4 style={{
          fontSize: 'var(--font-size-md)',
          fontWeight: 'bold',
          color: 'var(--color-text-primary)',
          margin: 0
        }}>
          文字起こし進行中
        </h4>
        <div style={{
          marginLeft: 'auto',
          fontSize: 'var(--font-size-sm)',
          color: 'var(--color-accent)',
          fontWeight: 'bold'
        }}>
          {progressPercentage}%
        </div>
      </div>

      {/* プログレスバー */}
      <div style={{
        width: '100%',
        height: '8px',
        backgroundColor: 'var(--color-bg-tertiary)',
        borderRadius: '4px',
        overflow: 'hidden',
        marginBottom: 'var(--spacing-md)'
      }}>
        <div style={{
          width: `${progressPercentage}%`,
          height: '100%',
          backgroundColor: 'var(--color-accent)',
          borderRadius: '4px',
          transition: 'width 0.3s ease',
          background: progress.isTranscribing 
            ? 'linear-gradient(90deg, var(--color-accent) 0%, var(--color-success) 100%)'
            : 'var(--color-accent)'
        }} />
      </div>

      {/* 統計情報 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 'var(--spacing-sm)',
        marginBottom: 'var(--spacing-md)'
      }}>
        <div style={{
          textAlign: 'center',
          padding: 'var(--spacing-sm)',
          backgroundColor: 'var(--color-bg-primary)',
          borderRadius: '4px'
        }}>
          <div style={{
            fontSize: 'var(--font-size-lg)',
            fontWeight: 'bold',
            color: 'var(--color-text-primary)'
          }}>
            {progress.processedChunks}
          </div>
          <div style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-secondary)'
          }}>
            処理完了
          </div>
        </div>

        <div style={{
          textAlign: 'center',
          padding: 'var(--spacing-sm)',
          backgroundColor: 'var(--color-bg-primary)',
          borderRadius: '4px'
        }}>
          <div style={{
            fontSize: 'var(--font-size-lg)',
            fontWeight: 'bold',
            color: 'var(--color-text-primary)'
          }}>
            {progress.totalChunks}
          </div>
          <div style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-secondary)'
          }}>
            総チャンク数
          </div>
        </div>

        <div style={{
          textAlign: 'center',
          padding: 'var(--spacing-sm)',
          backgroundColor: 'var(--color-bg-primary)',
          borderRadius: '4px'
        }}>
          <div style={{
            fontSize: 'var(--font-size-lg)',
            fontWeight: 'bold',
            color: progress.failedChunks > 0 ? 'var(--color-error)' : 'var(--color-text-primary)'
          }}>
            {progress.failedChunks}
          </div>
          <div style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-secondary)'
          }}>
            失敗
          </div>
        </div>
      </div>

      {/* 詳細情報 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 'var(--font-size-sm)',
        color: 'var(--color-text-secondary)'
      }}>
        <div>
          {progress.currentProcessingChunk > 0 && (
            <span>
              📋 処理中: チャンク {progress.currentProcessingChunk}
            </span>
          )}
        </div>
        
        <div style={{
          display: 'flex',
          gap: 'var(--spacing-md)'
        }}>
          {progress.averageProcessingTime > 0 && (
            <span>
              ⏱️ 平均: {formatRemainingTime(progress.averageProcessingTime)}
            </span>
          )}
          {progress.estimatedTimeRemaining > 0 && (
            <span>
              ⏳ 残り: {formatRemainingTime(progress.estimatedTimeRemaining)}
            </span>
          )}
        </div>
      </div>

      {/* 現在の処理状況 */}
      {transcriptionProgress && (
        <div style={{
          marginTop: 'var(--spacing-sm)',
          padding: 'var(--spacing-sm)',
          backgroundColor: 'var(--color-bg-tertiary)',
          borderRadius: '4px',
          fontSize: 'var(--font-size-xs)',
          color: 'var(--color-text-secondary)',
          fontFamily: 'monospace'
        }}>
          {transcriptionProgress}
        </div>
      )}

      {/* CSS アニメーション */}
      <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
            transform: scale(1);
          }
          50% {
            opacity: 0.7;
            transform: scale(1.1);
          }
        }
      `}</style>
    </div>
  )
}

export default TranscriptionProgressPanel