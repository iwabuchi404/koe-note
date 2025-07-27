import React from 'react'
import { Button } from '../../common'

interface StandardTranscriptionProps {
  selectedFile: any | null
  isTranscribing: boolean
  serverRunning: boolean
  isChangingModel: boolean
  progress: string
  onTranscribe: () => void
  disabled?: boolean
}

/**
 * 標準文字起こしボタンコンポーネント
 * 単一ファイルの音声認識を実行
 */
const StandardTranscription: React.FC<StandardTranscriptionProps> = ({
  selectedFile,
  isTranscribing,
  serverRunning,
  isChangingModel,
  progress,
  onTranscribe,
  disabled = false
}) => {
  const canTranscribe = !!(
    selectedFile && 
    !selectedFile.isRecording && 
    serverRunning && 
    !isTranscribing && 
    !isChangingModel
  )

  return (
    <div className="standard-transcription">
      <div className="standard-transcription__info">
        <h3 className="standard-transcription__title">通常文字起こし</h3>
        <p className="standard-transcription__description">
          選択されたファイル全体を一度に文字起こしします
        </p>
      </div>

      <div className="standard-transcription__status">
        {!selectedFile ? (
          <span className="standard-transcription__warning">
            ⚠️ ファイルが選択されていません
          </span>
        ) : selectedFile.isRecording ? (
          <span className="standard-transcription__warning">
            🔴 録音中のファイルは文字起こしできません
          </span>
        ) : !serverRunning ? (
          <span className="standard-transcription__warning">
            ⚠️ サーバーが起動していません
          </span>
        ) : isChangingModel ? (
          <span className="standard-transcription__info-text">
            🔄 モデル変更中...
          </span>
        ) : selectedFile.hasTranscriptionFile ? (
          <span className="standard-transcription__info-text">
            ✅ 文字起こしファイル作成済み
          </span>
        ) : (
          <span className="standard-transcription__ready">
            ✅ 文字起こし準備完了
          </span>
        )}
      </div>

      {isTranscribing && progress && (
        <div className="standard-transcription__progress">
          <span className="standard-transcription__progress-text">
            {progress}
          </span>
          <div className="standard-transcription__spinner">🔄</div>
        </div>
      )}

      <div className="standard-transcription__actions">
        <Button
          variant={isTranscribing ? "secondary" : "primary"}
          icon={isTranscribing ? "🔄" : selectedFile?.hasTranscriptionFile ? "🔄" : "🎙️"}
          loading={isTranscribing}
          onClick={onTranscribe}
          disabled={disabled || !canTranscribe || isTranscribing}
          className="standard-transcription__button"
          fullWidth
        >
          {isTranscribing ? (
            "文字起こし中..."
          ) : selectedFile?.hasTranscriptionFile ? (
            "上書き実行"
          ) : (
            "文字起こし実行"
          )}
        </Button>
      </div>

      {selectedFile && (
        <div className="standard-transcription__file-info">
          <div className="standard-transcription__file-name">
            📁 {selectedFile.filename}
          </div>
          <div className="standard-transcription__file-details">
            {selectedFile.duration > 0 && (
              <span>⏱️ {Math.round(selectedFile.duration)}秒</span>
            )}
            {selectedFile.size > 0 && (
              <span>📊 {(selectedFile.size / 1024 / 1024).toFixed(1)}MB</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default StandardTranscription