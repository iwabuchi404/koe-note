import { AudioFile } from '../../../App'

// ファイル管理用の拡張インターフェース
export interface ExtendedAudioFile extends AudioFile {
  hasTranscriptionFile?: boolean
  transcriptionPath?: string
  isRecording?: boolean
  isSelected?: boolean
}

// ファイル操作結果
export interface FileOperationResult {
  success: boolean
  message: string
  error?: Error
}

// ファイル表示設定
export interface FileDisplaySettings {
  showFileSize: boolean
  showDuration: boolean
  showFormat: boolean
  showCreatedDate: boolean
  sortBy: 'name' | 'created' | 'duration' | 'size'
  sortOrder: 'asc' | 'desc'
  groupByType: boolean
}

// ファイルフィルター設定
export interface FileFilterSettings {
  showAudioFiles: boolean
  showTranscriptionFiles: boolean
  showRecordingFiles: boolean
  fileFormat: string[]
  searchQuery: string
}

// ファイル選択状態
export interface FileSelectionState {
  selectedFileId: string | null
  multiSelection: string[]
  lastSelectedIndex: number
}

// ファイルアクション
export type FileAction = 
  | 'select'
  | 'delete'
  | 'rename'
  | 'duplicate'
  | 'export'
  | 'showInFolder'
  | 'toggleTranscription'

// ファイルコンテキストメニュー項目
export interface FileContextMenuItem {
  id: FileAction
  label: string
  icon: string
  disabled?: boolean
  separator?: boolean
}

// ファイル統計情報
export interface FileStatistics {
  totalFiles: number
  totalSize: number
  totalDuration: number
  audioFileCount: number
  transcriptionFileCount: number
  recordingFileCount: number
}

// ファイル管理プロパティ共通
export interface FileManagementProps {
  files: ExtendedAudioFile[]
  selectedFileId: string | null
  onFileSelect: (fileId: string) => void
  onFileAction: (action: FileAction, fileId: string) => void
  isLoading?: boolean
  error?: string
}