/**
 * テキスト整形ユーティリティ
 * 表示用テキストの整形と変換
 */

import { TranscriptionSegment } from '../types/TextDisplayTypes'
import { MetadataParser } from './MetadataParser'

/**
 * テキスト整形クラス
 */
export class TextFormatter {
  
  /**
   * セグメントを表示用テキストに整形
   */
  static formatSegmentsForDisplay(segments: TranscriptionSegment[]): string {
    return segments.map(segment => {
      const startTime = MetadataParser.secondsToTime(segment.start)
      const endTime = MetadataParser.secondsToTime(segment.end)
      const speaker = segment.speaker ? `${segment.speaker}: ` : ''
      
      return `${segment.id.toString().padStart(3, '0')} | ${startTime} - ${endTime} | ${speaker}${segment.text}`
    }).join('\n')
  }
  
  /**
   * セグメントから純粋なテキストのみを抽出
   */
  static extractPlainTextFromSegments(segments: TranscriptionSegment[]): string {
    return segments.map(segment => {
      const speaker = segment.speaker ? `${segment.speaker}: ` : ''
      return `${speaker}${segment.text}`
    }).join('\n')
  }
  
  /**
   * 時間範囲を人間が読みやすい形式に変換
   */
  static formatTimeRange(start: number, end: number): string {
    const startTime = this.formatDuration(start)
    const endTime = this.formatDuration(end)
    return `${startTime} - ${endTime}`
  }
  
  /**
   * 秒数を時間表示に変換
   */
  static formatDuration(seconds: number): string {
    if (seconds < 60) {
      return `${seconds.toFixed(1)}秒`
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60)
      const remainingSeconds = Math.floor(seconds % 60)
      return `${minutes}分${remainingSeconds}秒`
    } else {
      const hours = Math.floor(seconds / 3600)
      const minutes = Math.floor((seconds % 3600) / 60)
      const remainingSeconds = Math.floor(seconds % 60)
      return `${hours}時間${minutes}分${remainingSeconds}秒`
    }
  }
  
  /**
   * ファイルサイズを人間が読みやすい形式に変換
   */
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B'
    
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }
  
  /**
   * 数値を人間が読みやすい形式に変換
   */
  static formatNumber(num: number): string {
    return new Intl.NumberFormat('ja-JP').format(num)
  }
  
  /**
   * パーセンテージを整形
   */
  static formatPercentage(value: number): string {
    return `${value.toFixed(1)}%`
  }
  
  /**
   * 日時を人間が読みやすい形式に変換
   */
  static formatDateTime(dateString: string): string {
    try {
      const date = new Date(dateString)
      return new Intl.DateTimeFormat('ja-JP', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }).format(date)
    } catch (error) {
      return dateString
    }
  }
  
  /**
   * 相対時間を表示
   */
  static formatRelativeTime(dateString: string): string {
    try {
      const date = new Date(dateString)
      const now = new Date()
      const diffMs = now.getTime() - date.getTime()
      const diffMinutes = Math.floor(diffMs / (1000 * 60))
      const diffHours = Math.floor(diffMinutes / 60)
      const diffDays = Math.floor(diffHours / 24)
      
      if (diffMinutes < 1) {
        return 'たった今'
      } else if (diffMinutes < 60) {
        return `${diffMinutes}分前`
      } else if (diffHours < 24) {
        return `${diffHours}時間前`
      } else if (diffDays < 7) {
        return `${diffDays}日前`
      } else {
        return this.formatDateTime(dateString)
      }
    } catch (error) {
      return dateString
    }
  }
  
  /**
   * テキストをハイライト用にマークアップ
   */
  static highlightText(text: string, searchTerm: string): string {
    if (!searchTerm.trim()) return text
    
    const regex = new RegExp(`(${this.escapeRegExp(searchTerm)})`, 'gi')
    return text.replace(regex, '<mark class="selection-highlight">$1</mark>')
  }
  
  /**
   * 正規表現用エスケープ
   */
  private static escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  
  /**
   * テキストを指定長で切り詰め
   */
  static truncateText(text: string, maxLength: number, suffix: string = '...'): string {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength - suffix.length) + suffix
  }
  
  /**
   * 単語数を計算
   */
  static countWords(text: string): number {
    return text.split(/\s+/).filter(word => word.length > 0).length
  }
  
  /**
   * 文字数を計算（改行等を除く）
   */
  static countCharacters(text: string): number {
    return text.replace(/\s/g, '').length
  }
  
  /**
   * 品質スコアを視覚的な表現に変換
   */
  static formatQualityScore(score?: number): string {
    if (score === undefined) return '不明'
    
    if (score >= 90) return `🟢 優秀 (${score}%)`
    else if (score >= 75) return `🟡 良好 (${score}%)`
    else if (score >= 50) return `🟠 普通 (${score}%)`
    else return `🔴 要改善 (${score}%)`
  }
  
  /**
   * 言語コードを日本語表示に変換
   */
  static formatLanguage(languageCode: string): string {
    const languages: Record<string, string> = {
      'ja': '日本語',
      'en': '英語',
      'ko': '韓国語',
      'zh': '中国語',
      'auto': '自動検出'
    }
    
    return languages[languageCode] || languageCode
  }
  
  /**
   * モデル名を表示用に変換
   */
  static formatModelName(model: string): string {
    const models: Record<string, string> = {
      'small': 'Small (高速)',
      'medium': 'Medium (バランス)',
      'large': 'Large (高精度)',
      'large-v2': 'Large v2 (最高精度)',
      'large-v3': 'Large v3 (最新)'
    }
    
    return models[model] || model
  }
  
  /**
   * カバレッジ率を視覚的に表現
   */
  static formatCoverage(coverage: number): string {
    const percentage = this.formatPercentage(coverage)
    
    if (coverage >= 95) return `🟢 ${percentage}`
    else if (coverage >= 85) return `🟡 ${percentage}`
    else if (coverage >= 70) return `🟠 ${percentage}`
    else return `🔴 ${percentage}`
  }
  
  /**
   * セグメント統計の要約を生成
   */
  static formatSegmentSummary(segments: TranscriptionSegment[]): string {
    if (segments.length === 0) return 'セグメントなし'
    
    const totalDuration = segments[segments.length - 1]?.end || 0
    const avgSegmentLength = totalDuration / segments.length
    
    return [
      `${this.formatNumber(segments.length)}セグメント`,
      `総時間: ${this.formatDuration(totalDuration)}`,
      `平均長: ${avgSegmentLength.toFixed(1)}秒`
    ].join(' | ')
  }
}