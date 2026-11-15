/**
 * モデル管理（renderer 側）の型
 *
 * モデル定義の正は src/shared/modelCatalog.ts（= src/shared/models.json）。
 * Python サーバーも同じJSONを読む。ここではrenderer固有の
 * ダウンロード制御の型だけを持つ。
 */
import type { ModelDownloadProgress, ModelInfo } from '@shared/types'

export type { ModelInfo }

export interface ModelDownloadOptions {
  modelId: string
  /** 既にインストール済みでも再ダウンロードする */
  forceDownload?: boolean
  onProgress?: (progress: ModelDownloadProgress) => void
  onComplete?: (modelId: string) => void
  onError?: (error: string) => void
}

/** ModelDownloadService が公開するメソッド（実装が持つもののみ） */
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

