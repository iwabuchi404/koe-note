import { 
  TranscriptionQuality, 
  SupportedLanguage 
} from '../../../state/TranscriptionState'

// 型安全な設定インターフェース（後方互換性のため既存インターフェースを保持しつつ、型を強化）
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
  language: SupportedLanguage    // 型安全な言語設定
  chunkDurationSeconds: number
}

export interface FileSettings {
  workspaceFolder: string
}

export interface DetailedSettings {
  // 現在使用されていない設定項目は削除済み
}

// 型安全なデバイス情報
export interface SafeAudioDeviceInfo {
  deviceId: string
  label: string
  kind: 'audioinput' | 'audiooutput'
  groupId?: string
}

// 設定エラー情報
export interface SettingsError {
  field: string
  message: string
  type: 'validation' | 'device' | 'permission' | 'unknown'
}

// 設定パネル共通プロパティ
export interface SettingsPanelProps {
  validationErrors: SettingsError[]
  isDisabled?: boolean
}