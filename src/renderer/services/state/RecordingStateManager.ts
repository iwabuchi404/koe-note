/**
 * RecordingStateManager - 録音機能の状態管理クラス
 * 
 * 役割:
 * - RecordingServiceV2とRecordingStateの統合
 * - 状態変更の一元管理
 * - UI更新の制御
 * - エラー状態の管理
 */

import { RecordingServiceV2 } from '../core/RecordingServiceV2'
import { 
  RecordingState, 
  RecordingAction,
  createInitialRecordingState,
  validateRecordingState,
  RecordingConfig,
  RecordingSession,
  RecordingError,
  AudioDeviceInfo,
  MicrophoneStatus,
  AudioLevels
} from '../../state/RecordingState'

// 状態変更リスナー型
export type RecordingStateListener = (state: RecordingState) => void

/**
 * 録音状態管理クラス
 * ビジネスロジック（RecordingServiceV2）と状態管理を統合
 */
export class RecordingStateManager {
  private currentState: RecordingState
  private recordingService: RecordingServiceV2
  private listeners: Set<RecordingStateListener> = new Set()
  private audioLevelUpdateInterval?: NodeJS.Timeout
  private deviceMonitorInterval?: NodeJS.Timeout

  constructor() {
    this.currentState = createInitialRecordingState()
    this.recordingService = new RecordingServiceV2()
    
    // サービスのイベントリスナー設定
    this.setupServiceListeners()
    
    // 初期化処理
    this.initialize()
  }

  /**
   * 初期化処理
   */
  private async initialize(): Promise<void> {
    try {
      // デバイス情報を取得
      await this.updateAvailableDevices()
      
      // 音声レベル監視を開始
      this.startAudioLevelMonitoring()
      
      // デバイス監視を開始
      this.startDeviceMonitoring()
      
    } catch (error) {
      this.handleError({
        type: 'device_error',
        message: '初期化に失敗しました',
        details: error,
        timestamp: new Date(),
        recoverable: true,
        suggestedAction: 'アプリケーションを再起動してください'
      })
    }
  }

  /**
   * サービスの状態管理（イベントベースではなく直接管理）
   */
  private setupServiceListeners(): void {
    // V2サービスはイベントエミッターではないため、
    // 状態管理は各メソッド内で直接行う
    console.log('RecordingStateManager: サービス初期化完了')
  }

  /**
   * 状態変更リスナーを追加
   */
  public addListener(listener: RecordingStateListener): void {
    this.listeners.add(listener)
  }

  /**
   * 状態変更リスナーを削除
   */
  public removeListener(listener: RecordingStateListener): void {
    this.listeners.delete(listener)
  }

  /**
   * 現在の状態を取得
   */
  public getState(): RecordingState {
    return { ...this.currentState }
  }

  /**
   * 状態を更新
   */
  private updateState(updates: Partial<RecordingState>): void {
    const previousState = this.currentState
    this.currentState = {
      ...previousState,
      ...updates,
      lastUpdate: new Date()
    }

    // 状態バリデーション
    const errors = validateRecordingState(this.currentState)
    if (errors.length > 0) {
      console.warn('録音状態バリデーションエラー:', errors)
    }

    // リスナーに通知
    this.listeners.forEach(listener => {
      try {
        listener(this.currentState)
      } catch (error) {
        console.error('状態変更リスナーエラー:', error)
      }
    })
  }

  /**
   * 録音開始
   */
  public async startRecording(config?: Partial<RecordingConfig>): Promise<void> {
    try {
      const recordingConfig: RecordingConfig = {
        ...this.currentState.config,
        ...config
      }

      this.updateState({
        status: 'recording',
        config: recordingConfig,
        error: null
      })

      // RecordingServiceV2のRecordingConfigに合わせて変換
      const serviceConfig = {
        inputType: recordingConfig.inputType,
        deviceId: recordingConfig.selectedDevice,
        deviceName: 'Selected Device', // 仮の名前
        mimeType: recordingConfig.format === 'webm' ? 'audio/webm' : 'audio/wav',
        quality: recordingConfig.quality,
        enableRealtimeTranscription: recordingConfig.enableRealtimeTranscription
      }

      const result = await this.recordingService.startRecording(serviceConfig)
      
      if (!result.success) {
        throw new Error(result.error?.message || '録音開始に失敗しました')
      }

    } catch (error) {
      this.handleError({
        type: 'device_error',
        message: error instanceof Error ? error.message : '録音開始に失敗しました',
        details: error,
        timestamp: new Date(),
        recoverable: true,
        suggestedAction: 'デバイス設定を確認して再試行してください'
      })
    }
  }

  /**
   * 録音一時停止
   */
  public async pauseRecording(): Promise<void> {
    try {
      this.updateState({ status: 'paused' })
      await this.recordingService.pauseRecording()
    } catch (error) {
      this.handleError({
        type: 'unknown_error',
        message: '録音一時停止に失敗しました',
        details: error,
        timestamp: new Date(),
        recoverable: true
      })
    }
  }

  /**
   * 録音再開
   */
  public async resumeRecording(): Promise<void> {
    try {
      this.updateState({ status: 'recording' })
      await this.recordingService.resumeRecording()
    } catch (error) {
      this.handleError({
        type: 'unknown_error',
        message: '録音再開に失敗しました',
        details: error,
        timestamp: new Date(),
        recoverable: true
      })
    }
  }

  /**
   * 録音停止
   */
  public async stopRecording(): Promise<void> {
    try {
      this.updateState({ status: 'stopping' })
      const result = await this.recordingService.stopRecording()
      
      if (result.success) {
        this.updateState({
          status: 'idle',
          session: null
        })
      } else {
        throw new Error(result.error?.message || '録音停止に失敗しました')
      }
    } catch (error) {
      this.handleError({
        type: 'unknown_error',
        message: '録音停止に失敗しました',
        details: error,
        timestamp: new Date(),
        recoverable: true
      })
    }
  }

  /**
   * 設定更新
   */
  public updateConfig(config: Partial<RecordingConfig>): void {
    const newConfig = {
      ...this.currentState.config,
      ...config
    }
    
    this.updateState({ config: newConfig })
  }

  /**
   * 利用可能なデバイス更新
   */
  public async updateAvailableDevices(): Promise<void> {
    try {
      // Web Audio API を直接使用してデバイス情報を取得
      const devices = await navigator.mediaDevices.enumerateDevices()
      
      const audioDevices: AudioDeviceInfo[] = devices
        .filter(device => device.kind === 'audioinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `デバイス ${device.deviceId.slice(0, 8)}`,
          kind: device.kind as 'audioinput',
          groupId: device.groupId
        }))
        
      this.updateState({ availableDevices: audioDevices })
    } catch (error) {
      console.error('デバイス情報取得エラー:', error)
      this.handleError({
        type: 'device_error',
        message: 'デバイス情報の取得に失敗しました',
        details: error,
        timestamp: new Date(),
        recoverable: true,
        suggestedAction: 'マイクロフォンの接続とアクセス許可を確認してください'
      })
    }
  }

  /**
   * マイクロフォン状態更新
   */
  public updateMicrophoneStatus(status: MicrophoneStatus): void {
    this.updateState({ microphoneStatus: status })
  }

  /**
   * エラー処理
   */
  private handleError(error: RecordingError): void {
    this.updateState({
      status: 'error',
      error,
      session: null
    })
  }

  /**
   * エラークリア
   */
  public clearError(): void {
    this.updateState({ error: null })
    
    // エラー状態だった場合は待機状態に戻す
    if (this.currentState.status === 'error') {
      this.updateState({ status: 'idle' })
    }
  }

  /**
   * 音声レベル監視開始
   */
  private startAudioLevelMonitoring(): void {
    this.audioLevelUpdateInterval = setInterval(() => {
      if (this.currentState.status === 'recording') {
        // 実際の音声レベル取得は RecordingServiceV2 から
        // ここではダミーデータで代替
        const levels: AudioLevels = {
          microphoneLevel: Math.random() * 0.8,
          desktopLevel: Math.random() * 0.6,
          mixedLevel: Math.random() * 0.9
        }
        
        this.updateState({ audioLevels: levels })
      }
    }, 100) // 100ms間隔で更新
  }

  /**
   * デバイス監視開始
   */
  private startDeviceMonitoring(): void {
    this.deviceMonitorInterval = setInterval(async () => {
      await this.updateAvailableDevices()
    }, 5000) // 5秒間隔でデバイス変更をチェック
  }

  /**
   * リソース解放
   */
  public dispose(): void {
    // インターバルクリア
    if (this.audioLevelUpdateInterval) {
      clearInterval(this.audioLevelUpdateInterval)
    }
    
    if (this.deviceMonitorInterval) {
      clearInterval(this.deviceMonitorInterval)
    }

    // リスナークリア
    this.listeners.clear()

    // サービス停止
    if (this.currentState.status === 'recording') {
      this.recordingService.stopRecording().catch(console.error)
    }
  }
}

// シングルトンインスタンス（オプション）
let globalRecordingStateManager: RecordingStateManager | null = null

/**
 * グローバルな録音状態管理インスタンスを取得
 */
export const getRecordingStateManager = (): RecordingStateManager => {
  if (!globalRecordingStateManager) {
    globalRecordingStateManager = new RecordingStateManager()
  }
  return globalRecordingStateManager
}

/**
 * グローバルインスタンスを破棄
 */
export const disposeRecordingStateManager = (): void => {
  if (globalRecordingStateManager) {
    globalRecordingStateManager.dispose()
    globalRecordingStateManager = null
  }
}