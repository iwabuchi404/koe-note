/**
 * useRecordingControl - 録音制御ロジックを分離したカスタムフック
 * 
 * 責務:
 * - 録音開始/停止/一時停止の制御
 * - リアルタイム文字起こしの統合
 * - チャンク生成とファイル処理
 * - エラーハンドリング
 */

import { useCallback, useRef } from 'react'
import { useRecordingStateManager } from './useRecordingStateManager'
import { TrueDifferentialChunkGenerator, TrueDifferentialResult } from '../services/TrueDifferentialChunkGenerator'
import { FileBasedRealtimeProcessor } from '../services/FileBasedRealtimeProcessor'
import { LoggerFactory, LogCategories } from '../utils/LoggerFactory'

export interface RecordingControlConfig {
  inputType: 'microphone' | 'desktop' | 'stereo-mix' | 'mixing'
  selectedDevice: string
  selectedDesktopSource?: string
  selectedSystemDevice?: string
  enableRealtimeTranscription: boolean
}

export interface RecordingControlCallbacks {
  onRecordingStart?: () => void
  onRecordingStopped?: () => void
  onError?: (error: Error) => void
}

/**
 * 録音制御カスタムフック
 */
export const useRecordingControl = (callbacks?: RecordingControlCallbacks) => {
  const recordingManager = useRecordingStateManager()
  
  // ログシステム
  const logger = LoggerFactory.getLogger(LogCategories.HOOK_RECORDING_CONTROL)
  
  // リアルタイム文字起こし関連のRef
  const trueDiffGeneratorRef = useRef<TrueDifferentialChunkGenerator | null>(null)
  const realtimeProcessorRef = useRef<FileBasedRealtimeProcessor | null>(null)
  
  // テスト用: リアルタイム文字起こし強制有効化フラグ
  const FORCE_ENABLE_REALTIME_TRANSCRIPTION = true

  /**
   * リアルタイム文字起こしシステムの初期化
   */
  const initializeRealtimeTranscription = useCallback(async (
    recordingFileName: string, 
    enableTranscription: boolean
  ) => {
    logger.info('リアルタイム文字起こし準備開始')
    
    // チャンクフォルダ名を録音ファイル名ベースで生成
    const baseFileName = recordingFileName.replace('.webm', '')
    const chunkFolderName = `${baseFileName}_chunks`
    logger.debug('チャンクファイル保存先フォルダ設定', { chunkFolderName })
    
    // FileBasedRealtimeProcessorを初期化
    if (!realtimeProcessorRef.current) {
      realtimeProcessorRef.current = new FileBasedRealtimeProcessor({
        fileCheckInterval: 2000,
        maxRetryCount: 2,
        processingTimeout: 180000,
        enableAutoRetry: true,
        textWriteInterval: 5000,
        enableAutoSave: true,
        textFormat: 'detailed'
      })
      logger.info('FileBasedRealtimeProcessor初期化完了')
    }
    
    // TrueDifferentialChunkGeneratorを初期化
    if (!trueDiffGeneratorRef.current) {
      logger.debug('TrueDifferentialChunkGenerator新規作成')
      trueDiffGeneratorRef.current = new TrueDifferentialChunkGenerator(20, {
        intervalSeconds: 20,
        enableFileGeneration: true,
        tempFolderPath: chunkFolderName,
        enableAutoGeneration: true
      })
      logger.info('TrueDifferentialChunkGenerator作成完了')
    } else {
      logger.debug('TrueDifferentialChunkGenerator設定更新')
      // 既存インスタンスの設定更新
      trueDiffGeneratorRef.current.updateConfig({
        intervalSeconds: 20,
        enableFileGeneration: true,
        tempFolderPath: chunkFolderName,
        enableAutoGeneration: true
      })
      trueDiffGeneratorRef.current.reset()
      logger.info('TrueDifferentialChunkGenerator設定更新完了')
    }
    
    // チャンク生成コールバック設定
    trueDiffGeneratorRef.current.onChunkGenerated((result: TrueDifferentialResult) => {
      logger.info('チャンク生成完了', {
        chunkNumber: result.chunkNumber,
        dataSize: result.dataSize,
        duration: result.duration.toFixed(1),
        filePath: result.filePath
      })
      if (!result.filePath) {
        logger.warn('チャンクファイルのパスが設定されていません', { chunkNumber: result.chunkNumber })
      }
    })
    
    // チャンク保存コールバック設定（重複起動防止版）
    let isProcessorStarting = false // 起動中フラグ
    
    trueDiffGeneratorRef.current.onChunkSaved(async (fileInfo) => {
      logger.debug('onChunkSaved コールバック実行', { 
        filename: fileInfo.filename, 
        sizeBytes: fileInfo.sizeBytes,
        filepath: fileInfo.filepath 
      })
      
      // リアルタイム文字起こし処理
      if ((enableTranscription || FORCE_ENABLE_REALTIME_TRANSCRIPTION) && realtimeProcessorRef.current) {
        logger.debug('FileBasedRealtimeProcessorに文字起こし開始要求', { filepath: fileInfo.filepath })
        
        try {
          // 重複起動チェック
          if (isProcessorStarting) {
            logger.warn('FileBasedRealtimeProcessor起動中のため要求をスキップ', { filename: fileInfo.filename })
            return
          }
          
          // 最初のチャンクの場合は必ずFileBasedRealtimeProcessorを開始
          const isFirstChunk = fileInfo.filename.includes('_001.webm')
          const isActive = realtimeProcessorRef.current.isActive()
          logger.debug('プロセッサ状態確認', { isFirstChunk, isActive })
          
          if (isFirstChunk && !isActive && !isProcessorStarting) {
            isProcessorStarting = true
            
            const settings = await window.electronAPI.loadSettings()
            const outputFilePath = `${settings.saveFolder}\\${baseFileName}_realtime.rt.txt`
            const absoluteChunkFolderPath = `${settings.saveFolder}\\${chunkFolderName}`
            logger.info('リアルタイム文字起こし開始', { 
              input: absoluteChunkFolderPath, 
              output: outputFilePath 
            })
            
            await realtimeProcessorRef.current.start(absoluteChunkFolderPath, outputFilePath)
            logger.info('FileBasedRealtimeProcessor開始完了')
            
            isProcessorStarting = false
          } else if (isActive) {
            logger.debug('FileBasedRealtimeProcessorは既にアクティブ - 新しいチャンクを直接処理', { filename: fileInfo.filename })
          } else {
            logger.debug('非最初チャンクのため処理スキップ', { filename: fileInfo.filename })
          }
        } catch (error) {
          isProcessorStarting = false
          logger.error('FileBasedRealtimeProcessor開始エラー', error instanceof Error ? error : undefined, error)
        }
      } else {
        logger.debug('文字起こし処理スキップ', { 
          enableTranscription, 
          forceEnable: FORCE_ENABLE_REALTIME_TRANSCRIPTION, 
          hasProcessor: !!realtimeProcessorRef.current 
        })
      }
    })
    
    // エラーコールバック設定（重複防止付き）
    let lastErrorTime = 0
    const errorCooldown = 5000 // 5秒間のクールダウン
    
    trueDiffGeneratorRef.current.onError((error) => {
      const now = Date.now()
      if (now - lastErrorTime < errorCooldown) {
        console.log(`⚠️ エラーコールバック重複防止: ${error}`)
        return
      }
      lastErrorTime = now
      
      console.error(`❌ チャンク生成エラー:`, error)
      callbacks?.onError?.(error instanceof Error ? error : new Error(String(error)))
    })
    
    return { baseFileName, chunkFolderName }
  }, [callbacks])

  /**
   * 録音開始（統合版）
   */
  const startRecording = useCallback(async (config: RecordingControlConfig) => {
    try {
      logger.info('録音開始リクエスト', config)
      
      // リアルタイム文字起こしの準備
      if (config.enableRealtimeTranscription || FORCE_ENABLE_REALTIME_TRANSCRIPTION) {
        // 録音ファイル名を事前に生成
        const recordingFileName = recordingManager.generateFileName()
        if (!recordingFileName) {
          throw new Error('録音ファイル名の生成に失敗しました')
        }
        
        // リアルタイム文字起こしシステム初期化
        await initializeRealtimeTranscription(recordingFileName, config.enableRealtimeTranscription)
        
        // 録音開始（チャンク生成開始）
        trueDiffGeneratorRef.current?.startRecording()
        
        // データコールバック設定：RecordingServiceV2 → TrueDifferentialChunkGenerator
        recordingManager.setDataCallback((data: Blob) => {
          if (trueDiffGeneratorRef.current) {
            logger.debug('チャンクデータ受信', { size: data.size })
            try {
              trueDiffGeneratorRef.current.addRecordingData(data)
              logger.debug('チャンクデータ追加成功', { size: data.size })
            } catch (error) {
              logger.error('チャンクデータ追加エラー', error instanceof Error ? error : undefined, error)
            }
          } else {
            logger.warn('TrueDifferentialChunkGenerator未初期化 - データ破棄', { size: data.size })
          }
        })
      }
      
      // 録音開始
      await recordingManager.startRecording({
        inputType: config.inputType,
        selectedDevice: config.selectedDevice || 'default',
        enableRealtimeTranscription: config.enableRealtimeTranscription
      })
      
      logger.info('録音開始成功')
      callbacks?.onRecordingStart?.()
      
    } catch (error) {
      logger.error('録音開始エラー', error instanceof Error ? error : undefined, error)
      const errorObj = error instanceof Error ? error : new Error(String(error))
      callbacks?.onError?.(errorObj)
      throw errorObj
    }
  }, [recordingManager, initializeRealtimeTranscription, callbacks])

  /**
   * 録音停止
   */
  const stopRecording = useCallback(async () => {
    try {
      logger.info('録音停止リクエスト')
      
      // 録音停止（先にRecordingServiceを停止）
      await recordingManager.stopRecording()
      
      // リアルタイム文字起こし停止
      if (realtimeProcessorRef.current) {
        await realtimeProcessorRef.current.stop()
        logger.info('リアルタイム文字起こし停止完了')
      }
      
      // チャンク生成停止（最後に停止）
      if (trueDiffGeneratorRef.current) {
        trueDiffGeneratorRef.current.stopRecording()
        logger.info('チャンク生成停止完了')
      }
      
      logger.info('録音停止成功')
      callbacks?.onRecordingStopped?.()
      
    } catch (error) {
      logger.error('録音停止エラー', error instanceof Error ? error : undefined, error)
      const errorObj = error instanceof Error ? error : new Error(String(error))
      callbacks?.onError?.(errorObj)
      throw errorObj
    }
  }, [recordingManager, callbacks])

  /**
   * 録音一時停止
   */
  const pauseRecording = useCallback(async () => {
    try {
      await recordingManager.pauseRecording()
      
      // チャンク生成も一時停止
      if (trueDiffGeneratorRef.current) {
        // TrueDifferentialChunkGeneratorに一時停止機能があれば使用
        logger.debug('チャンク生成一時停止')
      }
      
    } catch (error) {
      logger.error('録音一時停止エラー', error instanceof Error ? error : undefined, error)
      const errorObj = error instanceof Error ? error : new Error(String(error))
      callbacks?.onError?.(errorObj)
      throw errorObj
    }
  }, [recordingManager, callbacks])

  /**
   * 録音再開
   */
  const resumeRecording = useCallback(async () => {
    try {
      await recordingManager.resumeRecording()
      
      // チャンク生成も再開
      if (trueDiffGeneratorRef.current) {
        logger.debug('チャンク生成再開')
        // 必要に応じてチャンク生成を再開
      }
      
    } catch (error) {
      logger.error('録音再開エラー', error instanceof Error ? error : undefined, error)
      const errorObj = error instanceof Error ? error : new Error(String(error))
      callbacks?.onError?.(errorObj)
      throw errorObj
    }
  }, [recordingManager, callbacks])

  /**
   * クリーンアップ
   */
  const cleanup = useCallback(() => {
    logger.info('クリーンアップ開始')
    
    // 順序重要: 録音停止 → 文字起こし停止 → チャンク生成停止
    
    // リアルタイム文字起こし停止
    if (realtimeProcessorRef.current) {
      logger.debug('FileBasedRealtimeProcessor停止中')
      realtimeProcessorRef.current.stop().catch((error) => {
        logger.error('FileBasedRealtimeProcessor停止エラー', error instanceof Error ? error : undefined, error)
      })
      realtimeProcessorRef.current = null
    }
    
    // チャンク生成停止
    if (trueDiffGeneratorRef.current) {
      logger.debug('TrueDifferentialChunkGenerator停止中')
      try {
        trueDiffGeneratorRef.current.stopRecording()
      } catch (error) {
        logger.error('TrueDifferentialChunkGenerator停止エラー', error instanceof Error ? error : undefined, error)
      }
      trueDiffGeneratorRef.current = null
    }
    
    logger.info('クリーンアップ完了')
  }, [])

  return {
    // 状態（recordingManagerから継承）
    isRecording: recordingManager.isRecording,
    isPaused: recordingManager.isPaused,
    isStopping: recordingManager.isStopping,
    currentRecordingTime: recordingManager.currentRecordingTime,
    hasError: recordingManager.hasError,
    
    // アクション
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    cleanup,
    
    // 高度な操作
    recordingManager
  }
}