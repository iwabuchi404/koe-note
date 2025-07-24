/**
 * TranscriptionServiceV2 - 文字起こしビジネスロジック（UI非依存）
 * 
 * 設計方針:
 * - UIから完全に独立したビジネスロジック
 * - Observable/Promiseベースの非同期処理
 * - 型安全なエラーハンドリング
 * - 単体テスト可能な設計
 */

import { Observable } from 'rxjs'

// 型定義
export interface TranscriptionConfig {
  model: string
  quality: 'high' | 'medium' | 'fast'
  language: 'ja' | 'en' | 'auto'
  enableTimestamp: boolean
  enableSpeakerIdentification: boolean
  chunkDurationSeconds: number
}

export interface AudioFileInfo {
  filePath: string
  fileName: string
  format: string
  size: number
  duration?: number
}

export interface TranscriptionSegment {
  id: string
  startTime: number
  endTime: number
  text: string
  confidence: number
  speaker?: string
  isEdited?: boolean
}

export interface TranscriptionResult {
  id: string
  audioFile: AudioFileInfo
  config: TranscriptionConfig
  segments: TranscriptionSegment[]
  metadata: {
    totalDuration: number
    processingTime: number
    modelUsed: string
    accuracy?: number
    createdAt: Date
    completedAt: Date
  }
  rawText: string
  formattedText: string
}

export interface TranscriptionProgress {
  totalChunks: number
  processedChunks: number
  currentChunk: number
  progress: number // 0-100
  estimatedTimeRemaining?: number
  currentSegment?: TranscriptionSegment
}

export interface RealtimeTranscriptionChunk {
  id: string
  chunkIndex: number
  audioData: ArrayBuffer
  timestamp: number
  partial?: boolean
  text?: string
  confidence?: number
}

export interface TranscriptionError {
  type: 'server_error' | 'file_error' | 'timeout' | 'network_error' | 'audio_quality_error' | 'model_error' | 'unknown_error'
  message: string
  details?: any
  recoverable: boolean
}

// 結果型
export type TranscriptionResult_T<T> = {
  success: true
  data: T
} | {
  success: false
  error: TranscriptionError
}

/**
 * 文字起こしサービスV2 - ビジネスロジック専用
 */
export class TranscriptionServiceV2 {
  private onProgress?: (progress: TranscriptionProgress) => void
  private onSegmentComplete?: (segment: TranscriptionSegment) => void
  private onError?: (error: TranscriptionError) => void

  /**
   * イベントリスナー設定
   */
  setEventHandlers(
    onProgress?: (progress: TranscriptionProgress) => void,
    onSegmentComplete?: (segment: TranscriptionSegment) => void,
    onError?: (error: TranscriptionError) => void
  ) {
    this.onProgress = onProgress
    this.onSegmentComplete = onSegmentComplete
    this.onError = onError
  }

  /**
   * ファイル文字起こし（バッチ処理）
   * @param audioFile 音声ファイル情報
   * @param config 文字起こし設定
   * @returns 文字起こし結果
   */
  async transcribeFile(
    audioFile: AudioFileInfo, 
    config: TranscriptionConfig
  ): Promise<TranscriptionResult_T<TranscriptionResult>> {
    try {
      // 1. ファイル検証
      const validationResult = await this.validateAudioFile(audioFile)
      if (!validationResult.success) {
        return validationResult
      }

      // 2. 文字起こし開始
      const startTime = new Date()
      const transcriptionId = `transcription_${Date.now()}`

      // 3. 音声ファイルをチャンクに分割
      const chunks = await this.splitAudioIntoChunks(audioFile, config.chunkDurationSeconds)
      
      const progress: TranscriptionProgress = {
        totalChunks: chunks.length,
        processedChunks: 0,
        currentChunk: 0,
        progress: 0
      }

      // 4. 各チャンクを順次処理
      const segments: TranscriptionSegment[] = []
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]
        progress.currentChunk = i + 1
        progress.progress = (i / chunks.length) * 100
        
        this.onProgress?.(progress)

        // チャンク文字起こし
        const segmentResult = await this.transcribeChunk(chunk, config, i)
        if (!segmentResult.success) {
          // エラーが発生した場合でも、部分的な結果を返す
          console.warn(`Chunk ${i} transcription failed:`, segmentResult.error)
          continue
        }

        segments.push(segmentResult.data)
        progress.processedChunks = i + 1
        
        this.onSegmentComplete?.(segmentResult.data)
      }

      // 5. 結果統合
      const endTime = new Date()
      const result: TranscriptionResult = {
        id: transcriptionId,
        audioFile,
        config,
        segments,
        metadata: {
          totalDuration: audioFile.duration || 0,
          processingTime: endTime.getTime() - startTime.getTime(),
          modelUsed: config.model,
          createdAt: startTime,
          completedAt: endTime
        },
        rawText: segments.map(s => s.text).join(' '),
        formattedText: this.formatTranscriptionText(segments)
      }

      return {
        success: true,
        data: result
      }

    } catch (error) {
      const transcriptionError: TranscriptionError = {
        type: 'unknown_error',
        message: `文字起こしエラー: ${error instanceof Error ? error.message : String(error)}`,
        details: error,
        recoverable: false
      }

      this.onError?.(transcriptionError)
      
      return {
        success: false,
        error: transcriptionError
      }
    }
  }

  /**
   * リアルタイム文字起こし（ストリーミング処理）
   * @param audioStream 音声ストリーム
   * @param config 文字起こし設定
   * @returns リアルタイム文字起こしチャンクのObservable
   */
  transcribeRealtime(
    audioStream: MediaStream, 
    config: TranscriptionConfig
  ): Observable<RealtimeTranscriptionChunk> {
    return new Observable(observer => {
      let chunkIndex = 0
      let mediaRecorder: MediaRecorder | null = null

      try {
        // MediaRecorderでチャンク分割
        mediaRecorder = new MediaRecorder(audioStream, {
          mimeType: 'audio/webm;codecs=opus'
        })

        mediaRecorder.ondataavailable = async (event) => {
          if (event.data.size > 0) {
            const chunkId = `realtime_chunk_${chunkIndex}`
            const audioData = await event.data.arrayBuffer()
            
            const chunk: RealtimeTranscriptionChunk = {
              id: chunkId,
              chunkIndex,
              audioData,
              timestamp: Date.now(),
              partial: true
            }

            // チャンクを文字起こし処理に送信
            this.processRealtimeChunk(chunk, config)
              .then(result => {
                if (result.success) {
                  observer.next({
                    ...chunk,
                    text: result.data.text,
                    confidence: result.data.confidence,
                    partial: false
                  })
                }
              })
              .catch(error => {
                observer.error({
                  type: 'processing_error',
                  message: `リアルタイム処理エラー: ${error.message}`,
                  details: error,
                  recoverable: true
                })
              })

            chunkIndex++
          }
        }

        mediaRecorder.onerror = (event) => {
          observer.error({
            type: 'recording_error',
            message: 'MediaRecorderエラー',
            details: event,
            recoverable: false
          })
        }

        // 定期的にデータを要求（チャンク間隔に基づく）
        mediaRecorder.start()
        const intervalId = setInterval(() => {
          if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.requestData()
          }
        }, config.chunkDurationSeconds * 1000)

        // クリーンアップ関数
        return () => {
          clearInterval(intervalId)
          if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop()
          }
        }

      } catch (error) {
        observer.error({
          type: 'initialization_error',
          message: `リアルタイム文字起こし初期化エラー: ${error instanceof Error ? error.message : String(error)}`,
          details: error,
          recoverable: false
        })
      }
    })
  }

  /**
   * 文字起こし結果の保存
   * @param result 文字起こし結果
   * @param outputPath 出力パス
   * @returns 保存成功/失敗
   */
  async saveTranscription(
    result: TranscriptionResult, 
    outputPath?: string
  ): Promise<TranscriptionResult_T<string>> {
    try {
      const filePath = outputPath || this.generateTranscriptionFilePath(result.audioFile.fileName)
      
      // フォーマット済みテキストを保存
      const content = this.generateTranscriptionFile(result)
      
      // Electron APIを使用してファイル保存
      await window.electronAPI.saveFile(
        new TextEncoder().encode(content),
        filePath.split('\\').pop() || 'transcription.txt'
      )

      return {
        success: true,
        data: filePath
      }

    } catch (error) {
      const transcriptionError: TranscriptionError = {
        type: 'file_error',
        message: `文字起こし保存エラー: ${error instanceof Error ? error.message : String(error)}`,
        details: error,
        recoverable: true
      }

      this.onError?.(transcriptionError)
      
      return {
        success: false,
        error: transcriptionError
      }
    }
  }

  /**
   * 保存済み文字起こしの読み込み
   * @param filePath 文字起こしファイルパス
   * @returns 文字起こし結果
   */
  async loadTranscription(filePath: string): Promise<TranscriptionResult_T<TranscriptionResult>> {
    try {
      // 実装は簡易版
      const fileContent = 'テスト文字起こし内容' // 暫定実装
      
      // TODO: ファイル内容をパースしてTranscriptionResultに変換
      const result: TranscriptionResult = {
        id: `loaded_${Date.now()}`,
        audioFile: {
          filePath: '',
          fileName: '',
          format: '',
          size: 0
        },
        config: {
          model: 'unknown',
          quality: 'medium',
          language: 'ja',
          enableTimestamp: true,
          enableSpeakerIdentification: false,
          chunkDurationSeconds: 20
        },
        segments: [],
        metadata: {
          totalDuration: 0,
          processingTime: 0,
          modelUsed: 'unknown',
          createdAt: new Date(),
          completedAt: new Date()
        },
        rawText: fileContent,
        formattedText: fileContent
      }

      return {
        success: true,
        data: result
      }

    } catch (error) {
      return {
        success: false,
        error: {
          type: 'file_error',
          message: `文字起こし読み込みエラー: ${error instanceof Error ? error.message : String(error)}`,
          details: error,
          recoverable: true
        }
      }
    }
  }

  // プライベートメソッド

  private async validateAudioFile(audioFile: AudioFileInfo): Promise<TranscriptionResult_T<void>> {
    // ファイル存在確認（暫定実装）
    try {
      // 暫定的に常に存在するとする
      const exists = true
      if (!exists) {
        return {
          success: false,
          error: {
            type: 'file_error',
            message: 'オーディオファイルが見つかりません',
            recoverable: false
          }
        }
      }

      // ファイル形式チェック
      const supportedFormats = ['webm', 'wav', 'mp3', 'm4a']
      if (!supportedFormats.includes(audioFile.format.toLowerCase())) {
        return {
          success: false,
          error: {
            type: 'file_error',
            message: `サポートされていないファイル形式: ${audioFile.format}`,
            recoverable: false
          }
        }
      }

      return { success: true, data: undefined }

    } catch (error) {
      return {
        success: false,
        error: {
          type: 'file_error',
          message: `ファイル検証エラー: ${error instanceof Error ? error.message : String(error)}`,
          details: error,
          recoverable: false
        }
      }
    }
  }

  private async splitAudioIntoChunks(
    audioFile: AudioFileInfo, 
    chunkDurationSeconds: number
  ): Promise<ArrayBuffer[]> {
    // 実装は簡易版 - 実際にはオーディオファイルを時間ベースで分割
    // 現在は既存のチャンク分割システムを活用
    return [await this.loadAudioFile(audioFile.filePath)]
  }

  private async loadAudioFile(filePath: string): Promise<ArrayBuffer> {
    // Electron APIを使用してファイル読み込み（暫定実装）
    const audioData = await window.electronAPI.loadAudioFile(filePath)
    
    // ArrayBufferに変換（必要に応じて）
    if (typeof audioData === 'string') {
      // Base64デコードなど必要に応じて処理
      return new ArrayBuffer(0) // 暫定的に空のバッファ
    } else {
      return audioData || new ArrayBuffer(0)
    }
  }

  private async transcribeChunk(
    audioData: ArrayBuffer, 
    config: TranscriptionConfig, 
    chunkIndex: number
  ): Promise<TranscriptionResult_T<TranscriptionSegment>> {
    try {
      // 既存のKotoba-Whisperサーバーとの通信
      const response = await this.callTranscriptionAPI(audioData, config)
      
      if (!response.success) {
        return {
          success: false,
          error: {
            type: 'server_error',
            message: response.error || 'サーバーエラー',
            recoverable: true
          }
        }
      }

      const segment: TranscriptionSegment = {
        id: `segment_${chunkIndex}`,
        startTime: chunkIndex * config.chunkDurationSeconds,
        endTime: (chunkIndex + 1) * config.chunkDurationSeconds,
        text: response.text || '',
        confidence: response.confidence || 0.8,
        isEdited: false
      }

      return {
        success: true,
        data: segment
      }

    } catch (error) {
      return {
        success: false,
        error: {
          type: 'server_error',
          message: `チャンク文字起こしエラー: ${error instanceof Error ? error.message : String(error)}`,
          details: error,
          recoverable: true
        }
      }
    }
  }

  private async processRealtimeChunk(
    chunk: RealtimeTranscriptionChunk, 
    config: TranscriptionConfig
  ): Promise<TranscriptionResult_T<{ text: string; confidence: number }>> {
    try {
      // リアルタイム文字起こしAPI呼び出し
      const response = await this.callTranscriptionAPI(chunk.audioData, config)
      
      return {
        success: true,
        data: {
          text: response.text || '',
          confidence: response.confidence || 0.0
        }
      }

    } catch (error) {
      return {
        success: false,
        error: {
          type: 'server_error',
          message: `リアルタイム処理エラー: ${error instanceof Error ? error.message : String(error)}`,
          details: error,
          recoverable: true
        }
      }
    }
  }

  private async callTranscriptionAPI(
    audioData: ArrayBuffer, 
    config: TranscriptionConfig
  ): Promise<{ success: boolean; text?: string; confidence?: number; error?: string }> {
    // 既存のKotoba-Whisperサーバーとの通信
    // 実装は既存のロジックを活用
    try {
      const formData = new FormData()
      formData.append('audio', new Blob([audioData], { type: 'audio/webm' }))
      formData.append('model', config.model)
      formData.append('language', config.language)

      const response = await fetch('http://localhost:8000/transcribe', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`)
      }

      const result = await response.json()
      
      return {
        success: true,
        text: result.text || '',
        confidence: result.confidence || 0.8
      }

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }

  private formatTranscriptionText(segments: TranscriptionSegment[]): string {
    return segments.map(segment => {
      const timeStr = `[${this.formatTime(segment.startTime)}]`
      const speakerStr = segment.speaker ? `${segment.speaker}: ` : ''
      return `${timeStr} ${speakerStr}${segment.text}`
    }).join('\n')
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  private generateTranscriptionFilePath(audioFileName: string): string {
    const baseName = audioFileName.replace(/\.[^/.]+$/, '')
    return `${baseName}.trans.txt`
  }

  private generateTranscriptionFile(result: TranscriptionResult): string {
    const header = `---
audio_file: ${result.audioFile.fileName}
model: ${result.metadata.modelUsed}
transcribed_at: ${result.metadata.completedAt.toISOString()}
duration: ${result.metadata.totalDuration}
processing_time: ${result.metadata.processingTime}ms
---

`
    
    return header + result.formattedText
  }
}