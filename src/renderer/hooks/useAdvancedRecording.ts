/**
 * useAdvancedRecording - 新録音システム専用Hook
 * AudioWorkletRecordingService + TranscriptionWebSocketService統合管理
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { AudioWorkletRecordingService, AudioSourceConfig, ChunkReadyEvent, RecordingStats } from '../audio/services/AudioWorkletRecordingService'
import { TranscriptionResult, TranscriptionProgress } from '../audio/services/TranscriptionWebSocketService'
import { AdvancedRecordingFileService, SaveFileOptions, SaveResult } from '../services/AdvancedRecordingFileService'
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

export interface AdvancedRecordingCallbacks {
  onDataUpdate?: (data: AdvancedRecordingTabData) => void
  onError?: (error: string) => void
  onChunkReady?: (chunk: ChunkReadyEvent) => void
  onTranscriptionResult?: (result: TranscriptionResult) => void
}

export const useAdvancedRecording = (
  initialConfig: AdvancedRecordingConfig,
  callbacks?: AdvancedRecordingCallbacks
) => {
  // 現在の設定を保持
  const currentConfigRef = useRef<AdvancedRecordingConfig>(initialConfig)
  // 録音データ状態
  const [recordingData, setRecordingData] = useState<AdvancedRecordingTabData>({
    startTime: new Date(),
    duration: 0,
    audioLevel: 0,
    isRecording: false,
    recordingSettings: initialConfig.recordingSettings,
    transcriptionSettings: initialConfig.transcriptionSettings,
    chunks: [],
    stats: {
      totalChunks: 0,
      totalDataSize: 0,
      currentBitrate: 0,
      processedSamples: 0
    },
    errors: []
  })

  // サービス参照
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

    logger.error(`AdvancedRecording ${type} エラー:`, new Error(message))
    callbacks?.onError?.(message)
  }, [callbacks])

  // チャンク準備完了コールバック
  const handleChunkReady = useCallback(async (event: ChunkReadyEvent) => {
    logger.info(`チャンク#${event.chunkNumber}生成`, { size: event.size })

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
      logger.info(`チャンク#${event.chunkNumber}自動保存完了`, { filePath })
    } catch (error) {
      const errorMessage = `チャンク#${event.chunkNumber}自動保存失敗: ${error instanceof Error ? error.message : String(error)}`
      addError('recording', errorMessage)
    }

    callbacks?.onChunkReady?.(event)
  }, [callbacks, addError])

  // 録音統計更新コールバック
  const handleStatsUpdate = useCallback((stats: RecordingStats) => {
    const currentTime = Date.now()
    const duration = recordingStartTimeRef.current ? (currentTime - recordingStartTimeRef.current) / 1000 : 0

    setRecordingData(prev => ({
      ...prev,
      duration,
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
    logger.info(`文字起こし結果 #${result.chunkNumber}:`, result.text)

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
        const chunkTimestamp = new Date() // 文字起こし完了時刻
        const filePath = await AdvancedRecordingFileService.appendTranscription(
          result.chunkNumber,
          result.text,
          chunkTimestamp,
          baseFileNameRef.current,
          true // タイムスタンプ付き
        )
        logger.info(`チャンク#${result.chunkNumber}文字起こし追記完了`, { filePath, text: result.text.substring(0, 30) + '...' })
      } catch (error) {
        const errorMessage = `チャンク#${result.chunkNumber}文字起こし追記失敗: ${error instanceof Error ? error.message : String(error)}`
        addError('transcription', errorMessage)
      }
    }

    callbacks?.onTranscriptionResult?.(result)
  }, [callbacks, addError])

  // 文字起こし進捗コールバック
  const handleTranscriptionProgress = useCallback((progress: TranscriptionProgress) => {
    logger.info(`文字起こし進捗 #${progress.chunkNumber}:`, progress.status)

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
  const startRecording = useCallback(async () => {
    try {
      logger.info('新録音システム開始', { config: initialConfig })

      // ベースファイル名生成
      const timestamp = new Date().toISOString()
        .replace(/:/g, '-')
        .replace(/\./g, '-')
        .slice(0, 19) // 2024-01-01T12-30-45
      baseFileNameRef.current = `advanced_recording_${timestamp}`

      // AudioWorkletRecordingServiceインスタンス作成
      audioWorkletServiceRef.current = new AudioWorkletRecordingService(
        handleChunkReady,
        handleError,
        handleStatsUpdate,
        handleTranscriptionResult,
        handleTranscriptionProgress
      )

      // 文字起こし設定（現在の設定を使用）
      if (currentConfigRef.current.transcriptionSettings.enabled) {
        audioWorkletServiceRef.current.setTranscriptionConfig({
          enabled: true,
          serverUrl: currentConfigRef.current.transcriptionSettings.serverUrl,
          language: currentConfigRef.current.transcriptionSettings.language
        })
      }

      // チャンクサイズ設定（現在の設定を使用）
      audioWorkletServiceRef.current.setChunkSizeThreshold(currentConfigRef.current.recordingSettings.chunkSize * 1024)

      // 音声ソース設定（現在の設定を使用）
      const audioConfig: AudioSourceConfig = {
        type: currentConfigRef.current.recordingSettings.source,
        deviceId: currentConfigRef.current.recordingSettings.deviceId
      }

      // 録音開始
      await audioWorkletServiceRef.current.startWithConfig(audioConfig)
      
      recordingStartTimeRef.current = Date.now()
      setRecordingData(prev => ({
        ...prev,
        isRecording: true,
        startTime: new Date(),
        chunks: [],
        errors: []
      }))

      logger.info('新録音システム開始完了', { baseName: baseFileNameRef.current })

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      addError('recording', `録音開始失敗: ${errorMessage}`)
      throw error
    }
  }, [initialConfig, handleChunkReady, handleError, handleStatsUpdate, handleTranscriptionResult, handleTranscriptionProgress, addError])

  // 録音停止
  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    try {
      if (!audioWorkletServiceRef.current) {
        addError('recording', '録音サービスが初期化されていません')
        return null
      }

      logger.info('新録音システム停止開始')

      const finalBlob = await audioWorkletServiceRef.current.stop()
      
      setRecordingData(prev => ({
        ...prev,
        isRecording: false
      }))

      // サービスクリーンアップ
      audioWorkletServiceRef.current = null
      recordingStartTimeRef.current = 0

      logger.info('新録音システム停止完了', { finalBlobSize: finalBlob.size })
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

    logger.info('録音設定更新', newConfig)
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
    a.download = `advanced_recording_chunk_${chunkId}.${recordingData.recordingSettings.format}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    logger.info(`チャンク#${chunkId}ダウンロード完了`)
  }, [recordingData.chunks, recordingData.recordingSettings.format, addError])

  // 全チャンク統合ダウンロード（レガシー）
  const downloadAllChunks = useCallback(() => {
    if (recordingData.chunks.length === 0) {
      addError('recording', 'ダウンロード可能なチャンクがありません')
      return
    }

    const blobs = recordingData.chunks.map(chunk => chunk.blob)
    const finalBlob = new Blob(blobs, { 
      type: recordingData.recordingSettings.format === 'mp3' ? 'audio/mp3' : 'audio/wav' 
    })

    const url = URL.createObjectURL(finalBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = `advanced_recording_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.${recordingData.recordingSettings.format}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    logger.info(`統合ファイルダウンロード完了`, { chunksCount: recordingData.chunks.length })
  }, [recordingData.chunks, recordingData.recordingSettings.format, addError])

  // ファイル保存機能
  const saveRecording = useCallback(async (options: SaveFileOptions): Promise<SaveResult> => {
    try {
      logger.info('録音ファイル保存開始', options)
      
      const result = await AdvancedRecordingFileService.saveRecording(recordingData, options)
      
      if (result.success) {
        logger.info('録音ファイル保存完了', result)
      } else {
        result.errors.forEach(error => addError('recording', error))
      }
      
      return result
    } catch (error) {
      const errorMessage = `ファイル保存エラー: ${error instanceof Error ? error.message : String(error)}`
      addError('recording', errorMessage)
      return {
        success: false,
        errors: [errorMessage]
      }
    }
  }, [recordingData, addError])

  // 保存プリセット機能
  const saveWithPreset = useCallback(async (presetName: keyof ReturnType<typeof AdvancedRecordingFileService.getPresetOptions>): Promise<SaveResult> => {
    const presets = AdvancedRecordingFileService.getPresetOptions()
    return saveRecording(presets[presetName])
  }, [saveRecording])


  // データ更新時のコールバック実行
  useEffect(() => {
    callbacks?.onDataUpdate?.(recordingData)
  }, [recordingData, callbacks])

  // クリーンアップ
  useEffect(() => {
    return () => {
      if (audioWorkletServiceRef.current) {
        audioWorkletServiceRef.current.stop().catch(error => {
          logger.error('録音サービスクリーンアップエラー:', error)
        })
      }
    }
  }, [])

  return {
    // 状態
    recordingData,
    isRecording: recordingData.isRecording,

    // アクション
    startRecording,
    stopRecording,
    updateConfig,
    downloadChunk,
    downloadAllChunks,

    // ファイル保存機能
    saveRecording,
    saveWithPreset,

    // ヘルパー
    getChunkById: (id: number) => recordingData.chunks.find(c => c.id === id),
    getTotalDuration: () => recordingData.duration,
    getTotalDataSize: () => recordingData.stats.totalDataSize,
    getChunksCount: () => recordingData.chunks.length,
    getErrorsCount: () => recordingData.errors.length,
    getTranscriptionCount: () => recordingData.chunks.filter(c => c.transcriptionText).length,
    hasTranscriptionData: () => recordingData.chunks.some(c => c.transcriptionText && c.transcriptionText.trim()),

    // 統計
    stats: recordingData.stats
  }
}

export default useAdvancedRecording