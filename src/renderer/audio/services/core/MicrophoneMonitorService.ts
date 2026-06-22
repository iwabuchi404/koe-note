/**
 * マイクロフォン入力レベル監視システム
 * リアルタイムで音声レベルを監視し、サイレンス検出を行う
 */

import { LoggerFactory, LogCategories } from '../../../utils/LoggerFactory'

const logger = LoggerFactory.getLogger(LogCategories.SERVICE_MICROPHONE_MONITOR)

export interface MicrophoneStatus {
  isActive: boolean
  inputLevel: number        // 0-100の音声レベル
  peakLevel: number        // ピークレベル
  averageLevel: number     // 平均レベル
  isSilent: boolean       // サイレンス状態
  silenceDuration: number // サイレンス継続時間（秒）
  hasPermission: boolean  // マイク権限
  deviceName?: string     // デバイス名
}

export interface MicrophoneAlert {
  type: 'silence' | 'low_volume' | 'permission_denied' | 'device_error'
  message: string
  severity: 'info' | 'warning' | 'error'
  timestamp: number
  recommendation?: string
}

export class MicrophoneMonitor {
  private audioContext: AudioContext | null = null
  private analyser: AnalyserNode | null = null
  private microphone: MediaStreamAudioSourceNode | null = null
  private dataArray: Uint8Array | null = null
  private animationId: number | null = null
  
  private isMonitoring: boolean = false
  private stream: MediaStream | null = null
  private shouldStopStreamOnStop: boolean = true
  
  // 統計データ
  private levelHistory: number[] = []
  private silenceStartTime: number | null = null
  private lastActiveTime: number = Date.now()
  
  // アラート制御
  private lastAlertTime: Map<string, number> = new Map()
  private alertCooldown: number = 5000 // 5秒間隔でアラート
  
  // 設定
  private silenceThreshold: number = 5  // 5%以下をサイレンスとみなす
  private silenceAlertTime: number = 10000 // 10秒のサイレンスで警告
  private lowVolumeThreshold: number = 15 // 15%以下を低音量とみなす
  
  // コールバック
  private statusCallbacks: ((status: MicrophoneStatus) => void)[] = []
  private alertCallbacks: ((alert: MicrophoneAlert) => void)[] = []
  
  /**
   * マイク監視を開始（既存のストリームを使用）
   */
  async startMonitoring(existingStream?: MediaStream, deviceId?: string): Promise<boolean> {
    try {
      logger.debug('🎤 マイク監視開始')
      
      // 既に監視中の場合は停止
      if (this.isMonitoring) {
        this.stopMonitoring()
      }
      
      // 既存のストリームがある場合はそれを使用、なければ新規取得
      if (existingStream && existingStream.getAudioTracks().length > 0) {
        logger.debug('🎤 既存の録音ストリームを使用してマイク監視開始')
        this.stream = existingStream
        this.shouldStopStreamOnStop = false // 既存ストリームは停止しない
      } else {
        logger.debug('🎤 新しいストリームを取得してマイク監視開始')
        // マイクアクセス権限を取得
        const constraints: MediaStreamConstraints = {
          audio: deviceId ? { deviceId: { exact: deviceId } } : true,
          video: false
        }
        
        this.stream = await navigator.mediaDevices.getUserMedia(constraints)
        this.shouldStopStreamOnStop = true // 新規ストリームは停止する
      }
      
      // AudioContextをセットアップ
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      this.analyser = this.audioContext.createAnalyser()
      this.microphone = this.audioContext.createMediaStreamSource(this.stream)
      
      // 解析設定
      this.analyser.fftSize = 256
      this.analyser.smoothingTimeConstant = 0.8
      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount)
      
      // マイクと解析ノードを接続
      this.microphone.connect(this.analyser)
      
      this.isMonitoring = true
      this.silenceStartTime = null
      this.lastActiveTime = Date.now()
      
      // レベル監視ループを開始
      this.monitorLoop()
      
      logger.debug('✅ マイク監視開始成功')
      
      return true
      
    } catch (error) {
      logger.error('❌ マイク監視開始エラー:', error)
      
      let alertType: MicrophoneAlert['type'] = 'device_error'
      let message = 'マイクアクセスに失敗しました'
      let recommendation = 'マイクの接続と権限を確認してください'
      
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          alertType = 'permission_denied'
          message = 'マイクアクセスが拒否されました'
          recommendation = 'ブラウザの設定でマイクアクセスを許可してください'
        } else if (error.name === 'NotFoundError') {
          alertType = 'device_error'
          message = 'マイクデバイスが見つかりません'
          recommendation = 'マイクが正しく接続されているか確認してください'
        }
      }
      
      this.sendAlert({
        type: alertType,
        message,
        severity: 'error',
        timestamp: Date.now(),
        recommendation
      })
      
      return false
    }
  }
  
  /**
   * マイク監視を停止
   */
  stopMonitoring(): void {
    logger.debug('🎤 マイク監視停止')
    
    this.isMonitoring = false
    
    if (this.animationId) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }
    
    if (this.microphone) {
      this.microphone.disconnect()
      this.microphone = null
    }
    
    if (this.analyser) {
      this.analyser.disconnect()
      this.analyser = null
    }
    
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
    
    if (this.stream && this.shouldStopStreamOnStop) {
      this.stream.getTracks().forEach(track => track.stop())
    }
    this.stream = null
    
    this.dataArray = null
    this.levelHistory = []
    this.silenceStartTime = null
    this.lastAlertTime.clear()
  }
  
  /**
   * 監視ループ
   */
  private monitorLoop(): void {
    if (!this.isMonitoring || !this.analyser || !this.dataArray) {
      logger.debug('🎤 マイク監視ループ終了 - 監視状態:', this.isMonitoring)
      this.animationId = null
      return
    }
    
    // 音声データを取得
    this.analyser.getByteFrequencyData(this.dataArray)
    
    // 音声レベルを計算
    const bufferLength = this.dataArray.length
    let sum = 0
    let peak = 0
    
    for (let i = 0; i < bufferLength; i++) {
      const value = this.dataArray[i]
      sum += value
      if (value > peak) {
        peak = value
      }
    }
    
    const averageValue = sum / bufferLength
    const inputLevel = Math.round((averageValue / 255) * 100)
    const peakLevel = Math.round((peak / 255) * 100)
    
    // 履歴を更新（最新100件）
    this.levelHistory.push(inputLevel)
    if (this.levelHistory.length > 100) {
      this.levelHistory.shift()
    }
    
    // 平均レベル計算
    const averageLevel = this.levelHistory.length > 0 
      ? Math.round(this.levelHistory.reduce((sum, level) => sum + level, 0) / this.levelHistory.length)
      : 0
    
    // サイレンス判定
    const isSilent = inputLevel < this.silenceThreshold
    const now = Date.now()
    
    if (isSilent) {
      if (this.silenceStartTime === null) {
        this.silenceStartTime = now
      }
    } else {
      this.silenceStartTime = null
      this.lastActiveTime = now
    }
    
    // サイレンス継続時間計算
    const silenceDuration = this.silenceStartTime 
      ? (now - this.silenceStartTime) / 1000 
      : 0
    
    // デバイス情報取得
    const audioTrack = this.stream?.getAudioTracks()[0]
    const deviceName = audioTrack?.label || 'Unknown Device'
    
    // ステータス作成
    const status: MicrophoneStatus = {
      isActive: this.isMonitoring,
      inputLevel,
      peakLevel,
      averageLevel,
      isSilent,
      silenceDuration,
      hasPermission: true,
      deviceName
    }
    
    // ステータスコールバック実行
    this.statusCallbacks.forEach(callback => {
      try {
        callback(status)
      } catch (error) {
        logger.error('マイクステータスコールバックエラー:', error)
      }
    })
    
    // アラート判定
    this.checkAlerts(status)
    
    // 次のフレーム（監視中のみ）
    if (this.isMonitoring) {
      this.animationId = requestAnimationFrame(() => this.monitorLoop())
    } else {
      logger.debug('🎤 監視停止のため、次のフレームをキャンセル')
      this.animationId = null
    }
  }
  
  /**
   * アラート判定
   */
  private checkAlerts(status: MicrophoneStatus): void {
    const now = Date.now()
    
    // 長時間サイレンス警告（頻度制限あり）
    if (status.silenceDuration > this.silenceAlertTime / 1000) {
      const alertKey = 'silence'
      const lastAlert = this.lastAlertTime.get(alertKey)
      
      if (!lastAlert || now - lastAlert > this.alertCooldown) {
        this.sendAlert({
          type: 'silence',
          message: `${Math.round(status.silenceDuration)}秒間音声が検出されていません`,
          severity: 'warning',
          timestamp: now,
          recommendation: 'マイクに向かって話しているか確認してください'
        })
        this.lastAlertTime.set(alertKey, now)
      }
    }
    
    // 低音量警告（サイレンスではないが音量が低い）
    if (!status.isSilent && status.averageLevel < this.lowVolumeThreshold && status.averageLevel > 0) {
      const alertKey = 'low_volume'
      const lastAlert = this.lastAlertTime.get(alertKey)
      
      if (!lastAlert || now - lastAlert > this.alertCooldown) {
        this.sendAlert({
          type: 'low_volume',
          message: '音量が低すぎます',
          severity: 'warning',
          timestamp: now,
          recommendation: 'マイクの音量を上げるか、マイクに近づいて話してください'
        })
        this.lastAlertTime.set(alertKey, now)
      }
    }
  }
  
  /**
   * アラート送信
   */
  private sendAlert(alert: MicrophoneAlert): void {
    logger.debug(`🎤 マイクアラート [${alert.severity}]: ${alert.message}`)
    if (alert.recommendation) {
      logger.debug(`   推奨対策: ${alert.recommendation}`)
    }
    
    this.alertCallbacks.forEach(callback => {
      try {
        callback(alert)
      } catch (error) {
        logger.error('マイクアラートコールバックエラー:', error)
      }
    })
  }
  
  /**
   * コールバック登録
   */
  onStatusUpdate(callback: (status: MicrophoneStatus) => void): void {
    this.statusCallbacks.push(callback)
  }
  
  onAlert(callback: (alert: MicrophoneAlert) => void): void {
    this.alertCallbacks.push(callback)
  }
  
  /**
   * 設定更新
   */
  updateSettings(settings: {
    silenceThreshold?: number
    silenceAlertTime?: number
    lowVolumeThreshold?: number
  }): void {
    if (settings.silenceThreshold !== undefined) {
      this.silenceThreshold = settings.silenceThreshold
    }
    if (settings.silenceAlertTime !== undefined) {
      this.silenceAlertTime = settings.silenceAlertTime
    }
    if (settings.lowVolumeThreshold !== undefined) {
      this.lowVolumeThreshold = settings.lowVolumeThreshold
    }
    
    logger.debug('🎤 マイク監視設定更新:', {
      silenceThreshold: this.silenceThreshold,
      silenceAlertTime: this.silenceAlertTime,
      lowVolumeThreshold: this.lowVolumeThreshold
    })
  }
  
  /**
   * 現在のステータス取得
   */
  getCurrentStatus(): MicrophoneStatus | null {
    if (!this.isMonitoring) return null
    
    const audioTrack = this.stream?.getAudioTracks()[0]
    const deviceName = audioTrack?.label || 'Unknown Device'
    
    const now = Date.now()
    const silenceDuration = this.silenceStartTime 
      ? (now - this.silenceStartTime) / 1000 
      : 0
    
    const averageLevel = this.levelHistory.length > 0 
      ? Math.round(this.levelHistory.reduce((sum, level) => sum + level, 0) / this.levelHistory.length)
      : 0
    
    return {
      isActive: this.isMonitoring,
      inputLevel: this.levelHistory[this.levelHistory.length - 1] || 0,
      peakLevel: Math.max(...this.levelHistory.slice(-10)) || 0,
      averageLevel,
      isSilent: (this.levelHistory[this.levelHistory.length - 1] || 0) < this.silenceThreshold,
      silenceDuration,
      hasPermission: true,
      deviceName
    }
  }
  
  /**
   * クリーンアップ
   */
  cleanup(): void {
    this.stopMonitoring()
    this.statusCallbacks = []
    this.alertCallbacks = []
  }
}