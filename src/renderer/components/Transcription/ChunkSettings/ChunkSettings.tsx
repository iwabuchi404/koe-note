import React from 'react'
import { ChunkSettings as ChunkSettingsType } from '../../../../preload/preload'

interface ChunkSettingsProps {
  chunkSettings: ChunkSettingsType
  isTranscribing: boolean
  onUpdateSettings: (settings: Partial<ChunkSettingsType>) => void
  disabled?: boolean
}

/**
 * チャンク分割設定コンポーネント
 * チャンクサイズ、オーバーラップ、並列処理数などの設定を管理
 */
const ChunkSettings: React.FC<ChunkSettingsProps> = ({
  chunkSettings,
  isTranscribing,
  onUpdateSettings,
  disabled = false
}) => {
  const isDisabled = disabled || isTranscribing

  return (
    <div className="chunk-settings">
      <div className="chunk-settings__header">
        <h3 className="chunk-settings__title">⚙️ チャンク分割設定</h3>
        <p className="chunk-settings__description">
          音声分割と並列処理の設定を調整します
        </p>
      </div>

      <div className="chunk-settings__grid">
        {/* チャンクサイズ設定 */}
        <div className="chunk-settings__field">
          <label className="chunk-settings__label">
            チャンクサイズ
          </label>
          <select
            value={chunkSettings.chunkSize}
            onChange={(e) => onUpdateSettings({ chunkSize: parseInt(e.target.value) })}
            disabled={isDisabled}
            className="chunk-settings__select"
          >
            <option value={10}>10秒</option>
            <option value={15}>15秒</option>
            <option value={20}>20秒</option>
            <option value={30}>30秒</option>
            <option value={45}>45秒</option>
            <option value={60}>60秒</option>
          </select>
          <span className="chunk-settings__hint">
            短いほど並列処理効果が高い
          </span>
        </div>

        {/* オーバーラップ設定 */}
        <div className="chunk-settings__field">
          <label className="chunk-settings__label">
            オーバーラップ
          </label>
          <select
            value={chunkSettings.overlapSize}
            onChange={(e) => onUpdateSettings({ overlapSize: parseInt(e.target.value) })}
            disabled={isDisabled}
            className="chunk-settings__select"
          >
            <option value={0.5}>0.5秒</option>
            <option value={1}>1秒</option>
            <option value={2}>2秒</option>
            <option value={3}>3秒</option>
            <option value={5}>5秒</option>
          </select>
          <span className="chunk-settings__hint">
            チャンク境界での認識ミスを軽減
          </span>
        </div>

        {/* 並列処理数設定 */}
        <div className="chunk-settings__field">
          <label className="chunk-settings__label">
            並列処理数
          </label>
          <select
            value={chunkSettings.maxConcurrency}
            onChange={(e) => onUpdateSettings({ maxConcurrency: parseInt(e.target.value) })}
            disabled={isDisabled}
            className="chunk-settings__select"
          >
            <option value={1}>1チャンク</option>
            <option value={2}>2チャンク</option>
            <option value={3}>3チャンク</option>
            <option value={4}>4チャンク</option>
            <option value={6}>6チャンク</option>
            <option value={8}>8チャンク</option>
          </select>
          <span className="chunk-settings__hint">
            CPU性能に応じて調整
          </span>
        </div>

        {/* 品質モード設定 */}
        <div className="chunk-settings__field">
          <label className="chunk-settings__label">
            品質モード
          </label>
          <select
            value={chunkSettings.qualityMode}
            onChange={(e) => onUpdateSettings({ 
              qualityMode: e.target.value as 'speed' | 'balance' | 'accuracy' 
            })}
            disabled={isDisabled}
            className="chunk-settings__select"
          >
            <option value="speed">速度優先</option>
            <option value="balance">バランス</option>
            <option value="accuracy">精度優先</option>
          </select>
          <span className="chunk-settings__hint">
            {chunkSettings.qualityMode === 'speed' && '最高速度、標準精度'}
            {chunkSettings.qualityMode === 'balance' && '速度と精度のバランス'}
            {chunkSettings.qualityMode === 'accuracy' && '最高精度、処理時間長'}
          </span>
        </div>
      </div>

      {/* チェックボックス設定 */}
      <div className="chunk-settings__checkboxes">
        <label className="chunk-settings__checkbox">
          <input
            type="checkbox"
            checked={chunkSettings.enableAutoScroll}
            onChange={(e) => onUpdateSettings({ enableAutoScroll: e.target.checked })}
            disabled={isDisabled}
          />
          <span className="chunk-settings__checkbox-text">
            自動スクロール有効
          </span>
          <span className="chunk-settings__checkbox-hint">
            処理完了したチャンクを自動的に表示
          </span>
        </label>
      </div>

      {/* 設定プリセット */}
      <div className="chunk-settings__presets">
        <div className="chunk-settings__presets-title">
          クイック設定
        </div>
        <div className="chunk-settings__presets-buttons">
          <button
            className="chunk-settings__preset-button"
            onClick={() => onUpdateSettings({
              chunkSize: 15,
              overlapSize: 1,
              maxConcurrency: 2,
              qualityMode: 'speed',
              enableAutoScroll: true
            })}
            disabled={isDisabled}
          >
            🚀 高速
          </button>
          
          <button
            className="chunk-settings__preset-button"
            onClick={() => onUpdateSettings({
              chunkSize: 20,
              overlapSize: 2,
              maxConcurrency: 3,
              qualityMode: 'balance',
              enableAutoScroll: true
            })}
            disabled={isDisabled}
          >
            ⚖️ バランス
          </button>
          
          <button
            className="chunk-settings__preset-button"
            onClick={() => onUpdateSettings({
              chunkSize: 30,
              overlapSize: 3,
              maxConcurrency: 2,
              qualityMode: 'accuracy',
              enableAutoScroll: false
            })}
            disabled={isDisabled}
          >
            🎯 高精度
          </button>
        </div>
      </div>

      {/* 設定情報表示 */}
      <div className="chunk-settings__info">
        <div className="chunk-settings__info-item">
          <span className="chunk-settings__info-label">推定処理時間:</span>
          <span className="chunk-settings__info-value">
            {chunkSettings.qualityMode === 'speed' && '標準の約0.7倍'}
            {chunkSettings.qualityMode === 'balance' && '標準と同程度'}
            {chunkSettings.qualityMode === 'accuracy' && '標準の約1.5倍'}
          </span>
        </div>
        
        <div className="chunk-settings__info-item">
          <span className="chunk-settings__info-label">メモリ使用量:</span>
          <span className="chunk-settings__info-value">
            並列数 × チャンクサイズに比例
          </span>
        </div>
      </div>
    </div>
  )
}

export default ChunkSettings