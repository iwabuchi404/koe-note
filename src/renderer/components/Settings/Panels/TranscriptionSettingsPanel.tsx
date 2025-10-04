import React, { useState, useEffect } from 'react'
import { TranscriptionSettings, SettingsPanelProps } from '../types'
import { SupportedLanguage } from '../../../state/TranscriptionState'
import { modelDownloadService } from '../../../services/ModelDownloadService'

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
  // インストール済みモデルの状態管理
  const [installedModels, setInstalledModels] = useState<Array<{id: string, name: string}>>([])

  // インストール済みモデルの取得
  useEffect(() => {
    const loadInstalledModels = async () => {
      try {
        const models = await modelDownloadService.getInstalledModels()
        setInstalledModels(models)
      } catch (error) {
        console.error('モデル一覧の取得に失敗しました:', error)
        setInstalledModels([])
      }
    }

    loadInstalledModels()
    
    // 5秒ごとにモデル一覧を更新
    const interval = setInterval(loadInstalledModels, 5000)
    return () => clearInterval(interval)
  }, [])

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
          disabled={isDisabled || installedModels.length === 0}
          className={getFieldError('model') ? 'settings-input--error' : ''}
        >
          {installedModels.length > 0 ? (
            installedModels.map(m => (
              <option key={m.id} value={m.id}>
                {m.name || m.id}
              </option>
            ))
          ) : (
            <option value="" disabled>モデルをダウンロードしてください</option>
          )}
        </select>
        <div className="settings-description">
          {installedModels.length > 0 ? (
            installedModels.find(m => m.id === settings.model)?.name || settings.model
          ) : (
            <span style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
              📥 モデル管理タブからモデルをダウンロードしてください
            </span>
          )}
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
              {installedModels.length > 0 ? (
                installedModels.find(m => m.id === settings.model)?.name || settings.model
              ) : (
                'モデルがインストールされていません'
              )}
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