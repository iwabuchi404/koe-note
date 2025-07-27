import { useState, useEffect } from 'react'

/**
 * モデル制御ロジックを管理するフック
 * Whisperモデルの選択・変更を担当
 */
export const useModelControl = (currentModel: string, setCurrentModel: (model: string) => void) => {
  const [selectedModel, setSelectedModel] = useState<string>(currentModel)
  const [isChangingModel, setIsChangingModel] = useState(false)
  const [error, setError] = useState<string>('')

  // selectedModelをcurrentModelと同期
  useEffect(() => {
    setSelectedModel(currentModel)
  }, [currentModel])

  // モデル変更
  const changeModel = async (newModel: string) => {
    if (newModel === currentModel) return
    
    setIsChangingModel(true)
    setSelectedModel(newModel)
    
    try {
      const success = await window.electronAPI.speechChangeModel(newModel)
      if (success) {
        setCurrentModel(newModel) // AppContextのcurrentModelを更新
        console.log('モデル変更成功:', newModel)
        setError('')
      } else {
        setError('モデル変更に失敗しました')
        setSelectedModel(currentModel)
      }
    } catch (error) {
      setError('モデル変更エラー: ' + String(error))
      setSelectedModel(currentModel)
    } finally {
      setIsChangingModel(false)
    }
  }

  // エラークリア
  const clearError = () => {
    setError('')
  }

  return {
    selectedModel,
    isChangingModel,
    error,
    changeModel,
    clearError
  }
}