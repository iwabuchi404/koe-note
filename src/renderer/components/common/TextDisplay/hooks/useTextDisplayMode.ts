/**
 * テキスト表示モード管理Hook
 * 表示モード ↔ 編集モード の切り替えと状態管理
 */

import { useState, useCallback, useRef } from 'react'
import { DisplayMode, UseTextDisplayModeOptions, UseTextDisplayModeReturn } from '../types/TextDisplayTypes'

/**
 * テキスト表示モード管理Hook
 */
export function useTextDisplayMode(options: UseTextDisplayModeOptions): UseTextDisplayModeReturn {
  const {
    initialMode = 'view',
    readOnly = false,
    onSave
  } = options
  
  // 状態管理
  const [currentMode, setCurrentMode] = useState<DisplayMode>(initialMode)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  
  
  /**
   * モード切り替え
   */
  const switchMode = useCallback(async (mode: DisplayMode, content: string): Promise<void> => {
    if (mode === currentMode) return
    
    if (hasUnsavedChanges) {
      const confirmed = window.confirm('未保存の変更があります。破棄して続行しますか？')
      if (!confirmed) return
    }
    
    setCurrentMode(mode)
    setHasUnsavedChanges(false)
  }, [currentMode, hasUnsavedChanges])
  
  /**
   * 変更を保存
   */
  const saveChanges = useCallback(async (content: string): Promise<boolean> => {
    if (!onSave) return false
    
    try {
      const success = await onSave(content)
      if (success) {
        setHasUnsavedChanges(false)
      }
      return success
    } catch (error) {
      console.error('保存エラー:', error)
      return false
    }
  }, [onSave])
  
  /**
   * 変更を破棄
   */
  const discardChanges = useCallback(() => {
    setHasUnsavedChanges(false)
  }, [])

  return {
    currentMode,
    canSwitchMode: !readOnly,
    hasUnsavedChanges,
    switchMode,
    saveChanges,
    discardChanges
  }
}