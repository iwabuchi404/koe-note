import React from 'react'

interface TranscriptionProgressProps {
  isTranscribing: boolean
  transcriptionProgress: string
  error?: string
  type?: 'standard' | 'chunk'
}

/**
 * 文字起こし進捗表示コンポーネント
 * 標準・チャンク文字起こし共通の進捗表示
 */
const TranscriptionProgress: React.FC<TranscriptionProgressProps> = ({
  isTranscribing,
  transcriptionProgress,
  error,
  type = 'standard'
}) => {
  if (!isTranscribing && !error && !transcriptionProgress) {
    return null
  }

  return (
    <div className="transcription-progress">
      {/* エラー表示 */}
      {error && (
        <div className="transcription-progress__error">
          <div className="transcription-progress__error-icon">❌</div>
          <div className="transcription-progress__error-content">
            <div className="transcription-progress__error-title">
              {type === 'chunk' ? 'チャンク分割文字起こしエラー' : '文字起こしエラー'}
            </div>
            <div className="transcription-progress__error-message">
              {error}
            </div>
          </div>
        </div>
      )}

      {/* 進捗表示 */}
      {isTranscribing && transcriptionProgress && (
        <div className="transcription-progress__active">
          <div className="transcription-progress__spinner">
            <div className="transcription-progress__spinner-icon">🔄</div>
          </div>
          <div className="transcription-progress__content">
            <div className="transcription-progress__title">
              {type === 'chunk' ? 'チャンク分割処理中...' : '文字起こし処理中...'}
            </div>
            <div className="transcription-progress__message">
              {transcriptionProgress}
            </div>
          </div>
        </div>
      )}

      {/* 処理中状態（進捗メッセージなし） */}
      {isTranscribing && !transcriptionProgress && (
        <div className="transcription-progress__active">
          <div className="transcription-progress__spinner">
            <div className="transcription-progress__spinner-icon">🔄</div>
          </div>
          <div className="transcription-progress__content">
            <div className="transcription-progress__title">
              {type === 'chunk' ? 'チャンク分割処理を開始しています...' : '文字起こしを開始しています...'}
            </div>
            <div className="transcription-progress__message">
              少々お待ちください
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default TranscriptionProgress