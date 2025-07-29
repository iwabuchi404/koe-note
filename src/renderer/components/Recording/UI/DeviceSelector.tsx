/**
 * DeviceSelector - デバイス選択UIコンポーネント
 * 
 * 責務:
 * - 入力タイプ選択（マイク、デスクトップ、ステレオミックス、ミキシング）
 * - デバイス一覧の表示と選択
 * - 選択状態の管理
 */

import React from 'react'

type InputType = 'microphone' | 'desktop' | 'stereo-mix' | 'mixing'

interface Device {
  deviceId: string
  label: string
}

interface DesktopSource {
  id: string
  name: string
}

interface DeviceSelectorProps {
  // 入力タイプ
  inputType: InputType
  onInputTypeChange: (type: InputType) => void
  
  // デバイス関連
  availableDevices: Device[]
  selectedDevice: string
  onDeviceSelect: (deviceId: string) => void
  
  // デスクトップソース
  desktopSources: DesktopSource[]
  selectedDesktopSource: string
  onDesktopSourceSelect: (sourceId: string) => void
  
  // システム音声デバイス
  systemAudioDevices: Device[]
  selectedSystemDevice: string
  onSystemDeviceSelect: (deviceId: string) => void
  
  // 状態
  disabled?: boolean
}

const DeviceSelector: React.FC<DeviceSelectorProps> = ({
  inputType,
  onInputTypeChange,
  availableDevices,
  selectedDevice,
  onDeviceSelect,
  desktopSources,
  selectedDesktopSource,
  onDesktopSourceSelect,
  systemAudioDevices,
  selectedSystemDevice,
  onSystemDeviceSelect,
  disabled = false
}) => {
  const inputTypes: Array<{ value: InputType; label: string; icon: string; description: string }> = [
    { value: 'microphone', label: 'マイク', icon: '🎤', description: 'マイクロフォンから録音' },
    { value: 'desktop', label: 'デスクトップ', icon: '🖥️', description: 'デスクトップ音声を録音' },
    { value: 'stereo-mix', label: 'ステレオミックス', icon: '🔊', description: 'システム音声を録音' },
    { value: 'mixing', label: 'ミキシング', icon: '🎛️', description: 'マイク＋デスクトップ' }
  ]

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
      {/* 入力タイプ選択 */}
      <div>
        <h4 style={{
          fontSize: 'var(--font-size-sm)',
          fontWeight: 'bold',
          color: 'var(--color-text-primary)',
          marginBottom: 'var(--spacing-sm)',
          margin: 0
        }}>
          入力タイプ
        </h4>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 'var(--spacing-sm)'
        }}>
          {inputTypes.map((type) => (
            <button
              key={type.value}
              onClick={() => onInputTypeChange(type.value)}
              disabled={disabled}
              style={{
                padding: 'var(--spacing-sm)',
                fontSize: 'var(--font-size-sm)',
                backgroundColor: inputType === type.value 
                  ? 'var(--color-accent)' 
                  : 'var(--color-bg-primary)',
                color: inputType === type.value 
                  ? 'white' 
                  : 'var(--color-text-primary)',
                border: `1px solid ${inputType === type.value 
                  ? 'var(--color-accent)' 
                  : 'var(--color-border)'}`,
                borderRadius: '4px',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1,
                transition: 'all 0.2s ease',
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px'
              }}
              onMouseEnter={(e) => {
                if (!disabled && inputType !== type.value) {
                  e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)'
                }
              }}
              onMouseLeave={(e) => {
                if (!disabled && inputType !== type.value) {
                  e.currentTarget.style.backgroundColor = 'var(--color-bg-primary)'
                }
              }}
              title={type.description}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)' }}>
                <span>{type.icon}</span>
                <span style={{ fontWeight: '500' }}>{type.label}</span>
              </div>
              <span style={{ 
                fontSize: 'var(--font-size-xs)', 
                opacity: 0.8 
              }}>
                {type.description}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* デバイス選択エリア */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-sm)'
      }}>
        {/* マイクロフォンデバイス選択 */}
        {(inputType === 'microphone' || inputType === 'mixing') && (
          <div>
            <label style={{
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-secondary)',
              marginBottom: 'var(--spacing-xs)',
              display: 'block'
            }}>
              マイクロフォン
            </label>
            <select
              value={selectedDevice}
              onChange={(e) => onDeviceSelect(e.target.value)}
              disabled={disabled}
              style={{
                width: '100%',
                padding: 'var(--spacing-sm)',
                fontSize: 'var(--font-size-sm)',
                backgroundColor: 'var(--color-bg-primary)',
                border: '1px solid var(--color-border)',
                borderRadius: '4px',
                color: 'var(--color-text-primary)',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1
              }}
            >
              {availableDevices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* デスクトップソース選択 */}
        {(inputType === 'desktop' || inputType === 'mixing') && (
          <div>
            <label style={{
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-secondary)',
              marginBottom: 'var(--spacing-xs)',
              display: 'block'
            }}>
              デスクトップソース
            </label>
            <select
              value={selectedDesktopSource}
              onChange={(e) => onDesktopSourceSelect(e.target.value)}
              disabled={disabled}
              style={{
                width: '100%',
                padding: 'var(--spacing-sm)',
                fontSize: 'var(--font-size-sm)',
                backgroundColor: 'var(--color-bg-primary)',
                border: '1px solid var(--color-border)',
                borderRadius: '4px',
                color: 'var(--color-text-primary)',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1
              }}
            >
              {desktopSources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* システム音声デバイス選択 */}
        {inputType === 'stereo-mix' && (
          <div>
            <label style={{
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-secondary)',
              marginBottom: 'var(--spacing-xs)',
              display: 'block'
            }}>
              システム音声デバイス
            </label>
            <select
              value={selectedSystemDevice}
              onChange={(e) => onSystemDeviceSelect(e.target.value)}
              disabled={disabled}
              style={{
                width: '100%',
                padding: 'var(--spacing-sm)',
                fontSize: 'var(--font-size-sm)',
                backgroundColor: 'var(--color-bg-primary)',
                border: '1px solid var(--color-border)',
                borderRadius: '4px',
                color: 'var(--color-text-primary)',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1
              }}
            >
              {systemAudioDevices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* 選択タイプに応じたヘルプテキスト */}
      <div style={{
        padding: 'var(--spacing-sm)',
        backgroundColor: 'var(--color-bg-tertiary)',
        borderRadius: '4px',
        fontSize: 'var(--font-size-xs)',
        color: 'var(--color-text-secondary)',
        lineHeight: '1.4'
      }}>
        {inputType === 'microphone' && '💡 マイクロフォンからの音声を録音します'}
        {inputType === 'desktop' && '💡 デスクトップで再生される音声を録音します'}
        {inputType === 'stereo-mix' && '💡 システム全体の音声（スピーカー出力）を録音します'}
        {inputType === 'mixing' && '💡 マイクロフォンとデスクトップ音声を同時に録音します'}
      </div>
    </div>
  )
}

export default DeviceSelector