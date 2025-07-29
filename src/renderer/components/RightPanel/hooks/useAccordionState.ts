/**
 * useAccordionState - アコーディオン状態管理フック
 * 
 * 責務:
 * - 各セクションの開閉状態管理
 * - セクション切り替えロジック
 * - 初期状態の設定
 */

import { useState, useCallback } from 'react'

interface AccordionState {
  transcription: boolean   // 文字起こし結果
  recognition: boolean     // 音声認識制御
  player: boolean         // 音声プレイヤー
  recording: boolean      // 録音コントロール
}

const DEFAULT_ACCORDION_STATE: AccordionState = {
  transcription: true,   // 文字起こし結果は初期展開
  recognition: false,    // 音声認識は必要時のみ展開
  player: false,         // 音声プレイヤーは必要時のみ展開
  recording: false       // 録音コントロールは必要時のみ展開
}

interface UseAccordionStateReturn {
  accordionState: AccordionState
  toggleSection: (section: keyof AccordionState) => void
  expandSection: (section: keyof AccordionState) => void
  collapseSection: (section: keyof AccordionState) => void
  expandAll: () => void
  collapseAll: () => void
}

export const useAccordionState = (
  initialState: Partial<AccordionState> = {}
): UseAccordionStateReturn => {
  const [accordionState, setAccordionState] = useState<AccordionState>({
    ...DEFAULT_ACCORDION_STATE,
    ...initialState
  })

  // セクションの開閉切り替え
  const toggleSection = useCallback((section: keyof AccordionState) => {
    setAccordionState(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }, [])

  // セクションの展開
  const expandSection = useCallback((section: keyof AccordionState) => {
    setAccordionState(prev => ({
      ...prev,
      [section]: true
    }))
  }, [])

  // セクションの折りたたみ
  const collapseSection = useCallback((section: keyof AccordionState) => {
    setAccordionState(prev => ({
      ...prev,
      [section]: false
    }))
  }, [])

  // 全セクションの展開
  const expandAll = useCallback(() => {
    setAccordionState({
      transcription: true,
      recognition: true,
      player: true,
      recording: true
    })
  }, [])

  // 全セクションの折りたたみ
  const collapseAll = useCallback(() => {
    setAccordionState({
      transcription: false,
      recognition: false,
      player: false,
      recording: false
    })
  }, [])

  return {
    accordionState,
    toggleSection,
    expandSection,
    collapseSection,
    expandAll,
    collapseAll
  }
}