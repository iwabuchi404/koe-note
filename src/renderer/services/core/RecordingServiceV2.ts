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
  private onDataAvailable?: (data: Blob) => void
  private audioContext?: AudioContext
  private analyser?: AnalyserNode
  private audioLevelData?: Uint8Array

  /**
   * イベントリスナー設定
   */
  setEventHandlers(
    onStatusChange?: (session: RecordingSession) => void,
    onError?: (error: RecordingError) => void,
    onDataAvailable?: (data: Blob) => void
  ) {
    this.onStatusChange = onStatusChange
    this.onError = onError
    this.onDataAvailable = onDataAvailable
  }

  /**
   * 録音開始
   * @param config 録音設定
   * @returns 録音セッション
   */
  async startRecording(config: RecordingConfig): Promise<RecordingResult<RecordingSession>> {
    try {
      console.log('🎙️ RecordingServiceV2: 録音開始リクエスト', config)
      
      // 1. 既存セッションのチェック
      if (this.currentSession && this.currentSession.status === 'recording') {
        console.warn('🎙️ RecordingServiceV2: 既に録音中です')
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
      console.log('🎙️ RecordingServiceV2: メディアストリーム取得開始')
      const mediaStreamResult = await this.getMediaStream(config)
      if (!mediaStreamResult.success) {
        console.error('🎙️ RecordingServiceV2: メディアストリーム取得失敗', mediaStreamResult.error)
        return mediaStreamResult
      }
      console.log('🎙️ RecordingServiceV2: メディアストリーム取得成功', mediaStreamResult.data)
      
      // 実際に使用されるストリームの音声レベルを監視
      this.monitorAudioLevel(mediaStreamResult.data)

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
      console.log('🎙️ RecordingServiceV2: MediaRecorder作成開始')
      const mediaRecorderResult = await this.createMediaRecorder(session)
      if (!mediaRecorderResult.success) {
        console.error('🎙️ RecordingServiceV2: MediaRecorder作成失敗', mediaRecorderResult.error)
        // ストリームをクリーンアップ
        mediaStreamResult.data.getTracks().forEach(track => track.stop())
        return mediaRecorderResult
      }
      console.log('🎙️ RecordingServiceV2: MediaRecorder作成成功')

      session.mediaRecorder = mediaRecorderResult.data
      session.status = 'recording'
      this.currentSession = session

      // 6. 録音開始
      console.log('🎙️ RecordingServiceV2: 録音開始処理')
      const startResult = await this.startMediaRecorder(session)
      if (!startResult.success) {
        console.error('🎙️ RecordingServiceV2: 録音開始失敗', startResult.error)
        // リソースクリーンアップ
        this.cleanupSession(session)
        return startResult
      }

      // 7. 成功通知
      console.log('🎙️ RecordingServiceV2: 録音開始成功！')
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

  /**
   * 現在の音声レベル取得
   */
  getCurrentAudioLevel(): number {
    if (!this.analyser || !this.audioLevelData) {
      // console.log('🔇 RecordingServiceV2: アナライザー未初期化')
      return 0
    }
    
    try {
      this.analyser.getByteFrequencyData(this.audioLevelData)
      const average = this.audioLevelData.reduce((sum, value) => sum + value, 0) / this.audioLevelData.length
      
      // 基本の正規化（0-1）
      let normalizedLevel = average / 255
      
      // 音声レベルの増幅・調整
      // 1. 非線形増幅（小さな値を大きく、大きな値はそれなりに）
      normalizedLevel = Math.pow(normalizedLevel, 0.5) // 平方根で増幅
      
      // 2. 最小閾値以上の場合にさらに増幅
      if (normalizedLevel > 0.005) {
        normalizedLevel = Math.min(1.0, normalizedLevel * 15) // 15倍に増幅、上限1.0
      }
      
      // 3. 最終的な範囲制限
      normalizedLevel = Math.max(0, Math.min(1, normalizedLevel))
      
      // デバッグ用：レベルが取得できている場合のみログ出力
      if (normalizedLevel > 0.05) {
        console.log(`🔊 RecordingServiceV2: 増幅後音声レベル: ${normalizedLevel.toFixed(3)} (元値: ${(average/255).toFixed(3)})`)
      }
      
      return normalizedLevel
    } catch (error) {
      console.error('音声レベル取得エラー:', error)
      return 0
    }
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

    console.log('🎙️ RecordingServiceV2: マイクストリーム取得開始', constraints)
    const stream = await navigator.mediaDevices.getUserMedia(constraints)
    
    // ストリームの詳細をログ出力
    console.log('🎙️ RecordingServiceV2: ストリーム取得成功', {
      id: stream.id,
      active: stream.active,
      tracks: stream.getTracks().map(track => ({
        kind: track.kind,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
        label: track.label
      }))
    })
    
    return stream
  }

  private async getDesktopStream(): Promise<MediaStream> {
    console.log('🖥️ RecordingServiceV2: デスクトップ音声取得開始')
    
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 48000
        },
        video: { width: { ideal: 1 }, height: { ideal: 1 } }
      })
      
      console.log('🖥️ RecordingServiceV2: デスクトップストリーム取得成功', {
        id: stream.id,
        audioTracks: stream.getAudioTracks().length,
        videoTracks: stream.getVideoTracks().length,
        audioTrackDetails: stream.getAudioTracks().map(track => ({
          label: track.label,
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState
        }))
      })
      
      // ビデオトラックは不要なので削除
      stream.getVideoTracks().forEach(track => {
        stream.removeTrack(track)
        track.stop()
      })
      
      return stream
      
    } catch (error) {
      console.error('🖥️ RecordingServiceV2: デスクトップ音声取得エラー:', error)
      throw error
    }
  }

  private async getMixedStream(micDeviceId: string): Promise<MediaStream> {
    console.log('🎛️ RecordingServiceV2: ミキシング録音開始（既存実装からの機能抽出）')
    
    try {
      // 既存AudioMixingServiceから必要機能のみを抽出した実装
      // Step 1: AudioContext初期化
      const audioContext = new AudioContext()
      console.log('🔊 AudioContext作成完了')
      
      // Step 2: マイクストリーム取得
      const microphoneStream = await this.getMicrophoneStream(micDeviceId)
      console.log('🎤 マイクストリーム取得完了')
      
      // Step 3: デスクトップストリーム取得
      const desktopStream = await this.getDesktopStream()
      console.log('🖥️ デスクトップストリーム取得完了')
      
      // Step 4: Web Audio APIノード作成
      const microphoneSource = audioContext.createMediaStreamSource(microphoneStream)
      const desktopSource = audioContext.createMediaStreamSource(desktopStream)
      const destination = audioContext.createMediaStreamDestination()
      
      // Step 5: ゲインノード作成（既存設定を参考）
      const microphoneGain = audioContext.createGain()
      const desktopGain = audioContext.createGain()
      microphoneGain.gain.value = 0.7  // 既存設定
      desktopGain.gain.value = 0.8     // 既存設定
      
      // Step 6: ノード接続
      microphoneSource.connect(microphoneGain)
      desktopSource.connect(desktopGain)
      microphoneGain.connect(destination)
      desktopGain.connect(destination)
      
      // Step 7: ミキシング済みストリームを返す
      const mixedStream = destination.stream
      console.log('✅ ミキシングストリーム作成完了', {
        audioTracks: mixedStream.getAudioTracks().length,
        micTracks: microphoneStream.getAudioTracks().length,
        desktopTracks: desktopStream.getAudioTracks().length
      })
      
      return mixedStream
      
    } catch (error) {
      console.error('🎛️ RecordingServiceV2: ミキシング失敗:', error)
      throw new Error(`ミキシング録音に失敗しました: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  public generateFileName(): string {
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

      // MediaRecorderでサポートされているmimeTypeを確認
      const supportedTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/wav'
      ]
      
      let selectedMimeType = session.config.mimeType
      if (!MediaRecorder.isTypeSupported(selectedMimeType)) {
        console.warn('🎙️ RecordingServiceV2: 指定されたmimeTypeがサポートされていません:', selectedMimeType)
        // サポートされているタイプを検索
        for (const type of supportedTypes) {
          if (MediaRecorder.isTypeSupported(type)) {
            selectedMimeType = type
            console.log('🎙️ RecordingServiceV2: 代替mimeType選択:', selectedMimeType)
            break
          }
        }
      }

      console.log('🎙️ RecordingServiceV2: MediaRecorder作成', {
        mimeType: selectedMimeType,
        streamTracks: session.mediaStream.getTracks().length,
        streamActive: session.mediaStream.active
      })

      const mediaRecorder = new MediaRecorder(session.mediaStream, {
        mimeType: selectedMimeType
      })

      // 録音データを蓄積する配列
      const recordedChunks: Blob[] = []

      // データが利用可能になったときの処理
      mediaRecorder.ondataavailable = (event) => {
        console.log('🎙️ RecordingServiceV2: データ受信', event.data.size, 'bytes')
        if (event.data.size > 0) {
          recordedChunks.push(event.data)
          
          // データコールバック実行（チャンク処理用）
          if (this.onDataAvailable) {
            console.log('🎙️ RecordingServiceV2: データコールバック実行')
            this.onDataAvailable(event.data)
          }
        }
      }

      // 録音停止時の処理
      mediaRecorder.onstop = async () => {
        console.log('🎙️ RecordingServiceV2: 録音停止、ファイル保存開始')
        try {
          // 録音データを結合
          const blob = new Blob(recordedChunks, { type: session.config.mimeType })
          console.log('🎙️ RecordingServiceV2: ファイルサイズ', blob.size, 'bytes')
          
          // ファイル保存（Electron preload API経由）
          const arrayBuffer = await blob.arrayBuffer()
          
          // ファイル名を取得
          const fileName = session.fileName
          
          // Electron APIを使用してファイル保存
          const savedPath = await window.electronAPI.saveFile(arrayBuffer, fileName)
          
          console.log('🎙️ RecordingServiceV2: ファイル保存完了:', savedPath)
        } catch (error) {
          console.error('🎙️ RecordingServiceV2: ファイル保存エラー:', error)
        }
      }

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
        // チャンク処理のため、短い間隔でデータを生成
        session.mediaRecorder.start(1000) // 1秒ごとにondataavailableを発火
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

  private monitorAudioLevel(stream: MediaStream): void {
    try {
      // 既存のaudioContextがあればクリーンアップ
      if (this.audioContext) {
        this.audioContext.close()
      }
      
      this.audioContext = new AudioContext()
      this.analyser = this.audioContext.createAnalyser()
      const microphone = this.audioContext.createMediaStreamSource(stream)
      
      // AnalyserNodeの設定を音声レベル検出用に最適化
      this.analyser.fftSize = 512 // より高い解像度
      this.analyser.smoothingTimeConstant = 0.3 // レスポンスを向上
      this.analyser.minDecibels = -90 // より低い音量も検出
      this.analyser.maxDecibels = -10 // 上限を適切に設定
      
      this.audioLevelData = new Uint8Array(this.analyser.frequencyBinCount)

      microphone.connect(this.analyser)

      const checkAudioLevel = () => {
        if (!this.analyser || !this.audioLevelData) return
        
        this.analyser.getByteFrequencyData(this.audioLevelData)
        const average = this.audioLevelData.reduce((sum, value) => sum + value, 0) / this.audioLevelData.length
        
        if (average > 0) {
          console.log('🔊 RecordingServiceV2: 音声レベル検出', Math.round(average))
        } else {
          console.log('🔇 RecordingServiceV2: 音声レベル0（無音）- ミキシング設定を確認してください')
          console.log('💡 RecordingServiceV2: デスクトップ音声とマイクの音量設定を確認')
        }
      }

      // 初回の3秒間は詳細ログを出力
      const initialMonitorInterval = setInterval(checkAudioLevel, 1000)
      setTimeout(() => {
        clearInterval(initialMonitorInterval)
        console.log('🎙️ RecordingServiceV2: 初期音声レベル監視終了（継続監視に切替）')
      }, 3000)

    } catch (error) {
      console.error('🎙️ RecordingServiceV2: 音声レベル監視エラー:', error)
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