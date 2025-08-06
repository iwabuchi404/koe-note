/**
 * 既存のTranscriptionResultを新しいTextDisplayシステムに適応させるアダプター
 */

import { TranscriptionResult as LegacyTranscriptionResult, TranscriptionSegment as LegacyTranscriptionSegment } from '../../../../../preload/preload'
import { TranscriptionSegment, ParsedTranscriptionContent, DisplayMetadata } from '../types/TextDisplayTypes'

/**
 * 既存のTranscriptionResultを新しい形式に変換
 */
export class TranscriptionAdapter {
  
  /**
   * レガシーTranscriptionResultを新しい形式に変換
   */
  static convertLegacyResult(
    legacyResult: LegacyTranscriptionResult,
    audioFileName?: string
  ): ParsedTranscriptionContent {
    
    // セグメントの変換
    const segments: TranscriptionSegment[] = legacyResult.segments.map((segment: LegacyTranscriptionSegment, index: number) => ({
      id: index + 1,
      start: segment.start,
      end: segment.end,
      text: segment.text,
      isEdited: segment.isEdited || false
    }))
    
    // メタデータの作成
    const metadata: DisplayMetadata = {
      sourceFile: audioFileName || 'unknown.audio',
      fileType: 'transcription',
      createdAt: new Date(legacyResult.created_at * 1000).toISOString(), // Unix timestamp → ISO
      transcription: {
        audioFile: audioFileName || 'unknown.audio',
        model: 'kotoba-whisper', // デフォルト値
        transcribedAt: new Date(legacyResult.created_at * 1000).toISOString(),
        duration: legacyResult.duration,
        segmentCount: legacyResult.segment_count || segments.length,
        language: legacyResult.language || 'ja',
        speakers: [], // レガシーデータには話者情報がない
        coverage: 100 // 完了したデータとして扱う
      },
      stats: {
        totalCharacters: segments.reduce((sum, seg) => sum + seg.text.length, 0),
        totalWords: segments.reduce((sum, seg) => sum + seg.text.split(/\s+/).length, 0),
        totalLines: segments.length,
        encoding: 'UTF-8'
      }
    }
    
    // 生テキストの生成
    const rawText = segments.map(segment => segment.text).join('\n')
    
    return {
      metadata,
      segments,
      rawText
    }
  }
  
  /**
   * 新しい形式から既存のTranscriptionResultに逆変換
   */
  static convertToLegacyResult(
    parsedContent: ParsedTranscriptionContent
  ): LegacyTranscriptionResult {
    
    const legacySegments: LegacyTranscriptionSegment[] = parsedContent.segments.map((segment: TranscriptionSegment) => ({
      start: segment.start,
      end: segment.end,
      text: segment.text,
      isEdited: segment.isEdited
    }))
    
    return {
      language: parsedContent.metadata.transcription?.language || 'ja',
      duration: parsedContent.metadata.transcription?.duration || 0,
      segments: legacySegments,
      created_at: Math.floor(new Date(parsedContent.metadata.createdAt).getTime() / 1000),
      segment_count: legacySegments.length
    }
  }
  
  /**
   * 編集されたセグメントを反映してTranscriptionResultを更新
   */
  static updateLegacyResultWithEdits(
    originalResult: LegacyTranscriptionResult,
    editedSegmentTexts: Map<number, string>
  ): LegacyTranscriptionResult {
    
    const updatedSegments: LegacyTranscriptionSegment[] = originalResult.segments.map((segment: LegacyTranscriptionSegment, index: number) => {
      const editedText = editedSegmentTexts.get(index)
      
      if (editedText !== undefined && editedText !== segment.text) {
        return {
          ...segment,
          text: editedText,
          isEdited: true
        }
      }
      
      return segment
    })
    
    return {
      ...originalResult,
      segments: updatedSegments
    }
  }
  
  /**
   * TranscriptionResultからファイル形式のテキストを生成
   */
  static generateFileContent(
    result: LegacyTranscriptionResult,
    audioFileName?: string,
    model?: string
  ): string {
    const metadata = {
      audio_file: audioFileName || 'unknown.audio',
      model: model || 'kotoba-whisper',
      transcribed_at: new Date(result.created_at * 1000).toISOString(),
      duration: result.duration.toFixed(3),
      segment_count: result.segment_count || result.segments.length,
      language: result.language || 'ja',
      coverage: '100.0'
    }
    
    // YAMLメタデータ
    const yamlHeader = [
      '---',
      ...Object.entries(metadata).map(([key, value]) => `${key}: ${value}`),
      '---',
      ''
    ].join('\n')
    
    // セグメント内容
    const segmentContent = result.segments.map((segment: LegacyTranscriptionSegment, index: number) => {
      const id = (index + 1).toString().padStart(3, '0')
      const startTime = this.formatTime(segment.start)
      const endTime = this.formatTime(segment.end)
      
      return `${id} | ${startTime} - ${endTime} | ${segment.text}`
    }).join('\n')
    
    return yamlHeader + segmentContent
  }
  
  /**
   * 秒を時間文字列に変換
   */
  private static formatTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    
    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toFixed(3).padStart(6, '0')}`
    } else {
      return `${minutes.toString().padStart(2, '0')}:${secs.toFixed(3).padStart(6, '0')}`
    }
  }
}