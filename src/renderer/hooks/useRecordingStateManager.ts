/**
 * useRecordingStateManager - RecordingStateManagerとReactコンポーネントを橋渡しするカスタムフック
 * 
 * 役割:
 * - RecordingStateManagerのReactフック化
 * - 既存コンポーネントとの段階的統合
 * - 状態変更の自動的なUI更新
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { RecordingStateManager, type RecordingStateListener } from '../services/state/RecordingStateManager'
import { 
  RecordingState, 
  RecordingConfig,
  RecordingSession,
  RecordingError,
  AudioDeviceInfo,
  MicrophoneStatus
} from '../state/RecordingState'

/**
 * RecordingStateManagerのカスタムフック
 * 既存のBottomPanelとの段階的統合を支援
 */
export const useRecordingStateManager = () => {
  // RecordingStateManagerのインスタンス
  const managerRef = useRef<RecordingStateManager | null>(null)
  
  // React管理の状態（RecordingStateManagerから同期）
  const [recordingState, setRecordingState] = useState<RecordingState | null>(null)
  
  // 初期化状態
  const [isInitialized, setIsInitialized] = useState<boolean>(false)
  
  // エラー状態
  const [initializationError, setInitializationError] = useState<string | null>(null)

  /**
   * RecordingStateManager初期化
   */
  useEffect(() => {
    const initializeManager = async () => {
      try {
        console.log('useRecordingStateManager: 初期化開始')
        
        // RecordingStateManagerインスタンス作成
        const manager = new RecordingStateManager()
        managerRef.current = manager
        
        // 初期状態を取得
        const initialState = manager.getState()
        setRecordingState(initialState)
        
        // 状態変更リスナーを設定
        const stateListener: RecordingStateListener = (newState: RecordingState) => {
          console.log('useRecordingStateManager: 状態更新', {
            status: newState.status,
            session: !!newState.session,
            error: !!newState.error,
            devices: newState.availableDevices.length
          })
          setRecordingState(newState)
        }
        
        manager.addListener(stateListener)
        
        // 初期化完了
        setIsInitialized(true)
        setInitializationError(null)
        console.log('useRecordingStateManager: 初期化完了')
        
        // クリーンアップ関数を登録
        return () => {
          console.log('useRecordingStateManager: クリーンアップ実行')
          manager.removeListener(stateListener)
          manager.dispose()
          managerRef.current = null
        }
        
      } catch (error) {
        console.error('useRecordingStateManager: 初期化エラー', error)
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
   * 録音開始
   */
  const startRecording = useCallback(async (config?: Partial<RecordingConfig>) => {
    if (!managerRef.current || !isInitialized) {
      console.warn('RecordingStateManager が初期化されていません')
      return false
    }

    try {
      await managerRef.current.startRecording(config)
      return true
    } catch (error) {
      console.error('録音開始エラー:', error)
      return false
    }
  }, [isInitialized])

  /**
   * 録音停止
   */
  const stopRecording = useCallback(async () => {
    if (!managerRef.current || !isInitialized) {
      console.warn('RecordingStateManager が初期化されていません')
      return false
    }

    try {
      await managerRef.current.stopRecording()
      return true
    } catch (error) {
      console.error('録音停止エラー:', error)
      return false
    }
  }, [isInitialized])

  /**
   * 録音一時停止
   */
  const pauseRecording = useCallback(async () => {
    if (!managerRef.current || !isInitialized) {
      console.warn('RecordingStateManager が初期化されていません')
      return false
    }

    try {
      await managerRef.current.pauseRecording()
      return true
    } catch (error) {
      console.error('録音一時停止エラー:', error)
      return false
    }
  }, [isInitialized])

  /**
   * 録音再開
   */
  const resumeRecording = useCallback(async () => {
    if (!managerRef.current || !isInitialized) {
      console.warn('RecordingStateManager が初期化されていません')
      return false
    }

    try {
      await managerRef.current.resumeRecording()
      return true
    } catch (error) {
      console.error('録音再開エラー:', error)
      return false
    }
  }, [isInitialized])

  /**
   * 設定更新
   */
  const updateConfig = useCallback((config: Partial<RecordingConfig>) => {
    if (!managerRef.current || !isInitialized) {
      console.warn('RecordingStateManager が初期化されていません')
      return
    }

    managerRef.current.updateConfig(config)
  }, [isInitialized])

  /**
   * デバイス一覧更新
   */
  const refreshDevices = useCallback(async () => {
    if (!managerRef.current || !isInitialized) {
      console.warn('RecordingStateManager が初期化されていません')
      return false
    }

    try {
      await managerRef.current.updateAvailableDevices()
      return true
    } catch (error) {
      console.error('デバイス更新エラー:', error)
      return false
    }
  }, [isInitialized])

  /**
   * マイクロフォン状態更新
   */
  const updateMicrophoneStatus = useCallback((status: MicrophoneStatus) => {
    if (!managerRef.current || !isInitialized) {
      console.warn('RecordingStateManager が初期化されていません')
      return
    }

    managerRef.current.updateMicrophoneStatus(status)
  }, [isInitialized])

  /**
   * エラークリア
   */
  const clearError = useCallback(() => {
    if (!managerRef.current || !isInitialized) {
      console.warn('RecordingStateManager が初期化されていません')
      return
    }

    managerRef.current.clearError()
  }, [isInitialized])

  /**
   * 現在の状態を取得（最新の状態を強制取得）
   */
  const getCurrentState = useCallback((): RecordingState | null => {
    if (!managerRef.current || !isInitialized) {
      return null
    }

    return managerRef.current.getState()
  }, [isInitialized])

  // 便利な状態プロパティ（computedプロパティ）
  const isRecording = recordingState?.status === 'recording'
  const isPaused = recordingState?.status === 'paused'
  const isStopping = recordingState?.status === 'stopping'
  const hasError = !!recordingState?.error
  const currentSession = recordingState?.session
  const availableDevices = recordingState?.availableDevices || []
  const currentConfig = recordingState?.config
  const microphoneStatus = recordingState?.microphoneStatus
  const audioLevels = recordingState?.audioLevels

  return {
    // 状態
    recordingState,
    isInitialized,
    initializationError,
    
    // 便利プロパティ
    isRecording,
    isPaused,
    isStopping,
    hasError,
    currentSession,
    availableDevices,
    currentConfig,
    microphoneStatus,
    audioLevels,
    
    // アクション
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    updateConfig,
    refreshDevices,
    updateMicrophoneStatus,
    clearError,
    getCurrentState,
    
    // 高度な操作
    manager: managerRef.current
  }
}

/**
 * 録音状態のデバッグ用ヘルパー
 */
export const useRecordingStateDebug = () => {
  const recordingHook = useRecordingStateManager()
  
  const debugState = useCallback(() => {
    const state = recordingHook.getCurrentState()
    if (state) {
      console.log('=== Recording State Debug ===')
      console.log('Status:', state.status)
      console.log('Session:', state.session)
      console.log('Config:', state.config)
      console.log('Available Devices:', state.availableDevices.length)
      console.log('Error:', state.error)
      console.log('Audio Levels:', state.audioLevels)
      console.log('Last Update:', state.lastUpdate)
      console.log('=== End Debug ===')
    } else {
      console.log('Recording State is not available')
    }
  }, [recordingHook])

  const testRecording = useCallback(async () => {
    console.log('=== Recording Test Start ===')
    
    // デバイス更新
    console.log('1. Refreshing devices...')
    await recordingHook.refreshDevices()
    
    // 5秒間録音テスト
    console.log('2. Starting recording...')
    const startResult = await recordingHook.startRecording({
      inputType: 'microphone',
      selectedDevice: 'default',
      quality: 'medium',
      format: 'webm',
      enableRealtimeTranscription: false
    })
    
    if (startResult) {
      console.log('3. Recording started, waiting 5 seconds...')
      setTimeout(async () => {
        console.log('4. Stopping recording...')
        const stopResult = await recordingHook.stopRecording()
        console.log('5. Recording stopped:', stopResult)
        console.log('=== Recording Test End ===')
      }, 5000)
    } else {
      console.log('3. Failed to start recording')
      console.log('=== Recording Test Failed ===')
    }
  }, [recordingHook])

  return {
    ...recordingHook,
    debugState,
    testRecording
  }
}

// グローバルデバッグ関数（開発用）
if (typeof window !== 'undefined') {
  (window as any).debugRecordingState = () => {
    console.log('Recording State Debug機能は useRecordingStateDebug フックを使用してコンポーネント内で実行してください')
  }
}