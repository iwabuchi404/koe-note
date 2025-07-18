/**
 * ResultConsolidator - チャンク分割文字起こし結果の統合・最適化クラス
 * 
 * 複数チャンクの結果を統合し、重複除去、時間軸調整、品質向上を行う
 * 最終的な文字起こしファイルを生成する
 */

import { ChunkResult } from './ChunkTranscriptionManager';
import { TranscriptionFile, TranscriptionSegment } from '../../preload/preload';
import { TRANSCRIPTION_CONFIG } from '../config/transcriptionConfig';

// 内部処理用の拡張セグメント型
interface TranscriptionSegmentInternal extends TranscriptionSegment {
  confidence?: number;
}

export interface ConsolidationSettings {
  overlapThreshold: number;        // 重複判定の閾値（秒）
  qualityThreshold: number;        // 品質フィルタの閾値
  enableTextSmoothing: boolean;    // テキストの平滑化
  enableTimeAdjustment: boolean;   // 時間軸の調整
  maxGapFill: number;             // 最大ギャップ埋め時間（秒）
}

export interface ConsolidationStats {
  totalChunks: number;
  processedChunks: number;
  duplicatesRemoved: number;
  segmentsConsolidated: number;
  timeAdjustments: number;
  qualityScore: number;
  coveragePercentage: number;
}

export class ResultConsolidator {
  private settings: ConsolidationSettings;
  private stats: ConsolidationStats;

  constructor(settings?: Partial<ConsolidationSettings>) {
    this.settings = {
      overlapThreshold: TRANSCRIPTION_CONFIG.CONSOLIDATION.OVERLAP_THRESHOLD,
      qualityThreshold: TRANSCRIPTION_CONFIG.CONSOLIDATION.QUALITY_THRESHOLD,
      enableTextSmoothing: true,
      enableTimeAdjustment: true,
      maxGapFill: TRANSCRIPTION_CONFIG.CONSOLIDATION.MAX_GAP_FILL,
      ...settings
    };

    this.stats = {
      totalChunks: 0,
      processedChunks: 0,
      duplicatesRemoved: 0,
      segmentsConsolidated: 0,
      timeAdjustments: 0,
      qualityScore: 0,
      coveragePercentage: 0
    };
  }

  /**
   * チャンク結果を統合してTranscriptionFileを作成
   */
  consolidate(chunkResults: ChunkResult[], audioFilePath: string): TranscriptionFile {
    console.log('結果統合開始:', chunkResults.length, 'チャンク');

    this.stats.totalChunks = chunkResults.length;
    this.stats.processedChunks = 0;

    // 1. 成功したチャンクのみを抽出してソート
    const completedChunks = chunkResults
      .filter(chunk => chunk.status === 'completed')
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber);

    this.stats.processedChunks = completedChunks.length;

    if (completedChunks.length === 0) {
      console.warn('統合可能なチャンクがありません');
      return this.createEmptyTranscriptionFile(audioFilePath);
    }

    // 2. 全セグメントを収集
    const rawSegments = this.collectAllSegments(completedChunks);
    console.log('収集した生セグメント数:', rawSegments.length);

    // 3. 重複除去
    const deduplicatedSegments = this.removeDuplicates(rawSegments);
    console.log('重複除去後セグメント数:', deduplicatedSegments.length);

    // 4. 時間軸調整
    const adjustedSegments = this.adjustTimeAlignment(deduplicatedSegments);
    console.log('時間軸調整後セグメント数:', adjustedSegments.length);

    // 5. 品質フィルタリング
    const filteredSegments = this.filterByQuality(adjustedSegments);
    console.log('品質フィルタ後セグメント数:', filteredSegments.length);

    // 6. テキストの平滑化
    const smoothedSegments = this.smoothText(filteredSegments);
    console.log('テキスト平滑化後セグメント数:', smoothedSegments.length);

    // 7. ギャップ補完
    const gapFilledSegments = this.fillGaps(smoothedSegments);
    console.log('ギャップ補完後セグメント数:', gapFilledSegments.length);

    // 8. 最終的な統計計算
    this.calculateFinalStats(gapFilledSegments, completedChunks);

    // 9. TranscriptionFile作成
    const transcriptionFile = this.createTranscriptionFile(
      gapFilledSegments,
      audioFilePath,
      completedChunks
    );

    console.log('結果統合完了:', {
      totalSegments: transcriptionFile.segments.length,
      coverage: transcriptionFile.metadata.coverage,
      quality: this.stats.qualityScore
    });

    return transcriptionFile;
  }

  /**
   * 全チャンクからセグメントを収集
   */
  private collectAllSegments(chunks: ChunkResult[]): TranscriptionSegmentInternal[] {
    const segments: TranscriptionSegmentInternal[] = [];
    
    chunks.forEach(chunk => {
      chunk.segments.forEach(segment => {
        segments.push({
          start: segment.start,
          end: segment.end,
          text: segment.text,
          isEdited: false,
          confidence: chunk.confidence
        });
      });
    });

    return segments.sort((a, b) => a.start - b.start);
  }

  /**
   * 重複セグメントを除去
   */
  private removeDuplicates(segments: TranscriptionSegmentInternal[]): TranscriptionSegmentInternal[] {
    const filtered: TranscriptionSegmentInternal[] = [];
    const threshold = this.settings.overlapThreshold;

    for (let i = 0; i < segments.length; i++) {
      const current = segments[i];
      let isDuplicate = false;

      // 既に追加されたセグメントと重複チェック
      for (let j = filtered.length - 1; j >= 0; j--) {
        const existing = filtered[j];
        
        // 時間的に離れすぎている場合は重複チェック終了
        if (existing.end < current.start - threshold) {
          break;
        }

        // 重複判定
        if (this.isOverlapping(current, existing, threshold)) {
          isDuplicate = true;
          
          // より品質の高いセグメントを選択
          if ((current.confidence || 0) > (existing.confidence || 0) || 
              ((current.confidence || 0) === (existing.confidence || 0) && current.text.length > existing.text.length)) {
            filtered[j] = current;
          }
          
          this.stats.duplicatesRemoved++;
          break;
        }
      }

      if (!isDuplicate) {
        filtered.push(current);
      }
    }

    return filtered;
  }

  /**
   * 重複判定
   */
  private isOverlapping(seg1: TranscriptionSegmentInternal, seg2: TranscriptionSegmentInternal, threshold: number): boolean {
    const overlap = Math.min(seg1.end, seg2.end) - Math.max(seg1.start, seg2.start);
    const minDuration = Math.min(seg1.end - seg1.start, seg2.end - seg2.start);
    
    return overlap > threshold && overlap > minDuration * 0.5;
  }

  /**
   * 時間軸調整
   */
  private adjustTimeAlignment(segments: TranscriptionSegmentInternal[]): TranscriptionSegmentInternal[] {
    if (!this.settings.enableTimeAdjustment) {
      return segments;
    }

    const adjusted: TranscriptionSegmentInternal[] = [];
    
    for (let i = 0; i < segments.length; i++) {
      const current = { ...segments[i] };
      
      // 前のセグメントとの間隔を調整
      if (i > 0) {
        const prev = adjusted[i - 1];
        const gap = current.start - prev.end;
        
        // 小さなギャップを埋める
        if (gap > 0 && gap < 0.5) {
          const midPoint = prev.end + gap / 2;
          prev.end = midPoint;
          current.start = midPoint;
          this.stats.timeAdjustments++;
        }
      }
      
      adjusted.push(current);
    }

    return adjusted;
  }

  /**
   * 品質フィルタリング
   */
  private filterByQuality(segments: TranscriptionSegmentInternal[]): TranscriptionSegmentInternal[] {
    return segments.filter(segment => {
      // 最低品質チェック
      if ((segment.confidence || 0) < this.settings.qualityThreshold) {
        return false;
      }
      
      // 最低長チェック
      if (segment.text.trim().length < 2) {
        return false;
      }
      
      // 最低時間チェック
      if (segment.end - segment.start < 0.1) {
        return false;
      }
      
      return true;
    });
  }

  /**
   * テキストの平滑化
   */
  private smoothText(segments: TranscriptionSegmentInternal[]): TranscriptionSegmentInternal[] {
    if (!this.settings.enableTextSmoothing) {
      return segments;
    }

    return segments.map(segment => ({
      ...segment,
      text: this.smoothTextContent(segment.text)
    }));
  }

  /**
   * テキスト内容の平滑化
   */
  private smoothTextContent(text: string): string {
    return text
      .replace(/\s+/g, ' ')      // 連続する空白を1つに
      .replace(/([。．！？])\s*([あ-んア-ン])/g, '$1 $2')  // 句読点後の適切な間隔
      .replace(/([、，])\s*/g, '$1 ')  // 読点後の間隔
      .trim();
  }

  /**
   * ギャップ補完
   */
  private fillGaps(segments: TranscriptionSegmentInternal[]): TranscriptionSegmentInternal[] {
    const filled: TranscriptionSegmentInternal[] = [];
    
    for (let i = 0; i < segments.length; i++) {
      const current = segments[i];
      filled.push(current);
      
      // 次のセグメントとの間に大きなギャップがある場合
      if (i < segments.length - 1) {
        const next = segments[i + 1];
        const gap = next.start - current.end;
        
        if (gap > this.settings.maxGapFill) {
          // 無音セグメントを挿入
          filled.push({
            start: current.end,
            end: next.start,
            text: '[無音]',
            isEdited: false,
            confidence: 0
          });
        }
      }
    }
    
    return filled;
  }

  /**
   * 最終統計を計算
   */
  private calculateFinalStats(segments: TranscriptionSegmentInternal[], chunks: ChunkResult[]): void {
    this.stats.segmentsConsolidated = segments.length;
    
    // 品質スコア計算
    const totalConfidence = segments.reduce((sum, seg) => sum + (seg.confidence || 0), 0);
    this.stats.qualityScore = segments.length > 0 ? totalConfidence / segments.length : 0;
    
    // カバレッジ計算
    const totalDuration = segments.length > 0 ? Math.max(...segments.map(s => s.end)) : 0;
    const coveredTime = segments.reduce((sum, seg) => sum + (seg.end - seg.start), 0);
    this.stats.coveragePercentage = totalDuration > 0 ? (coveredTime / totalDuration) * 100 : 0;
  }

  /**
   * TranscriptionFile作成
   */
  private createTranscriptionFile(
    segments: TranscriptionSegmentInternal[],
    audioFilePath: string,
    chunks: ChunkResult[]
  ): TranscriptionFile {
    const fileName = audioFilePath.split('\\').pop() || audioFilePath;
    const totalDuration = segments.length > 0 ? Math.max(...segments.map(s => s.end)) : 0;

    return {
      metadata: {
        audioFile: fileName,
        model: 'chunk-transcription-v2',
        transcribedAt: new Date().toISOString(),
        duration: totalDuration,
        segmentCount: segments.length,
        language: 'ja',
        speakers: [],
        coverage: this.stats.coveragePercentage,
        chunkCount: chunks.length,
        qualityScore: this.stats.qualityScore
      },
      segments: segments.map(segment => ({
        start: segment.start,
        end: segment.end,
        text: segment.text,
        speaker: undefined,
        isEdited: false
      })),
      filePath: '',
      isModified: false
    };
  }

  /**
   * 空のTranscriptionFileを作成
   */
  private createEmptyTranscriptionFile(audioFilePath: string): TranscriptionFile {
    const fileName = audioFilePath.split('\\').pop() || audioFilePath;
    
    return {
      metadata: {
        audioFile: fileName,
        model: 'chunk-transcription-v2',
        transcribedAt: new Date().toISOString(),
        duration: 0,
        segmentCount: 0,
        language: 'ja',
        speakers: [],
        coverage: 0
      },
      segments: [],
      filePath: '',
      isModified: false
    };
  }

  /**
   * 統計情報を取得
   */
  getStats(): ConsolidationStats {
    return { ...this.stats };
  }

  /**
   * 設定を更新
   */
  updateSettings(newSettings: Partial<ConsolidationSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
  }
}