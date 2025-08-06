/**
 * テキスト種別判定ユーティリティ
 * 文字起こしテキストか一般テキストかを判定
 */

import { TextFileType, TextTypeDetectionResult, DisplayMetadata, TranscriptionMetadata } from '../types/TextDisplayTypes'

/**
 * ファイル内容からテキスト種別を判定
 */
export class TextTypeDetector {
  
  /**
   * ファイルタイプを検出（シンプルバージョン）
   */
  static detectFileType(content: string, filePath: string): TextFileType {
    const result = this.detectTextType(content, filePath)
    return result.fileType
  }
  
  /**
   * メインの判定関数
   */
  static detectTextType(content: string, filePath: string): TextTypeDetectionResult {
    // ファイル拡張子による基本判定
    const extension = this.getFileExtension(filePath)
    
    // YAMLメタデータの存在確認
    const hasYamlMetadata = this.hasYamlFrontMatter(content)
    
    // 文字起こし形式の特徴を検出
    const transcriptionFeatures = this.detectTranscriptionFeatures(content)
    
    // 判定ロジック
    if (hasYamlMetadata && transcriptionFeatures.confidence > 0.7) {
      return {
        fileType: 'transcription',
        confidence: Math.min(transcriptionFeatures.confidence + 0.2, 1.0),
        metadata: this.parseTranscriptionMetadata(content, filePath)
      }
    } else if (extension === 'trans.txt' || filePath.includes('_transcription.txt')) {
      return {
        fileType: 'transcription',
        confidence: 0.9,
        metadata: this.parseTranscriptionMetadata(content, filePath)
      }
    } else if (transcriptionFeatures.confidence > 0.6) {
      return {
        fileType: 'transcription',
        confidence: transcriptionFeatures.confidence,
        metadata: this.parseTranscriptionMetadata(content, filePath)
      }
    } else {
      return {
        fileType: 'plain-text',
        confidence: 1.0 - transcriptionFeatures.confidence,
        metadata: this.createPlainTextMetadata(content, filePath)
      }
    }
  }
  
  /**
   * ファイル拡張子を取得
   */
  private static getFileExtension(filePath: string): string {
    const parts = filePath.split('.')
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : ''
  }
  
  /**
   * YAMLフロントマターの存在確認
   */
  private static hasYamlFrontMatter(content: string): boolean {
    const yamlPattern = /^---\s*\n[\s\S]*?\n---\s*\n/
    return yamlPattern.test(content)
  }
  
  /**
   * 文字起こし特徴の検出
   */
  private static detectTranscriptionFeatures(content: string): { confidence: number, features: string[] } {
    const features: string[] = []
    let confidence = 0
    
    // YAMLメタデータ
    if (this.hasYamlFrontMatter(content)) {
      features.push('yaml_metadata')
      confidence += 0.3
    }
    
    // タイムスタンプパターン
    const timestampPatterns = [
      /\d{2}:\d{2}:\d{2}\.\d{3}/g,  // 00:00:05.123
      /\d{2}:\d{2}:\d{2}/g,         // 00:00:05
      /\d+\.\d{3}/g,                // 5.123 (秒)
      /\[\d+:\d+:\d+\]/g,           // [00:00:05]
    ]
    
    for (const pattern of timestampPatterns) {
      const matches = content.match(pattern)
      if (matches && matches.length > 0) {
        features.push('timestamps')
        confidence += Math.min(matches.length * 0.05, 0.3)
        break
      }
    }
    
    // 話者ラベル
    const speakerPatterns = [
      /^話者\d+:/gm,
      /^Speaker\s+\d+:/gm,
      /^\w+:/gm,  // 名前:
    ]
    
    for (const pattern of speakerPatterns) {
      const matches = content.match(pattern)
      if (matches && matches.length > 2) {
        features.push('speaker_labels')
        confidence += 0.2
        break
      }
    }
    
    // 音声認識特有のキーワード
    const transcriptionKeywords = [
      'audio_file', 'model', 'transcribed_at', 'duration', 'segment_count',
      'language', 'coverage', 'chunk_count', 'quality_score'
    ]
    
    const keywordCount = transcriptionKeywords.filter(keyword => 
      content.toLowerCase().includes(keyword)
    ).length
    
    if (keywordCount > 0) {
      features.push('transcription_keywords')
      confidence += keywordCount * 0.1
    }
    
    // 文字起こし特有の形式
    const structurePatterns = [
      /\n\d+\s*\|\s*\d+:\d+:\d+\s*-\s*\d+:\d+:\d+\s*\|/g,  // セグメント形式
      /\n\[\d+:\d+:\d+\]\s*.+/g,  // タイムスタンプ付きテキスト
    ]
    
    for (const pattern of structurePatterns) {
      if (pattern.test(content)) {
        features.push('structured_format')
        confidence += 0.25
        break
      }
    }
    
    return {
      confidence: Math.min(confidence, 1.0),
      features
    }
  }
  
  /**
   * 文字起こしメタデータを解析
   */
  private static parseTranscriptionMetadata(content: string, filePath: string): DisplayMetadata {
    const yamlMetadata = this.extractYamlMetadata(content)
    const stats = this.calculateFileStats(content)
    
    const transcriptionMetadata: TranscriptionMetadata = {
      audioFile: yamlMetadata.audio_file || this.guessAudioFileName(filePath),
      model: yamlMetadata.model || 'unknown',
      transcribedAt: yamlMetadata.transcribed_at || new Date().toISOString(),
      duration: parseFloat(yamlMetadata.duration) || 0,
      segmentCount: parseInt(yamlMetadata.segment_count) || this.countSegments(content),
      language: yamlMetadata.language || 'ja',
      speakers: this.parseSpeakers(yamlMetadata.speakers) || [],
      coverage: parseFloat(yamlMetadata.coverage) || 100,
      chunkCount: parseInt(yamlMetadata.chunk_count),
      qualityScore: parseFloat(yamlMetadata.quality_score)
    }
    
    return {
      sourceFile: this.getFileName(filePath),
      fileType: 'transcription',
      createdAt: yamlMetadata.transcribed_at || new Date().toISOString(),
      transcription: transcriptionMetadata,
      stats
    }
  }
  
  /**
   * プレーンテキストメタデータを作成
   */
  private static createPlainTextMetadata(content: string, filePath: string): DisplayMetadata {
    const stats = this.calculateFileStats(content)
    
    return {
      sourceFile: this.getFileName(filePath),
      fileType: 'plain-text',
      createdAt: new Date().toISOString(),
      stats
    }
  }
  
  /**
   * YAMLメタデータを抽出
   */
  private static extractYamlMetadata(content: string): Record<string, any> {
    const yamlMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/)
    if (!yamlMatch) return {}
    
    const yamlContent = yamlMatch[1]
    const metadata: Record<string, any> = {}
    
    // 簡易YAML解析（基本的なkey: value形式のみ）
    const lines = yamlContent.split('\n')
    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.+)$/)
      if (match) {
        const [, key, value] = match
        metadata[key] = value.trim()
      }
    }
    
    return metadata
  }
  
  /**
   * ファイル統計を計算
   */
  private static calculateFileStats(content: string) {
    const lines = content.split('\n')
    const characters = content.length
    const words = content.split(/\s+/).filter(word => word.length > 0).length
    
    return {
      totalCharacters: characters,
      totalWords: words,
      totalLines: lines.length,
      encoding: 'UTF-8'
    }
  }
  
  /**
   * セグメント数をカウント
   */
  private static countSegments(content: string): number {
    // タイムスタンプ付きの行をセグメントとしてカウント
    const timestampLines = content.match(/\n.*\d+:\d+:\d+.*\n/g)
    return timestampLines ? timestampLines.length : 0
  }
  
  /**
   * 話者リストを解析
   */
  private static parseSpeakers(speakersData: any): string[] {
    if (!speakersData) return []
    
    if (typeof speakersData === 'string') {
      // "[Speaker1, Speaker2]" 形式
      const match = speakersData.match(/\[(.*)\]/)
      if (match) {
        return match[1].split(',').map(s => s.trim().replace(/"/g, ''))
      }
      return [speakersData]
    }
    
    if (Array.isArray(speakersData)) {
      return speakersData
    }
    
    return []
  }
  
  /**
   * 音声ファイル名を推測
   */
  private static guessAudioFileName(filePath: string): string {
    const fileName = this.getFileName(filePath)
    return fileName
      .replace('_transcription.txt', '.mp3')
      .replace('.trans.txt', '.mp3')
      .replace('.txt', '.mp3')
  }
  
  /**
   * ファイル名のみを取得
   */
  private static getFileName(filePath: string): string {
    return filePath.split(/[/\\]/).pop() || filePath
  }
}