import React, { useState, useEffect } from 'react'
import { useAppContext } from '../../App'
import { useSettings } from '../../contexts/SettingsContext'
import './SettingsModal.css'

// 新しい型安全な設定型をインポート
import { 
  ApplicationSettings,
  createNotification,
  NotificationInfo
} from '../../state/ApplicationState'
import { 
  TranscriptionQuality, 
  SupportedLanguage 
} from '../../state/TranscriptionState'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

// 型安全な設定インターフェース（後方互換性のため既存インターフェースを保持しつつ、型を強化）
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
  quality: TranscriptionQuality  // 型安全な品質設定
  language: SupportedLanguage    // 型安全な言語設定
  chunkDurationSeconds: number
}

interface FileSettings {
  workspaceFolder: string
  autoSaveInterval: number
}

interface DetailedSettings {
  uiTheme: 'light' | 'dark' | 'auto'  // 型安全なテーマ設定
  logLevel: 'error' | 'warn' | 'info' | 'debug'  // 型安全なログレベル
  autoLineBreak: boolean
}

// 型安全なデバイス情報
interface SafeAudioDeviceInfo {
  deviceId: string
  label: string
  kind: 'audioinput' | 'audiooutput'
  groupId?: string
}

// 設定エラー情報
interface SettingsError {
  field: string
  message: string
  type: 'validation' | 'device' | 'permission' | 'unknown'
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

  // 型安全なローカル編集状態（既存設定との互換性を保持）
  const [localRecordingSettings, setLocalRecordingSettings] = useState<RecordingSettings>(settings.recording)
  const [localTranscriptionSettings, setLocalTranscriptionSettings] = useState<TranscriptionSettings>({
    ...settings.transcription,
    quality: settings.transcription.quality as TranscriptionQuality,
    language: settings.transcription.language as SupportedLanguage
  })
  const [localFileSettings, setLocalFileSettings] = useState<FileSettings>(settings.file)
  const [localDetailedSettings, setLocalDetailedSettings] = useState<DetailedSettings>({
    ...settings.detailed,
    uiTheme: settings.detailed.uiTheme as 'light' | 'dark' | 'auto',
    logLevel: settings.detailed.logLevel as 'error' | 'warn' | 'info' | 'debug'
  })

  // 型安全なデバイス管理
  const [availableDevices, setAvailableDevices] = useState<SafeAudioDeviceInfo[]>([])
  const [deviceLoadError, setDeviceLoadError] = useState<SettingsError | null>(null)
  
  // 設定検証エラー
  const [validationErrors, setValidationErrors] = useState<SettingsError[]>([])
  
  // 保存状態
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false)

  // 型安全なデバイス一覧取得
  const getAvailableDevices = async (): Promise<void> => {
    try {
      setDeviceLoadError(null)
      
      const devices = await navigator.mediaDevices.enumerateDevices()
      const audioInputDevices: SafeAudioDeviceInfo[] = devices
        .filter((device): device is MediaDeviceInfo => device.kind === 'audioinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `マイクロフォン ${device.deviceId.slice(0, 8)}`,
          kind: device.kind as 'audioinput',
          groupId: device.groupId
        }))
      
      setAvailableDevices(audioInputDevices)
      
    } catch (error) {
      const deviceError: SettingsError = {
        field: 'devices',
        message: error instanceof Error ? error.message : 'デバイス取得に失敗しました',
        type: error instanceof Error && error.name === 'NotAllowedError' ? 'permission' : 'device'
      }
      
      setDeviceLoadError(deviceError)
      console.error('デバイス取得エラー:', error)
    }
  }

  // デバイス取得のuseEffect
  useEffect(() => {
    if (isOpen) {
      getAvailableDevices()
    }
  }, [isOpen])

  // モーダルが開かれた時の初期化
  useEffect(() => {
    if (isOpen) {
      // 現在の設定をローカル状態に同期（型安全）
      setLocalRecordingSettings(settings.recording)
      setLocalTranscriptionSettings({
        ...settings.transcription,
        model: currentModel || settings.transcription.model,
        quality: settings.transcription.quality as TranscriptionQuality,
        language: settings.transcription.language as SupportedLanguage
      })
      setLocalFileSettings(settings.file)
      setLocalDetailedSettings({
        ...settings.detailed,
        uiTheme: settings.detailed.uiTheme as 'light' | 'dark' | 'auto',
        logLevel: settings.detailed.logLevel as 'error' | 'warn' | 'info' | 'debug'
      })
    }
  }, [isOpen, settings, currentModel])

  // 型安全な設定バリデーション
  const validateSettings = (): SettingsError[] => {
    const errors: SettingsError[] = []
    
    // 文字起こし設定の検証
    if (localTranscriptionSettings.chunkDurationSeconds < 1 || localTranscriptionSettings.chunkDurationSeconds > 300) {
      errors.push({
        field: 'transcription.chunkDurationSeconds',
        message: 'チャンク時間は1〜300秒の範囲で設定してください',
        type: 'validation'
      })
    }
    
    // ファイル設定の検証
    if (localFileSettings.autoSaveInterval < 0) {
      errors.push({
        field: 'file.autoSaveInterval',
        message: '自動保存間隔は0以上の値を設定してください',
        type: 'validation'
      })
    }
    
    // ワークスペースフォルダの検証
    if (!localFileSettings.workspaceFolder.trim()) {
      errors.push({
        field: 'file.workspaceFolder',
        message: 'ワークスペースフォルダを指定してください',
        type: 'validation'
      })
    }
    
    return errors
  }

  // 型安全な設定保存
  const handleSave = async (): Promise<void> => {
    try {
      setIsSaving(true)
      setValidationErrors([])
      setSaveSuccess(false)
      
      // 設定バリデーション
      const errors = validateSettings()
      if (errors.length > 0) {
        setValidationErrors(errors)
        setIsSaving(false)
        return
      }
      
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
      
      // 成功通知
      setSaveSuccess(true)
      setTimeout(() => {
        setSaveSuccess(false)
        onClose()
      }, 1000)
      
    } catch (error) {
      const saveError: SettingsError = {
        field: 'general',
        message: error instanceof Error ? error.message : '設定の保存に失敗しました',
        type: 'unknown'
      }
      
      setValidationErrors([saveError])
      console.error('設定保存エラー:', error)
    } finally {
      setIsSaving(false)
    }
  }

  // 型安全なキャンセル処理
  const handleCancel = (): void => {
    // エラー状態をリセット
    setValidationErrors([])
    setDeviceLoadError(null)
    setSaveSuccess(false)
    
    // ローカル設定を元に戻す（型安全）
    setLocalRecordingSettings(settings.recording)
    setLocalTranscriptionSettings({
      ...settings.transcription,
      quality: settings.transcription.quality as TranscriptionQuality,
      language: settings.transcription.language as SupportedLanguage
    })
    setLocalFileSettings(settings.file)
    setLocalDetailedSettings({
      ...settings.detailed,
      uiTheme: settings.detailed.uiTheme as 'light' | 'dark' | 'auto',
      logLevel: settings.detailed.logLevel as 'error' | 'warn' | 'info' | 'debug'
    })
    
    onClose()
  }

  // 型安全なリセット処理
  const handleReset = (): void => {
    if (window.confirm('すべての設定をデフォルトに戻しますか？')) {
      try {
        resetToDefaults()
        
        // ローカル状態も更新（デフォルト値に戻す）
        const defaultRecording: RecordingSettings = {
          microphone: {
            deviceId: '',
            deviceName: ''
          },
          desktopAudio: {
            enabled: false,
            deviceId: '',
            deviceName: ''
          }
        }
        
        const defaultTranscription: TranscriptionSettings = {
          model: 'kotoba-whisper-v1.0',
          quality: 'medium',
          language: 'ja',
          chunkDurationSeconds: 20
        }
        
        const defaultFile: FileSettings = {
          workspaceFolder: '',
          autoSaveInterval: 30
        }
        
        const defaultDetailed: DetailedSettings = {
          uiTheme: 'auto',
          logLevel: 'info',
          autoLineBreak: true
        }
        
        setLocalRecordingSettings(defaultRecording)
        setLocalTranscriptionSettings(defaultTranscription)
        setLocalFileSettings(defaultFile)
        setLocalDetailedSettings(defaultDetailed)
        
        // エラー状態をクリア
        setValidationErrors([])
        setDeviceLoadError(null)
        
        console.log('設定をデフォルトに戻しました')
        
      } catch (error) {
        const resetError: SettingsError = {
          field: 'general',
          message: 'デフォルト設定への復元に失敗しました',
          type: 'unknown'
        }
        
        setValidationErrors([resetError])
        console.error('設定リセットエラー:', error)
      }
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
                  quality: e.target.value as TranscriptionQuality
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
                  language: e.target.value as SupportedLanguage
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
                  uiTheme: e.target.value as 'light' | 'dark' | 'auto'
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
                  logLevel: e.target.value as 'error' | 'warn' | 'info' | 'debug'
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