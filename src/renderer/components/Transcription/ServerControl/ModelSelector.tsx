import React, { useEffect, useState } from 'react'
import { modelDownloadService } from '../../../services/ModelDownloadService'
import type { ModelInfo } from '../../../types/ModelTypes'

interface ModelSelectorProps {
  selectedModel: string
  currentModel: string
  isChanging: boolean
  onModelChange: (model: string) => void
}

/**
 * モデル選択コンポーネント
 * Whisperモデルの選択とプレビューを提供
 */
const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedModel,
  currentModel,
  isChanging,
  onModelChange
}) => {
  const [installedModels, setInstalledModels] = useState<ModelInfo[]>([])

  useEffect(() => {
    const loadInstalled = async () => {
      try {
        const models = await modelDownloadService.getInstalledModels()
        setInstalledModels(models)
      } catch (e) {
        console.warn('インストール済みモデル取得失敗:', e)
      }
    }
    loadInstalled()
    const interval = setInterval(loadInstalled, 5000)
    return () => clearInterval(interval)
  }, [])

  const modelDescriptions: Record<string, string> = {
    tiny: '最軽量・最高速 (日本語の精度は低め)',
    base: '軽量・高速 (バランス重視)',
    small: '標準・実用的 (推奨)',
    medium: '高精度 (処理時間やや長)',
    large: '最高精度 (処理時間長)'
  }

  return (
    <div className="model-selector">
      <label className="model-selector__label">
        音声認識モデル:
      </label>
      
      <div className="model-selector__container">
        <select
          className="model-selector__select"
          value={selectedModel}
          onChange={(e) => onModelChange(e.target.value)}
          disabled={isChanging}
        >
          {installedModels.length > 0 ? (
            installedModels.map(m => (
              <option key={m.id} value={m.id}>
                {m.name || m.id}
              </option>
            ))
          ) : (
            <>
              <option value="tiny">tiny</option>
              <option value="base">base</option>
              <option value="small">small</option>
              <option value="medium">medium</option>
              <option value="large-v2">large-v2</option>
            </>
          )}
        </select>
        
        {isChanging && (
          <span className="model-selector__loading">
            🔄 変更中...
          </span>
        )}
      </div>
      
      <div className="model-selector__description">
        {modelDescriptions[selectedModel]}
      </div>
      
      {selectedModel !== currentModel && !isChanging && (
        <div className="model-selector__warning">
          ⚠️ モデルを変更するとサーバーが再起動されます
        </div>
      )}
    </div>
  )
}

export default ModelSelector