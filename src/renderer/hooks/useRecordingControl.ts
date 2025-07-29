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
import { AudioChunkGenerator, AudioChunkResult, ChunkGeneratorConfig, ChunkFileInfo } from '../audio/services/processing/AudioChunkGenerator'
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
  onTranscriptionUpdate?: (transcriptionText: string) => void
}

/**
 * 録音制御カスタムフック
 */
export const useRecordingControl = (callbacks?: RecordingControlCallbacks) => {
  const recordingManager = useRecordingStateManager()
  
  // ログシステム
  const logger = LoggerFactory.getLogger(LogCategories.HOOK_RECORDING_CONTROL)
  
  // リアルタイム文字起こし関連のRef
  const chunkGeneratorRef = useRef<AudioChunkGenerator | null>(null)
  const realtimeProcessorRef = useRef<FileBasedRealtimeProcessor | null>(null)
  
  // リアルタイム文字起こし強制有効化フラグ
  const FORCE_ENABLE_REALTIME_TRANSCRIPTION = true
  
  // 文字起こし結果監視用
  const transcriptionMonitorRef = useRef<NodeJS.Timeout | null>(null)

  /**
   * リアルタイム文字起こしシステムの初期化
   */
  const initializeRealtimeTranscription = useCallback( async (
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
    
    // AudioChunkGeneratorを初期化
    if (!chunkGeneratorRef.current) {
      logger.debug('AudioChunkGenerator新規作成')
      const config: ChunkGeneratorConfig = {
        intervalSeconds: 20,
        enableFileGeneration: true,
        tempFolderPath: chunkFolderName,
        enableAutoGeneration: true
      }
      chunkGeneratorRef.current = new AudioChunkGenerator(config)
      logger.info('AudioChunkGenerator作成完了')
    } else {
      logger.debug('AudioChunkGenerator設定更新')
      chunkGeneratorRef.current.updateConfig({
        intervalSeconds: 20,
        enableFileGeneration: true,
        tempFolderPath: chunkFolderName,
        enableAutoGeneration: true
      })
      chunkGeneratorRef.current.reset()
      logger.info('AudioChunkGenerator設定更新完了')
    }
    
    // チャンク生成コールバック設定
    if (chunkGeneratorRef.current) {
      chunkGeneratorRef.current.onChunkGenerated((result: AudioChunkResult) => {
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
    }
    
    // チャンク保存コールバック設定（重複起動防止版）
    let isProcessorStarting = false // 起動中フラグ
    
    if (chunkGeneratorRef.current) {
      chunkGeneratorRef.current.onChunkSaved(async (fileInfo: ChunkFileInfo) => {
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
              
              // 実際のチャンクファイルパスから正しいフォルダパスを取得
              const actualChunkFolderPath = fileInfo.filepath.substring(0, fileInfo.filepath.lastIndexOf('\\'))
              const actualBaseFileName = actualChunkFolderPath.substring(actualChunkFolderPath.lastIndexOf('\\') + 1).replace('_chunks', '')
              const outputFilePath = `${actualChunkFolderPath.substring(0, actualChunkFolderPath.lastIndexOf('\\'))}\\${actualBaseFileName}_realtime.rt.txt`
              
              logger.info('リアルタイム文字起こし開始', { 
                input: actualChunkFolderPath, 
                output: outputFilePath,
                detectedFromFile: fileInfo.filepath
              })
            
            await realtimeProcessorRef.current.start(actualChunkFolderPath, outputFilePath)
            
            // 文字起こし結果の監視を開始
            setupTranscriptionMonitoring(outputFilePath)
            
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
      
      chunkGeneratorRef.current.onError((error) => {
        const now = Date.now()
        if (now - lastErrorTime < errorCooldown) {
          console.log(`⚠️ エラーコールバック重複防止: ${error}`)
          return
        }
        lastErrorTime = now
        
        console.error(`❌ チャンク生成エラー:`, error)
        callbacks?.onError?.(error instanceof Error ? error : new Error(String(error)))
      })
    }
    
    return { baseFileName, chunkFolderName }
  }, [callbacks, logger])

  /**
   * 文字起こし結果を監視して、UIに更新を通知
   */
  const setupTranscriptionMonitoring = useCallback(async (outputFilePath: string) => {
    logger.info('文字起こし結果監視開始', { outputFilePath })
    
    // 既存の監視を停止
    if (transcriptionMonitorRef.current) {
      clearInterval(transcriptionMonitorRef.current)
    }
    
    let lastFileSize = 0
    
    transcriptionMonitorRef.current = setInterval(async () => {
      try {
        // ファイルサイズをチェック
        const currentSize = await window.electronAPI.getFileSize(outputFilePath)
        
        if (currentSize > lastFileSize) {
          lastFileSize = currentSize
          
          // ファイル内容を読み取り
          const fileContentBuffer = await window.electronAPI.readFile(outputFilePath)
          let fileContent: string;
          
          if (fileContentBuffer instanceof Buffer) {
            fileContent = fileContentBuffer.toString('utf-8');
          } else if (fileContentBuffer instanceof Uint8Array) {
            fileContent = new TextDecoder('utf-8').decode(fileContentBuffer);
          } else if (typeof fileContentBuffer === 'string') {
            fileContent = fileContentBuffer;
          } else {
            logger.warn('予期しないファイル内容形式', { outputFilePath, type: typeof fileContentBuffer });
            return;
          }
          
          if (fileContent && callbacks?.onTranscriptionUpdate) {
            logger.debug('文字起こし結果更新', { fileSize: currentSize, contentLength: fileContent.length })
            
            // メタデータ部分を除いて本文のみを抽出
            const textContent = extractTranscriptionText(fileContent)
            callbacks.onTranscriptionUpdate(textContent)
          }
        }
      } catch (error) {
        logger.warn('文字起こし結果監視エラー', { outputFilePath }, error instanceof Error ? error : new Error(String(error)))
      }
    }, 2000) // 2秒間隔で監視
    
  }, [callbacks, logger])

  /**
   * ファイル内容から実際の文字起こしテキストを抽出
   */
  const extractTranscriptionText = useCallback((fileContent: string): string => {
    try {
      // 入力値検証
      if (typeof fileContent !== 'string') {
        logger.warn('文字起こしテキスト抽出: 無効な入力形式', { type: typeof fileContent });
        return String(fileContent);
      }
      
      logger.debug('文字起こしテキスト抽出開始', { 
        contentLength: fileContent.length, 
        preview: fileContent.substring(0, 200) 
      });
      
      // ## 本文 セクションを探す
      const mainTextMatch = fileContent.match(/## 本文\s*\n([\s\S]*?)(?:\n##|$)/);
      if (mainTextMatch && mainTextMatch[1]) {
        const extractedText = mainTextMatch[1].trim();
        logger.debug('本文セクション抽出成功', { extractedLength: extractedText.length });
        return extractedText;
      }
      
      // フォールバック: メタデータヘッダーがない場合はそのまま返す
      if (!fileContent.includes('## メタデータ')) {
        logger.debug('メタデータなしファイル、そのまま返す');
        return fileContent.trim();
      }
      
      logger.debug('本文セクションが見つからない');
      return '';
    } catch (error) {
      logger.warn('文字起こしテキスト抽出エラー', {}, error instanceof Error ? error : new Error(String(error)));
      return fileContent; // エラー時は元の内容をそのまま返す
    }
  }, [logger])

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
        if (chunkGeneratorRef.current) {
          await chunkGeneratorRef.current.startRecording()
          
          // データコールバック設定：RecordingServiceV2 → AudioChunkGenerator
          recordingManager.setDataCallback((data: Blob) => {
            if (chunkGeneratorRef.current) {
              logger.debug('チャンクデータ受信', { size: data.size })
              chunkGeneratorRef.current.addAudioData(data).catch(error => {
                logger.error('チャンクデータ追加エラー', error instanceof Error ? error : undefined, error)
              })
            } else {
              logger.warn('AudioChunkGenerator未初期化 - データ破棄', { size: data.size })
            }
          })
        }
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
  }, [recordingManager, callbacks])

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
      if (chunkGeneratorRef.current) {
        await chunkGeneratorRef.current.stopRecording()
        logger.info('AudioChunkGenerator停止完了')
      }
      
      // 文字起こし監視停止
      if (transcriptionMonitorRef.current) {
        clearInterval(transcriptionMonitorRef.current)
        transcriptionMonitorRef.current = null
        logger.info('文字起こし監視停止完了')
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
      
      // チャンク生成も一時停止（AudioChunkGeneratorには一時停止機能なし）
      logger.debug('チャンク生成一時停止（AudioChunkGeneratorは継続）')
      
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
      
      // チャンク生成も再開（AudioChunkGeneratorは自動継続）
      logger.debug('チャンク生成再開（AudioChunkGeneratorは自動継続）')
      
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
    if (chunkGeneratorRef.current) {
      logger.debug('AudioChunkGenerator停止中')
      try {
        chunkGeneratorRef.current.cleanup()
      } catch (error) {
        logger.error('AudioChunkGenerator停止エラー', error instanceof Error ? error : undefined, error)
      }
      chunkGeneratorRef.current = null
    }
    
    // 文字起こし監視停止
    if (transcriptionMonitorRef.current) {
      clearInterval(transcriptionMonitorRef.current)
      transcriptionMonitorRef.current = null
      logger.debug('文字起こし監視停止完了')
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