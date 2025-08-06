/**
 * RecordingContext - グローバル録音状態管理
 * タブ切り替え時も録音状態を維持する
 */

import React, { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react'
import { AudioWorkletRecordingService, AudioSourceConfig, ChunkReadyEvent, RecordingStats } from '../audio/services/AudioWorkletRecordingService'
import { TranscriptionResult, TranscriptionProgress } from '../audio/services/TranscriptionWebSocketService'
import { AdvancedRecordingFileService } from '../services/AdvancedRecordingFileService'
import { AdvancedRecordingTabData } from '../types/TabTypes'
import { LoggerFactory, LogCategories } from '../utils/LoggerFactory'

const logger = LoggerFactory.getLogger(LogCategories.SERVICE_RECORDING)

export interface AdvancedRecordingConfig {
  recordingSettings: {
    source: 'microphone' | 'desktop' | 'mix'
    deviceId?: string
    chunkSize: number
    chunkDuration: number
    chunkSizeMode: 'bytes' | 'duration'
    format: 'mp3' | 'wav'
  }
  transcriptionSettings: {
    enabled: boolean
    serverUrl: string
    language: 'ja' | 'en' | 'auto'
    model: 'small' | 'medium' | 'large'
  }
}

interface RecordingContextType {
  // 状態
  recordingData: AdvancedRecordingTabData
  isRecording: boolean
  
  // アクション
  startRecording: (config: AdvancedRecordingConfig) => Promise<void>
  stopRecording: () => Promise<Blob | null>
  updateConfig: (newConfig: Partial<AdvancedRecordingConfig>) => void
  
  // ヘルパー
  getChunkById: (id: number) => AdvancedRecordingTabData['chunks'][0] | undefined
  getTotalDuration: () => number
  getTotalDataSize: () => number
  getChunksCount: () => number
  getErrorsCount: () => number
  getTranscriptionCount: () => number
  hasTranscriptionData: () => boolean
  
  // ダウンロード機能
  downloadChunk: (chunkId: number) => void
  downloadAllChunks: () => void
}

const RecordingContext = createContext<RecordingContextType | null>(null)

export const RecordingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 現在の設定を保持
  const currentConfigRef = useRef<AdvancedRecordingConfig>({
    recordingSettings: {
      source: 'microphone',
      deviceId: undefined,
      chunkSize: 64,
      chunkDuration: 3.0,
      chunkSizeMode: 'duration',
      format: 'mp3'
    },
    transcriptionSettings: {
      enabled: true,
      serverUrl: 'ws://localhost:8770',
      language: 'ja',
      model: 'small'
    }
  })

  // 録音データ状態（グローバル）
  const [recordingData, setRecordingData] = useState<AdvancedRecordingTabData>({
    startTime: new Date(),
    duration: 0,
    audioLevel: 0,
    isRecording: false,
    recordingSettings: currentConfigRef.current.recordingSettings,
    transcriptionSettings: currentConfigRef.current.transcriptionSettings,
    chunks: [],
    stats: {
      totalChunks: 0,
      totalDataSize: 0,
      currentBitrate: 0,
      processedSamples: 0
    },
    errors: []
  })

  // サービス参照（グローバル）
  const audioWorkletServiceRef = useRef<AudioWorkletRecordingService | null>(null)
  const recordingStartTimeRef = useRef<number>(0)
  const baseFileNameRef = useRef<string>('')

  // エラー追加ヘルパー
  const addError = useCallback((type: 'recording' | 'transcription' | 'encoding', message: string) => {
    const newError = {
      timestamp: new Date(),
      type,
      message
    }
    
    setRecordingData(prev => ({
      ...prev,
      errors: [...prev.errors, newError]
    }))

    logger.error(`グローバル録音 ${type} エラー:`, new Error(message))
  }, [])

  // チャンク準備完了コールバック
  const handleChunkReady = useCallback(async (event: ChunkReadyEvent) => {
    logger.info(`グローバル録音 チャンク#${event.chunkNumber}生成`, { size: event.size })

    const newChunk = {
      id: event.chunkNumber,
      size: event.size,
      timestamp: new Date(event.timestamp),
      blob: event.chunk,
      transcriptionStatus: 'pending' as const
    }

    setRecordingData(prev => ({
      ...prev,
      chunks: [...prev.chunks, newChunk]
    }))

    // チャンク毎の自動保存
    try {
      const format = currentConfigRef.current.recordingSettings.format
      const filePath = await AdvancedRecordingFileService.saveChunk(
        event.chunk,
        event.chunkNumber,
        baseFileNameRef.current,
        format
      )
      logger.info(`グローバル録音 チャンク#${event.chunkNumber}自動保存完了`, { filePath })
    } catch (error) {
      const errorMessage = `チャンク#${event.chunkNumber}自動保存失敗: ${error instanceof Error ? error.message : String(error)}`
      addError('recording', errorMessage)
    }
  }, [addError])

  // 録音統計更新コールバック
  const handleStatsUpdate = useCallback((stats: RecordingStats) => {
    const currentTime = Date.now()
    const duration = recordingStartTimeRef.current ? (currentTime - recordingStartTimeRef.current) / 1000 : 0

    setRecordingData(prev => ({
      ...prev,
      duration,
      audioLevel: stats.audioLevel,
      stats: {
        totalChunks: stats.chunksGenerated,
        totalDataSize: stats.totalDataSize,
        currentBitrate: stats.currentBitrate,
        processedSamples: stats.processedSamples
      }
    }))
  }, [])

  // エラーコールバック
  const handleError = useCallback((error: Error) => {
    addError('recording', error.message)
  }, [addError])

  // 文字起こし結果コールバック
  const handleTranscriptionResult = useCallback(async (result: TranscriptionResult) => {
    logger.info(`グローバル録音 文字起こし結果 #${result.chunkNumber}:`, result.text)

    setRecordingData(prev => ({
      ...prev,
      chunks: prev.chunks.map(chunk => 
        chunk.id === result.chunkNumber
          ? { ...chunk, transcriptionStatus: 'completed' as const, transcriptionText: result.text }
          : chunk
      )
    }))

    // 文字起こし結果をファイルに追記
    if (result.text && result.text.trim()) {
      try {
        const chunkTimestamp = new Date()
        const filePath = await AdvancedRecordingFileService.appendTranscription(
          result.chunkNumber,
          result.text,
          chunkTimestamp,
          baseFileNameRef.current,
          true
        )
        logger.info(`グローバル録音 チャンク#${result.chunkNumber}文字起こし追記完了`, { filePath, text: result.text.substring(0, 30) + '...' })
      } catch (error) {
        const errorMessage = `チャンク#${result.chunkNumber}文字起こし追記失敗: ${error instanceof Error ? error.message : String(error)}`
        addError('transcription', errorMessage)
      }
    }
  }, [addError])

  // 文字起こし進捗コールバック
  const handleTranscriptionProgress = useCallback((progress: TranscriptionProgress) => {
    logger.info(`グローバル録音 文字起こし進捗 #${progress.chunkNumber}:`, progress.status)

    const status = progress.status === 'completed' ? 'completed' : 
                   progress.status === 'failed' ? 'failed' : 'processing'

    setRecordingData(prev => ({
      ...prev,
      chunks: prev.chunks.map(chunk => 
        chunk.id === progress.chunkNumber
          ? { ...chunk, transcriptionStatus: status as any }
          : chunk
      )
    }))
  }, [])

  // 録音開始
  const startRecording = useCallback(async (config: AdvancedRecordingConfig) => {
    try {
      if (recordingData.isRecording) {
        logger.warn('既に録音中です')
        return
      }

      logger.info('グローバル録音システム開始', { config })

      // 設定を更新
      currentConfigRef.current = config

      // ベースファイル名生成（design-doc準拠）
      const timestamp = new Date().toISOString()
        .replace(/:/g, '')
        .replace(/\./g, '')
        .replace(/[-T]/g, '_')
        .slice(0, 15) // YYYYMMDD_HHMMSS
      baseFileNameRef.current = `recording_${timestamp}`

      // AudioWorkletRecordingServiceインスタンス作成
      audioWorkletServiceRef.current = new AudioWorkletRecordingService(
        handleChunkReady,
        handleError,
        handleStatsUpdate,
        handleTranscriptionResult,
        handleTranscriptionProgress
      )

      // 文字起こし設定
      if (config.transcriptionSettings.enabled) {
        audioWorkletServiceRef.current.setTranscriptionConfig({
          enabled: true,
          serverUrl: config.transcriptionSettings.serverUrl,
          language: config.transcriptionSettings.language
        })
      }

      // チャンクサイズ設定
      audioWorkletServiceRef.current.setChunkSizeThreshold(config.recordingSettings.chunkSize * 1024)

      // 音声ソース設定
      const audioConfig: AudioSourceConfig = {
        type: config.recordingSettings.source,
        deviceId: config.recordingSettings.deviceId
      }

      // 録音開始
      await audioWorkletServiceRef.current.startWithConfig(audioConfig)
      
      recordingStartTimeRef.current = Date.now()
      setRecordingData(prev => ({
        ...prev,
        isRecording: true,
        audioLevel: 0,
        startTime: new Date(),
        recordingSettings: config.recordingSettings,
        transcriptionSettings: config.transcriptionSettings,
        chunks: [],
        errors: []
      }))

      logger.info('グローバル録音システム開始完了', { baseName: baseFileNameRef.current })

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      addError('recording', `録音開始失敗: ${errorMessage}`)
      throw error
    }
  }, [recordingData.isRecording, handleChunkReady, handleError, handleStatsUpdate, handleTranscriptionResult, handleTranscriptionProgress, addError])

  // 録音停止
  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    try {
      if (!audioWorkletServiceRef.current) {
        addError('recording', '録音サービスが初期化されていません')
        return null
      }

      logger.info('グローバル録音システム停止開始')

      const finalBlob = await audioWorkletServiceRef.current.stop()
      
      // 未処理チャンクをキャンセル処理
      setRecordingData(prev => ({
        ...prev,
        isRecording: false,
        audioLevel: 0,
        chunks: prev.chunks.map(chunk => {
          if (chunk.transcriptionStatus === 'pending' || chunk.transcriptionStatus === 'processing') {
            return {
              ...chunk,
              transcriptionStatus: 'failed' as const,
              transcriptionText: '録音停止によりキャンセル'
            }
          }
          return chunk
        })
      }))

      // サービスクリーンアップ
      audioWorkletServiceRef.current = null
      recordingStartTimeRef.current = 0

      logger.info('グローバル録音システム停止完了', { finalBlobSize: finalBlob.size })
      return finalBlob

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      addError('recording', `録音停止失敗: ${errorMessage}`)
      return null
    }
  }, [addError])

  // 設定更新
  const updateConfig = useCallback((newConfig: Partial<AdvancedRecordingConfig>) => {
    if (recordingData.isRecording) {
      addError('recording', '録音中は設定を変更できません')
      return
    }

    // 現在の設定を更新
    currentConfigRef.current = {
      recordingSettings: { ...currentConfigRef.current.recordingSettings, ...newConfig.recordingSettings },
      transcriptionSettings: { ...currentConfigRef.current.transcriptionSettings, ...newConfig.transcriptionSettings }
    }

    setRecordingData(prev => ({
      ...prev,
      recordingSettings: { ...prev.recordingSettings, ...newConfig.recordingSettings },
      transcriptionSettings: { ...prev.transcriptionSettings, ...newConfig.transcriptionSettings }
    }))

    logger.info('グローバル録音設定更新', newConfig)
  }, [recordingData.isRecording, addError])

  // チャンクダウンロード
  const downloadChunk = useCallback((chunkId: number) => {
    const chunk = recordingData.chunks.find(c => c.id === chunkId)
    if (!chunk) {
      addError('recording', `チャンク#${chunkId}が見つかりません`)
      return
    }

    const url = URL.createObjectURL(chunk.blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `recording_chunk_${chunkId}.${recordingData.recordingSettings.format}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    logger.info(`チャンク#${chunkId}ダウンロード完了`)
  }, [recordingData.chunks, recordingData.recordingSettings.format, addError])

  // 全チャンク統合ダウンロード
  const downloadAllChunks = useCallback(() => {
    if (recordingData.chunks.length === 0) {
      addError('recording', 'ダウンロード可能なチャンクがありません')
      return
    }

    const blobs = recordingData.chunks.map(chunk => chunk.blob)
    const finalBlob = new Blob(blobs, { 
      type: recordingData.recordingSettings.format === 'mp3' ? 'audio/mp3' : 'audio/wav' 
    })

    const timestamp = new Date().toISOString()
      .replace(/:/g, '')
      .replace(/\./g, '')
      .replace(/[-T]/g, '_')
      .slice(0, 15) // YYYYMMDD_HHMMSS
    
    const url = URL.createObjectURL(finalBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = `recording_${timestamp}.${recordingData.recordingSettings.format}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    logger.info(`統合ファイルダウンロード完了`, { chunksCount: recordingData.chunks.length })
  }, [recordingData.chunks, recordingData.recordingSettings.format, addError])

  // クリーンアップ（アプリ終了時）
  useEffect(() => {
    return () => {
      if (audioWorkletServiceRef.current) {
        audioWorkletServiceRef.current.stop().catch(error => {
          logger.error('グローバル録音サービスクリーンアップエラー:', error)
        })
      }
    }
  }, [])

  const contextValue: RecordingContextType = {
    // 状態
    recordingData,
    isRecording: recordingData.isRecording,

    // アクション
    startRecording,
    stopRecording,
    updateConfig,

    // ヘルパー
    getChunkById: (id: number) => recordingData.chunks.find(c => c.id === id),
    getTotalDuration: () => recordingData.duration,
    getTotalDataSize: () => recordingData.stats.totalDataSize,
    getChunksCount: () => recordingData.chunks.length,
    getErrorsCount: () => recordingData.errors.length,
    getTranscriptionCount: () => recordingData.chunks.filter(c => c.transcriptionText).length,
    hasTranscriptionData: () => recordingData.chunks.some(c => c.transcriptionText && c.transcriptionText.trim()),

    // ダウンロード機能
    downloadChunk,
    downloadAllChunks
  }

  return (
    <RecordingContext.Provider value={contextValue}>
      {children}
    </RecordingContext.Provider>
  )
}

// RecordingContextの使用フック
export const useRecordingContext = (): RecordingContextType => {
  const context = useContext(RecordingContext)
  if (!context) {
    throw new Error('useRecordingContext must be used within RecordingProvider')
  }
  return context
}