/**
 * TranscriptionEditor - 文字起こし編集機能統合コンポーネント
 * 
 * 責務:
 * - 編集状態管理
 * - キーボードショートカット処理
 * - 編集操作の統合
 */

import React, { useState, useEffect, useCallback } from 'react'
import { TranscriptionResult } from '../../../../preload/preload'
import EditingToolbar from './EditingToolbar'

interface TranscriptionEditorProps {
  transcriptionResult: TranscriptionResult | null
  onTranscriptionUpdate: (result: TranscriptionResult) => void
  onSaveTranscription: () => void
}

export const useTranscriptionEditor = ({
  transcriptionResult,
  onTranscriptionUpdate,
  onSaveTranscription
}: TranscriptionEditorProps) => {
  // 編集状態管理
  const [editingSegmentId, setEditingSegmentId] = useState<number | null>(null)
  const [editingText, setEditingText] = useState<string>('')
  const [modifiedSegments, setModifiedSegments] = useState<Set<number>>(new Set())
  const [editedSegmentTexts, setEditedSegmentTexts] = useState<Map<number, string>>(new Map())

  // キーボードショートカット処理
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S で保存
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault()
        if (modifiedSegments.size > 0) {
          onSaveTranscription()
        }
      }
      // Escape で編集キャンセル
      if (e.key === 'Escape' && editingSegmentId !== null) {
        e.preventDefault()
        handleCancelEdit()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [modifiedSegments.size, editingSegmentId, onSaveTranscription])

  // セグメント編集開始
  const handleSegmentDoubleClick = useCallback((segmentIndex: number, text: string) => {
    setEditingSegmentId(segmentIndex)
    setEditingText(text)
  }, [])

  // テキスト変更処理
  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditingText(e.target.value)
  }, [])

  // 編集保存処理
  const handleSaveEdit = useCallback((segmentIndex: number) => {
    if (!transcriptionResult || !transcriptionResult.segments) return
    
    const currentSegment = transcriptionResult.segments[segmentIndex]
    const originalText = currentSegment?.text?.trim() || ''
    const newText = editingText.trim()
    
    // テキストが変更されている場合のみ編集済みとしてマーク
    if (newText !== originalText) {
      setModifiedSegments(prev => new Set(prev).add(segmentIndex))
      setEditedSegmentTexts(prev => new Map(prev).set(segmentIndex, newText))
      
      // transcriptionResultを更新
      const updatedSegments = [...transcriptionResult.segments]
      updatedSegments[segmentIndex] = {
        ...updatedSegments[segmentIndex],
        text: newText,
        isEdited: true
      }
      
      onTranscriptionUpdate({
        ...transcriptionResult,
        segments: updatedSegments
      })
    } else {
      // 変更がない場合は編集済みマークを削除
      setModifiedSegments(prev => {
        const newSet = new Set(prev)
        newSet.delete(segmentIndex)
        return newSet
      })
      setEditedSegmentTexts(prev => {
        const newMap = new Map(prev)
        newMap.delete(segmentIndex)
        return newMap
      })
    }
    
    // 編集モードを終了
    setEditingSegmentId(null)
    setEditingText('')
  }, [transcriptionResult, editingText, onTranscriptionUpdate])

  // 編集キャンセル処理
  const handleCancelEdit = useCallback(() => {
    setEditingSegmentId(null)
    setEditingText('')
  }, [])

  // キーダウン処理（Enterで保存、Escapeでキャンセル）
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>, index: number) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSaveEdit(index)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancelEdit()
    }
  }, [handleSaveEdit, handleCancelEdit])

  // 全変更のリセット
  const handleResetChanges = useCallback(() => {
    setModifiedSegments(new Set())
    setEditedSegmentTexts(new Map())
    setEditingSegmentId(null)
    setEditingText('')
  }, [])

  return {
    // 編集状態
    editingSegmentId,
    editingText,
    modifiedSegments,
    editedSegmentTexts,
    
    // イベントハンドラー
    handleSegmentDoubleClick,
    handleTextChange,
    handleSaveEdit,
    handleCancelEdit,
    handleKeyDown,
    handleResetChanges,

    // ツールバーコンポーネント
    toolbar: (
      <EditingToolbar
        modifiedSegmentsCount={modifiedSegments.size}
        onSave={onSaveTranscription}
        onReset={handleResetChanges}
        hasChanges={modifiedSegments.size > 0}
      />
    )
  }
}

const TranscriptionEditor: React.FC<TranscriptionEditorProps> = (props) => {
  const editor = useTranscriptionEditor(props)
  return editor.toolbar
}

export default TranscriptionEditor