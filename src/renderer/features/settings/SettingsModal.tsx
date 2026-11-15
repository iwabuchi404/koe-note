import { LoggerFactory, LogCategories } from '@renderer/shared/utils/LoggerFactory'
import React, { useState, useEffect } from 'react'
import { useSettings } from '@renderer/features/settings/SettingsContext'
import { ModelManager } from '@renderer/features/models/ModelManager'
import { modelDownloadService } from '@renderer/features/models/ModelDownloadService'
import './SettingsModal.css'

import { SupportedLanguage } from './types'

const logger = LoggerFactory.getLogger(LogCategories.UI_SETTINGS)

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
  language: SupportedLanguage    // 型安全な言語設定
  chunkDurationSeconds: number
}

interface FileSettings {
  workspaceFolder: string
}

interface DetailedSettings {
  // 現在使用されていない設定項目は削除済み
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
  // モーダル内のモデル選択状態（AppContext からローカルへ降格）
  const [currentModel, setCurrentModel] = useState<string>('small')
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
    language: settings.transcription.language as SupportedLanguage
  })
  const [localFileSettings, setLocalFileSettings] = useState<FileSettings>(settings.file)
  const [localDetailedSettings, setLocalDetailedSettings] = useState<DetailedSettings>(settings.detailed)

  // 型安全なデバイス管理
  const [availableDevices, setAvailableDevices] = useState<SafeAudioDeviceInfo[]>([])
  const [deviceLoadError, setDeviceLoadError] = useState<SettingsError | null>(null)
  
  // 設定検証エラー
  const [validationErrors, setValidationErrors] = useState<SettingsError[]>([])
  
  // 保存状態
  const [isSaving, setIsSaving] = useState<boolean>(false)
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false)
  
  // タブ管理
  const [activeTab, setActiveTab] = useState<'general' | 'models'>('general')
  
  // ダウンロード状態監視
  const [hasActiveDownloads, setHasActiveDownloads] = useState(false)
  const [activeDownloads, setActiveDownloads] = useState<string[]>([])

  // インストール済みモデル
  const [installedModels, setInstalledModels] = useState<{ id: string; name?: string }[]>([])

  useEffect(() => {
    const loadInstalled = async () => {
      try {
        const models = await modelDownloadService.getInstalledModels()
        setInstalledModels(models.map(m => ({ id: m.id, name: m.name })))
      } catch (e) {
        logger.warn('インストール済みモデル取得失敗:', e)
      }
    }
    loadInstalled()
  }, [])

  // ダウンロード状態を監視
  useEffect(() => {
    const checkDownloads = () => {
      const hasDownloads = modelDownloadService.hasActiveDownloads()
      const downloads = modelDownloadService.getActiveDownloads()
      setHasActiveDownloads(hasDownloads)
      setActiveDownloads(downloads)
    }
    
    // 初回チェック
    checkDownloads()
    
    // 定期的にチェック（1秒間隔）
    const interval = setInterval(checkDownloads, 1000)
    
    return () => clearInterval(interval)
  }, [])

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
      logger.error('デバイス取得エラー:', error)
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
        language: settings.transcription.language as SupportedLanguage
      })
      setLocalFileSettings(settings.file)
      setLocalDetailedSettings(settings.detailed)
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

      // モデルがインストール済みか確認（未インストールでも保存は継続し、サーバー切替のみスキップ）
      let selectedModelInstalled = false
      try {
        const installed = await modelDownloadService.getInstalledModels()
        selectedModelInstalled = installed.some(m => m.id === localTranscriptionSettings.model)
      } catch (e) {
        logger.warn('インストール済みモデル確認失敗（保存は継続）:', e)
      }
      
      // SettingsContextに設定を反映
      updateRecordingSettings(localRecordingSettings)
      updateTranscriptionSettings(localTranscriptionSettings)
      updateFileSettings(localFileSettings)
      updateDetailedSettings(localDetailedSettings)
      
      // モデル設定をグローバル状態に反映（未インストールでも選択自体は保持）
      setCurrentModel(localTranscriptionSettings.model)

      // サーバーが起動中かつ選択モデルがインストール済みならモデル変更を依頼
      try {
        const serverStatus = await window.electronAPI.speechGetServerStatus?.()
        if (serverStatus?.isRunning && selectedModelInstalled) {
          await window.electronAPI.speechChangeModel(localTranscriptionSettings.model)
        }
      } catch (e) {
        logger.warn('モデル変更要求に失敗しました（後で再試行可）:', e)
      }
      
      logger.debug('設定を保存しました:', {
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
      logger.error('設定保存エラー:', error)
    } finally {
      setIsSaving(false)
    }
  }

  // 型安全なキャンセル処理
  const handleCancel = (): void => {
    // ダウンロード中の場合、警告を表示
    if (hasActiveDownloads) {
      const downloadNames = activeDownloads.join(', ')
      const confirmed = window.confirm(
        `モデルのダウンロードが進行中です（${downloadNames}）。\n` +
        `設定を閉じるとダウンロード状態が失われます。\n` +
        `本当に閉じますか？`
      )
      if (!confirmed) {
        return
      }
    }
    
    // エラー状態をリセット
    setValidationErrors([])
    setDeviceLoadError(null)
    setSaveSuccess(false)
    
    // ローカル設定を元に戻す（型安全）
    setLocalRecordingSettings(settings.recording)
    setLocalTranscriptionSettings({
      ...settings.transcription,
      language: settings.transcription.language as SupportedLanguage
    })
    setLocalFileSettings(settings.file)
    setLocalDetailedSettings(settings.detailed)
    
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
          language: 'ja',
          chunkDurationSeconds: 20
        }
        
        const defaultFile: FileSettings = {
          workspaceFolder: ''
        }
        
        const defaultDetailed: DetailedSettings = {}
        
        setLocalRecordingSettings(defaultRecording)
        setLocalTranscriptionSettings(defaultTranscription)
        setLocalFileSettings(defaultFile)
        setLocalDetailedSettings(defaultDetailed)
        
        // エラー状態をクリア
        setValidationErrors([])
        setDeviceLoadError(null)
        
        logger.debug('設定をデフォルトに戻しました')
        
      } catch (error) {
        const resetError: SettingsError = {
          field: 'general',
          message: 'デフォルト設定への復元に失敗しました',
          type: 'unknown'
        }
        
        setValidationErrors([resetError])
        logger.error('設定リセットエラー:', error)
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
      logger.error('フォルダ選択エラー:', error)
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
            onClick={handleCancel}
            title="閉じる"
          >
            ✕
          </button>
        </div>

        <div className="settings-modal__content">
          {/* タブナビゲーション */}
          <div className="settings-modal__tabs">
            <button
              className={`settings-tab ${activeTab === 'general' ? 'active' : ''}`}
              onClick={() => setActiveTab('general')}
            >
              一般設定
            </button>
            <button
              className={`settings-tab ${activeTab === 'models' ? 'active' : ''}`}
              onClick={() => setActiveTab('models')}
            >
              モデル管理
            </button>
          </div>

          {activeTab === 'general' ? (
            <div className="settings-modal__body">
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
                disabled={installedModels.length === 0}
              >
                {installedModels.length > 0 ? (
                  installedModels.map(m => (
                    <option key={m.id} value={m.id}>{m.name || m.id}</option>
                  ))
                ) : (
                  <option value="" disabled>モデルをダウンロードしてください</option>
                )}
              </select>
              {installedModels.length === 0 && (
                <div className="settings-hint">📥 モデル管理タブからモデルをダウンロードしてください</div>
              )}
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

          </section>

            </div>
          ) : (
            <div className="settings-modal__body">
              <ModelManager
                currentModel={currentModel}
                onModelChange={setCurrentModel}
              />
            </div>
          )}
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