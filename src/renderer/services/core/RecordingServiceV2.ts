/**
 * RecordingServiceV2 - 録音ビジネスロジック（UI非依存）
 * 
 * 設計方針:
 * - UIから完全に独立したビジネスロジック
 * - 純粋関数・Promise/Observableベースの非同期処理
 * - 型安全なエラーハンドリング
 * - 単体テスト可能な設計
 */

// 型定義
export interface RecordingConfig {
  deviceId: string
  deviceName: string
  inputType: 'microphone' | 'desktop' | 'stereo-mix' | 'mixing'
  desktopSourceId?: string
  mimeType: string
  quality: 'low' | 'medium' | 'high'
  enableRealtimeTranscription: boolean
}

export interface RecordingSession {
  id: string
  config: RecordingConfig  
  startTime: Date
  mediaRecorder: MediaRecorder | null
  mediaStream: MediaStream | null
  filePath: string
  fileName: string
  status: 'preparing' | 'recording' | 'paused' | 'stopped'
}

export interface AudioFile {
  id: string
  fileName: string
  filePath: string
  size: number
  duration: number
  format: string
  createdAt: Date
  metadata?: Record<string, any>
}

export interface RecordingError {
  type: 'device_error' | 'permission_error' | 'recording_error' | 'file_save_error' | 'unknown_error'
  message: string
  details?: any
  recoverable: boolean
}

// 結果型
export type RecordingResult<T> = {
  success: true
  data: T
} | {
  success: false
  error: RecordingError
}

/**
 * 録音サービスV2 - ビジネスロジック専用
 */
export class RecordingServiceV2 {
  private currentSession: RecordingSession | null = null
  private onStatusChange?: (session: RecordingSession) => void
  private onError?: (error: RecordingError) => void

  /**
   * イベントリスナー設定
   */
  setEventHandlers(
    onStatusChange?: (session: RecordingSession) => void,
    onError?: (error: RecordingError) => void
  ) {
    this.onStatusChange = onStatusChange
    this.onError = onError
  }

  /**
   * 録音開始
   * @param config 録音設定
   * @returns 録音セッション
   */
  async startRecording(config: RecordingConfig): Promise<RecordingResult<RecordingSession>> {
    try {
      // 1. 既存セッションのチェック
      if (this.currentSession && this.currentSession.status === 'recording') {
        return {
          success: false,
          error: {
            type: 'recording_error',
            message: '既に録音中です',
            recoverable: false
          }
        }
      }

      // 2. デバイス取得・検証
      const mediaStreamResult = await this.getMediaStream(config)
      if (!mediaStreamResult.success) {
        return mediaStreamResult
      }

      // 3. ファイル名生成
      const fileName = this.generateFileName()
      const filePath = await this.getFilePath(fileName)

      // 4. 録音セッション作成
      const session: RecordingSession = {
        id: `session_${Date.now()}`,
        config,
        startTime: new Date(),
        mediaRecorder: null,
        mediaStream: mediaStreamResult.data,
        filePath,
        fileName,
        status: 'preparing'
      }

      // 5. MediaRecorder設定
      const mediaRecorderResult = await this.createMediaRecorder(session)
      if (!mediaRecorderResult.success) {
        // ストリームをクリーンアップ
        mediaStreamResult.data.getTracks().forEach(track => track.stop())
        return mediaRecorderResult
      }

      session.mediaRecorder = mediaRecorderResult.data
      session.status = 'recording'
      this.currentSession = session

      // 6. 録音開始
      const startResult = await this.startMediaRecorder(session)
      if (!startResult.success) {
        // リソースクリーンアップ
        this.cleanupSession(session)
        return startResult
      }

      // 7. 成功通知
      this.onStatusChange?.(session)

      return {
        success: true,
        data: session
      }

    } catch (error) {
      const recordingError: RecordingError = {
        type: 'unknown_error',
        message: `録音開始エラー: ${error instanceof Error ? error.message : String(error)}`,
        details: error,
        recoverable: false
      }

      this.onError?.(recordingError)
      
      return {
        success: false,
        error: recordingError
      }
    }
  }

  /**
   * 録音停止
   * @returns 録音されたファイル情報
   */
  async stopRecording(): Promise<RecordingResult<AudioFile>> {
    try {
      if (!this.currentSession || this.currentSession.status !== 'recording') {
        return {
          success: false,
          error: {
            type: 'recording_error',
            message: '録音中ではありません',
            recoverable: false
          }
        }
      }

      const session = this.currentSession
      session.status = 'stopped'

      // MediaRecorder停止
      if (session.mediaRecorder) {
        const stopResult = await this.stopMediaRecorder(session)
        if (!stopResult.success) {
          return stopResult
        }
      }

      // ファイル情報取得
      const audioFile = await this.getAudioFileInfo(session)
      
      // セッションクリーンアップ
      this.cleanupSession(session)
      this.currentSession = null

      // 成功通知
      this.onStatusChange?.(session)

      return {
        success: true,
        data: audioFile
      }

    } catch (error) {
      const recordingError: RecordingError = {
        type: 'unknown_error',
        message: `録音停止エラー: ${error instanceof Error ? error.message : String(error)}`,
        details: error,
        recoverable: false
      }

      this.onError?.(recordingError)
      
      return {
        success: false,
        error: recordingError
      }
    }
  }

  /**
   * 録音一時停止
   */
  async pauseRecording(): Promise<RecordingResult<void>> {
    try {
      if (!this.currentSession || this.currentSession.status !== 'recording') {
        return {
          success: false,
          error: {
            type: 'recording_error',
            message: '録音中ではありません',
            recoverable: false
          }
        }
      }

      if (this.currentSession.mediaRecorder) {
        this.currentSession.mediaRecorder.pause()
        this.currentSession.status = 'paused'
        this.onStatusChange?.(this.currentSession)
      }

      return { success: true, data: undefined }

    } catch (error) {
      const recordingError: RecordingError = {
        type: 'recording_error',
        message: `録音一時停止エラー: ${error instanceof Error ? error.message : String(error)}`,
        details: error,
        recoverable: true
      }

      this.onError?.(recordingError)
      
      return {
        success: false,
        error: recordingError
      }
    }
  }

  /**
   * 録音再開
   */
  async resumeRecording(): Promise<RecordingResult<void>> {
    try {
      if (!this.currentSession || this.currentSession.status !== 'paused') {
        return {
          success: false,
          error: {
            type: 'recording_error',
            message: '一時停止中ではありません',
            recoverable: false
          }
        }
      }

      if (this.currentSession.mediaRecorder) {
        this.currentSession.mediaRecorder.resume()
        this.currentSession.status = 'recording'
        this.onStatusChange?.(this.currentSession)
      }

      return { success: true, data: undefined }

    } catch (error) {
      const recordingError: RecordingError = {
        type: 'recording_error',
        message: `録音再開エラー: ${error instanceof Error ? error.message : String(error)}`,
        details: error,
        recoverable: true
      }

      this.onError?.(recordingError)
      
      return {
        success: false,
        error: recordingError
      }
    }
  }

  /**
   * 現在のセッション取得
   */
  getCurrentSession(): RecordingSession | null {
    return this.currentSession
  }

  /**
   * 録音状態取得
   */
  isRecording(): boolean {
    return this.currentSession?.status === 'recording' || false
  }

  // プライベートメソッド

  private async getMediaStream(config: RecordingConfig): Promise<RecordingResult<MediaStream>> {
    try {
      let stream: MediaStream

      switch (config.inputType) {
        case 'microphone':
          stream = await this.getMicrophoneStream(config.deviceId)
          break
        case 'desktop':
          stream = await this.getDesktopStream()
          break
        case 'mixing':
          stream = await this.getMixedStream(config.deviceId)
          break
        default:
          throw new Error(`Unsupported input type: ${config.inputType}`)
      }

      return { success: true, data: stream }

    } catch (error) {
      return {
        success: false,
        error: {
          type: 'device_error',
          message: `デバイス取得エラー: ${error instanceof Error ? error.message : String(error)}`,
          details: error,
          recoverable: true
        }
      }
    }
  }

  private async getMicrophoneStream(deviceId: string): Promise<MediaStream> {
    const constraints = {
      audio: deviceId === 'default' ? true : { deviceId: { exact: deviceId } },
      video: false
    }

    return await navigator.mediaDevices.getUserMedia(constraints)
  }

  private async getDesktopStream(): Promise<MediaStream> {
    return await navigator.mediaDevices.getDisplayMedia({
      audio: true,
      video: { width: { ideal: 1 }, height: { ideal: 1 } }
    })
  }

  private async getMixedStream(micDeviceId: string): Promise<MediaStream> {
    // マイクとデスクトップ音声のミキシング
    // 実装は複雑なので、現在は簡易版
    const micStream = await this.getMicrophoneStream(micDeviceId)
    return micStream
  }

  private generateFileName(): string {
    const now = new Date()
    const timestamp = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`
    return `recording_${timestamp}.webm`
  }

  private async getFilePath(fileName: string): Promise<string> {
    // 既存のElectron API呼び出し
    const settings = await window.electronAPI.loadSettings()
    return `${settings.saveFolder}\\${fileName}`
  }

  private async createMediaRecorder(session: RecordingSession): Promise<RecordingResult<MediaRecorder>> {
    try {
      if (!session.mediaStream) {
        throw new Error('MediaStream is null')
      }

      const mediaRecorder = new MediaRecorder(session.mediaStream, {
        mimeType: session.config.mimeType
      })

      return { success: true, data: mediaRecorder }

    } catch (error) {
      return {
        success: false,
        error: {
          type: 'recording_error',
          message: `MediaRecorder作成エラー: ${error instanceof Error ? error.message : String(error)}`,
          details: error,
          recoverable: false
        }
      }
    }
  }

  private async startMediaRecorder(session: RecordingSession): Promise<RecordingResult<void>> {
    return new Promise((resolve) => {
      if (!session.mediaRecorder) {
        resolve({
          success: false,
          error: {
            type: 'recording_error',
            message: 'MediaRecorderが初期化されていません',
            recoverable: false
          }
        })
        return
      }

      try {
        session.mediaRecorder.start()
        resolve({ success: true, data: undefined })
      } catch (error) {
        resolve({
          success: false,
          error: {
            type: 'recording_error',
            message: `MediaRecorder開始エラー: ${error instanceof Error ? error.message : String(error)}`,
            details: error,
            recoverable: false
          }
        })
      }
    })
  }

  private async stopMediaRecorder(session: RecordingSession): Promise<RecordingResult<void>> {
    return new Promise((resolve) => {
      if (!session.mediaRecorder) {
        resolve({
          success: false,
          error: {
            type: 'recording_error',
            message: 'MediaRecorderが初期化されていません',
            recoverable: false
          }
        })
        return
      }

      try {
        session.mediaRecorder.stop()
        resolve({ success: true, data: undefined })
      } catch (error) {
        resolve({
          success: false,
          error: {
            type: 'recording_error',
            message: `MediaRecorder停止エラー: ${error instanceof Error ? error.message : String(error)}`,
            details: error,
            recoverable: false
          }
        })
      }
    })
  }

  private async getAudioFileInfo(session: RecordingSession): Promise<AudioFile> {
    // 実際のファイル情報を取得（簡易実装）
    return {
      id: session.id,
      fileName: session.fileName,
      filePath: session.filePath,
      size: 0, // 実際のファイルサイズを取得
      duration: 0, // 実際の録音時間を計算
      format: 'webm',
      createdAt: session.startTime,
      metadata: {
        config: session.config
      }
    }
  }

  private cleanupSession(session: RecordingSession): void {
    // MediaStream停止
    if (session.mediaStream) {
      session.mediaStream.getTracks().forEach(track => track.stop())
    }

    // MediaRecorderクリーンアップ
    if (session.mediaRecorder) {
      session.mediaRecorder.stream.getTracks().forEach(track => track.stop())
    }
  }
}