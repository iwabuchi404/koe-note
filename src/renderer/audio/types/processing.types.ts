/**
 * 音声処理関連の型定義
 */

// 音声チャンク
export interface AudioChunk {
  id: string
  sequenceNumber: number
  startTime: number
  endTime: number
  audioData: ArrayBuffer
  sampleRate: number
  channels: number
  overlapWithPrevious: number
}

// チャンク処理結果
export interface ChunkResult {
  chunkId: string
  sequenceNumber: number
  text: string
  startTime: number
  endTime: number
  confidence: number
  language: string
  segments: TranscriptionSegment[]
}

// 文字起こしセグメント
export interface TranscriptionSegment {
  start: number
  end: number
  text: string
  confidence?: number
}

// 音声処理設定
export interface ProcessingConfig {
  chunkSize: number        // seconds
  overlapSize: number      // seconds
  sampleRate: number       // Hz
  channels: number
  bitDepth: number
}

// 差分チャンク情報
export interface DifferentialChunk {
  id: string
  sequenceNumber: number
  data: ArrayBuffer
  timestamp: number
  duration: number
  isIncremental: boolean
}

// 音声診断結果
export interface AudioDiagnostics {
  duration: number
  sampleRate: number
  channels: number
  bitRate: number
  format: string
  quality: 'excellent' | 'good' | 'fair' | 'poor'
  issues: AudioIssue[]
  recommendations: string[]
}

// 音声品質問題
export interface AudioIssue {
  type: 'clipping' | 'silence' | 'low_volume' | 'distortion' | 'noise'
  severity: 'low' | 'medium' | 'high'
  description: string
  timestamp?: number
  duration?: number
}