/**
 * RecordingControls - 録音制御ボタンコンポーネント
 * 
 * 責務:
 * - 録音開始/停止/一時停止ボタン
 * - 録音制御の統合UI
 * - 録音状態に応じたボタン状態管理
 */

import React from 'react'

interface RecordingControlsProps {
  isRecording: boolean
  isPaused: boolean
  isStopping: boolean
  onStartRecording: () => void
  onStopRecording: () => void
  onPauseRecording: () => void
  onResumeRecording: () => void
  enableRealtimeTranscription: boolean
  onRealtimeTranscriptionChange: (enabled: boolean) => void
  disabled?: boolean
}

const RecordingControls: React.FC<RecordingControlsProps> = ({
  isRecording,
  isPaused,
  isStopping,
  onStartRecording,
  onStopRecording,
  onPauseRecording,
  onResumeRecording,
  enableRealtimeTranscription,
  onRealtimeTranscriptionChange,
  disabled = false
}) => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--spacing-md)',
      padding: 'var(--spacing-md)',
      backgroundColor: 'var(--color-bg-secondary)',
      borderRadius: '8px',
      border: '1px solid var(--color-border)'
    }}>
      {/* メイン録音ボタン */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--spacing-md)'
      }}>
        {!isRecording ? (
          <button
            onClick={onStartRecording}
            disabled={disabled}
            style={{
              padding: '12px 24px',
              fontSize: 'var(--font-size-md)',
              fontWeight: 'bold',
              backgroundColor: 'var(--color-error)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.5 : 1,
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacing-sm)'
            }}
            onMouseEnter={(e) => {
              if (!disabled) {
                e.currentTarget.style.backgroundColor = 'var(--color-error-hover)'
              }
            }}
            onMouseLeave={(e) => {
              if (!disabled) {
                e.currentTarget.style.backgroundColor = 'var(--color-error)'
              }
            }}
            title="録音を開始"
          >
            <span style={{ fontSize: '18px' }}>⏺️</span>
            録音開始
          </button>
        ) : (
          <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
            {/* 一時停止/再開ボタン */}
            {!isPaused ? (
              <button
                onClick={onPauseRecording}
                disabled={disabled || isStopping}
                style={{
                  padding: '12px 18px',
                  fontSize: 'var(--font-size-md)',
                  backgroundColor: 'var(--color-warning)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: (disabled || isStopping) ? 'not-allowed' : 'pointer',
                  opacity: (disabled || isStopping) ? 0.5 : 1,
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--spacing-xs)'
                }}
                title="録音を一時停止"
              >
                <span style={{ fontSize: '16px' }}>⏸️</span>
                一時停止
              </button>
            ) : (
              <button
                onClick={onResumeRecording}
                disabled={disabled || isStopping}
                style={{
                  padding: '12px 18px',
                  fontSize: 'var(--font-size-md)',
                  backgroundColor: 'var(--color-success)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: (disabled || isStopping) ? 'not-allowed' : 'pointer',
                  opacity: (disabled || isStopping) ? 0.5 : 1,
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--spacing-xs)'
                }}
                title="録音を再開"
              >
                <span style={{ fontSize: '16px' }}>▶️</span>
                再開
              </button>
            )}

            {/* 停止ボタン */}
            <button
              onClick={onStopRecording}
              disabled={disabled || isStopping}
              style={{
                padding: '12px 18px',
                fontSize: 'var(--font-size-md)',
                backgroundColor: isStopping ? 'var(--color-bg-tertiary)' : 'var(--color-error)',
                color: isStopping ? 'var(--color-text-secondary)' : 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: (disabled || isStopping) ? 'not-allowed' : 'pointer',
                opacity: (disabled || isStopping) ? 0.5 : 1,
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacing-xs)'
              }}
              title={isStopping ? '停止処理中...' : '録音を停止'}
            >
              <span style={{ fontSize: '16px' }}>⏹️</span>
              {isStopping ? '停止中...' : '停止'}
            </button>
          </div>
        )}
      </div>

      {/* リアルタイム文字起こし設定 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--spacing-sm)',
        padding: 'var(--spacing-sm)',
        backgroundColor: 'var(--color-bg-tertiary)',
        borderRadius: '4px'
      }}>
        <input
          type="checkbox"
          id="realtime-transcription"
          checked={enableRealtimeTranscription}
          onChange={(e) => onRealtimeTranscriptionChange(e.target.checked)}
          disabled={isRecording || disabled}
          style={{
            width: '16px',
            height: '16px',
            cursor: (isRecording || disabled) ? 'not-allowed' : 'pointer'
          }}
        />
        <label
          htmlFor="realtime-transcription"
          style={{
            fontSize: 'var(--font-size-sm)',
            color: (isRecording || disabled) ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
            cursor: (isRecording || disabled) ? 'not-allowed' : 'pointer',
            userSelect: 'none'
          }}
        >
          リアルタイム文字起こしを有効にする
        </label>
      </div>

      {/* 録音中の注意事項 */}
      {isRecording && (
        <div style={{
          padding: 'var(--spacing-sm)',
          backgroundColor: 'rgba(220, 53, 69, 0.1)',
          border: '1px solid var(--color-error)',
          borderRadius: '4px',
          fontSize: 'var(--font-size-xs)',
          color: 'var(--color-error)'
        }}>
          ⚠️ 録音中はデバイス設定を変更できません
        </div>
      )}
    </div>
  )
}

export default RecordingControls