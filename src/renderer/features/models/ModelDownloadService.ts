/**
 * モデルダウンロード管理サービス
 * Whisperモデルのダウンロード、インストール、管理を担当
 */

import { LoggerFactory, LogCategories } from '@renderer/shared/utils/LoggerFactory'
import type { ModelDownloadProgress, ModelInfo } from '@shared/types'
import {
  ModelDownloadOptions,
  ModelDownloadService as IModelDownloadService
} from './ModelTypes'
import { MODEL_CATALOG, findModelById, formatModelSize, repoToFolder } from '@shared/modelCatalog'


const logger = LoggerFactory.getLogger(LogCategories.SERVICE_FILE_MANAGER)

export class ModelDownloadService implements IModelDownloadService {
  private downloadProgress = new Map<string, ModelDownloadProgress>()
  private downloadControllers = new Map<string, AbortController>()
  private installedModels = new Set<string>()

  constructor() {
    this.initializeInstalledModels()
  }

  /**
   * インストール済みモデルの初期化
   */
  private async initializeInstalledModels(): Promise<void> {
    try {
      // 既存のモデルディレクトリをチェック
      await window.electronAPI.getModelsPath()
      const installedModels = await window.electronAPI.getInstalledModels()
      
      installedModels.forEach(modelId => {
        this.installedModels.add(modelId)
      })
    } catch (error) {
      logger.error('Failed to initialize installed models:', error)
    }
  }

/**
   * 利用可能なモデル一覧を取得
   *
   * 定義は src/shared/models.json（Python と同じ1枚）が正。
   */
  async getAvailableModels(): Promise<ModelInfo[]> {
    return MODEL_CATALOG.map((model) => ({
      id: model.id,
      name: model.name,
      description: model.description,
      size: formatModelSize(model.sizeBytes),
      sizeBytes: model.sizeBytes,
      version: '',
      license: model.license,
      licenseUrl: model.licenseUrl,
      downloadUrl: `https://huggingface.co/${model.huggingFaceRepo}/resolve/main`,
      checksum: '',
      isInstalled: this.installedModels.has(model.id),
      isDownloading: this.downloadProgress.has(model.id),
      downloadProgress: this.downloadProgress.get(model.id)?.progress || 0
    }))
  }

  /**
   * インストール済みモデル一覧を取得
   */
  async getInstalledModels(): Promise<ModelInfo[]> {
    const availableModels = await this.getAvailableModels()
    return availableModels.filter(model => model.isInstalled)
  }

  /**
   * モデルをダウンロード
   */
  async downloadModel(options: ModelDownloadOptions): Promise<void> {
    const { modelId, forceDownload = false, onProgress, onComplete, onError } = options

    try {
      // 既にダウンロード中かチェック（重複開始せず、呼び出し元には現在値だけ通知して黙って返す）
      if (this.downloadProgress.has(modelId)) {
        const existing = this.downloadProgress.get(modelId)!
        onProgress?.(existing)
        return
      }

      // 既にインストール済みかチェック
      if (this.installedModels.has(modelId) && !forceDownload) {
        throw new Error(`Model ${modelId} is already installed`)
      }

const modelInfo = findModelById(modelId)
      if (!modelInfo) {
        throw new Error(`Model ${modelId} not found`)
      }

// ModelInfo型に変換
const fullModelInfo: ModelInfo = {
        id: modelInfo.id,
        name: modelInfo.name,
        description: modelInfo.description,
        size: formatModelSize(modelInfo.sizeBytes),
        sizeBytes: modelInfo.sizeBytes,
        version: '',
        license: modelInfo.license,
        licenseUrl: modelInfo.licenseUrl,
        downloadUrl: `https://huggingface.co/${modelInfo.huggingFaceRepo}/resolve/main`,
        checksum: '',
        isInstalled: this.installedModels.has(modelId),
        isDownloading: false,
        downloadProgress: 0
      }

      // ダウンロード開始
      const controller = new AbortController()
      this.downloadControllers.set(modelId, controller)

      const progress: ModelDownloadProgress = {
        modelId,
        progress: 0,
        downloadedBytes: 0,
        totalBytes: modelInfo.sizeBytes,
        speed: 0,
        eta: 0,
        status: 'downloading'
      }

      this.downloadProgress.set(modelId, progress)

      // ダウンロード実行
      await this.performDownload(fullModelInfo, progress, controller.signal, onProgress)

      // ダウンロード完了
      progress.status = 'completed'
      progress.progress = 100
      this.installedModels.add(modelId)
      this.downloadProgress.delete(modelId)
      this.downloadControllers.delete(modelId)

      onComplete?.(modelId)

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      
      // エラー状態に設定
      const progress = this.downloadProgress.get(modelId)
      if (progress) {
        progress.status = 'error'
        this.downloadProgress.delete(modelId)
      }
      
      this.downloadControllers.delete(modelId)
      onError?.(errorMessage)
      throw error
    }
  }

  /**
   * 実際のダウンロード処理
   * faster-whisperのモデルダウンロード機能を利用
   */
  private async performDownload(
    modelInfo: ModelInfo,
    progress: ModelDownloadProgress,
    signal: AbortSignal,
    onProgress?: (progress: ModelDownloadProgress) => void
  ): Promise<void> {
    try {
      // 進捗リスナーを設定
      const progressListener = (data: { modelId: string, percent: number, message?: string, bytesDownloaded?: number, totalBytes?: number, speed?: number, eta?: number }) => {
        if (data.modelId === modelInfo.id) {
          progress.progress = data.percent
          if (typeof data.bytesDownloaded === 'number') {
            progress.downloadedBytes = data.bytesDownloaded
          } else {
            progress.downloadedBytes = Math.floor((data.percent / 100) * (data.totalBytes || modelInfo.sizeBytes))
          }
          progress.totalBytes = data.totalBytes || modelInfo.sizeBytes
          progress.speed = data.speed || 0
          progress.eta = data.eta || 0

          onProgress?.(progress)
        }
      }

      // 進捗イベントリスナーを追加（戻り値は購読解除関数）
      const unsubscribe = window.electronAPI.onModelDownloadProgress(progressListener)

      try {
        // faster-whisperのモデルダウンロードを実行
        await window.electronAPI.downloadWhisperModel(modelInfo.id)
      } finally {
        unsubscribe()
      }

    } catch (error) {
      if (signal.aborted) {
        progress.status = 'cancelled'
      } else {
        progress.status = 'error'
      }
      throw error
    }
  }

  /**
   * ダウンロードをキャンセル
   */
  async cancelDownload(modelId: string): Promise<void> {
    const controller = this.downloadControllers.get(modelId)
    if (controller) {
      controller.abort()
      this.downloadControllers.delete(modelId)
    }

    const progress = this.downloadProgress.get(modelId)
    if (progress) {
      progress.status = 'cancelled'
      this.downloadProgress.delete(modelId)
    }
    // Mainへもキャンセル要求
    try {
      await window.electronAPI.cancelModelDownload(modelId)
    } catch {}
  }

  /**
   * ダウンロードを一時停止
   */
  async pauseDownload(modelId: string): Promise<void> {
    const progress = this.downloadProgress.get(modelId)
    if (progress) {
      progress.status = 'paused'
    }
  }

  /**
   * ダウンロードを再開
   */
  async resumeDownload(modelId: string): Promise<void> {
    const progress = this.downloadProgress.get(modelId)
    if (progress) {
      progress.status = 'downloading'
    }
  }

  /**
   * モデルを削除
   */
  async removeModel(modelId: string): Promise<void> {
    try {
      const modelPath = await this.getModelPath(modelId)
      await window.electronAPI.removeModel(modelPath)
      
      this.installedModels.delete(modelId)
    } catch (error) {
      logger.error(`Failed to remove model ${modelId}:`, error)
      throw error
    }
  }

  /**
   * モデル更新をチェック
   */
  async checkForUpdates(): Promise<ModelInfo[]> {
    // 実装: リモートから最新バージョン情報を取得
    // 現在は簡易実装
    return []
  }

  /**
   * ダウンロード進捗を取得
   */
  getModelDownloadProgress(modelId: string): ModelDownloadProgress | null {
    return this.downloadProgress.get(modelId) || null
  }

  /**
   * ダウンロード中のモデルがあるかチェック
   */
  hasActiveDownloads(): boolean {
    return this.downloadProgress.size > 0
  }

  /**
   * ダウンロード中のモデル一覧を取得
   */
  getActiveDownloads(): string[] {
    return Array.from(this.downloadProgress.keys())
  }

  /**
   * モデルのパスを取得
   */
  private async getModelPath(modelId: string): Promise<string> {
    const modelsPath = await window.electronAPI.getModelsPath()
    const config = findModelById(modelId)
    if (!config) {
      throw new Error(`Unknown model: ${modelId}`)
    }
    // Main 側は models--<org>--<name>/snapshots/main に配置
    return `${modelsPath}/${repoToFolder(config.huggingFaceRepo)}`
  }
}

// シングルトンインスタンス
export const modelDownloadService = new ModelDownloadService()



