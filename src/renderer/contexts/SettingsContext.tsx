import { LoggerFactory, LogCategories } from '../utils/LoggerFactory'
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

// 設定の型定義
const logger = LoggerFactory.getLogger(LogCategories.UI_SETTINGS)

export interface RecordingSettings {
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

export interface TranscriptionSettings {
  model: string
  language: string
  chunkDurationSeconds: number
}

export interface FileSettings {
  workspaceFolder: string
}

export interface DetailedSettings {
  // 現在使用されていない設定項目は削除済み
}

/**
 * renderer 側が localStorage に持つユーザー設定
 *
 * main プロセスが settings.json で管理する AppSettings（@shared/types）
 * とは別の概念。名前で混同しないよう UserPreferences としている。
 */
export interface UserPreferences {
  recording: RecordingSettings
  transcription: TranscriptionSettings
  file: FileSettings
  detailed: DetailedSettings
}

// コンテキストの型定義
interface SettingsContextType {
  settings: UserPreferences
  updateRecordingSettings: (settings: Partial<RecordingSettings>) => void
  updateTranscriptionSettings: (settings: Partial<TranscriptionSettings>) => void
  updateFileSettings: (settings: Partial<FileSettings>) => void
  updateDetailedSettings: (settings: Partial<DetailedSettings>) => void
  resetToDefaults: () => void
  loadSettings: () => Promise<void>
  saveSettings: () => Promise<void>
}

// デフォルト設定
const DEFAULT_SETTINGS: UserPreferences = {
  recording: {
    microphone: {
      deviceId: 'default',
      deviceName: 'Microphone (Default)'
    },
    desktopAudio: {
      enabled: false,
      deviceId: 'default',
      deviceName: 'System Audio'
    }
  },
  transcription: {
    model: 'kotoba-whisper-v2.0-faster',
    language: 'ja',
    chunkDurationSeconds: 20
  },
  file: {
    workspaceFolder: 'D:\\work\\recordings'
  },
  detailed: {}
}

// コンテキストの作成
const SettingsContext = createContext<SettingsContextType | null>(null)

// カスタムフック
export const useSettings = (): SettingsContextType => {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}

// プロバイダーコンポーネント
interface SettingsProviderProps {
  children: ReactNode
}

export const SettingsProvider: React.FC<SettingsProviderProps> = ({ children }) => {
  const [settings, setSettings] = useState<UserPreferences>(DEFAULT_SETTINGS)

  // 設定の読み込み
  const loadSettings = async () => {
    try {
      // ローカルストレージから設定を読み込み
      const recordingSettings = localStorage.getItem('koeNote_recordingSettings')
      const transcriptionSettings = localStorage.getItem('koeNote_transcriptionSettings')
      const fileSettings = localStorage.getItem('koeNote_fileSettings')
      const detailedSettings = localStorage.getItem('koeNote_detailedSettings')

      const loadedSettings: UserPreferences = {
        recording: recordingSettings ? JSON.parse(recordingSettings) : DEFAULT_SETTINGS.recording,
        transcription: transcriptionSettings ? JSON.parse(transcriptionSettings) : DEFAULT_SETTINGS.transcription,
        file: fileSettings ? JSON.parse(fileSettings) : DEFAULT_SETTINGS.file,
        detailed: detailedSettings ? JSON.parse(detailedSettings) : DEFAULT_SETTINGS.detailed
      }

      setSettings(loadedSettings)
      logger.debug('設定を読み込みました:', loadedSettings)
    } catch (error) {
      logger.error('設定読み込みエラー:', error)
      setSettings(DEFAULT_SETTINGS)
    }
  }

  // 設定の保存
  const saveSettings = async () => {
    try {
      localStorage.setItem('koeNote_recordingSettings', JSON.stringify(settings.recording))
      localStorage.setItem('koeNote_transcriptionSettings', JSON.stringify(settings.transcription))
      localStorage.setItem('koeNote_fileSettings', JSON.stringify(settings.file))
      localStorage.setItem('koeNote_detailedSettings', JSON.stringify(settings.detailed))
      
      logger.debug('設定を保存しました:', settings)
    } catch (error) {
      logger.error('設定保存エラー:', error)
    }
  }

  // 初期化時に設定を読み込み
  useEffect(() => {
    loadSettings()
  }, [])

  // 録音設定の更新
  const updateRecordingSettings = (newSettings: Partial<RecordingSettings>) => {
    setSettings(prev => ({
      ...prev,
      recording: { ...prev.recording, ...newSettings }
    }))
  }

  // 文字起こし設定の更新
  const updateTranscriptionSettings = (newSettings: Partial<TranscriptionSettings>) => {
    setSettings(prev => ({
      ...prev,
      transcription: { ...prev.transcription, ...newSettings }
    }))
  }

  // ファイル設定の更新
  const updateFileSettings = (newSettings: Partial<FileSettings>) => {
    setSettings(prev => ({
      ...prev,
      file: { ...prev.file, ...newSettings }
    }))
  }

  // 詳細設定の更新
  const updateDetailedSettings = (newSettings: Partial<DetailedSettings>) => {
    setSettings(prev => ({
      ...prev,
      detailed: { ...prev.detailed, ...newSettings }
    }))
  }

  // デフォルト設定に戻す
  const resetToDefaults = () => {
    setSettings(DEFAULT_SETTINGS)
  }

  // 設定値が変更されたら自動保存
  useEffect(() => {
    if (settings !== DEFAULT_SETTINGS) {
      saveSettings()
    }
  }, [settings])

  const contextValue: SettingsContextType = {
    settings,
    updateRecordingSettings,
    updateTranscriptionSettings,
    updateFileSettings,
    updateDetailedSettings,
    resetToDefaults,
    loadSettings,
    saveSettings
  }

  return (
    <SettingsContext.Provider value={contextValue}>
      {children}
    </SettingsContext.Provider>
  )
}

export default SettingsContext