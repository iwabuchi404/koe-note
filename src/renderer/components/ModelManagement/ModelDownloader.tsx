/**
 * モデルダウンロードUIコンポーネント
 */

import React, { useState, useEffect } from 'react'
import { ModelInfo, DownloadProgress } from '../../types/ModelTypes'
import { modelDownloadService } from '../../services/ModelDownloadService'
import './ModelDownloader.css'

interface ModelDownloaderProps {
  onModelInstalled?: (modelId: string) => void
  onError?: (error: string) => void
}

export const ModelDownloader: React.FC<ModelDownloaderProps> = ({
  onModelInstalled,
  onError
}) => {
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([])
  const [downloadingModels, setDownloadingModels] = useState<Set<string>>(new Set())
  const [downloadProgress, setDownloadProgress] = useState<Map<string, DownloadProgress>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadAvailableModels()
  }, [])

  const loadAvailableModels = async () => {
    try {
      setIsLoading(true)
      const models = await modelDownloadService.getAvailableModels()
      setAvailableModels(models)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load models'
      setError(errorMessage)
      onError?.(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDownload = async (modelId: string) => {
    try {
      setError(null)
      setDownloadingModels(prev => new Set(prev).add(modelId))

      await modelDownloadService.downloadModel({
        modelId,
        onProgress: (progress) => {
          setDownloadProgress(prev => new Map(prev).set(modelId, progress))
        },
        onComplete: (completedModelId) => {
          setDownloadingModels(prev => {
            const newSet = new Set(prev)
            newSet.delete(completedModelId)
            return newSet
          })
          setDownloadProgress(prev => {
            const newMap = new Map(prev)
            newMap.delete(completedModelId)
            return newMap
          })
          onModelInstalled?.(completedModelId)
          loadAvailableModels() // リストを更新
        },
        onError: (errorMessage) => {
          setError(errorMessage)
          onError?.(errorMessage)
          setDownloadingModels(prev => {
            const newSet = new Set(prev)
            newSet.delete(modelId)
            return newSet
          })
        }
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Download failed'
      setError(errorMessage)
      onError?.(errorMessage)
    }
  }

  const handleCancel = async (modelId: string) => {
    try {
      await modelDownloadService.cancelDownload(modelId)
      setDownloadingModels(prev => {
        const newSet = new Set(prev)
        newSet.delete(modelId)
        return newSet
      })
      setDownloadProgress(prev => {
        const newMap = new Map(prev)
        newMap.delete(modelId)
        return newMap
      })
    } catch (err) {
      console.error('Failed to cancel download:', err)
    }
  }

  const handleRemove = async (modelId: string) => {
    try {
      await modelDownloadService.removeModel(modelId)
      loadAvailableModels() // リストを更新
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to remove model'
      setError(errorMessage)
      onError?.(errorMessage)
    }
  }

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatSpeed = (bytesPerSecond: number): string => {
    return formatBytes(bytesPerSecond) + '/s'
  }

  const formatETA = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`
    return `${Math.round(seconds / 3600)}h`
  }

  if (isLoading) {
    return (
      <div className="model-downloader">
        <div className="loading">Loading available models...</div>
      </div>
    )
  }

  return (
    <div className="model-downloader">
      <h3>Model Management</h3>
      
      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="models-list">
        {availableModels.map((model) => {
          const isDownloading = downloadingModels.has(model.id)
          const progress = downloadProgress.get(model.id)
          const isInstalled = model.isInstalled

          return (
            <div key={model.id} className="model-item">
              <div className="model-info">
                <h4>{model.name}</h4>
                <p className="model-description">{model.description}</p>
                <div className="model-details">
                  <span className="model-size">Size: {model.size}</span>
                  <span className="model-license">License: {model.license}</span>
                  <span className="model-version">Version: {model.version}</span>
                </div>
              </div>

              <div className="model-actions">
                {isInstalled ? (
                  <div className="installed-status">
                    <span className="status-badge installed">✓ Installed</span>
                    <button 
                      className="btn btn-danger"
                      onClick={() => handleRemove(model.id)}
                    >
                      Remove
                    </button>
                  </div>
                ) : isDownloading ? (
                  <div className="downloading-status">
                    <div className="progress-info">
                      <div className="progress-bar">
                        <div 
                          className="progress-fill"
                          style={{ width: `${progress?.progress || 0}%` }}
                        />
                      </div>
                      <div className="progress-details">
                        <span>{Math.round(progress?.progress || 0)}%</span>
                        {progress && (
                          <>
                            <span>{formatSpeed(progress.speed)}</span>
                            <span>ETA: {formatETA(progress.eta)}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <button 
                      className="btn btn-secondary"
                      onClick={() => handleCancel(model.id)}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button 
                    className="btn btn-primary"
                    onClick={() => handleDownload(model.id)}
                  >
                    Download
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
