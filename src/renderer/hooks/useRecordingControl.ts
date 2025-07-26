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
    console.log('📝 リアルタイム文字起こし準備開始')
    
    // チャンクフォルダ名を録音ファイル名ベースで生成
    const baseFileName = recordingFileName.replace('.webm', '')
    const chunkFolderName = `${baseFileName}_chunks`
    console.log(`🔧 チャンクファイル保存先フォルダ: ${chunkFolderName}`)
    
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
      console.log('🎯 FileBasedRealtimeProcessor初期化完了')
    }
    
    // TrueDifferentialChunkGeneratorを初期化
    if (!trueDiffGeneratorRef.current) {
      console.log(`🔧 TrueDifferentialChunkGenerator新規作成`)
      trueDiffGeneratorRef.current = new TrueDifferentialChunkGenerator(20, {
        intervalSeconds: 20,
        enableFileGeneration: true,
        tempFolderPath: chunkFolderName,
        enableAutoGeneration: true
      })
      console.log(`🔧 TrueDifferentialChunkGenerator作成完了`)
    } else {
      console.log(`🔧 TrueDifferentialChunkGenerator設定更新`)
      // 既存インスタンスの設定更新
      trueDiffGeneratorRef.current.updateConfig({
        intervalSeconds: 20,
        enableFileGeneration: true,
        tempFolderPath: chunkFolderName,
        enableAutoGeneration: true
      })
      trueDiffGeneratorRef.current.reset()
      console.log(`🔧 TrueDifferentialChunkGenerator設定更新完了`)
    }
    
    // チャンク生成コールバック設定
    trueDiffGeneratorRef.current.onChunkGenerated((result: TrueDifferentialResult) => {
      console.log(`✅ チャンク生成完了: #${result.chunkNumber}, ${result.dataSize}bytes, ${result.duration.toFixed(1)}s`)
      if (result.filePath) {
        console.log(`💾 チャンクファイル保存: ${result.filePath}`)
      } else {
        console.warn(`⚠️ チャンクファイルのパスが設定されていません: #${result.chunkNumber}`)
      }
    })
    
    // チャンク保存コールバック設定（重複起動防止版）
    let isProcessorStarting = false // 起動中フラグ
    
    trueDiffGeneratorRef.current.onChunkSaved(async (fileInfo) => {
      console.log(`🔥 onChunkSaved コールバック実行: ${fileInfo.filename} (${fileInfo.sizeBytes}bytes)`)
      console.log(`🔥 ファイルパス: ${fileInfo.filepath}`)
      
      // リアルタイム文字起こし処理
      if ((enableTranscription || FORCE_ENABLE_REALTIME_TRANSCRIPTION) && realtimeProcessorRef.current) {
        console.log(`🔗 FileBasedRealtimeProcessorに文字起こし開始要求: ${fileInfo.filepath}`)
        
        try {
          // 重複起動チェック
          if (isProcessorStarting) {
            console.log(`⚠️ FileBasedRealtimeProcessor起動中のため、この要求をスキップ: ${fileInfo.filename}`)
            return
          }
          
          // 最初のチャンクの場合は必ずFileBasedRealtimeProcessorを開始
          const isFirstChunk = fileInfo.filename.includes('_001.webm')
          const isActive = realtimeProcessorRef.current.isActive()
          console.log(`🔥 isFirstChunk: ${isFirstChunk}, realtimeProcessor.isActive(): ${isActive}`)
          
          if (isFirstChunk && !isActive && !isProcessorStarting) {
            isProcessorStarting = true
            
            const settings = await window.electronAPI.loadSettings()
            const outputFilePath = `${settings.saveFolder}\\${baseFileName}_realtime.rt.txt`
            const absoluteChunkFolderPath = `${settings.saveFolder}\\${chunkFolderName}`
            console.log(`📝 リアルタイム文字起こし開始: ${absoluteChunkFolderPath} -> ${outputFilePath}`)
            
            await realtimeProcessorRef.current.start(absoluteChunkFolderPath, outputFilePath)
            console.log(`✅ FileBasedRealtimeProcessor開始完了`)
            
            isProcessorStarting = false
          } else if (isActive) {
            console.log(`ℹ️ FileBasedRealtimeProcessorは既にアクティブです - 新しいチャンクを直接処理: ${fileInfo.filename}`)
          } else {
            console.log(`ℹ️ 非最初チャンクのため処理スキップ: ${fileInfo.filename}`)
          }
        } catch (error) {
          isProcessorStarting = false
          console.error('❌ FileBasedRealtimeProcessor開始エラー:', error)
          if (error instanceof Error) {
            console.error('❌ エラー詳細:', error.stack)
          }
        }
      } else {
        console.log(`⚠️ 文字起こし処理スキップ: enableTranscription=${enableTranscription}, FORCE=${FORCE_ENABLE_REALTIME_TRANSCRIPTION}, processor=${!!realtimeProcessorRef.current}`)
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
      console.log('🎵 useRecordingControl: 録音開始リクエスト', config)
      
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
            console.log(`📝 チャンクデータ受信: ${data.size} bytes`)
            try {
              trueDiffGeneratorRef.current.addRecordingData(data)
              console.log(`✅ チャンクデータ追加成功: ${data.size} bytes`)
            } catch (error) {
              console.error(`❌ チャンクデータ追加エラー:`, error)
            }
          } else {
            console.warn(`⚠️ TrueDifferentialChunkGeneratorが初期化されていません - データ破棄: ${data.size} bytes`)
          }
        })
      }
      
      // 録音開始
      await recordingManager.startRecording({
        inputType: config.inputType,
        selectedDevice: config.selectedDevice || 'default',
        enableRealtimeTranscription: config.enableRealtimeTranscription
      })
      
      console.log('🎵 useRecordingControl: 録音開始成功')
      callbacks?.onRecordingStart?.()
      
    } catch (error) {
      console.error('🎵 useRecordingControl: 録音開始エラー:', error)
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
      console.log('⏹️ useRecordingControl: 録音停止リクエスト')
      
      // 録音停止（先にRecordingServiceを停止）
      await recordingManager.stopRecording()
      
      // リアルタイム文字起こし停止
      if (realtimeProcessorRef.current) {
        await realtimeProcessorRef.current.stop()
        console.log('📝 リアルタイム文字起こし停止完了')
      }
      
      // チャンク生成停止（最後に停止）
      if (trueDiffGeneratorRef.current) {
        trueDiffGeneratorRef.current.stopRecording()
        console.log('🔧 チャンク生成停止完了')
      }
      
      console.log('⏹️ useRecordingControl: 録音停止成功')
      callbacks?.onRecordingStopped?.()
      
    } catch (error) {
      console.error('⏹️ useRecordingControl: 録音停止エラー:', error)
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
        console.log('⏸️ チャンク生成一時停止')
      }
      
    } catch (error) {
      console.error('⏸️ useRecordingControl: 録音一時停止エラー:', error)
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
        console.log('▶️ チャンク生成再開')
        // 必要に応じてチャンク生成を再開
      }
      
    } catch (error) {
      console.error('▶️ useRecordingControl: 録音再開エラー:', error)
      const errorObj = error instanceof Error ? error : new Error(String(error))
      callbacks?.onError?.(errorObj)
      throw errorObj
    }
  }, [recordingManager, callbacks])

  /**
   * クリーンアップ
   */
  const cleanup = useCallback(() => {
    console.log('🧹 useRecordingControl: クリーンアップ開始')
    
    // 順序重要: 録音停止 → 文字起こし停止 → チャンク生成停止
    
    // リアルタイム文字起こし停止
    if (realtimeProcessorRef.current) {
      console.log('🧹 FileBasedRealtimeProcessor停止中...')
      realtimeProcessorRef.current.stop().catch((error) => {
        console.error('🧹 FileBasedRealtimeProcessor停止エラー:', error)
      })
      realtimeProcessorRef.current = null
    }
    
    // チャンク生成停止
    if (trueDiffGeneratorRef.current) {
      console.log('🧹 TrueDifferentialChunkGenerator停止中...')
      try {
        trueDiffGeneratorRef.current.stopRecording()
      } catch (error) {
        console.error('🧹 TrueDifferentialChunkGenerator停止エラー:', error)
      }
      trueDiffGeneratorRef.current = null
    }
    
    console.log('🧹 useRecordingControl: クリーンアップ完了')
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