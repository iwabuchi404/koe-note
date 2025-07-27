/**
 * ChunkProcessor - チャンク処理のコアロジック
 * 音声チャンクの分割、処理、統合を管理
 */

import { AudioChunk, ChunkResult, ChunkSettings, ChunkProgress } from '../types'
import { LoggerFactory, LogCategories } from '../../utils/LoggerFactory'

export class ChunkProcessor {
  private settings: ChunkSettings
  private logger = LoggerFactory.getLogger(LogCategories.CHUNK_PROCESSOR)
  private isProcessing: boolean = false
  private chunks: Map<string, ChunkResult> = new Map()
  private progressCallbacks: ((progress: ChunkProgress) => void)[] = []

  constructor(settings: ChunkSettings) {
    this.settings = settings
    this.logger.info('ChunkProcessor初期化完了', { settings })
  }

  /**
   * 音声ファイルをチャンクに分割
   */
  async splitIntoChunks(audioFilePath: string): Promise<AudioChunk[]> {
    try {
      this.logger.info('チャンク分割開始', { audioFilePath, settings: this.settings })

      // 音声ファイルの情報を取得（仮実装）
      // const audioInfo = await window.electronAPI.getAudioInfo(audioFilePath)
      const audioInfo = { duration: 60, sampleRate: 44100, channels: 2 } // 仮のデータ
      if (!audioInfo) {
        throw new Error('音声ファイル情報の取得に失敗しました')
      }

      const { duration, sampleRate, channels } = audioInfo
      const chunks: AudioChunk[] = []
      
      const chunkDuration = this.settings.chunkSize
      const overlapDuration = this.settings.overlapSize
      const stepDuration = chunkDuration - overlapDuration

      let currentTime = 0
      let sequenceNumber = 0

      while (currentTime < duration) {
        const startTime = Math.max(0, currentTime - overlapDuration)
        const endTime = Math.min(duration, currentTime + chunkDuration)
        
        const chunkId = `chunk_${sequenceNumber}_${Date.now()}`
        
        const chunk: AudioChunk = {
          id: chunkId,
          sequenceNumber,
          startTime,
          endTime,
          audioData: new ArrayBuffer(0), // 実際の処理では音声データを設定
          sampleRate,
          channels,
          overlapWithPrevious: sequenceNumber > 0 ? overlapDuration : 0,
          sourceFilePath: audioFilePath
        }

        chunks.push(chunk)
        
        currentTime += stepDuration
        sequenceNumber++
      }

      this.logger.info('チャンク分割完了', { 
        totalChunks: chunks.length, 
        totalDuration: duration 
      })

      return chunks
    } catch (error) {
      this.logger.error('チャンク分割エラー', error instanceof Error ? error : new Error(String(error)), { audioFilePath })
      throw error
    }
  }

  /**
   * 単一チャンクを処理
   */
  async processChunk(chunk: AudioChunk): Promise<ChunkResult> {
    const startTime = Date.now()
    
    try {
      this.logger.debug('チャンク処理開始', { chunkId: chunk.id })

      // 実際の文字起こし処理は外部APIを呼び出し
      const result = await this.transcribeChunk(chunk)
      
      const processingTime = Date.now() - startTime
      
      const chunkResult: ChunkResult = {
        chunkId: chunk.id,
        sequenceNumber: chunk.sequenceNumber,
        status: 'completed',
        segments: result.segments || [],
        confidence: result.confidence || 0.8,
        processingTime
      }

      this.chunks.set(chunk.id, chunkResult)
      this.logger.debug('チャンク処理完了', { 
        chunkId: chunk.id, 
        processingTime,
        segmentCount: chunkResult.segments.length 
      })

      return chunkResult
    } catch (error) {
      const processingTime = Date.now() - startTime
      const chunkResult: ChunkResult = {
        chunkId: chunk.id,
        sequenceNumber: chunk.sequenceNumber,
        status: 'failed',
        segments: [],
        confidence: 0,
        processingTime,
        error: error instanceof Error ? error.message : String(error)
      }

      this.chunks.set(chunk.id, chunkResult)
      this.logger.error('チャンク処理エラー', error instanceof Error ? error : new Error(String(error)), { chunkId: chunk.id })
      
      return chunkResult
    }
  }

  /**
   * チャンクの文字起こし処理
   */
  private async transcribeChunk(chunk: AudioChunk): Promise<{ segments: any[], confidence: number }> {
    if (!chunk.sourceFilePath) {
      throw new Error('ソースファイルパスが設定されていません')
    }

    // Electron APIを通じて文字起こし処理を実行（仮実装）
    // const result = await window.electronAPI.transcribeAudioChunk(
    //   chunk.sourceFilePath,
    //   chunk.startTime,
    //   chunk.endTime
    // )
    const result = { segments: [], confidence: 0.8 } // 仮のデータ

    if (!result || !result.segments) {
      throw new Error('文字起こし結果が無効です')
    }

    return {
      segments: result.segments,
      confidence: result.confidence || 0.8
    }
  }

  /**
   * 処理済みチャンクを取得
   */
  getProcessedChunk(chunkId: string): ChunkResult | undefined {
    return this.chunks.get(chunkId)
  }

  /**
   * 全ての処理済みチャンクを取得
   */
  getAllProcessedChunks(): ChunkResult[] {
    return Array.from(this.chunks.values()).sort((a, b) => a.sequenceNumber - b.sequenceNumber)
  }

  /**
   * 進捗状況を計算
   */
  calculateProgress(totalChunks: number): ChunkProgress {
    const processedChunks = this.chunks.size
    const completedChunks = Array.from(this.chunks.values()).filter(c => c.status === 'completed').length
    const failedChunks = Array.from(this.chunks.values()).filter(c => c.status === 'failed').length

    return {
      totalChunks,
      processedChunks,
      failedChunks,
      currentChunk: processedChunks,
      estimatedTimeRemaining: 0, // 実装時に計算ロジックを追加
      processingRate: 0 // 実装時に計算ロジックを追加
    }
  }

  /**
   * 進捗コールバックを追加
   */
  onProgress(callback: (progress: ChunkProgress) => void): void {
    this.progressCallbacks.push(callback)
  }

  /**
   * 処理状態をリセット
   */
  reset(): void {
    this.chunks.clear()
    this.isProcessing = false
    this.logger.info('ChunkProcessor状態リセット完了')
  }

  /**
   * 設定を更新
   */
  updateSettings(newSettings: Partial<ChunkSettings>): void {
    this.settings = { ...this.settings, ...newSettings }
    this.logger.info('ChunkProcessor設定更新', { newSettings })
  }
}

export default ChunkProcessor