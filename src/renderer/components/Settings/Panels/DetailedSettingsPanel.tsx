import React from 'react'
import { DetailedSettings, SettingsPanelProps } from '../types'

interface DetailedSettingsPanelProps extends SettingsPanelProps {
  settings: DetailedSettings
  onSettingsChange: (settings: DetailedSettings) => void
  onResetDefaults: () => void
}

/**
 * 詳細設定パネルコンポーネント
 * UIテーマ、ログレベル、その他の詳細設定を管理
 */
const DetailedSettingsPanel: React.FC<DetailedSettingsPanelProps> = ({
  settings,
  validationErrors,
  isDisabled = false,
  onSettingsChange,
  onResetDefaults
}) => {
  // 設定変更ハンドラー
  const handleSettingChange = <K extends keyof DetailedSettings>(
    field: K,
    value: DetailedSettings[K]
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

  // UIテーマの選択肢
  const themeOptions = [
    { value: 'light', label: 'ライト', description: '明るいテーマ' },
    { value: 'dark', label: 'ダーク', description: '暗いテーマ' },
    { value: 'auto', label: '自動', description: 'システム設定に従う' }
  ]

  // ログレベルの選択肢
  const logLevelOptions = [
    { value: 'error', label: 'エラーのみ', description: 'エラーメッセージのみを記録' },
    { value: 'warn', label: '警告以上', description: '警告とエラーを記録' },
    { value: 'info', label: '情報以上', description: '一般的な情報も記録（推奨）' },
    { value: 'debug', label: 'デバッグ', description: '詳細な情報を記録（開発者向け）' }
  ]

  // リセット確認ハンドラー
  const handleResetConfirm = () => {
    if (window.confirm('すべての設定をデフォルトに戻しますか？この操作は取り消せません。')) {
      onResetDefaults()
    }
  }

  return (
    <section className="settings-section">
      <h3>🔧 詳細設定</h3>
      
      {/* UIテーマ設定 */}
      <div className="settings-item">
        <label htmlFor="ui-theme">UIテーマ:</label>
        <select
          id="ui-theme"
          value={settings.uiTheme}
          onChange={(e) => handleSettingChange('uiTheme', e.target.value as 'light' | 'dark' | 'auto')}
          disabled={isDisabled}
          className={getFieldError('uiTheme') ? 'settings-input--error' : ''}
        >
          {themeOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="settings-description">
          {themeOptions.find(opt => opt.value === settings.uiTheme)?.description}
        </div>
        {getFieldError('uiTheme') && (
          <div className="settings-error-message">
            {getFieldError('uiTheme')}
          </div>
        )}
      </div>

      {/* ログレベル設定 */}
      <div className="settings-item">
        <label htmlFor="log-level">ログレベル:</label>
        <select
          id="log-level"
          value={settings.logLevel}
          onChange={(e) => handleSettingChange('logLevel', e.target.value as 'error' | 'warn' | 'info' | 'debug')}
          disabled={isDisabled}
          className={getFieldError('logLevel') ? 'settings-input--error' : ''}
        >
          {logLevelOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="settings-description">
          {logLevelOptions.find(opt => opt.value === settings.logLevel)?.description}
        </div>
        {getFieldError('logLevel') && (
          <div className="settings-error-message">
            {getFieldError('logLevel')}
          </div>
        )}
      </div>

      {/* 自動改行設定 */}
      <div className="settings-item">
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={settings.autoLineBreak}
            onChange={(e) => handleSettingChange('autoLineBreak', e.target.checked)}
            disabled={isDisabled}
          />
          自動改行を有効にする
        </label>
        <div className="settings-description">
          文字起こし結果で長い行を自動的に改行します
        </div>
        {getFieldError('autoLineBreak') && (
          <div className="settings-error-message">
            {getFieldError('autoLineBreak')}
          </div>
        )}
      </div>

      {/* パフォーマンス設定 */}
      <div className="settings-subsection">
        <h4>⚡ パフォーマンス</h4>
        
        <div className="settings-item">
          <div className="settings-info-box">
            <div className="settings-info-box__title">
              システム情報
            </div>
            <div className="settings-info-box__content">
              <div className="settings-info-item">
                <span className="settings-info-label">プラットフォーム:</span>
                <span className="settings-info-value">{navigator.platform}</span>
              </div>
              <div className="settings-info-item">
                <span className="settings-info-label">ユーザーエージェント:</span>
                <span className="settings-info-value">{navigator.userAgent.split(' ').slice(0, 3).join(' ')}...</span>
              </div>
              <div className="settings-info-item">
                <span className="settings-info-label">メモリ:</span>
                <span className="settings-info-value">
                  {(navigator as any).deviceMemory ? `約${(navigator as any).deviceMemory}GB` : '不明'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* リセット機能 */}
      <div className="settings-subsection">
        <h4>🔄 設定のリセット</h4>
        
        <div className="settings-item">
          <div className="settings-reset-section">
            <div className="settings-reset-description">
              すべての設定をデフォルト値に戻します。この操作は取り消せません。
            </div>
            <button
              type="button"
              onClick={handleResetConfirm}
              disabled={isDisabled}
              className="settings-reset-button"
            >
              🔄 すべての設定をリセット
            </button>
          </div>
        </div>
      </div>

      {/* バージョン情報 */}
      <div className="settings-subsection">
        <h4>ℹ️ バージョン情報</h4>
        
        <div className="settings-item">
          <div className="settings-version-info">
            <div className="settings-version-item">
              <span className="settings-version-label">アプリバージョン:</span>
              <span className="settings-version-value">1.0.0</span>
            </div>
            <div className="settings-version-item">
              <span className="settings-version-label">Electron:</span>
              <span className="settings-version-value">{process.versions?.electron || '不明'}</span>
            </div>
            <div className="settings-version-item">
              <span className="settings-version-label">Node.js:</span>
              <span className="settings-version-value">{process.versions?.node || '不明'}</span>
            </div>
            <div className="settings-version-item">
              <span className="settings-version-label">Chrome:</span>
              <span className="settings-version-value">{process.versions?.chrome || '不明'}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="settings-note">
        ※ 一部の設定変更はアプリケーションの再起動後に有効になります
      </div>
    </section>
  )
}

export default DetailedSettingsPanel