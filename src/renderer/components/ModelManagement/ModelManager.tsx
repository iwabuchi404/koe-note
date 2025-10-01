/**
 * モデル管理メインコンポーネント
 * モデルダウンローダーとモデルステータスを統合
 */

import React, { useState, useEffect } from 'react'
import { ModelDownloader } from './ModelDownloader'
import { ModelStatus } from './ModelStatus'
import { ModelInfo } from '../../types/ModelTypes'
import { modelDownloadService } from '../../services/ModelDownloadService'
import './ModelManager.css'

interface ModelManagerProps {
  onModelChange?: (modelId: string) => void
  currentModel?: string
}

export const ModelManager: React.FC<ModelManagerProps> = ({
  onModelChange,
  currentModel
}) => {
  const [installedModels, setInstalledModels] = useState<ModelInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'download' | 'manage'>('download')

  useEffect(() => {
    loadInstalledModels()
  }, [])

  const loadInstalledModels = async () => {
    try {
      setIsLoading(true)
      const models = await modelDownloadService.getInstalledModels()
      setInstalledModels(models)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load installed models'
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const handleModelInstalled = (modelId: string) => {
    loadInstalledModels()
    onModelChange?.(modelId)
  }

  const handleError = (errorMessage: string) => {
    setError(errorMessage)
  }

  const handleModelSelect = (modelId: string) => {
    onModelChange?.(modelId)
  }

  return (
    <div className="model-manager">
      <div className="model-manager-header">
        <h2>Model Management</h2>
        <div className="tab-buttons">
          <button
            className={`tab-button ${activeTab === 'download' ? 'active' : ''}`}
            onClick={() => setActiveTab('download')}
          >
            Download Models
          </button>
          <button
            className={`tab-button ${activeTab === 'manage' ? 'active' : ''}`}
            onClick={() => setActiveTab('manage')}
          >
            Manage Installed
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="model-manager-content">
        {activeTab === 'download' ? (
          <ModelDownloader
            onModelInstalled={handleModelInstalled}
            onError={handleError}
          />
        ) : (
          <ModelStatus
            installedModels={installedModels}
            currentModel={currentModel}
            onModelSelect={handleModelSelect}
            onModelRemoved={loadInstalledModels}
            onError={handleError}
            isLoading={isLoading}
          />
        )}
      </div>
    </div>
  )
}
