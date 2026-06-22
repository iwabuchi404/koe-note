/**
 * useBottomPanelState - BottomPanelのUI状態管理を分離したカスタムフック
 * 
 * 責務:
 * - 入力タイプ（マイク、デスクトップ、ミキシング）の管理
 * - オーディオミキシング設定の管理
 * - マイクロフォン監視状態の管理
 * - UI表示状態の管理
 */

import { LoggerFactory, LogCategories } from '../utils/LoggerFactory'
import { useState, useCallback, useRef, useEffect } from 'react'
import { MicrophoneMonitor, MicrophoneStatus, MicrophoneAlert } from '../audio/services/core/MicrophoneMonitorService'
import { AudioMixingService, MixingConfig, AudioLevels } from '../audio/services/core/AudioMixingService'

const logger = LoggerFactory.getLogger(LogCategories.HOOK_BOTTOM_PANEL_STATE)

export type InputType = 'microphone' | 'desktop' | 'stereo-mix' | 'mixing'

export interface BottomPanelUIState {
  // 入力タイプ選択
  inputType: InputType
  
  // マイク監視状態
  micStatus: MicrophoneStatus | null
  micAlerts: MicrophoneAlert[]
  
  // ミキシング関連状態
  mixingConfig: MixingConfig
  audioLevels: AudioLevels
  
  // UI表示状態
  isLoading: boolean
  error: string | null
}

/**
 * BottomPanelUI状態管理カスタムフック
 */
export const useBottomPanelState = () => {
  // UI状態
  const [state, setState] = useState<BottomPanelUIState>({
    inputType: 'microphone',
    micStatus: null,
    micAlerts: [],
    mixingConfig: {
      enableMicrophone: true,
      enableDesktop: true,
      microphoneGain: 0.7,
      desktopGain: 0.8
    },
    audioLevels: {
      microphoneLevel: 0,
      desktopLevel: 0,
      mixedLevel: 0
    },
    isLoading: false,
    error: null
  })

  // サービス参照
  const micMonitorRef = useRef<MicrophoneMonitor | null>(null)
  const audioMixingServiceRef = useRef<AudioMixingService | null>(null)

  /**
   * 入力タイプを変更
   */
  const setInputType = useCallback((newType: InputType) => {
    logger.debug('🎛️ InputType変更', { from: state.inputType, to: newType })
    
    setState(prev => ({ ...prev, inputType: newType }))
    
    // 入力タイプが変更された場合、既存のマイクモニタリングを停止
    if (newType !== 'microphone' && micMonitorRef.current) {
      logger.debug('🎤 入力タイプ変更によりマイクモニタリングを停止:', newType)
      try {
        micMonitorRef.current.stopMonitoring()
        micMonitorRef.current = null
        setState(prev => ({
          ...prev,
          micStatus: null,
          micAlerts: []
        }))
      } catch (error) {
        logger.error('マイクモニタリング停止エラー:', error)
      }
    }
  }, [state.inputType])

  /**
   * マイクロフォン監視を開始
   */
  const startMicrophoneMonitoring = useCallback(async (deviceId: string) => {
    if (state.inputType !== 'microphone') {
      logger.debug('🎤 マイクロフォンモード以外では監視を開始しません')
      return
    }

    try {
      logger.debug('🎤 マイクロフォン監視開始:', deviceId)
      
      // 既存の監視を停止
      if (micMonitorRef.current) {
        micMonitorRef.current.stopMonitoring()
        micMonitorRef.current = null
      }

      // 新しい監視を開始
      micMonitorRef.current = new MicrophoneMonitor()
      
      // ステータス更新コールバック設定
      micMonitorRef.current.onStatusUpdate((status: MicrophoneStatus) => {
        setState(prev => ({ ...prev, micStatus: status }))
      })
      
      // アラートコールバック設定
      micMonitorRef.current.onAlert((alert: MicrophoneAlert) => {
        setState(prev => ({ 
          ...prev, 
          micAlerts: [...prev.micAlerts, alert].slice(-10) // 最新10件を保持
        }))
      })
      
      // 監視開始
      await micMonitorRef.current.startMonitoring(undefined, deviceId)
      logger.debug('🎤 マイクロフォン監視開始成功')
      
    } catch (error) {
      logger.error('🎤 マイクロフォン監視開始エラー:', error)
      setState(prev => ({
        ...prev,
        error: `マイクロフォン監視の開始に失敗しました: ${error instanceof Error ? error.message : String(error)}`
      }))
    }
  }, [state.inputType])

  /**
   * マイクロフォン監視を停止
   */
  const stopMicrophoneMonitoring = useCallback(() => {
    if (micMonitorRef.current) {
      logger.debug('🎤 マイクロフォン監視停止')
      try {
        micMonitorRef.current.stopMonitoring()
        micMonitorRef.current = null
        setState(prev => ({
          ...prev,
          micStatus: null,
          micAlerts: []
        }))
      } catch (error) {
        logger.error('マイクロフォン監視停止エラー:', error)
      }
    }
  }, [])

  /**
   * ミキシング設定を更新
   */
  const updateMixingConfig = useCallback((config: Partial<MixingConfig>) => {
    logger.debug('🎛️ ミキシング設定更新:', config)
    setState(prev => ({
      ...prev,
      mixingConfig: { ...prev.mixingConfig, ...config }
    }))
  }, [])

  /**
   * AudioMixingServiceを初期化
   */
  const initializeAudioMixingService = useCallback(() => {
    if (!audioMixingServiceRef.current) {
      logger.debug('🎛️ AudioMixingService初期化')
      audioMixingServiceRef.current = new AudioMixingService()
      
      // 音声レベル更新コールバック設定
      audioMixingServiceRef.current.setLevelsUpdateCallback((levels: AudioLevels) => {
        setState(prev => ({ ...prev, audioLevels: levels }))
      })
    }
    return audioMixingServiceRef.current
  }, [])

  /**
   * AudioMixingServiceを取得（遅延初期化）
   */
  const getAudioMixingService = useCallback(() => {
    return audioMixingServiceRef.current || initializeAudioMixingService()
  }, [initializeAudioMixingService])

  /**
   * エラークリア
   */
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }))
  }, [])

  /**
   * 時間フォーマット関数
   */
  const formatTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }, [])

  /**
   * クリーンアップ
   */
  const cleanup = useCallback(() => {
    logger.debug('🧹 useBottomPanelState: クリーンアップ開始')
    
    // マイク監視のクリーンアップ
    if (micMonitorRef.current) {
      micMonitorRef.current.cleanup()
      micMonitorRef.current = null
    }
    
    // AudioMixingServiceのクリーンアップ
    if (audioMixingServiceRef.current) {
      audioMixingServiceRef.current.cleanup?.()
      audioMixingServiceRef.current = null
    }
    
    logger.debug('🧹 useBottomPanelState: クリーンアップ完了')
  }, [])

  // コンポーネントアンマウント時のクリーンアップ
  useEffect(() => {
    return cleanup
  }, [cleanup])

  return {
    // 状態
    ...state,
    
    // アクション
    setInputType,
    startMicrophoneMonitoring,
    stopMicrophoneMonitoring,
    updateMixingConfig,
    initializeAudioMixingService,
    getAudioMixingService,
    clearError,
    cleanup,
    
    // ユーティリティ
    formatTime
  }
}