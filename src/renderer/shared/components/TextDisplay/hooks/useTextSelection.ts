/**
 * テキスト選択管理Hook
 * テキスト選択、ハイライト、関連セグメントの管理
 */

import { useState, useCallback } from 'react'
import { TextSelection, UseTextSelectionReturn } from '../types/TextDisplayTypes'

/**
 * テキスト選択管理Hook
 */
export function useTextSelection(): UseTextSelectionReturn {
  
  // 状態管理
  const [selection, setSelection] = useState<TextSelection | null>(null)
  
  /**
   * 全テキストを選択
   */
  const selectAllText = useCallback((fullText: string) => {
    const textSelection: TextSelection = {
      start: 0,
      end: fullText.length,
      selectedText: fullText
    }
    
    setSelection(textSelection)
  }, [])
  
  /**
   * 選択をクリア
   */
  const clearSelection = useCallback(() => {
    setSelection(null)
    
    // ブラウザの選択もクリア
    const browserSelection = window.getSelection()
    if (browserSelection) {
      browserSelection.removeAllRanges()
    }
  }, [])
  
  /**
   * 選択状態を更新
   */
  const updateSelection = useCallback((newSelection: TextSelection) => {
    setSelection(newSelection)
  }, [])

  return {
    textSelection: selection,
    clearSelection,
    selectAll: selectAllText,
    updateSelection
  }
}