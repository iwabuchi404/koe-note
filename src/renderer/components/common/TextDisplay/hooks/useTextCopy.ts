/**
 * テキストコピー機能Hook
 * クリップボードへのコピー機能と状態管理
 */

import { useState, useCallback, useRef } from 'react'
import { UseTextCopyReturn, TextSelection, TranscriptionSegment } from '../types/TextDisplayTypes'

type CopyType = 'selection' | 'full-text' | 'segments' | 'formatted'

/**
 * テキストコピー機能Hook
 */
export function useTextCopy(): UseTextCopyReturn {
  
  // 状態管理
  const [lastCopiedText, setLastCopiedText] = useState<string | null>(null)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'success' | 'error'>('idle')
  
  // 通知タイマーの参照
  const notificationTimerRef = useRef<NodeJS.Timeout | null>(null)
  
  /**
   * クリップボードAPIの対応チェック
   */
  const isClipboardSupported = 'navigator' in window && 'clipboard' in navigator
  
  /**
   * 基本的なコピー処理
   */
  const performCopy = useCallback(async (text: string): Promise<boolean> => {
    if (!text.trim()) return false
    
    setCopyStatus('copying')
    
    try {
      if (isClipboardSupported) {
        // モダンなClipboard APIを使用
        await navigator.clipboard.writeText(text)
      } else {
        // フォールバック: execCommandを使用
        const textArea = document.createElement('textarea')
        textArea.value = text
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        textArea.style.top = '-999999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        
        const successful = document.execCommand('copy')
        document.body.removeChild(textArea)
        
        if (!successful) {
          throw new Error('execCommand failed')
        }
      }
      
      // 成功処理
      setLastCopiedText(text)
      setCopyStatus('success')
      
      // 一定時間後にステータスをリセット
      setTimeout(() => {
        setCopyStatus('idle')
      }, 1000)
      
      return true
      
    } catch (error) {
      console.error('コピーエラー:', error)
      setCopyStatus('error')
      
      // エラー状態を一定時間後にリセット
      setTimeout(() => {
        setCopyStatus('idle')
      }, 2000)
      
      return false
    }
  }, [isClipboardSupported])
  
  /**
   * 選択テキストをコピー
   */
  const copySelectedText = useCallback(async (selection: TextSelection): Promise<boolean> => {
    return await performCopy(selection.selectedText)
  }, [performCopy])
  
  /**
   * 全文をコピー
   */
  const copyFullText = useCallback(async (text: string): Promise<boolean> => {
    return await performCopy(text)
  }, [performCopy])
  
  /**
   * セグメントをコピー
   */
  const copySegments = useCallback(async (
    segments: TranscriptionSegment[], 
    format: 'plain' | 'formatted' = 'plain'
  ): Promise<boolean> => {
    if (segments.length === 0) return false
    
    let text: string
    
    if (format === 'formatted') {
      // 整形されたテキスト
      text = segments.map(segment => {
        const startTime = formatTime(segment.start)
        const endTime = formatTime(segment.end)
        const speaker = segment.speaker ? `${segment.speaker}: ` : ''
        
        return `${segment.id.toString().padStart(3, '0')} | ${startTime} - ${endTime} | ${speaker}${segment.text}`
      }).join('\n')
    } else {
      // プレーンテキスト
      text = segments.map(segment => {
        const speaker = segment.speaker ? `${segment.speaker}: ` : ''
        return `${speaker}${segment.text}`
      }).join('\n')
    }
    
    return await performCopy(text)
  }, [performCopy])
  
  /**
   * 時間フォーマット
   */
  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = (seconds % 60).toFixed(3)
    
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.padStart(6, '0')}`
    } else {
      return `${minutes.toString().padStart(2, '0')}:${secs.padStart(6, '0')}`
    }
  }
  
  return {
    copySelection: copySelectedText,
    copyFullText,
    copySegments,
    copyStatus
  }
}