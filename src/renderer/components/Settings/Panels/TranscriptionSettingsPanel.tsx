import React from 'react'
import { TranscriptionSettings, SettingsPanelProps } from '../types'
import { TranscriptionQuality, SupportedLanguage } from '../../../state/TranscriptionState'

interface TranscriptionSettingsPanelProps extends SettingsPanelProps {
  settings: TranscriptionSettings
  onSettingsChange: (settings: TranscriptionSettings) => void
}

/**
 * 文字起こし設定パネルコンポーネント
 * Whisperモデル、品質、言語設定を管理
 */
const TranscriptionSettingsPanel: React.FC<TranscriptionSettingsPanelProps> = ({
  settings,
  validationErrors,
  isDisabled = false,
  onSettingsChange
}) => {
  // 設定変更ハンドラー
  const handleSettingChange = <K extends keyof TranscriptionSettings>(
    field: K,
    value: TranscriptionSettings[K]
  ) => {
    onSettingsChange({
      ...settings,
      [field]: value
    })
  }

  // エラーメッセージを取得
  const getFieldError = (fieldName: string) => {
    return validationErrors.find(error => error.field === fieldName)?.message
  }

  // モデル選択肢
  const modelOptions = [
    { value: 'kotoba-whisper-v1.0', label: 'Kotoba-Whisper v1.0', description: '日本語特化、高精度' },
    { value: 'whisper-large', label: 'Whisper Large', description: '最高精度、処理時間長' },
    { value: 'whisper-base', label: 'Whisper Base', description: '標準精度、処理時間短' },
    { value: 'whisper-small', label: 'Whisper Small', description: '軽量、高速処理' }
  ]


  // 言語選択肢
  const languageOptions = [
    { value: 'ja', label: '日本語', description: '日本語音声の認識' },
    { value: 'en', label: 'English', description: '英語音声の認識' },
    { value: 'auto', label: '自動検出', description: '言語を自動で判定' }
  ]

  // チャンク時間選択肢
  const chunkDurationOptions = [
    { value: 10, label: '10秒', description: '短時間、リアルタイム性重視' },
    { value: 20, label: '20秒', description: '標準設定、バランス良い' },
    { value: 30, label: '30秒', description: '長時間、精度重視' }
  ]

  return (
    <section className="settings-section">
      <h3>🤖 文字起こし設定</h3>
      
      {/* モデル設定 */}
      <div className="settings-item">
        <label htmlFor="transcription-model">モデル:</label>
        <select
          id="transcription-model"
          value={settings.model}
          onChange={(e) => handleSettingChange('model', e.target.value)}
          disabled={isDisabled}
          className={getFieldError('model') ? 'settings-input--error' : ''}
        >
          {modelOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="settings-description">
          {modelOptions.find(opt => opt.value === settings.model)?.description}
        </div>
        {getFieldError('model') && (
          <div className="settings-error-message">
            {getFieldError('model')}
          </div>
        )}
      </div>


      {/* 言語設定 */}
      <div className="settings-item">
        <label htmlFor="transcription-language">言語:</label>
        <select
          id="transcription-language"
          value={settings.language}
          onChange={(e) => handleSettingChange('language', e.target.value as SupportedLanguage)}
          disabled={isDisabled}
          className={getFieldError('language') ? 'settings-input--error' : ''}
        >
          {languageOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="settings-description">
          {languageOptions.find(opt => opt.value === settings.language)?.description}
        </div>
        {getFieldError('language') && (
          <div className="settings-error-message">
            {getFieldError('language')}
          </div>
        )}
      </div>

      {/* チャンク分割時間設定 */}
      <div className="settings-item">
        <label htmlFor="chunk-duration">チャンク分割時間:</label>
        <select
          id="chunk-duration"
          value={settings.chunkDurationSeconds}
          onChange={(e) => handleSettingChange('chunkDurationSeconds', parseInt(e.target.value))}
          disabled={isDisabled}
          className={getFieldError('chunkDurationSeconds') ? 'settings-input--error' : ''}
        >
          {chunkDurationOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="settings-description">
          {chunkDurationOptions.find(opt => opt.value === settings.chunkDurationSeconds)?.description}
        </div>
        <span className="settings-hint">リアルタイム処理用</span>
        {getFieldError('chunkDurationSeconds') && (
          <div className="settings-error-message">
            {getFieldError('chunkDurationSeconds')}
          </div>
        )}
      </div>

      {/* 現在の設定サマリー */}
      <div className="settings-summary">
        <div className="settings-summary__title">現在の設定</div>
        <div className="settings-summary__content">
          <div className="settings-summary__item">
            <span className="settings-summary__label">モデル:</span>
            <span className="settings-summary__value">
              {modelOptions.find(opt => opt.value === settings.model)?.label}
            </span>
          </div>
          <div className="settings-summary__item">
            <span className="settings-summary__label">言語:</span>
            <span className="settings-summary__value">
              {languageOptions.find(opt => opt.value === settings.language)?.label}
            </span>
          </div>
          <div className="settings-summary__item">
            <span className="settings-summary__label">チャンク時間:</span>
            <span className="settings-summary__value">
              {settings.chunkDurationSeconds}秒
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}

export default TranscriptionSettingsPanel