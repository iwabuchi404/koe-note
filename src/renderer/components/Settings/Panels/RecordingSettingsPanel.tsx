import React from 'react'
import { RecordingSettings, SafeAudioDeviceInfo, SettingsPanelProps } from '../types'

interface RecordingSettingsPanelProps extends SettingsPanelProps {
  settings: RecordingSettings
  availableDevices: SafeAudioDeviceInfo[]
  onSettingsChange: (settings: RecordingSettings) => void
  onRefreshDevices: () => void
}

/**
 * 録音設定パネルコンポーネント
 * マイクとデスクトップ音声の設定を管理
 */
const RecordingSettingsPanel: React.FC<RecordingSettingsPanelProps> = ({
  settings,
  availableDevices,
  validationErrors,
  isDisabled = false,
  onSettingsChange,
  onRefreshDevices
}) => {
  // 入力デバイスのみをフィルタリング
  const inputDevices = availableDevices.filter(device => device.kind === 'audioinput')

  // マイク設定変更
  const handleMicrophoneChange = (deviceId: string) => {
    const selectedDevice = inputDevices.find(device => device.deviceId === deviceId)
    onSettingsChange({
      ...settings,
      microphone: {
        deviceId,
        deviceName: selectedDevice?.label || ''
      }
    })
  }

  // デスクトップ音声設定変更
  const handleDesktopAudioChange = (field: 'enabled' | 'deviceId', value: boolean | string) => {
    if (field === 'enabled') {
      onSettingsChange({
        ...settings,
        desktopAudio: {
          ...settings.desktopAudio,
          enabled: value as boolean
        }
      })
    } else if (field === 'deviceId') {
      const selectedDevice = inputDevices.find(device => device.deviceId === value as string)
      onSettingsChange({
        ...settings,
        desktopAudio: {
          ...settings.desktopAudio,
          deviceId: value as string,
          deviceName: selectedDevice?.label || ''
        }
      })
    }
  }

  // エラーメッセージを取得
  const getFieldError = (fieldName: string) => {
    return validationErrors.find(error => error.field === fieldName)?.message
  }

  return (
    <section className="settings-section">
      <div className="settings-section-header">
        <h3>🎤 録音設定</h3>
        <button 
          type="button"
          onClick={onRefreshDevices}
          disabled={isDisabled}
          className="settings-refresh-button"
          title="デバイス一覧を更新"
        >
          🔄
        </button>
      </div>
      
      {/* マイク設定 */}
      <div className="settings-item">
        <label htmlFor="microphone-device">マイクロフォン:</label>
        <select
          id="microphone-device"
          value={settings.microphone.deviceId}
          onChange={(e) => handleMicrophoneChange(e.target.value)}
          disabled={isDisabled}
          className={getFieldError('microphone') ? 'settings-input--error' : ''}
        >
          <option value="">デバイスを選択してください</option>
          {inputDevices.map(device => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label || `デバイス ${device.deviceId.slice(0, 8)}...`}
            </option>
          ))}
        </select>
        {getFieldError('microphone') && (
          <div className="settings-error-message">
            {getFieldError('microphone')}
          </div>
        )}
      </div>

      {/* デスクトップ音声設定 */}
      <div className="settings-item">
        <label className="settings-checkbox">
          <input
            type="checkbox"
            checked={settings.desktopAudio.enabled}
            onChange={(e) => handleDesktopAudioChange('enabled', e.target.checked)}
            disabled={isDisabled}
          />
          デスクトップ音声を録音
        </label>
      </div>

      {/* デスクトップ音声デバイス選択（有効な場合のみ表示） */}
      {settings.desktopAudio.enabled && (
        <div className="settings-item settings-item--indented">
          <label htmlFor="desktop-audio-device">デスクトップ音声デバイス:</label>
          <select
            id="desktop-audio-device"
            value={settings.desktopAudio.deviceId}
            onChange={(e) => handleDesktopAudioChange('deviceId', e.target.value)}
            disabled={isDisabled}
            className={getFieldError('desktopAudio') ? 'settings-input--error' : ''}
          >
            <option value="">デバイスを選択してください</option>
            {inputDevices.map(device => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `デバイス ${device.deviceId.slice(0, 8)}...`}
              </option>
            ))}
          </select>
          {getFieldError('desktopAudio') && (
            <div className="settings-error-message">
              {getFieldError('desktopAudio')}
            </div>
          )}
        </div>
      )}

      {/* 現在の設定表示 */}
      {settings.microphone.deviceName && (
        <div className="settings-current-device">
          <div className="settings-current-device__label">
            選択中のマイク:
          </div>
          <div className="settings-current-device__name">
            {settings.microphone.deviceName}
          </div>
        </div>
      )}

      {settings.desktopAudio.enabled && settings.desktopAudio.deviceName && (
        <div className="settings-current-device">
          <div className="settings-current-device__label">
            選択中のデスクトップ音声:
          </div>
          <div className="settings-current-device__name">
            {settings.desktopAudio.deviceName}
          </div>
        </div>
      )}
      
      <div className="settings-note">
        ※ 録音・文字起こしタブの設定と同期されます
      </div>
    </section>
  )
}

export default RecordingSettingsPanel