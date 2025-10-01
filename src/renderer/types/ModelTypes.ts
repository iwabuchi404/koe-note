/**
 * モデル管理関連の型定義
 */

export interface ModelInfo {
  id: string
  name: string
  description: string
  size: string
  sizeBytes: number
  version: string
  license: string
  licenseUrl?: string
  downloadUrl: string
  checksum: string
  isInstalled: boolean
  isDownloading: boolean
  downloadProgress: number
  installPath?: string
  lastUpdated?: Date
}

export interface DownloadProgress {
  modelId: string
  progress: number
  downloadedBytes: number
  totalBytes: number
  speed: number
  eta: number
  status: 'downloading' | 'paused' | 'completed' | 'error' | 'cancelled'
}

export interface ModelDownloadOptions {
  modelId: string
  forceDownload?: boolean
  verifyChecksum?: boolean
  onProgress?: (progress: DownloadProgress) => void
  onComplete?: (modelId: string) => void
  onError?: (error: string) => void
}

export interface ModelManagerState {
  availableModels: ModelInfo[]
  installedModels: ModelInfo[]
  downloadingModels: Set<string>
  error: string | null
  isInitialized: boolean
}

export interface ModelDownloadService {
  // モデル一覧取得
  getAvailableModels(): Promise<ModelInfo[]>
  
  // インストール済みモデル取得
  getInstalledModels(): Promise<ModelInfo[]>
  
  // モデルダウンロード
  downloadModel(options: ModelDownloadOptions): Promise<void>
  
  // ダウンロードキャンセル
  cancelDownload(modelId: string): Promise<void>
  
  // ダウンロード一時停止/再開
  pauseDownload(modelId: string): Promise<void>
  resumeDownload(modelId: string): Promise<void>
  
  // モデル削除
  removeModel(modelId: string): Promise<void>
  
  // モデル更新チェック
  checkForUpdates(): Promise<ModelInfo[]>
  
  // ダウンロード進捗取得
  getDownloadProgress(modelId: string): DownloadProgress | null
  
  // ダウンロード中チェック
  hasActiveDownloads(): boolean
  
  // ダウンロード中モデル一覧取得
  getActiveDownloads(): string[]
}

// 利用可能なモデル定義
export const AVAILABLE_MODELS: Omit<ModelInfo, 'isInstalled' | 'isDownloading' | 'downloadProgress'>[] = [
  {
    id: 'small',
    name: 'Whisper Small',
    description: '軽量・高速モデル（244MB）',
    size: '244MB',
    sizeBytes: 244 * 1024 * 1024,
    version: '1.0.0',
    license: 'MIT',
    licenseUrl: 'https://huggingface.co/Systran/faster-whisper-small',
    downloadUrl: 'https://huggingface.co/Systran/faster-whisper-small/resolve/main',
    checksum: 'sha256:...'
  },
  {
    id: 'kotoba-whisper-v2.0-faster',
    name: 'Kotoba Whisper v2.0',
    description: '日本語最適化モデル（769MB）',
    size: '769MB',
    sizeBytes: 769 * 1024 * 1024,
    version: '2.0.0',
    license: 'MIT',
    licenseUrl: 'https://huggingface.co/kotoba-tech/kotoba-whisper-v2.0-faster',
    downloadUrl: 'https://huggingface.co/kotoba-tech/kotoba-whisper-v2.0-faster/resolve/main',
    checksum: 'sha256:...'
  },
  {
    id: 'large-v2',
    name: 'Whisper Large v2',
    description: '高精度モデル（3.1GB）',
    size: '3.1GB',
    sizeBytes: 3.1 * 1024 * 1024 * 1024,
    version: '1.0.0',
    license: 'MIT',
    licenseUrl: 'https://huggingface.co/Systran/faster-whisper-large-v2',
    downloadUrl: 'https://huggingface.co/Systran/faster-whisper-large-v2/resolve/main',
    checksum: 'sha256:...'
  }
]
