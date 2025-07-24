/**
 * useTranscriptionStateManager - TranscriptionStateManagerとReactコンポーネントを橋渡しするカスタムフック
 * 
 * 役割:
 * - TranscriptionStateManagerのReactフック化
 * - 既存文字起こしコンポーネントとの段階的統合
 * - 状態変更の自動的なUI更新
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { TranscriptionStateManager, type TranscriptionStateListener } from '../services/state/TranscriptionStateManager'
import { 
  TranscriptionState, 
  TranscriptionConfig,
  TranscriptionResult,
  TranscriptionError,
  TranscriptionProgress,
  RealtimeTranscriptionChunk,
  ServerConnectionState,
  TranscriptionSegment
} from '../state/TranscriptionState'
import { AudioFileInfo } from '../state/ApplicationState'

/**
 * TranscriptionStateManagerのカスタムフック
 * 既存の文字起こしコンポーネントとの段階的統合を支援
 */
export const useTranscriptionStateManager = () => {
  // TranscriptionStateManagerのインスタンス
  const managerRef = useRef<TranscriptionStateManager | null>(null)
  
  // React管理の状態（TranscriptionStateManagerから同期）
  const [transcriptionState, setTranscriptionState] = useState<TranscriptionState | null>(null)
  
  // 初期化状態
  const [isInitialized, setIsInitialized] = useState<boolean>(false)
  
  // エラー状態
  const [initializationError, setInitializationError] = useState<string | null>(null)

  /**
   * TranscriptionStateManager初期化
   */
  useEffect(() => {
    const initializeManager = async () => {
      try {
        console.log('useTranscriptionStateManager: 初期化開始')
        
        // TranscriptionStateManagerインスタンス作成
        const manager = new TranscriptionStateManager()
        managerRef.current = manager
        
        // 初期状態を取得
        const initialState = manager.getState()
        setTranscriptionState(initialState)
        
        // 状態変更リスナーを設定
        const stateListener: TranscriptionStateListener = (newState: TranscriptionState) => {
          console.log('useTranscriptionStateManager: 状態更新', {
            status: newState.status,
            mode: newState.mode,
            hasResult: !!newState.currentResult,
            error: !!newState.error,
            serverConnected: newState.serverConnection.isConnected
          })
          setTranscriptionState(newState)
        }
        
        manager.addListener(stateListener)
        
        // 初期化完了
        setIsInitialized(true)
        setInitializationError(null)
        console.log('useTranscriptionStateManager: 初期化完了')
        
        // クリーンアップ関数を登録
        return () => {
          console.log('useTranscriptionStateManager: クリーンアップ実行')
          manager.removeListener(stateListener)
          manager.dispose()
          managerRef.current = null
        }
        
      } catch (error) {
        console.error('useTranscriptionStateManager: 初期化エラー', error)
        setInitializationError(error instanceof Error ? error.message : '初期化に失敗しました')
        setIsInitialized(false)
      }
    }

    initializeManager()
    
    // コンポーネントアンマウント時のクリーンアップ
    return () => {
      if (managerRef.current) {
        managerRef.current.dispose()
        managerRef.current = null
      }
    }
  }, [])

  /**
   * ファイル文字起こし開始
   */
  const startFileTranscription = useCallback(async (
    audioFile: AudioFileInfo, 
    config?: Partial<TranscriptionConfig>
  ) => {
    if (!managerRef.current || !isInitialized) {
      console.warn('TranscriptionStateManager が初期化されていません')
      return false
    }

    try {
      await managerRef.current.startFileTranscription(audioFile, config)
      return true
    } catch (error) {
      console.error('ファイル文字起こし開始エラー:', error)
      return false
    }
  }, [isInitialized])

  /**
   * リアルタイム文字起こし開始
   */
  const startRealtimeTranscription = useCallback(async (
    audioStream: MediaStream,
    config?: Partial<TranscriptionConfig>
  ) => {
    if (!managerRef.current || !isInitialized) {
      console.warn('TranscriptionStateManager が初期化されていません')
      return false
    }

    try {
      await managerRef.current.startRealtimeTranscription(audioStream, config)
      return true
    } catch (error) {
      console.error('リアルタイム文字起こし開始エラー:', error)
      return false
    }
  }, [isInitialized])

  /**
   * 文字起こし停止
   */
  const stopTranscription = useCallback(async () => {
    if (!managerRef.current || !isInitialized) {
      console.warn('TranscriptionStateManager が初期化されていません')
      return false
    }

    try {
      await managerRef.current.stopTranscription()
      return true
    } catch (error) {
      console.error('文字起こし停止エラー:', error)
      return false
    }
  }, [isInitialized])

  /**
   * 文字起こし一時停止
   */
  const pauseTranscription = useCallback(async () => {
    if (!managerRef.current || !isInitialized) {
      console.warn('TranscriptionStateManager が初期化されていません')
      return false
    }

    try {
      await managerRef.current.pauseTranscription()
      return true
    } catch (error) {
      console.error('文字起こし一時停止エラー:', error)
      return false
    }
  }, [isInitialized])

  /**
   * 文字起こし再開
   */
  const resumeTranscription = useCallback(async () => {
    if (!managerRef.current || !isInitialized) {
      console.warn('TranscriptionStateManager が初期化されていません')
      return false
    }

    try {
      await managerRef.current.resumeTranscription()
      return true
    } catch (error) {
      console.error('文字起こし再開エラー:', error)
      return false
    }
  }, [isInitialized])

  /**
   * 設定更新
   */
  const updateConfig = useCallback((config: Partial<TranscriptionConfig>) => {
    if (!managerRef.current || !isInitialized) {
      console.warn('TranscriptionStateManager が初期化されていません')
      return
    }

    managerRef.current.updateConfig(config)
  }, [isInitialized])

  /**
   * セグメント更新
   */
  const updateSegment = useCallback((segmentId: string, updates: Partial<TranscriptionSegment>) => {
    if (!managerRef.current || !isInitialized) {
      console.warn('TranscriptionStateManager が初期化されていません')
      return
    }

    managerRef.current.updateSegment(segmentId, updates)
  }, [isInitialized])

  /**
   * サーバー接続確認
   */
  const checkServerConnection = useCallback(async () => {
    if (!managerRef.current || !isInitialized) {
      console.warn('TranscriptionStateManager が初期化されていません')
      return false
    }

    try {
      await managerRef.current.checkServerConnection()
      return true
    } catch (error) {
      console.error('サーバー接続確認エラー:', error)
      return false
    }
  }, [isInitialized])

  /**
   * エラークリア
   */
  const clearError = useCallback(() => {
    if (!managerRef.current || !isInitialized) {
      console.warn('TranscriptionStateManager が初期化されていません')
      return
    }

    managerRef.current.clearError()
  }, [isInitialized])

  /**
   * 現在の状態を取得（最新の状態を強制取得）
   */
  const getCurrentState = useCallback((): TranscriptionState | null => {
    if (!managerRef.current || !isInitialized) {
      return null
    }

    return managerRef.current.getState()
  }, [isInitialized])

  // 便利な状態プロパティ（computedプロパティ）
  const isIdle = transcriptionState?.status === 'idle'
  const isInitializing = transcriptionState?.status === 'initializing'
  const isProcessing = transcriptionState?.status === 'processing'
  const isPaused = transcriptionState?.status === 'paused'
  const isCompleted = transcriptionState?.status === 'completed'
  const isCompleting = transcriptionState?.status === 'completing'
  const hasError = !!transcriptionState?.error
  const isFileMode = transcriptionState?.mode === 'file'
  const isRealtimeMode = transcriptionState?.mode === 'realtime'
  const currentResult = transcriptionState?.currentResult
  const currentProgress = transcriptionState?.progress
  const realtimeChunks = transcriptionState?.realtimeChunks || []
  const currentChunk = transcriptionState?.currentChunk
  const recentResults = transcriptionState?.recentResults || []
  const serverConnection = transcriptionState?.serverConnection
  const currentConfig = transcriptionState?.config

  return {
    // 状態
    transcriptionState,
    isInitialized,
    initializationError,
    
    // 便利プロパティ
    isIdle,
    isInitializing,
    isProcessing,
    isPaused,
    isCompleted,
    isCompleting,
    hasError,
    isFileMode,
    isRealtimeMode,
    currentResult,
    currentProgress,
    realtimeChunks,
    currentChunk,
    recentResults,
    serverConnection,
    currentConfig,
    
    // アクション
    startFileTranscription,
    startRealtimeTranscription,
    stopTranscription,
    pauseTranscription,
    resumeTranscription,
    updateConfig,
    updateSegment,
    checkServerConnection,
    clearError,
    getCurrentState,
    
    // 高度な操作
    manager: managerRef.current
  }
}

/**
 * 文字起こし状態のデバッグ用ヘルパー
 */
export const useTranscriptionStateDebug = () => {
  const transcriptionHook = useTranscriptionStateManager()
  
  const debugState = useCallback(() => {
    const state = transcriptionHook.getCurrentState()
    if (state) {
      console.log('=== Transcription State Debug ===')
      console.log('Status:', state.status)
      console.log('Mode:', state.mode)
      console.log('Config:', state.config)
      console.log('Current Result:', state.currentResult)
      console.log('Progress:', state.progress)
      console.log('Error:', state.error)
      console.log('Server Connection:', state.serverConnection)
      console.log('Realtime Chunks:', state.realtimeChunks.length)
      console.log('Recent Results:', state.recentResults.length)
      console.log('Last Update:', state.lastUpdate)
      console.log('=== End Debug ===')
    } else {
      console.log('Transcription State is not available')
    }
  }, [transcriptionHook])

  const testFileTranscription = useCallback(async () => {
    console.log('=== File Transcription Test Start ===')
    
    // ダミーファイル情報
    const testFile: AudioFileInfo = {
      id: 'test_file_123',
      fileName: 'test.webm',
      filePath: '/path/to/test.webm',
      size: 1024,
      duration: 10.0,
      format: 'webm',
      createdAt: new Date(),
      modifiedAt: new Date(),
      isRecording: false,
      isSelected: true,
      isPlaying: false
    }
    
    // ファイル文字起こしテスト
    console.log('1. Starting file transcription...')
    const startResult = await transcriptionHook.startFileTranscription(testFile, {
      quality: 'medium',
      language: 'ja',
      enableTimestamp: true
    })
    
    if (startResult) {
      console.log('2. File transcription started successfully')
      console.log('3. Test completed')
    } else {
      console.log('2. Failed to start file transcription')
    }
    
    console.log('=== File Transcription Test End ===')
  }, [transcriptionHook])

  const testServerConnection = useCallback(async () => {
    console.log('=== Server Connection Test Start ===')
    
    console.log('1. Checking server connection...')
    const connectionResult = await transcriptionHook.checkServerConnection()
    
    console.log('2. Connection result:', connectionResult)
    console.log('3. Server state:', transcriptionHook.serverConnection)
    
    console.log('=== Server Connection Test End ===')
  }, [transcriptionHook])

  return {
    ...transcriptionHook,
    debugState,
    testFileTranscription,
    testServerConnection
  }
}

// グローバルデバッグ関数（開発用）
if (typeof window !== 'undefined') {
  (window as any).debugTranscriptionState = () => {
    console.log('Transcription State Debug機能は useTranscriptionStateDebug フックを使用してコンポーネント内で実行してください')
  }
}