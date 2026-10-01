/**
 * モデル管理（renderer 側）の型とローカル定義
 *
 * モデル情報・進捗の型は src/shared/types.ts を正とする。
 * ここでは renderer 固有の_download 制御_ だけを持つ。
 */
import type { ModelInfo, ModelDownloadProgress } from '@shared/types'

export type { ModelInfo }

/** 画面に出すためのモデル定義（インストール状態は実行時に決まる） */
export type ModelCatalogEntry = Omit<ModelInfo, 'isInstalled' | 'isDownloading' | 'downloadProgress'>

export interface ModelDownloadOptions {
  modelId: string
  forceDownload?: boolean
  verifyChecksum?: boolean
  onProgress?: (progress: ModelDownloadProgress) => void
  onComplete?: (modelId: string) => void
  onError?: (error: string) => void
}

/**
 * モデルダウンロードサービスの公開API（実装が持つメソッドのみ）
 *
 * 以前は実装に存在しない pause/resume/checkForUpdates などを含む
 * interfaceを定義していたため、型としては嘘になっていた。
 */
export interface ModelDownloadService {
  getAvailableModels(): Promise<ModelInfo[]>
  getInstalledModels(): Promise<ModelInfo[]>
  downloadModel(options: ModelDownloadOptions): Promise<void>
  cancelDownload(modelId: string): Promise<void>
  removeModel(modelId: string): Promise<void>
  getModelDownloadProgress(modelId: string): ModelDownloadProgress | null
  hasActiveDownloads(): boolean
  getActiveDownloads(): string[]
}

// TODO(C3): この定義は models.json を正とする。4箇所に散らばった
// モデルカタログ（main.ts の MODEL_CONFIGS / models.json / この配列 /
// Python の config.py）を統合し、この配列は削除する。
/** 旧: ハードコードされたモデル一覧。Phase C3 で models.json に統合する */
export const AVAILABLE_MODELS: ModelCatalogEntry[] = [
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
