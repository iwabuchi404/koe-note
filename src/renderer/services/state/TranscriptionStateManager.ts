/**
 * TranscriptionStateManager - 文字起こし機能の状態管理クラス
 * 
 * 役割:
 * - TranscriptionServiceV2とTranscriptionStateの統合
 * - リアルタイム文字起こしの状態管理
 * - 進捗状況の追跡
 * - 結果の管理とキャッシュ
 */

import { TranscriptionServiceV2 } from '../core/TranscriptionServiceV2'
import { 
  TranscriptionState, 
  TranscriptionAction,
  createInitialTranscriptionState,
  validateTranscriptionState,
  TranscriptionConfig,
  TranscriptionResult,
  TranscriptionError,
  TranscriptionProgress,
  RealtimeTranscriptionChunk,
  ServerConnectionState,
  TranscriptionSegment
} from '../../state/TranscriptionState'
import { AudioFileInfo } from '../../state/ApplicationState'
// Observable, Subscriptionは将来のリアルタイム実装で使用予定
// import { Observable, Subscription } from 'rxjs'
type Subscription = any // 一時的な型定義

// 状態変更リスナー型
export type TranscriptionStateListener = (state: TranscriptionState) => void

/**
 * 文字起こし状態管理クラス
 * ビジネスロジック（TranscriptionServiceV2）と状態管理を統合
 */
export class TranscriptionStateManager {
  private currentState: TranscriptionState
  private transcriptionService: TranscriptionServiceV2
  private listeners: Set<TranscriptionStateListener> = new Set()
  private realtimeSubscription?: Subscription
  private progressUpdateInterval?: NodeJS.Timeout
  private serverPingInterval?: NodeJS.Timeout

  constructor() {
    this.currentState = createInitialTranscriptionState()
    this.transcriptionService = new TranscriptionServiceV2()
    
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
      // サーバー接続確認
      await this.checkServerConnection()
      
      // サーバー監視開始
      this.startServerMonitoring()
      
    } catch (error) {
      this.handleError({
        type: 'server_error',
        message: '初期化に失敗しました',
        details: error,
        timestamp: new Date(),
        recoverable: true,
        suggestedAction: 'サーバーの接続設定を確認してください'
      })
    }
  }

  /**
   * サービスの状態管理（イベントベースではなく直接管理）
   */
  private setupServiceListeners(): void {
    // V2サービスはイベントエミッターではないため、
    // 状態管理は各メソッド内で直接行う
    console.log('TranscriptionStateManager: サービス初期化完了')
  }

  /**
   * 状態変更リスナーを追加
   */
  public addListener(listener: TranscriptionStateListener): void {
    this.listeners.add(listener)
  }

  /**
   * 状態変更リスナーを削除
   */
  public removeListener(listener: TranscriptionStateListener): void {
    this.listeners.delete(listener)
  }

  /**
   * 現在の状態を取得
   */
  public getState(): TranscriptionState {
    return { ...this.currentState }
  }

  /**
   * 状態を更新
   */
  private updateState(updates: Partial<TranscriptionState>): void {
    const previousState = this.currentState
    this.currentState = {
      ...previousState,
      ...updates,
      lastUpdate: new Date()
    }

    // 状態バリデーション
    const errors = validateTranscriptionState(this.currentState)
    if (errors.length > 0) {
      console.warn('文字起こし状態バリデーションエラー:', errors)
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
   * ファイル文字起こし開始
   */
  public async startFileTranscription(
    audioFile: AudioFileInfo, 
    config?: Partial<TranscriptionConfig>
  ): Promise<void> {
    try {
      const transcriptionConfig: TranscriptionConfig = {
        ...this.currentState.config,
        mode: 'file',
        ...config
      }

      this.updateState({
        status: 'initializing',
        mode: 'file',
        config: transcriptionConfig,
        error: null,
        currentResult: null,
        progress: null
      })

      // AudioFileInfoに必要な情報を追加して完全な形に変換
      const completeAudioFile = {
        ...audioFile,
        size: audioFile.size || 0, // サイズがない場合は0で代替
        createdAt: audioFile.createdAt || new Date(),
        modifiedAt: audioFile.modifiedAt || new Date(),
        isRecording: audioFile.isRecording || false,
        isSelected: audioFile.isSelected || false,
        isPlaying: audioFile.isPlaying || false
      }

      const result = await this.transcriptionService.transcribeFile(
        completeAudioFile,
        transcriptionConfig
      )
      
      if (result.success && result.data) {
        // 成功時の結果処理
        const transcriptionResult: TranscriptionResult = this.convertToTranscriptionResult(result.data)
        
        this.updateState({
          status: 'completed',
          currentResult: transcriptionResult,
          progress: null
        })
        
        // 結果を履歴に追加
        this.addToRecentResults(transcriptionResult)
      } else {
        throw new Error('ファイル文字起こしに失敗しました')
      }

    } catch (error) {
      this.handleError({
        type: 'audio_error',
        message: error instanceof Error ? error.message : 'ファイル文字起こしに失敗しました',
        details: error,
        timestamp: new Date(),
        recoverable: true,
        suggestedAction: 'ファイル形式を確認するか、別のファイルを選択してください'
      })
    }
  }

  /**
   * リアルタイム文字起こし開始
   */
  public async startRealtimeTranscription(
    audioStream: MediaStream,
    config?: Partial<TranscriptionConfig>
  ): Promise<void> {
    try {
      const transcriptionConfig: TranscriptionConfig = {
        ...this.currentState.config,
        mode: 'realtime',
        ...config
      }

      this.updateState({
        status: 'initializing',
        mode: 'realtime',
        config: transcriptionConfig,
        error: null,
        realtimeChunks: [],
        currentChunk: null
      })

      // リアルタイム文字起こしは将来実装予定
      // 現在はV2サービスでObservableベースの実装がないため、状態管理のみ
      console.log('リアルタイム文字起こし開始（将来実装予定）')
      
      this.updateState({ status: 'processing' })
      
      // デモ用の進捗更新（実際の実装では削除）
      setTimeout(() => {
        this.updateState({ status: 'completed' })
      }, 5000)

    } catch (error) {
      this.handleError({
        type: 'server_error',
        message: 'リアルタイム文字起こしの開始に失敗しました',
        details: error,
        timestamp: new Date(),
        recoverable: true
      })
    }
  }

  /**
   * 文字起こし停止
   */
  public async stopTranscription(): Promise<void> {
    try {
      this.updateState({ status: 'completing' })

      // リアルタイム文字起こしの場合はストリーム停止
      if (this.realtimeSubscription) {
        this.realtimeSubscription.unsubscribe()
        this.realtimeSubscription = undefined
      }

      // V2サービスではstopTranscriptionは実装されていないため、状態管理のみ
      console.log('文字起こし停止')
      this.updateState({ status: 'idle' })

    } catch (error) {
      this.handleError({
        type: 'unknown_error',
        message: '文字起こし停止に失敗しました',
        details: error,
        timestamp: new Date(),
        recoverable: true
      })
    }
  }

  /**
   * 文字起こし一時停止
   */
  public async pauseTranscription(): Promise<void> {
    try {
      this.updateState({ status: 'paused' })
      // V2サービスではpauseTranscriptionは実装されていないため、状態管理のみ
      console.log('文字起こし一時停止')
    } catch (error) {
      this.handleError({
        type: 'unknown_error',
        message: '文字起こし一時停止に失敗しました',
        details: error,
        timestamp: new Date(),
        recoverable: true
      })
    }
  }

  /**
   * 文字起こし再開
   */
  public async resumeTranscription(): Promise<void> {
    try {
      this.updateState({ status: 'processing' })
      // V2サービスではresumeTranscriptionは実装されていないため、状態管理のみ
      console.log('文字起こし再開')
    } catch (error) {
      this.handleError({
        type: 'unknown_error',
        message: '文字起こし再開に失敗しました',
        details: error,
        timestamp: new Date(),
        recoverable: true
      })
    }
  }

  /**
   * 設定更新
   */
  public updateConfig(config: Partial<TranscriptionConfig>): void {
    const newConfig = {
      ...this.currentState.config,
      ...config
    }
    
    this.updateState({ config: newConfig })
  }

  /**
   * セグメント編集
   */
  public updateSegment(segmentId: string, updates: Partial<TranscriptionSegment>): void {
    if (!this.currentState.currentResult) return

    const updatedSegments = this.currentState.currentResult.segments.map(segment => 
      segment.id === segmentId 
        ? { ...segment, ...updates, isEdited: true }
        : segment
    )

    const updatedResult: TranscriptionResult = {
      ...this.currentState.currentResult,
      segments: updatedSegments,
      // テキストも更新
      rawText: updatedSegments.map(s => s.text).join(' '),
      formattedText: this.formatSegmentsToText(updatedSegments)
    }

    this.updateState({ 
      currentResult: updatedResult,
      editingSegment: null
    })
  }

  /**
   * サーバー接続確認
   */
  public async checkServerConnection(): Promise<void> {
    try {
      // V2サービスではcheckConnectionは実装されていないため、ダミーデータで代替
      const connectionResult = {
        success: true, // 仮の接続成功
        responseTime: 100,
        version: '1.0.0',
        models: ['kotoba-whisper-v1.0', 'whisper-large']
      }
      
      const serverConnection: ServerConnectionState = {
        isConnected: connectionResult.success,
        serverUrl: this.currentState.serverConnection.serverUrl,
        lastPingTime: new Date(),
        responseTime: connectionResult.responseTime,
        version: connectionResult.version,
        availableModels: connectionResult.models
      }

      this.updateState({ serverConnection })

    } catch (error) {
      const serverConnection: ServerConnectionState = {
        isConnected: false,
        serverUrl: this.currentState.serverConnection.serverUrl,
        lastPingTime: new Date()
      }

      this.updateState({ serverConnection })
    }
  }

  /**
   * リアルタイムチャンク処理
   */
  private handleRealtimeChunk(chunkData: any): void {
    const chunk: RealtimeTranscriptionChunk = {
      id: chunkData.id || `chunk_${Date.now()}`,
      chunkIndex: chunkData.chunkIndex || 0,
      timestamp: chunkData.timestamp || Date.now(),
      partialText: chunkData.partialText || '',
      finalText: chunkData.finalText,
      confidence: chunkData.confidence || 0,
      isPartial: !chunkData.finalText,
      audioData: chunkData.audioData
    }

    const updatedChunks = [...this.currentState.realtimeChunks]
    
    // 既存のチャンクを更新または新規追加
    const existingIndex = updatedChunks.findIndex(c => c.id === chunk.id)
    if (existingIndex >= 0) {
      updatedChunks[existingIndex] = chunk
    } else {
      updatedChunks.push(chunk)
    }

    this.updateState({
      realtimeChunks: updatedChunks,
      currentChunk: chunk
    })
  }

  /**
   * 結果を履歴に追加
   */
  private addToRecentResults(result: TranscriptionResult): void {
    const recentResults = [result, ...this.currentState.recentResults]
      .slice(0, 10) // 最新10件まで保持

    this.updateState({ recentResults })
  }

  /**
   * データ変換ヘルパー
   */
  private convertToTranscriptionResult(data: any): TranscriptionResult {
    return {
      id: data.id || `result_${Date.now()}`,
      audioFileId: data.audioFileId,
      mode: data.mode || this.currentState.mode,
      config: data.config || this.currentState.config,
      segments: data.segments || [],
      metadata: {
        totalDuration: data.metadata?.totalDuration || 0,
        processingTime: data.metadata?.processingTime || 0,
        modelUsed: data.metadata?.modelUsed || '',
        accuracy: data.metadata?.accuracy,
        wordCount: data.metadata?.wordCount || 0,
        characterCount: data.metadata?.characterCount || 0,
        speakerCount: data.metadata?.speakerCount,
        createdAt: new Date(data.metadata?.createdAt || Date.now()),
        completedAt: new Date()
      },
      rawText: data.rawText || '',
      formattedText: data.formattedText || '',
      exportFormats: data.exportFormats || {}
    }
  }

  /**
   * セグメントをテキストにフォーマット
   */
  private formatSegmentsToText(segments: TranscriptionSegment[]): string {
    return segments
      .map(segment => {
        if (this.currentState.config.enableTimestamp) {
          const startTime = this.formatTime(segment.startTime)
          const endTime = this.formatTime(segment.endTime)
          return `[${startTime}-${endTime}] ${segment.text}`
        }
        return segment.text
      })
      .join('\n')
  }

  /**
   * 時間フォーマット
   */
  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  /**
   * エラー処理
   */
  private handleError(error: TranscriptionError): void {
    this.updateState({
      status: 'error',
      error
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
   * サーバー監視開始
   */
  private startServerMonitoring(): void {
    this.serverPingInterval = setInterval(async () => {
      await this.checkServerConnection()
    }, 30000) // 30秒間隔でサーバー接続確認
  }

  /**
   * リソース解放
   */
  public dispose(): void {
    // サブスクリプション解除
    if (this.realtimeSubscription) {
      this.realtimeSubscription.unsubscribe()
    }

    // インターバルクリア
    if (this.progressUpdateInterval) {
      clearInterval(this.progressUpdateInterval)
    }
    
    if (this.serverPingInterval) {
      clearInterval(this.serverPingInterval)
    }

    // リスナークリア
    this.listeners.clear()

    // サービス停止（V2サービスはstopTranscriptionがないため状態のみリセット）
    if (this.currentState.status === 'processing') {
      console.log('文字起こしサービス終了')
    }
  }
}

// シングルトンインスタンス（オプション）
let globalTranscriptionStateManager: TranscriptionStateManager | null = null

/**
 * グローバルな文字起こし状態管理インスタンスを取得
 */
export const getTranscriptionStateManager = (): TranscriptionStateManager => {
  if (!globalTranscriptionStateManager) {
    globalTranscriptionStateManager = new TranscriptionStateManager()
  }
  return globalTranscriptionStateManager
}

/**
 * グローバルインスタンスを破棄
 */
export const disposeTranscriptionStateManager = (): void => {
  if (globalTranscriptionStateManager) {
    globalTranscriptionStateManager.dispose()
    globalTranscriptionStateManager = null
  }
}