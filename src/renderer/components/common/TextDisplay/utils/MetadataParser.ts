/**
 * メタデータ解析ユーティリティ
 * YAMLメタデータの解析と文字起こしセグメントの解析
 */

import { TranscriptionSegment, DisplayMetadata, ParsedTranscriptionContent } from '../types/TextDisplayTypes'

/**
 * メタデータ解析クラス
 */
export class MetadataParser {
  
  /**
   * 文字起こしファイル全体を解析
   */
  static parseTranscriptionFile(content: string, filePath: string): ParsedTranscriptionContent {
    const metadata = this.parseMetadata(content, filePath)
    const segments = this.parseSegments(content)
    const rawText = this.extractRawText(content)
    
    return {
      metadata,
      segments,
      rawText
    }
  }
  
  /**
   * メタデータセクションを解析
   */
  static parseMetadata(content: string, filePath: string): DisplayMetadata {
    const yamlData = this.extractYamlFrontMatter(content)
    const stats = this.calculateContentStats(content)
    
    if (yamlData) {
      return {
        sourceFile: this.getFileName(filePath),
        fileType: 'transcription',
        createdAt: yamlData.transcribed_at || new Date().toISOString(),
        modifiedAt: yamlData.modified_at,
        transcription: {
          audioFile: yamlData.audio_file || '',
          model: yamlData.model || 'unknown',
          transcribedAt: yamlData.transcribed_at || new Date().toISOString(),
          duration: this.parseFloat(yamlData.duration, 0) || 0,
          segmentCount: this.parseInt(yamlData.segment_count, 0) || 0,
          language: yamlData.language || 'ja',
          speakers: this.parseSpeakersList(yamlData.speakers),
          coverage: this.parseFloat(yamlData.coverage, 100) || 100,
          chunkCount: this.parseInt(yamlData.chunk_count),
          qualityScore: this.parseFloat(yamlData.quality_score)
        },
        stats
      }
    } else {
      // メタデータが無い場合はプレーンテキストとして扱う
      return {
        sourceFile: this.getFileName(filePath),
        fileType: 'plain-text',
        createdAt: new Date().toISOString(),
        stats
      }
    }
  }
  
  /**
   * セグメントを解析
   */
  static parseSegments(content: string): TranscriptionSegment[] {
    const segments: TranscriptionSegment[] = []
    
    // YAMLメタデータを除去
    const textContent = this.removeYamlFrontMatter(content)
    
    // 各種セグメント形式を試行
    const parseMethods = [
      this.parseStructuredSegments,
      this.parseTimestampSegments,
      this.parseSimpleLines
    ]
    
    for (const parseMethod of parseMethods) {
      const result = parseMethod.call(this, textContent)
      if (result.length > 0) {
        return result
      }
    }
    
    return segments
  }
  
  /**
   * 構造化セグメント形式を解析
   * 例: "1 | 00:00:05 - 00:00:10 | テキスト内容"
   */
  private static parseStructuredSegments(content: string): TranscriptionSegment[] {
    const segments: TranscriptionSegment[] = []
    const lines = content.split('\n')
    
    for (const line of lines) {
      const match = line.match(/^(\d+)\s*\|\s*(\d+:\d+:\d+(?:\.\d+)?)\s*-\s*(\d+:\d+:\d+(?:\.\d+)?)\s*\|\s*(.+)$/)
      if (match) {
        const [, idStr, startTime, endTime, text] = match
        segments.push({
          id: parseInt(idStr),
          start: this.timeToSeconds(startTime),
          end: this.timeToSeconds(endTime),
          text: text.trim()
        })
      }
    }
    
    return segments
  }
  
  /**
   * タイムスタンプ付きセグメントを解析
   * 例: "[00:00:05] テキスト内容"
   */
  private static parseTimestampSegments(content: string): TranscriptionSegment[] {
    const segments: TranscriptionSegment[] = []
    const lines = content.split('\n')
    let segmentId = 1
    
    for (const line of lines) {
      const match = line.match(/^\[(\d+:\d+:\d+(?:\.\d+)?)\]\s*(.+)$/)
      if (match) {
        const [, timestamp, text] = match
        const start = this.timeToSeconds(timestamp)
        segments.push({
          id: segmentId++,
          start,
          end: start + 5, // デフォルト5秒間隔
          text: text.trim()
        })
      }
    }
    
    // 次のセグメントの開始時間で終了時間を修正
    for (let i = 0; i < segments.length - 1; i++) {
      segments[i].end = segments[i + 1].start
    }
    
    return segments
  }
  
  /**
   * シンプルな行単位解析
   */
  private static parseSimpleLines(content: string): TranscriptionSegment[] {
    const segments: TranscriptionSegment[] = []
    const lines = content.split('\n').filter(line => line.trim().length > 0)
    let segmentId = 1
    
    for (const line of lines) {
      if (line.trim()) {
        segments.push({
          id: segmentId,
          start: (segmentId - 1) * 5, // 5秒間隔と仮定
          end: segmentId * 5,
          text: line.trim()
        })
        segmentId++
      }
    }
    
    return segments
  }
  
  /**
   * 生テキストを抽出（メタデータ除去、タイムスタンプ除去）
   */
  static extractRawText(content: string): string {
    let textContent = this.removeYamlFrontMatter(content)
    
    // セグメント形式から純粋なテキストのみを抽出
    const lines = textContent.split('\n')
    const textLines: string[] = []
    
    for (const line of lines) {
      // 構造化形式からテキスト部分を抽出
      const structuredMatch = line.match(/^\d+\s*\|\s*\d+:\d+:\d+(?:\.\d+)?\s*-\s*\d+:\d+:\d+(?:\.\d+)?\s*\|\s*(.+)$/)
      if (structuredMatch) {
        textLines.push(structuredMatch[1].trim())
        continue
      }
      
      // タイムスタンプ形式からテキスト部分を抽出
      const timestampMatch = line.match(/^\[(\d+:\d+:\d+(?:\.\d+)?)\]\s*(.+)$/)
      if (timestampMatch) {
        textLines.push(timestampMatch[2].trim())
        continue
      }
      
      // 一般的な行
      if (line.trim()) {
        textLines.push(line.trim())
      }
    }
    
    return textLines.join('\n')
  }

  /**
   * タイムスタンプ付き生テキストを抽出（メタデータのみ除去）
   */
  static extractRawTextWithTimestamps(content: string): string {
    return this.removeYamlFrontMatter(content)
  }
  
  /**
   * YAMLフロントマターを除去
   */
  private static removeYamlFrontMatter(content: string): string {
    const yamlMatch = content.match(/^---\s*\n[\s\S]*?\n---\s*\n/)
    if (!yamlMatch) return content
    
    return content.substring(yamlMatch[0].length)
  }
  
  /**
   * YAMLフロントマターを抽出
   */
  private static extractYamlFrontMatter(content: string): Record<string, any> | null {
    const yamlMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/)
    if (!yamlMatch) return null
    
    const yamlContent = yamlMatch[1]
    const data: Record<string, any> = {}
    
    const lines = yamlContent.split('\n')
    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.+)$/)
      if (match) {
        const [, key, value] = match
        data[key] = value.trim()
      }
    }
    
    return data
  }
  
  /**
   * 時間文字列を秒に変換
   */
  private static timeToSeconds(timeStr: string): number {
    const parts = timeStr.split(':')
    if (parts.length === 3) {
      const [hours, minutes, seconds] = parts
      return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds)
    }
    return 0
  }
  
  /**
   * 秒を時間文字列に変換
   */
  static secondsToTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = Math.floor(seconds % 60)
    const decimal = seconds % 1
    
    // 小数点以下がほぼ0の場合は整数表示
    const hasDecimal = decimal >= 0.1
    
    if (hours > 0) {
      if (hasDecimal) {
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${Math.floor(decimal * 10)}`
      } else {
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
      }
    } else {
      if (hasDecimal) {
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${Math.floor(decimal * 10)}`
      } else {
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
      }
    }
  }
  
  /**
   * 話者リストを解析
   */
  private static parseSpeakersList(speakersData: any): string[] {
    if (!speakersData) return []
    
    if (typeof speakersData === 'string') {
      // "[Speaker1, Speaker2]" 形式を解析
      const match = speakersData.match(/\[(.*)\]/)
      if (match) {
        return match[1].split(',').map(s => s.trim().replace(/['"]/g, ''))
      }
      return [speakersData.replace(/['"]/g, '')]
    }
    
    if (Array.isArray(speakersData)) {
      return speakersData.map(s => String(s))
    }
    
    return []
  }
  
  /**
   * 安全な数値解析
   */
  private static parseFloat(value: any, defaultValue?: number): number | undefined {
    if (value === undefined || value === null) return defaultValue
    const num = parseFloat(String(value))
    return isNaN(num) ? defaultValue : num
  }
  
  private static parseInt(value: any, defaultValue?: number): number | undefined {
    if (value === undefined || value === null) return defaultValue
    const num = parseInt(String(value))
    return isNaN(num) ? defaultValue : num
  }
  
  /**
   * コンテンツ統計を計算
   */
  private static calculateContentStats(content: string) {
    const textContent = this.removeYamlFrontMatter(content)
    const lines = textContent.split('\n').filter(line => line.trim().length > 0)
    const characters = textContent.length
    const words = textContent.split(/\s+/).filter(word => word.length > 0).length
    
    return {
      totalCharacters: characters,
      totalWords: words,
      totalLines: lines.length,
      encoding: 'UTF-8'
    }
  }
  
  /**
   * ファイル名を取得
   */
  private static getFileName(filePath: string): string {
    return filePath.split(/[/\\]/).pop() || filePath
  }
}