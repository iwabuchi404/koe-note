/**
 * useChunkTranscription - チャンク分割文字起こし状態管理フック
 * 
 * 責務:
 * - チャンク文字起こしの進捗状態管理
 * - グローバルイベントリスナーの管理
 * - 進捗情報の提供
 */

import { useState, useEffect } from 'react'

interface ChunkProgress {
  processedChunks: number
  totalChunks: number
}

interface UseChunkTranscriptionReturn {
  isChunkTranscribing: boolean
  chunkProgress: ChunkProgress
  progressPercentage: number
  statusText: string
}

export const useChunkTranscription = (): UseChunkTranscriptionReturn => {
  const [isChunkTranscribing, setIsChunkTranscribing] = useState(false)
  const [chunkProgress, setChunkProgress] = useState<ChunkProgress>({ 
    processedChunks: 0, 
    totalChunks: 0 
  })

  // チャンク分割文字起こしイベントリスナー
  useEffect(() => {
    const handleChunkTranscriptionStart = (event: any) => {
      const { totalChunks } = event.detail
      setIsChunkTranscribing(true)
      setChunkProgress({ processedChunks: 0, totalChunks })
    }
    
    const handleChunkProgress = (event: any) => {
      const { processedChunks, totalChunks } = event.detail
      setChunkProgress({ processedChunks, totalChunks })
    }
    
    const handleChunkTranscriptionComplete = () => {
      setIsChunkTranscribing(false)
      setChunkProgress({ processedChunks: 0, totalChunks: 0 })
    }
    
    window.addEventListener('chunkTranscriptionStart', handleChunkTranscriptionStart)
    window.addEventListener('chunkProgress', handleChunkProgress)
    window.addEventListener('chunkTranscriptionComplete', handleChunkTranscriptionComplete)
    
    return () => {
      window.removeEventListener('chunkTranscriptionStart', handleChunkTranscriptionStart)
      window.removeEventListener('chunkProgress', handleChunkProgress)
      window.removeEventListener('chunkTranscriptionComplete', handleChunkTranscriptionComplete)
    }
  }, [])

  // 進捗率の計算
  const progressPercentage = chunkProgress.totalChunks > 0 
    ? Math.round((chunkProgress.processedChunks / chunkProgress.totalChunks) * 100)
    : 0

  // ステータステキストの生成
  const statusText = isChunkTranscribing 
    ? `⚡ チャンク処理中 (${chunkProgress.processedChunks}/${chunkProgress.totalChunks})`
    : ''

  return {
    isChunkTranscribing,
    chunkProgress,
    progressPercentage,
    statusText
  }
}