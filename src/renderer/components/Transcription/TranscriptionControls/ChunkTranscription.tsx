import React from 'react'
import { ChunkProgress, ChunkSettings } from '../../../../preload/preload'

interface ChunkTranscriptionProps {
  selectedFile: any | null
  chunkProgress: ChunkProgress
  chunkSettings: ChunkSettings
  serverRunning: boolean
  isTranscribing: boolean
  isChangingModel: boolean
  onStartChunkTranscription: () => void
  onStopChunkTranscription: () => void
  onUpdateChunkSettings: (settings: Partial<ChunkSettings>) => void
  disabled?: boolean
}

/**
 * チャンク分割文字起こしコンポーネント
 * 長時間音声を分割して並列処理する文字起こし機能
 */
const ChunkTranscription: React.FC<ChunkTranscriptionProps> = ({
  selectedFile,
  chunkProgress,
  chunkSettings,
  serverRunning,
  isTranscribing,
  isChangingModel,
  onStartChunkTranscription,
  onStopChunkTranscription,
  onUpdateChunkSettings,
  disabled = false
}) => {
  const canTranscribe = !!(
    selectedFile && 
    !selectedFile.isRecording && 
    serverRunning && 
    !isTranscribing && 
    !isChangingModel &&
    !chunkProgress.isTranscribing
  )

  const isChunkTranscribing = chunkProgress.isTranscribing

  // 進捗パーセンテージを計算
  const progressPercentage = chunkProgress.totalChunks > 0 
    ? Math.round((chunkProgress.processedChunks / chunkProgress.totalChunks) * 100)
    : 0

  // 残り時間を分秒でフォーマット
  const formatTimeRemaining = (seconds: number) => {
    if (!isFinite(seconds) || seconds <= 0) return '計算中...'
    
    const minutes = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    
    if (minutes > 0) {
      return `約${minutes}分${secs}秒`
    } else {
      return `約${secs}秒`
    }
  }

  return (
    <div className="chunk-transcription">
      <div className="chunk-transcription__info">
        <h3 className="chunk-transcription__title">チャンク分割文字起こし</h3>
        <p className="chunk-transcription__description">
          音声を小さなチャンクに分割して並列処理で高速に文字起こしします
        </p>
      </div>

      {/* チャンク設定 */}
      <div className="chunk-transcription__settings">
        <h4 className="chunk-transcription__settings-title">設定</h4>
        <div className="chunk-transcription__settings-grid">
          <div className="chunk-transcription__setting">
            <label>チャンクサイズ（秒）</label>
            <input
              type="number"
              min="10"
              max="300"
              value={chunkSettings.chunkSize}
              onChange={(e) => onUpdateChunkSettings({ chunkSize: parseInt(e.target.value) })}
              disabled={isChunkTranscribing || disabled}
              className="chunk-transcription__setting-input"
            />
          </div>
          
          <div className="chunk-transcription__setting">
            <label>オーバーラップ（秒）</label>
            <input
              type="number"
              min="0"
              max="30"
              value={chunkSettings.overlapSize}
              onChange={(e) => onUpdateChunkSettings({ overlapSize: parseInt(e.target.value) })}
              disabled={isChunkTranscribing || disabled}
              className="chunk-transcription__setting-input"
            />
          </div>
          
          <div className="chunk-transcription__setting">
            <label>並列実行数</label>
            <input
              type="number"
              min="1"
              max="8"
              value={chunkSettings.maxConcurrency}
              onChange={(e) => onUpdateChunkSettings({ maxConcurrency: parseInt(e.target.value) })}
              disabled={isChunkTranscribing || disabled}
              className="chunk-transcription__setting-input"
            />
          </div>
        </div>
        
        <div className="chunk-transcription__settings-checkboxes">
          <label className="chunk-transcription__checkbox">
            <input
              type="checkbox"
              checked={chunkSettings.enableAutoScroll}
              onChange={(e) => onUpdateChunkSettings({ enableAutoScroll: e.target.checked })}
              disabled={isChunkTranscribing || disabled}
            />
            自動スクロール有効
          </label>
          
          <div className="chunk-transcription__setting">
            <label>品質モード</label>
            <select
              value={chunkSettings.qualityMode}
              onChange={(e) => onUpdateChunkSettings({ 
                qualityMode: e.target.value as 'speed' | 'balance' | 'accuracy' 
              })}
              disabled={isChunkTranscribing || disabled}
              className="chunk-transcription__setting-select"
            >
              <option value="speed">速度優先</option>
              <option value="balance">バランス</option>
              <option value="accuracy">精度優先</option>
            </select>
          </div>
        </div>
      </div>

      <div className="chunk-transcription__status">
        {!selectedFile ? (
          <span className="chunk-transcription__warning">
            ⚠️ ファイルが選択されていません
          </span>
        ) : selectedFile.isRecording ? (
          <span className="chunk-transcription__warning">
            🔴 録音中のファイルは対応していません
          </span>
        ) : !serverRunning ? (
          <span className="chunk-transcription__warning">
            ⚠️ サーバーが起動していません
          </span>
        ) : isChangingModel ? (
          <span className="chunk-transcription__info-text">
            🔄 モデル変更中...
          </span>
        ) : isChunkTranscribing ? (
          <span className="chunk-transcription__processing">
            🔄 チャンク分割処理中... ({chunkProgress.processedChunks}/{chunkProgress.totalChunks})
          </span>
        ) : selectedFile.hasTranscriptionFile ? (
          <span className="chunk-transcription__info-text">
            ✅ 文字起こしファイル作成済み（上書き可能）
          </span>
        ) : (
          <span className="chunk-transcription__ready">
            ✅ チャンク分割文字起こし準備完了
          </span>
        )}
      </div>

      {/* 進捗表示 */}
      {isChunkTranscribing && chunkProgress.totalChunks > 0 && (
        <div className="chunk-transcription__progress">
          <div className="chunk-transcription__progress-header">
            <span className="chunk-transcription__progress-text">
              進捗: {chunkProgress.processedChunks}/{chunkProgress.totalChunks} チャンク完了
              {chunkProgress.failedChunks > 0 && (
                <span className="chunk-transcription__failed-count">
                  （{chunkProgress.failedChunks}個失敗）
                </span>
              )}
            </span>
            <span className="chunk-transcription__progress-percentage">
              {progressPercentage}%
            </span>
          </div>
          
          <div className="chunk-transcription__progress-bar">
            <div 
              className="chunk-transcription__progress-fill"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          
          <div className="chunk-transcription__progress-details">
            {chunkProgress.currentProcessingChunk > 0 && (
              <span>現在処理中: チャンク{chunkProgress.currentProcessingChunk}</span>
            )}
            {chunkProgress.averageProcessingTime > 0 && (
              <span>平均処理時間: {chunkProgress.averageProcessingTime.toFixed(1)}秒/チャンク</span>
            )}
            {chunkProgress.estimatedTimeRemaining > 0 && (
              <span>推定残り時間: {formatTimeRemaining(chunkProgress.estimatedTimeRemaining)}</span>
            )}
          </div>
        </div>
      )}

      <div className="chunk-transcription__actions">
        {!isChunkTranscribing ? (
          <button
            className="chunk-transcription__button chunk-transcription__button--start"
            onClick={onStartChunkTranscription}
            disabled={disabled || !canTranscribe}
          >
            {selectedFile?.hasTranscriptionFile ? (
              <>🔄 上書きで実行</>
            ) : (
              <>⚡ チャンク分割実行</>
            )}
          </button>
        ) : (
          <button
            className="chunk-transcription__button chunk-transcription__button--stop"
            onClick={onStopChunkTranscription}
            disabled={disabled}
          >
            ⏹️ 停止
          </button>
        )}
      </div>

      {selectedFile && (
        <div className="chunk-transcription__file-info">
          <div className="chunk-transcription__file-name">
            📁 {selectedFile.filename}
          </div>
          <div className="chunk-transcription__file-details">
            {selectedFile.duration > 0 && (
              <span>⏱️ {Math.round(selectedFile.duration)}秒</span>
            )}
            {selectedFile.size > 0 && (
              <span>📊 {(selectedFile.size / 1024 / 1024).toFixed(1)}MB</span>
            )}
            {chunkSettings.chunkSize > 0 && selectedFile.duration > 0 && (
              <span>
                📦 予想チャンク数: {Math.ceil(selectedFile.duration / chunkSettings.chunkSize)}個
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default ChunkTranscription