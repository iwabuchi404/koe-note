import React, { useState, useEffect } from 'react'
import { useAppContext } from '../../App'
import { useSettings } from '../../contexts/SettingsContext'
import './SettingsModal.css'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

interface RecordingSettings {
  microphone: {
    deviceId: string
    deviceName: string
  }
  desktopAudio: {
    enabled: boolean
    deviceId: string
    deviceName: string
  }
}

interface TranscriptionSettings {
  model: string
  quality: string
  language: string
  chunkDurationSeconds: number
}

interface FileSettings {
  workspaceFolder: string
  autoSaveInterval: number
}

interface DetailedSettings {
  uiTheme: string
  logLevel: string
  autoLineBreak: boolean
}

/**
 * 統合設定モーダルコンポーネント
 * アプリケーション全体の設定を集約管理
 */
const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { currentModel, setCurrentModel } = useAppContext()
  const { 
    settings,
    updateRecordingSettings,
    updateTranscriptionSettings,
    updateFileSettings,
    updateDetailedSettings,
    resetToDefaults
  } = useSettings()

  // ローカル編集用の状態（モーダル内での変更を一時保存）
  const [localRecordingSettings, setLocalRecordingSettings] = useState(settings.recording)
  const [localTranscriptionSettings, setLocalTranscriptionSettings] = useState(settings.transcription)
  const [localFileSettings, setLocalFileSettings] = useState(settings.file)
  const [localDetailedSettings, setLocalDetailedSettings] = useState(settings.detailed)

  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([])

  // 利用可能なデバイス一覧を取得
  useEffect(() => {
    const getDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        setAvailableDevices(devices.filter(device => device.kind === 'audioinput'))
      } catch (error) {
        console.error('デバイス取得エラー:', error)
      }
    }

    if (isOpen) {
      getDevices()
    }
  }, [isOpen])

  // モーダルが開かれた時の初期化
  useEffect(() => {
    if (isOpen) {
      // 現在の設定をローカル状態に同期
      setLocalRecordingSettings(settings.recording)
      setLocalTranscriptionSettings({
        ...settings.transcription,
        model: currentModel || settings.transcription.model
      })
      setLocalFileSettings(settings.file)
      setLocalDetailedSettings(settings.detailed)
    }
  }, [isOpen, settings, currentModel])

  // 設定保存
  const handleSave = () => {
    // SettingsContextに設定を反映
    updateRecordingSettings(localRecordingSettings)
    updateTranscriptionSettings(localTranscriptionSettings)
    updateFileSettings(localFileSettings)
    updateDetailedSettings(localDetailedSettings)
    
    // モデル設定をグローバル状態に反映
    setCurrentModel(localTranscriptionSettings.model)
    
    console.log('設定を保存しました:', {
      recording: localRecordingSettings,
      transcription: localTranscriptionSettings,
      file: localFileSettings,
      detailed: localDetailedSettings
    })
    
    onClose()
  }

  // キャンセル
  const handleCancel = () => {
    // ローカル設定を元に戻す
    setLocalRecordingSettings(settings.recording)
    setLocalTranscriptionSettings(settings.transcription)
    setLocalFileSettings(settings.file)
    setLocalDetailedSettings(settings.detailed)
    onClose()
  }

  // デフォルトに戻す
  const handleReset = () => {
    if (window.confirm('すべての設定をデフォルトに戻しますか？')) {
      resetToDefaults()
      // ローカル状態も更新
      setLocalRecordingSettings(settings.recording)
      setLocalTranscriptionSettings(settings.transcription)
      setLocalFileSettings(settings.file)
      setLocalDetailedSettings(settings.detailed)
    }
  }

  // ワークスペースフォルダ選択
  const handleSelectWorkspaceFolder = async () => {
    try {
      const result = await window.electronAPI.selectFolder()
      if (result) {
        setLocalFileSettings(prev => ({
          ...prev,
          workspaceFolder: result
        }))
      }
    } catch (error) {
      console.error('フォルダ選択エラー:', error)
    }
  }

  if (!isOpen) return null

  return (
    <div className="settings-modal-overlay">
      <div className="settings-modal">
        <div className="settings-modal__header">
          <h2>⚙️ KoeNote 設定</h2>
          <button 
            className="settings-modal__close"
            onClick={onClose}
            title="閉じる"
          >
            ✕
          </button>
        </div>

        <div className="settings-modal__content">
          {/* 録音設定 */}
          <section className="settings-section">
            <h3>📺 録音設定</h3>
            
            <div className="settings-item">
              <label htmlFor="mic-device">入力デバイス:</label>
              <select 
                id="mic-device"
                value={localRecordingSettings.microphone.deviceId}
                onChange={(e) => {
                  const device = availableDevices.find(d => d.deviceId === e.target.value)
                  setLocalRecordingSettings(prev => ({
                    ...prev,
                    microphone: {
                      deviceId: e.target.value,
                      deviceName: device?.label || 'Unknown Device'
                    }
                  }))
                }}
              >
                <option value="default">Microphone (Default)</option>
                {availableDevices.map(device => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Device ${device.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="settings-item">
              <label>
                <input
                  type="checkbox"
                  checked={localRecordingSettings.desktopAudio.enabled}
                  onChange={(e) => setLocalRecordingSettings(prev => ({
                    ...prev,
                    desktopAudio: { ...prev.desktopAudio, enabled: e.target.checked }
                  }))}
                />
                デスクトップ音声を録音
              </label>
            </div>
            
            <div className="settings-note">
              ※ 録音・文字起こしタブの設定と同期されます
            </div>
          </section>

          {/* 文字起こし設定 */}
          <section className="settings-section">
            <h3>🤖 文字起こし設定</h3>
            
            <div className="settings-item">
              <label htmlFor="transcription-model">モデル:</label>
              <select
                id="transcription-model"
                value={localTranscriptionSettings.model}
                onChange={(e) => setLocalTranscriptionSettings(prev => ({
                  ...prev,
                  model: e.target.value
                }))}
              >
                <option value="kotoba-whisper-v1.0">Kotoba-Whisper v1.0</option>
                <option value="whisper-large">Whisper Large</option>
                <option value="whisper-base">Whisper Base</option>
              </select>
            </div>

            <div className="settings-item">
              <label htmlFor="transcription-quality">品質:</label>
              <select
                id="transcription-quality"
                value={localTranscriptionSettings.quality}
                onChange={(e) => setLocalTranscriptionSettings(prev => ({
                  ...prev,
                  quality: e.target.value
                }))}
              >
                <option value="high">高精度（処理時間長）</option>
                <option value="medium">標準</option>
                <option value="fast">高速（精度低）</option>
              </select>
            </div>

            <div className="settings-item">
              <label htmlFor="transcription-language">言語:</label>
              <select
                id="transcription-language"
                value={localTranscriptionSettings.language}
                onChange={(e) => setLocalTranscriptionSettings(prev => ({
                  ...prev,
                  language: e.target.value
                }))}
              >
                <option value="ja">日本語</option>
                <option value="en">English</option>
                <option value="auto">自動検出</option>
              </select>
            </div>

            <div className="settings-item">
              <label htmlFor="chunk-duration">チャンク分割時間:</label>
              <select
                id="chunk-duration"
                value={localTranscriptionSettings.chunkDurationSeconds}
                onChange={(e) => setLocalTranscriptionSettings(prev => ({
                  ...prev,
                  chunkDurationSeconds: parseInt(e.target.value)
                }))}
              >
                <option value={10}>10秒</option>
                <option value={20}>20秒</option>
                <option value={30}>30秒</option>
              </select>
              <span className="settings-hint">リアルタイム処理用</span>
            </div>
          </section>

          {/* ファイル設定 */}
          <section className="settings-section">
            <h3>📁 ファイル設定</h3>
            
            <div className="settings-item">
              <label htmlFor="workspace-folder">作業フォルダ:</label>
              <div className="folder-input">
                <input
                  type="text"
                  id="workspace-folder"
                  value={localFileSettings.workspaceFolder}
                  readOnly
                />
                <button 
                  type="button"
                  onClick={handleSelectWorkspaceFolder}
                  className="btn btn--secondary"
                >
                  参照...
                </button>
              </div>
              <div className="settings-hint">録音・文字起こし結果の保存・読み込み先</div>
            </div>

            <div className="settings-item">
              <label htmlFor="auto-save-interval">自動保存間隔:</label>
              <select
                id="auto-save-interval"
                value={localFileSettings.autoSaveInterval}
                onChange={(e) => setLocalFileSettings(prev => ({
                  ...prev,
                  autoSaveInterval: parseInt(e.target.value)
                }))}
              >
                <option value={1}>1秒</option>
                <option value={3}>3秒</option>
                <option value={5}>5秒</option>
                <option value={10}>10秒</option>
              </select>
            </div>
          </section>

          {/* 詳細設定 */}
          <section className="settings-section">
            <h3>🔧 詳細設定</h3>
            
            <div className="settings-item">
              <label htmlFor="ui-theme">UIテーマ:</label>
              <select
                id="ui-theme"
                value={localDetailedSettings.uiTheme}
                onChange={(e) => setLocalDetailedSettings(prev => ({
                  ...prev,
                  uiTheme: e.target.value
                }))}
              >
                <option value="light">ライト</option>
                <option value="dark">ダーク</option>
                <option value="auto">システム設定に従う</option>
              </select>
            </div>

            <div className="settings-item">
              <label htmlFor="log-level">ログレベル:</label>
              <select
                id="log-level"
                value={localDetailedSettings.logLevel}
                onChange={(e) => setLocalDetailedSettings(prev => ({
                  ...prev,
                  logLevel: e.target.value
                }))}
              >
                <option value="error">ERROR</option>
                <option value="warn">WARN</option>
                <option value="info">INFO</option>
                <option value="debug">DEBUG</option>
              </select>
            </div>

            <div className="settings-item">
              <label>
                <input
                  type="checkbox"
                  checked={localDetailedSettings.autoLineBreak}
                  onChange={(e) => setLocalDetailedSettings(prev => ({
                    ...prev,
                    autoLineBreak: e.target.checked
                  }))}
                />
                文字起こし結果の自動改行
              </label>
            </div>
          </section>
        </div>

        <div className="settings-modal__footer">
          <div className="settings-modal__actions">
            <button 
              type="button" 
              onClick={handleReset}
              className="btn btn--secondary"
            >
              デフォルトに戻す
            </button>
            <div className="settings-modal__main-actions">
              <button 
                type="button" 
                onClick={handleCancel}
                className="btn btn--secondary"
              >
                キャンセル
              </button>
              <button 
                type="button" 
                onClick={handleSave}
                className="btn btn--primary"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SettingsModal