/**
 * useRecordingControlV2 - 新しいAudioChunkGeneratorを使用するテスト版
 * 
 * 既存のuseRecordingControlと並行して動作するテスト版
 * AudioChunkGeneratorとWebMHeaderProcessorを使用
 */

import { useCallback, useRef } from 'react'
import { useRecordingStateManager } from './useRecordingStateManager'
import { AudioChunkGenerator, AudioChunkResult, ChunkGeneratorConfig, ChunkFileInfo } from '../audio/services/processing/AudioChunkGenerator'
import { FileBasedRealtimeProcessor } from '../services/FileBasedRealtimeProcessor'
import { LoggerFactory, LogCategories } from '../utils/LoggerFactory'

export interface RecordingControlV2Config {
  inputType: 'microphone' | 'desktop' | 'stereo-mix' | 'mixing'
  selectedDevice: string
  selectedDesktopSource?: string
  selectedSystemDevice?: string
  enableRealtimeTranscription: boolean
}

export interface RecordingControlV2Callbacks {
  onRecordingStart?: () => void
  onRecordingStopped?: () => void
  onError?: (error: Error) => void
  onTranscriptionUpdate?: (transcriptionText: string) => void
}

export const useRecordingControlV2 = (callbacks?: RecordingControlV2Callbacks) => {
  const recordingManager = useRecordingStateManager()
  const logger = LoggerFactory.getLogger(LogCategories.HOOK_RECORDING_CONTROL)
  
  // 新しいシステムのRef
  const chunkGeneratorRef = useRef<AudioChunkGenerator | null>(null)
  const realtimeProcessorRef = useRef<FileBasedRealtimeProcessor | null>(null)
  const transcriptionMonitorRef = useRef<NodeJS.Timeout | null>(null)
  
  /**
   * リアルタイム文字起こしシステムの初期化
   */
  const initializeRealtimeTranscription = useCallback(async (
    recordingFileName: string, 
    enableTranscription: boolean
  ) => {
    logger.info('リアルタイム文字起こし準備開始（V2）')
    
    const baseFileName = recordingFileName.replace('.webm', '')
    const chunkFolderName = `${baseFileName}_chunks`
    
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
      logger.info('FileBasedRealtimeProcessor初期化完了（V2）')
    }
    
    // AudioChunkGeneratorを初期化
    if (!chunkGeneratorRef.current) {
      const config: ChunkGeneratorConfig = {
        intervalSeconds: 20,
        enableFileGeneration: true,
        tempFolderPath: chunkFolderName,
        enableAutoGeneration: true
      }
      chunkGeneratorRef.current = new AudioChunkGenerator(config)
      logger.info('AudioChunkGenerator作成完了（V2）')
    } else {
      chunkGeneratorRef.current.updateConfig({
        intervalSeconds: 20,
        enableFileGeneration: true,
        tempFolderPath: chunkFolderName,
        enableAutoGeneration: true
      })
      chunkGeneratorRef.current.reset()
      logger.info('AudioChunkGenerator設定更新完了（V2）')
    }
    
    // チャンク生成コールバック設定
    chunkGeneratorRef.current.onChunkGenerated((result: AudioChunkResult) => {
      logger.info('チャンク生成完了（V2）', {
        chunkNumber: result.chunkNumber,
        dataSize: result.dataSize,
        duration: result.duration.toFixed(1),
        filePath: result.filePath
      })
    })
    
    // チャンク保存コールバック設定
    let isProcessorStarting = false
    
    chunkGeneratorRef.current.onChunkSaved(async (fileInfo: ChunkFileInfo) => {
      logger.debug('onChunkSaved コールバック実行（V2）', { 
        filename: fileInfo.filename, 
        sizeBytes: fileInfo.sizeBytes,
        filepath: fileInfo.filepath 
      })
      
      // リアルタイム文字起こし処理
      if (enableTranscription && realtimeProcessorRef.current) {
        logger.debug('FileBasedRealtimeProcessorに文字起こし開始要求（V2）')
        
        try {
          if (isProcessorStarting) {
            logger.warn('FileBasedRealtimeProcessor起動中のため要求をスキップ（V2）')
            return
          }
          
          const isFirstChunk = fileInfo.filename.includes('_001.webm')
          const isActive = realtimeProcessorRef.current.isActive()
          
          if (isFirstChunk && !isActive && !isProcessorStarting) {
            isProcessorStarting = true
            
            const actualChunkFolderPath = fileInfo.filepath.substring(0, fileInfo.filepath.lastIndexOf('\\'))
            const actualBaseFileName = actualChunkFolderPath.substring(actualChunkFolderPath.lastIndexOf('\\') + 1).replace('_chunks', '')
            const outputFilePath = `${actualChunkFolderPath.substring(0, actualChunkFolderPath.lastIndexOf('\\'))}\\${actualBaseFileName}_realtime.rt.txt`
            
            logger.info('リアルタイム文字起こし開始（V2）', { 
              input: actualChunkFolderPath, 
              output: outputFilePath,
              detectedFromFile: fileInfo.filepath
            })
            
            await realtimeProcessorRef.current.start(actualChunkFolderPath, outputFilePath)
            
            // 文字起こし結果の監視を開始
            setupTranscriptionMonitoring(outputFilePath)
            
            isProcessorStarting = false
          }
        } catch (error) {
          isProcessorStarting = false
          logger.error('FileBasedRealtimeProcessor開始エラー（V2）', error instanceof Error ? error : undefined, error)
        }
      }
    })
    
    // エラーコールバック設定
    chunkGeneratorRef.current.onError((error) => {
      logger.error('チャンク生成エラー（V2）', error instanceof Error ? error : undefined, error)
      callbacks?.onError?.(error instanceof Error ? error : new Error(String(error)))
    })
    
    return { baseFileName, chunkFolderName }
  }, [callbacks, logger])

  /**
   * 文字起こし結果を監視
   */
  const setupTranscriptionMonitoring = useCallback(async (outputFilePath: string) => {
    logger.info('文字起こし結果監視開始（V2）', { outputFilePath })
    
    if (transcriptionMonitorRef.current) {
      clearInterval(transcriptionMonitorRef.current)
    }
    
    let lastFileSize = 0
    
    transcriptionMonitorRef.current = setInterval(async () => {
      try {
        const currentSize = await window.electronAPI.getFileSize(outputFilePath)
        
        if (currentSize > lastFileSize) {
          lastFileSize = currentSize
          
          const fileContentBuffer = await window.electronAPI.readFile(outputFilePath)
          let fileContent: string;
          
          if (fileContentBuffer instanceof Buffer) {
            fileContent = fileContentBuffer.toString('utf-8');
          } else if (fileContentBuffer instanceof Uint8Array) {
            fileContent = new TextDecoder('utf-8').decode(fileContentBuffer);
          } else if (typeof fileContentBuffer === 'string') {
            fileContent = fileContentBuffer;
          } else {
            return;
          }
          
          if (fileContent && callbacks?.onTranscriptionUpdate) {
            const textContent = extractTranscriptionText(fileContent)
            callbacks.onTranscriptionUpdate(textContent)
          }
        }
      } catch (error) {
        logger.warn('文字起こし結果監視エラー（V2）', { outputFilePath }, error instanceof Error ? error : new Error(String(error)))
      }
    }, 2000)
    
  }, [callbacks, logger])

  /**
   * 文字起こしテキスト抽出
   */
  const extractTranscriptionText = useCallback((fileContent: string): string => {
    try {
      const mainTextMatch = fileContent.match(/## 本文\s*\n([\s\S]*?)(?:\n##|$)/);
      if (mainTextMatch && mainTextMatch[1]) {
        return mainTextMatch[1].trim();
      }
      
      if (!fileContent.includes('## メタデータ')) {
        return fileContent.trim();
      }
      
      return '';
    } catch (error) {
      logger.warn('文字起こしテキスト抽出エラー（V2）', {}, error instanceof Error ? error : new Error(String(error)));
      return fileContent;
    }
  }, [logger])

  /**
   * 録音開始
   */
  const startRecording = useCallback(async (config: RecordingControlV2Config) => {
    try {
      logger.info('録音開始リクエスト（V2）', config)
      
      if (config.enableRealtimeTranscription) {
        const recordingFileName = recordingManager.generateFileName()
        if (!recordingFileName) {
          throw new Error('録音ファイル名の生成に失敗しました')
        }
        
        await initializeRealtimeTranscription(recordingFileName, config.enableRealtimeTranscription)
        
        // AudioChunkGenerator開始
        if (chunkGeneratorRef.current) {
          await chunkGeneratorRef.current.startRecording()
          
          // データコールバック設定
          recordingManager.setDataCallback((data: Blob) => {
            if (chunkGeneratorRef.current) {
              chunkGeneratorRef.current.addAudioData(data).catch(error => {
                logger.error('チャンクデータ追加エラー（V2）', error instanceof Error ? error : undefined, error)
              })
            }
          })
        }
      }
      
      await recordingManager.startRecording({
        inputType: config.inputType,
        selectedDevice: config.selectedDevice || 'default',
        enableRealtimeTranscription: config.enableRealtimeTranscription
      })
      
      logger.info('録音開始成功（V2）')
      callbacks?.onRecordingStart?.()
      
    } catch (error) {
      logger.error('録音開始エラー（V2）', error instanceof Error ? error : undefined, error)
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
      logger.info('録音停止リクエスト（V2）')
      
      await recordingManager.stopRecording()
      
      if (realtimeProcessorRef.current) {
        await realtimeProcessorRef.current.stop()
        logger.info('リアルタイム文字起こし停止完了（V2）')
      }
      
      if (chunkGeneratorRef.current) {
        await chunkGeneratorRef.current.stopRecording()
        logger.info('AudioChunkGenerator停止完了（V2）')
      }
      
      if (transcriptionMonitorRef.current) {
        clearInterval(transcriptionMonitorRef.current)
        transcriptionMonitorRef.current = null
        logger.info('文字起こし監視停止完了（V2）')
      }
      
      logger.info('録音停止成功（V2）')
      callbacks?.onRecordingStopped?.()
      
    } catch (error) {
      logger.error('録音停止エラー（V2）', error instanceof Error ? error : undefined, error)
      const errorObj = error instanceof Error ? error : new Error(String(error))
      callbacks?.onError?.(errorObj)
      throw errorObj
    }
  }, [recordingManager, callbacks])

  /**
   * クリーンアップ
   */
  const cleanup = useCallback(() => {
    logger.info('クリーンアップ開始（V2）')
    
    if (realtimeProcessorRef.current) {
      realtimeProcessorRef.current.stop().catch((error) => {
        logger.error('FileBasedRealtimeProcessor停止エラー（V2）', error instanceof Error ? error : undefined, error)
      })
      realtimeProcessorRef.current = null
    }
    
    if (chunkGeneratorRef.current) {
      chunkGeneratorRef.current.cleanup()
      chunkGeneratorRef.current = null
    }
    
    if (transcriptionMonitorRef.current) {
      clearInterval(transcriptionMonitorRef.current)
      transcriptionMonitorRef.current = null
    }
    
    logger.info('クリーンアップ完了（V2）')
  }, [logger])

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
    cleanup,
    
    // 高度な操作
    recordingManager
  }
}