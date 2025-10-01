/**
 * モデルダウンロード管理サービス
 * Whisperモデルのダウンロード、インストール、管理を担当
 */

import { ModelInfo, DownloadProgress, ModelDownloadOptions, ModelDownloadService as IModelDownloadService } from '../types/ModelTypes'
import { AVAILABLE_MODELS } from '../types/ModelTypes'

export class ModelDownloadService implements IModelDownloadService {
  private downloadProgress = new Map<string, DownloadProgress>()
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
      const modelsPath = await window.electronAPI.getModelsPath()
      const installedModels = await window.electronAPI.getInstalledModels()
      
      installedModels.forEach(modelId => {
        this.installedModels.add(modelId)
      })
    } catch (error) {
      console.error('Failed to initialize installed models:', error)
    }
  }

  /**
   * 利用可能なモデル一覧を取得
   */
  async getAvailableModels(): Promise<ModelInfo[]> {
    return AVAILABLE_MODELS.map(model => ({
      ...model,
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
    const { modelId, forceDownload = false, verifyChecksum = true, onProgress, onComplete, onError } = options

    try {
      // 既にダウンロード中かチェック
      if (this.downloadProgress.has(modelId)) {
        throw new Error(`Model ${modelId} is already being downloaded`)
      }

      // 既にインストール済みかチェック
      if (this.installedModels.has(modelId) && !forceDownload) {
        throw new Error(`Model ${modelId} is already installed`)
      }

      const modelInfo = AVAILABLE_MODELS.find(m => m.id === modelId)
      if (!modelInfo) {
        throw new Error(`Model ${modelId} not found`)
      }

      // ModelInfo型に変換
      const fullModelInfo: ModelInfo = {
        ...modelInfo,
        isInstalled: this.installedModels.has(modelId),
        isDownloading: false,
        downloadProgress: 0
      }

      // ダウンロード開始
      const controller = new AbortController()
      this.downloadControllers.set(modelId, controller)

      const progress: DownloadProgress = {
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
    progress: DownloadProgress,
    signal: AbortSignal,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<void> {
    try {
      // 進捗リスナーを設定
      const progressListener = (event: any, data: { modelId: string, percent: number, message: string }) => {
        if (data.modelId === modelInfo.id) {
          progress.progress = data.percent
          progress.downloadedBytes = Math.floor((data.percent / 100) * modelInfo.sizeBytes)
          progress.totalBytes = modelInfo.sizeBytes
          progress.speed = 0 // faster-whisperでは速度計算が困難
          progress.eta = 0   // faster-whisperではETA計算が困難

          onProgress?.(progress)
        }
      }

      // 進捗イベントリスナーを追加
      window.electronAPI.on('models:downloadProgress', progressListener)

      // faster-whisperのモデルダウンロードを実行
      await window.electronAPI.downloadWhisperModel(modelInfo.id)

      // 進捗イベントリスナーを削除
      window.electronAPI.removeListener('models:downloadProgress', progressListener)

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
      console.error(`Failed to remove model ${modelId}:`, error)
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
  getDownloadProgress(modelId: string): DownloadProgress | null {
    return this.downloadProgress.get(modelId) || null
  }

  /**
   * モデルのパスを取得
   */
  private async getModelPath(modelId: string): Promise<string> {
    const modelsPath = await window.electronAPI.getModelsPath()
    return `${modelsPath}/${modelId}`
  }
}

// シングルトンインスタンス
export const modelDownloadService = new ModelDownloadService()
