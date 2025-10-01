/**
 * インストール済みモデルステータス表示コンポーネント
 */

import React from 'react'
import { ModelInfo } from '../../types/ModelTypes'
import './ModelStatus.css'

interface ModelStatusProps {
  installedModels: ModelInfo[]
  currentModel?: string
  onModelSelect?: (modelId: string) => void
  onModelRemoved?: () => void
  onError?: (error: string) => void
  isLoading: boolean
}

export const ModelStatus: React.FC<ModelStatusProps> = ({
  installedModels,
  currentModel,
  onModelSelect,
  onModelRemoved,
  onError,
  isLoading
}) => {
  const handleModelSelect = (modelId: string) => {
    onModelSelect?.(modelId)
  }

  const handleModelRemove = async (modelId: string) => {
    if (window.confirm(`Are you sure you want to remove ${modelId}?`)) {
      try {
        const { modelDownloadService } = await import('../../services/ModelDownloadService')
        await modelDownloadService.removeModel(modelId)
        onModelRemoved?.()
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to remove model'
        onError?.(errorMessage)
      }
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  if (isLoading) {
    return (
      <div className="model-status">
        <div className="loading">Loading installed models...</div>
      </div>
    )
  }

  if (installedModels.length === 0) {
    return (
      <div className="model-status">
        <div className="empty-state">
          <h3>No Models Installed</h3>
          <p>Download models from the "Download Models" tab to get started.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="model-status">
      <h3>Installed Models ({installedModels.length})</h3>
      
      <div className="models-grid">
        {installedModels.map((model) => (
          <div 
            key={model.id} 
            className={`model-card ${currentModel === model.id ? 'active' : ''}`}
            onClick={() => handleModelSelect(model.id)}
          >
            <div className="model-card-header">
              <h4>{model.name}</h4>
              {currentModel === model.id && (
                <span className="current-badge">Current</span>
              )}
            </div>
            
            <div className="model-card-body">
              <p className="model-description">{model.description}</p>
              
              <div className="model-meta">
                <div className="meta-item">
                  <span className="meta-label">Size:</span>
                  <span className="meta-value">{model.size}</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">Version:</span>
                  <span className="meta-value">{model.version}</span>
                </div>
                <div className="meta-item">
                  <span className="meta-label">License:</span>
                  <span className="meta-value">{model.license}</span>
                </div>
                {model.lastUpdated && (
                  <div className="meta-item">
                    <span className="meta-label">Updated:</span>
                    <span className="meta-value">
                      {model.lastUpdated.toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="model-card-actions">
              <button
                className="btn btn-primary"
                onClick={(e) => {
                  e.stopPropagation()
                  handleModelSelect(model.id)
                }}
                disabled={currentModel === model.id}
              >
                {currentModel === model.id ? 'Active' : 'Select'}
              </button>
              
              <button
                className="btn btn-danger"
                onClick={(e) => {
                  e.stopPropagation()
                  handleModelRemove(model.id)
                }}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
