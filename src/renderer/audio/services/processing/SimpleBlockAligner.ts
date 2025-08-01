/**
 * SimpleBlockAligner - WebMチャンクのSimpleBlockアライメント処理
 * 
 * MediaRecorderで生成されたWebMチャンクの先頭を、
 * SimpleBlockの境界に合わせて整形し、デコード成功率を向上させる
 * 
 * 主な機能:
 * - SimpleBlock要素の境界検出
 * - チャンクデータの先頭アライメント
 * - 品質診断とレポート生成
 * - 文字起こし適合性評価
 */

import { LoggerFactory, LogCategories } from '../../../utils/LoggerFactory';
import { WebMChunkValidator, ChunkValidationResult, ValidationConfig } from './WebMChunkValidator';

export interface AlignmentResult {
  alignedData: Uint8Array;
  trimmedBytes: number;
  simpleBlockFound: boolean;
  confidence: number; // 0-1の信頼度
  diagnostics: AlignmentDiagnostics;
}

export interface AlignmentDiagnostics {
  originalSize: number;
  alignedSize: number;
  searchRange: number;
  patternMatches: number;
  processingTime: number;
  validationScore: number; // 0-1の検証スコア
  recommendedAction: 'use_aligned' | 'use_original' | 'reject_chunk';
}

export interface ChunkQualityDiagnosis {
  hasValidHeader: boolean;
  estimatedSimpleBlocks: number;
  recommendAlignment: boolean;
  dataQuality: 'excellent' | 'good' | 'poor' | 'unusable';
  isHeaderOnly: boolean; // ヘッダーオンリーチャンクフラグを追加
  issues: string[];
  recommendations: string[];
}

export class SimpleBlockAligner {
  private logger = LoggerFactory.getLogger(LogCategories.SIMPLEBLOCK_ALIGNER);
  private validator: WebMChunkValidator | null = null;
  
  // WebM音声ブロック探索設定（トリミング量削減調整）
  private readonly SIMPLEBLOCK_ID = 0xA3;
  private readonly BLOCK_ID = 0xA1; // Block要素（MediaRecorderでよく使用）
  private readonly TRACK_NUMBER_AUDIO = 0x81; // Track 1 (音声)
  private readonly MAX_SEARCH_BYTES = 1024; // 最大1KB範囲で探索（大幅削減：データ保護優先）
  private readonly MIN_CHUNK_SIZE = 1024; // 最小チャンクサイズ
  private readonly MIN_ALIGNED_SIZE = 512; // アライメント後の最小サイズ
  
  // 音声ブロック構造検証用の閾値
  private readonly VALID_TRACK_RANGE = { min: 0x80, max: 0x9F }; // Track 0-31（拡張）
  private readonly CONFIDENCE_THRESHOLD = 0.6; // 信頼度閾値（緩和）
  
  // 音声データ検出用パターン
  private readonly AUDIO_BLOCK_PATTERNS = [
    { name: 'SimpleBlock+Track1', ids: [0xA3, 0x81] },
    { name: 'SimpleBlock+Track0', ids: [0xA3, 0x80] },
    { name: 'Block+Track1', ids: [0xA1, 0x81] },
    { name: 'Block+Track0', ids: [0xA1, 0x80] },
    { name: 'SimpleBlock+AnyTrack', ids: [0xA3] }, // 0xA3 + 任意のTrack
    { name: 'Block+AnyTrack', ids: [0xA1] } // 0xA1 + 任意のTrack
  ];
  
  constructor(enableValidation: boolean = true) {
    console.log('🔧 SimpleBlockAligner: コンストラクタ開始', { enableValidation });
    
    // Validatorの初期化
    if (enableValidation) {
      this.validator = new WebMChunkValidator({
        enableDeepAnalysis: false, // パフォーマンスのため軽量モード
        strictMode: false,
        performanceMode: 'speed',
        enableCaching: true
      });
      console.log('🔧 SimpleBlockAligner: WebMChunkValidator作成完了');
    }

    this.logger.info('SimpleBlockAligner初期化完了', {
      maxSearchBytes: this.MAX_SEARCH_BYTES,
      minChunkSize: this.MIN_CHUNK_SIZE,
      confidenceThreshold: this.CONFIDENCE_THRESHOLD,
      validationEnabled: enableValidation
    });
    console.log('🔧 SimpleBlockAligner: 初期化完了');
  }
  
  /**
   * チャンクデータをSimpleBlock境界にアライメント
   */
  alignChunkToSimpleBlock(chunkData: Uint8Array): AlignmentResult {
    const startTime = performance.now();
    
    console.log('🎯 alignChunkToSimpleBlock開始', { originalSize: chunkData.length });
    
    this.logger.debug('SimpleBlockアライメント開始（生音声データ対応）', {
      originalSize: chunkData.length
    });
    
    // 基本検証
    if (chunkData.length < this.MIN_CHUNK_SIZE) {
      this.logger.warn('チャンクサイズ不足', {
        actualSize: chunkData.length,
        minSize: this.MIN_CHUNK_SIZE
      });
      
      return this.createAlignmentResult(
        chunkData, 0, false, 0, startTime, 'reject_chunk'
      );
    }
    
    // 生音声データかドウかを判定
    const isRawAudio = this.isRawAudioData(chunkData);
    
    if (isRawAudio) {
      console.log('🎯 生音声データ検出 - Opusフレームアライメントを実行');
      return this.alignRawAudioData(chunkData, startTime);
    }
    
    // 既存のWebMコンテナデータの処理
    console.log('🎯 WebMコンテナデータ検出 - 既存アライメントを実行');
    
    // ヘッダーオンリーチャンクの事前チェック（改善版検証付き）
    if (this.isHeaderOnlyChunk(chunkData)) {
      this.logger.info('ヘッダーオンリーチャンク検出 - アライメント処理をスキップ', {
        chunkSize: chunkData.length,
        reason: '音声ブロックおよび高エントロピーデータを検出できませんでした'
      });
      
      return this.createAlignmentResult(
        chunkData, 0, false, 0.0, startTime, 'reject_chunk'
      );
    }
    
    // 音声ブロック開始位置を探索（SimpleBlock + Block対応）
    const searchResult = this.findFirstAudioBlock(chunkData);
    
    this.logger.debug('音声ブロック探索結果', {
      position: searchResult.position,
      blockType: searchResult.blockType,
      patternMatches: searchResult.patternMatches,
      validationScore: searchResult.validationScore.toFixed(3),
      searchRange: searchResult.searchRange
    });
    
    if (searchResult.position === -1) {
      // 音声ブロックが見つからない場合
      this.logger.warn('音声ブロック未発見', {
        searchRange: searchResult.searchRange,
        patternMatches: searchResult.patternMatches,
        searchedPatterns: this.AUDIO_BLOCK_PATTERNS.map(p => p.name),
        chunkPreview: Array.from(chunkData.slice(0, Math.min(64, chunkData.length)))
          .map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
      });
      
      return this.createAlignmentResult(
        chunkData, 0, false, 0.1, startTime, 'use_original'
      );
    }
    
    if (searchResult.position === 0) {
      // 既に正しい位置から始まっている
      this.logger.debug('音声ブロック既にアライメント済み', {
        blockType: searchResult.blockType
      });
      
      return this.createAlignmentResult(
        chunkData, 0, true, 1.0, startTime, 'use_aligned'
      );
    }
    
    // 保守的なトリミング防止チェック（大幅強化）
    const trimmedBytes = searchResult.position;
    const trimmedPercent = (trimmedBytes / chunkData.length) * 100;
    const MAX_SAFE_TRIMMING_BYTES = 150; // 150バイト以上のトリミングは過度
    const MAX_SAFE_TRIMMING_PERCENT = 8; // 8%以上のトリミングでも慎重判断
    
    const isSafeTrimming = (
      trimmedBytes <= MAX_SAFE_TRIMMING_BYTES && 
      trimmedPercent <= MAX_SAFE_TRIMMING_PERCENT
    );
    
    if (!isSafeTrimming) {
      this.logger.warn('保守的トリミング判定 - アライメントを無効化', {
        trimmedBytes,
        trimmedPercent: `${trimmedPercent.toFixed(1)}%`,
        maxSafeBytes: MAX_SAFE_TRIMMING_BYTES,
        maxSafePercent: `${MAX_SAFE_TRIMMING_PERCENT}%`,
        originalSize: chunkData.length,
        blockPosition: searchResult.position,
        blockType: searchResult.blockType,
        validationScore: searchResult.validationScore.toFixed(3),
        decision: 'preserve_original_data'
      });
      
      return this.createAlignmentResult(
        chunkData, 0, false, 0.6, startTime, 'use_original'
      );
    }
    
    // データをアライメント
    const alignedData = chunkData.slice(searchResult.position);
    
    // アライメント後のサイズチェック
    if (alignedData.length < this.MIN_ALIGNED_SIZE) {
      this.logger.warn('アライメント後サイズ不足', {
        alignedSize: alignedData.length,
        minAlignedSize: this.MIN_ALIGNED_SIZE,
        trimmedBytes: searchResult.position
      });
      
      return this.createAlignmentResult(
        chunkData, 0, false, 0.2, startTime, 'use_original'
      );
    }
    
    // 信頼度計算（トリミング量ペナルティ付き）
    const baseConfidence = this.calculateConfidence(chunkData, searchResult.position, searchResult);
    
    // トリミング量による信頼度調整
    let confidence = baseConfidence;
    if (trimmedBytes > 100) {
      confidence *= 0.7; // 100バイト以上のトリミングで大幅減点
    } else if (trimmedBytes > 50) {
      confidence *= 0.85; // 50バイト以上のトリミングで減点
    }
    
    const recommendedAction = confidence >= this.CONFIDENCE_THRESHOLD ? 'use_aligned' : 'use_original';
    
    this.logger.info('音声ブロックアライメント完了', {
      originalSize: chunkData.length,
      alignedSize: alignedData.length,
      trimmedBytes: searchResult.position,
      trimmedPercent: `${trimmedPercent.toFixed(1)}%`,
      baseConfidence: baseConfidence.toFixed(3),
      adjustedConfidence: confidence.toFixed(3),
      recommendedAction,
      blockType: searchResult.blockType,
      patternMatches: searchResult.patternMatches,
      validationScore: searchResult.validationScore.toFixed(3),
      safeTrimmingApplied: true
    });
    
    return this.createAlignmentResult(
      alignedData, searchResult.position, true, confidence, startTime, recommendedAction
    );
  }
  
  /**
   * 音声データの開始位置を推定（最大限保守的なアプローチ）
   */
  private estimateAudioDataStart(data: Uint8Array): number {
    // 最大限保守的: 常に先頭から開始
    this.logger.debug('最大限保守的音声データ開始位置', {
      position: 0,
      reason: 'ultra_conservative_no_trimming_approach'
    });
    
    return 0; // 常に先頭から開始
  }

  /**
   * 先頭寄り優先の音声ブロック位置探索（過度なトリミング防止）
   */
  private findFirstAudioBlock(data: Uint8Array): {
    position: number;
    searchRange: number;
    patternMatches: number;
    validationScore: number;
    blockType: string;
  } {
    const searchLimit = Math.min(data.length - 1, this.MAX_SEARCH_BYTES);
    let patternMatches = 0;
    let bestPosition = -1;
    let bestValidationScore = 0;
    let bestBlockType = 'unknown';
    
    this.logger.debug('先頭寄り音声ブロック探索開始', {
      dataSize: data.length,
      searchLimit,
      strategy: 'early_position_priority',
      patternsToSearch: this.AUDIO_BLOCK_PATTERNS.length
    });
    
    // Phase 1: 先頭200バイト範囲で高品質な音声ブロックを探索（最優先）
    const phase1Limit = Math.min(200, searchLimit);
    this.logger.debug('Phase 1: 先頭200バイト範囲探索', { phase1Limit });
    
    for (let i = 0; i < phase1Limit; i++) {
      for (const pattern of this.AUDIO_BLOCK_PATTERNS) {
        if (this.matchesPattern(data, i, pattern)) {
          patternMatches++;
          const validationResult = this.validateAudioBlockStructure(data, i, pattern);
          
          if (validationResult.isValid && validationResult.score >= 0.7) {
            this.logger.info('Phase 1: 高品質音声ブロック発見', {
              position: i,
              patternName: pattern.name,
              validationScore: validationResult.score,
              phase: 'early_search'
            });
            
            return {
              position: i,
              searchRange: phase1Limit,
              patternMatches,
              validationScore: validationResult.score,
              blockType: pattern.name
            };
          }
          
          // より良いスコアの位置を記録
          if (validationResult.score > bestValidationScore) {
            bestPosition = i;
            bestValidationScore = validationResult.score;
            bestBlockType = pattern.name;
          }
        }
      }
    }
    
    // Phase 1で見つかった候補があり、低品質でも採用（先頭200バイト以内なら優先）
    if (bestPosition !== -1 && bestValidationScore >= 0.3) {
      this.logger.info('Phase 1: 先頭200バイト範囲内音声ブロック採用', {
        position: bestPosition,
        validationScore: bestValidationScore,
        blockType: bestBlockType,
        reason: 'prioritize_early_position_over_quality'
      });
      
      return {
        position: bestPosition,
        searchRange: phase1Limit,
        patternMatches,
        validationScore: bestValidationScore,
        blockType: bestBlockType
      };
    }
    
    // Phase 2: 200-500バイト範囲で補助探索（限定的フォールバック）
    const phase2Start = phase1Limit;
    const phase2Limit = Math.min(500, searchLimit); // 500バイトで上限を設定
    
    this.logger.debug('Phase 2: 200-500バイト範囲補助探索', {
      phase2Start,
      phase2Limit,
      strategy: 'limited_fallback_search'
    });
    
    for (let i = phase2Start; i < phase2Limit; i++) {
      for (const pattern of this.AUDIO_BLOCK_PATTERNS) {
        if (this.matchesPattern(data, i, pattern)) {
          patternMatches++;
          const validationResult = this.validateAudioBlockStructure(data, i, pattern);
          
          if (validationResult.isValid) {
            this.logger.debug('Phase 2: 音声ブロック候補発見', {
              position: i,
              patternName: pattern.name,
              validationScore: validationResult.score
            });
            
            if (validationResult.score > bestValidationScore) {
              bestPosition = i;
              bestValidationScore = validationResult.score;
              bestBlockType = pattern.name;
            }
            
            // 十分に良いスコアなら早期終了
            if (validationResult.score >= 0.8) {
              break;
            }
          }
        }
      }
      
      if (bestValidationScore >= 0.8) {
        break;
      }
    }
    
    // 結果をログ出力
    if (bestPosition !== -1) {
      const trimmedBytes = bestPosition;
      const trimmedPercent = ((trimmedBytes / data.length) * 100).toFixed(1);
      
      this.logger.info('音声ブロック探索完了', {
        bestPosition,
        bestValidationScore: bestValidationScore.toFixed(3),
        bestBlockType,
        trimmedBytes,
        trimmedPercent: `${trimmedPercent}%`,
        originalSize: data.length,
        remainingSize: data.length - bestPosition,
        patternMatches
      });
      
      // 過度なトリミングの警告
      if (trimmedBytes > data.length * 0.5) {
        this.logger.warn('過度なデータトリミング検出', {
          trimmedBytes,
          trimmedPercent: `${trimmedPercent}%`,
          recommendation: 'データの半分以上がトリミングされます'
        });
      }
    } else {
      this.logger.warn('音声ブロック未発見', {
        searchedRanges: [`0-${phase1Limit}`, `${phase2Start}-${phase2Limit}`],
        patternMatches,
        totalSearched: phase1Limit + (phase2Limit - phase2Start)
      });
    }
    
    return {
      position: bestPosition,
      searchRange: searchLimit,
      patternMatches,
      validationScore: bestValidationScore,
      blockType: bestBlockType
    };
  }
  
  /**
   * パターンマッチング判定
   */
  private matchesPattern(data: Uint8Array, position: number, pattern: typeof this.AUDIO_BLOCK_PATTERNS[0]): boolean {
    if (position + pattern.ids.length > data.length) {
      return false;
    }
    
    // 完全一致パターン
    if (pattern.ids.length === 2) {
      return data[position] === pattern.ids[0] && data[position + 1] === pattern.ids[1];
    }
    
    // 単一IDパターン（Track番号チェック付き）
    if (pattern.ids.length === 1) {
      if (data[position] !== pattern.ids[0]) {
        return false;
      }
      
      // 次のバイトがTrack番号として妥当かチェック
      if (position + 1 < data.length) {
        const trackByte = data[position + 1];
        return trackByte >= this.VALID_TRACK_RANGE.min && trackByte <= this.VALID_TRACK_RANGE.max;
      }
    }
    
    return false;
  }
  
  /**
   * 音声ブロック構造の詳細検証（SimpleBlock + Block対応）
   */
  private validateAudioBlockStructure(data: Uint8Array, position: number, pattern: typeof this.AUDIO_BLOCK_PATTERNS[0]): {
    isValid: boolean;
    score: number;
    issues: string[];
  } {
    const issues: string[] = [];
    let score = 0.4; // ベーススコア（柔軟性のため低め）
    
    // 最小限のデータサイズチェック
    if (position + 6 >= data.length) {
      issues.push('insufficient_data_after_position');
      return { isValid: false, score: 0, issues };
    }
    
    const blockId = data[position];
    const trackNum = data[position + 1];
    const sizeField = data[position + 2];
    
    // Block ID検証
    const isSimpleBlock = blockId === this.SIMPLEBLOCK_ID;
    const isBlock = blockId === this.BLOCK_ID;
    
    if (isSimpleBlock) {
      score += 0.3; // SimpleBlockは高評価
    } else if (isBlock) {
      score += 0.25; // Blockも有効
    } else {
      issues.push(`unexpected_block_id_0x${blockId.toString(16)}`);
      return { isValid: false, score: 0, issues };
    }
    
    // Track Number検証（拡張範囲: 0x80-0x9F）
    const isValidTrackNum = trackNum >= this.VALID_TRACK_RANGE.min && 
                           trackNum <= this.VALID_TRACK_RANGE.max;
    
    if (isValidTrackNum) {
      score += 0.2;
      
      // 一般的な音声トラック番号の場合はボーナス
      if (trackNum === 0x80 || trackNum === 0x81) {
        score += 0.15;
      }
    } else {
      // Track番号が範囲外でも、完全に無効ではない（一部MediaRecorderは独自番号を使用）
      if (trackNum >= 0x80 && trackNum <= 0xFF) {
        score += 0.1; // 部分点
        issues.push(`unusual_track_number_0x${trackNum.toString(16)}`);
      } else {
        issues.push(`invalid_track_number_0x${trackNum.toString(16)}`);
      }
    }
    
    // サイズフィールド検証（VINT形式の基本的なチェック）
    const isValidSize = sizeField >= 0x80; // VINTの最小値
    
    if (isValidSize) {
      score += 0.15;
      
      // サイズが妥当な範囲内かチェック
      const estimatedSize = this.parseVINTSize(data, position + 2);
      if (estimatedSize > 0 && estimatedSize < data.length - position) {
        score += 0.1;
        
        // 音声データサイズとして妥当（100バイト以上）
        if (estimatedSize >= 100) {
          score += 0.05;
        }
      }
    } else {
      issues.push(`invalid_size_field_0x${sizeField.toString(16)}`);
    }
    
    // 音声データの存在チェック（位置+ サイズフィールド長 + ヘッダー長以降に実データ）
    const dataStartPos = position + 3; // Block ID + Track + Sizeの最小長
    if (dataStartPos < data.length) {
      // 後続データのエントロピーをチェック（音声データは高エントロピー）
      const sampleSize = Math.min(32, data.length - dataStartPos);
      const entropy = this.calculateDataEntropy(data.slice(dataStartPos, dataStartPos + sampleSize));
      
      if (entropy > 6.5) { // 高エントロピー = 音声データの可能性
        score += 0.1;
        this.logger.debug('高エントロピーデータ検出', {
          position: dataStartPos,
          entropy: entropy.toFixed(2)
        });
      }
    }
    
    // 最低限の有効性判定（さらに緩和されたルール）
    const isValid = (isSimpleBlock || isBlock) && sizeField >= 0x80 && issues.length <= 2;
    
    this.logger.debug('音声ブロック構造検証', {
      position,
      blockType: isSimpleBlock ? 'SimpleBlock' : 'Block',
      trackNum: `0x${trackNum.toString(16)}`,
      sizeField: `0x${sizeField.toString(16)}`,
      isValid,
      score: score.toFixed(3),
      issues,
      patternName: pattern.name
    });
    
    return { isValid, score: Math.min(score, 1.0), issues };
  }
  
  /**
   * データのエントロピー計算（音声データ検出用）
   */
  private calculateDataEntropy(data: Uint8Array): number {
    if (data.length === 0) return 0;
    
    const frequencies = new Array(256).fill(0);
    for (const byte of data) {
      frequencies[byte]++;
    }
    
    let entropy = 0;
    const length = data.length;
    for (const freq of frequencies) {
      if (freq > 0) {
        const p = freq / length;
        entropy -= p * Math.log2(p);
      }
    }
    
    return entropy;
  }
  
  /**
   * VINT形式のサイズ値を解析（簡易版）
   */
  private parseVINTSize(data: Uint8Array, position: number): number {
    if (position >= data.length) return -1;
    
    const firstByte = data[position];
    
    // VINT の長さを特定
    let vintLength = 1;
    let mask = 0x80;
    
    while (vintLength <= 8 && (firstByte & mask) === 0) {
      vintLength++;
      mask >>= 1;
    }
    
    if (vintLength > 8 || position + vintLength > data.length) {
      return -1;
    }
    
    // 簡易的なサイズ値計算（完全なEBML実装ではない）
    let size = firstByte & (mask - 1);
    
    for (let i = 1; i < vintLength; i++) {
      size = (size << 8) | data[position + i];
    }
    
    return size;
  }
  
  /**
   * アライメント結果の信頼度を計算（改善版）
   */
  private calculateConfidence(
    originalData: Uint8Array, 
    alignmentPosition: number, 
    searchResult: any
  ): number {
    let confidence = 0.3; // ベース信頼度を低めに設定
    
    // 検証スコアを重視（重みを大きく）
    confidence += searchResult.validationScore * 0.4;
    
    // ブロックタイプによるボーナス
    if (searchResult.blockType && searchResult.blockType.includes('Block')) {
      confidence += 0.15; // Block要素が見つかった場合
    }
    if (searchResult.blockType && searchResult.blockType.includes('SimpleBlock')) {
      confidence += 0.2; // SimpleBlockが見つかった場合
    }
    
    // アライメント位置が早いほど信頼度が高い（データ損失が少ない）
    const positionRatio = alignmentPosition / originalData.length;
    const positionBonus = (1 - positionRatio) * 0.15;
    confidence += positionBonus;
    
    // アライメント後のデータサイズが十分大きい場合は信頼度向上
    const alignedSize = originalData.length - alignmentPosition;
    if (alignedSize > 2048) {
      confidence += 0.1;
    } else if (alignedSize < 512) {
      confidence -= 0.15; // サイズが小さすぎる場合は信頼度低下
    }
    
    // パターンマッチ数による調整
    if (searchResult.patternMatches > 1) {
      confidence += 0.05; // 複数候補がある場合は若干プラス
    }
    
    // データがトリミングされる場合は効果あり
    if (alignmentPosition > 0) {
      confidence += 0.1;
    }
    
    const finalConfidence = Math.max(0, Math.min(confidence, 1.0));
    
    this.logger.debug('信頼度計算（改善版）', {
      baseConfidence: 0.3,
      validationScore: searchResult.validationScore,
      blockType: searchResult.blockType || 'unknown',
      positionRatio: positionRatio.toFixed(3),
      positionBonus: positionBonus.toFixed(3),
      alignedSize,
      patternMatches: searchResult.patternMatches,
      trimmedBytes: alignmentPosition,
      finalConfidence: finalConfidence.toFixed(3)
    });
    
    return finalConfidence;
  }
  
  /**
   * アライメント結果オブジェクトを生成
   */
  private createAlignmentResult(
    alignedData: Uint8Array, 
    trimmedBytes: number, 
    found: boolean, 
    confidence: number,
    startTime: number,
    recommendedAction: AlignmentDiagnostics['recommendedAction']
  ): AlignmentResult {
    const processingTime = performance.now() - startTime;
    const originalSize = alignedData.length + trimmedBytes;
    
    return {
      alignedData,
      trimmedBytes,
      simpleBlockFound: found,
      confidence,
      diagnostics: {
        originalSize,
        alignedSize: alignedData.length,
        searchRange: Math.min(this.MAX_SEARCH_BYTES, originalSize),
        patternMatches: found ? 1 : 0,
        processingTime,
        validationScore: confidence,
        recommendedAction
      }
    };
  }
  
  /**
   * ヘッダーオンリーチャンクかどうかを判定（改善版）
   * （EBMLヘッダーとメタデータのみで音声ブロックがないチャンク）
   */
  isHeaderOnlyChunk(chunkData: Uint8Array): boolean {
    // WebMヘッダーの存在確認
    const hasWebMHeader = chunkData.length >= 4 && 
                         chunkData[0] === 0x1A && chunkData[1] === 0x45 && 
                         chunkData[2] === 0xDF && chunkData[3] === 0xA3;
    
    if (!hasWebMHeader) {
      return false; // WebMヘッダーがない場合はヘッダーオンリーではない
    }
    
    // 音声ブロック要素の存在をチェック（改善版）
    const audioBlockCount = this.countSimpleBlocks(chunkData);
    
    // ヘッダーオンリーの判定: WebMヘッダーはあるが音声ブロックがない
    const isHeaderOnly = audioBlockCount === 0;
    
    this.logger.debug('ヘッダーオンリーチャンク判定（改善版）', {
      hasWebMHeader,
      audioBlockCount,
      isHeaderOnly,
      chunkSize: chunkData.length
    });
    
    return isHeaderOnly;
  }

  /**
   * チャンク品質の事前診断
   */
  diagnoseChunkQuality(chunkData: Uint8Array): ChunkQualityDiagnosis {
    this.logger.debug('チャンク品質診断開始', {
      chunkSize: chunkData.length
    });
    
    const issues: string[] = [];
    const recommendations: string[] = [];
    
    // サイズチェック
    if (chunkData.length < this.MIN_CHUNK_SIZE) {
      issues.push(`チャンクサイズが小さすぎます (${chunkData.length} bytes < ${this.MIN_CHUNK_SIZE} bytes)`);
      recommendations.push('より長い録音時間を試してください');
    }
    
    // WebMヘッダーの存在確認
    const hasValidHeader = chunkData.length >= 4 && 
                          chunkData[0] === 0x1A && chunkData[1] === 0x45 && 
                          chunkData[2] === 0xDF && chunkData[3] === 0xA3;
    
    // ヘッダーオンリーチャンクの検出
    const isHeaderOnly = this.isHeaderOnlyChunk(chunkData);
    
    // SimpleBlock数をカウント
    const simpleBlockCount = this.countSimpleBlocks(chunkData);
    
    // データ品質の評価
    let dataQuality: ChunkQualityDiagnosis['dataQuality'] = 'poor';
    
    if (isHeaderOnly) {
      dataQuality = 'unusable';
      issues.push('ヘッダーオンリーチャンクです（SimpleBlockなし）');
      recommendations.push('このチャンクは音声データを含まないため、文字起こしをスキップしてください');
    } else if (hasValidHeader && simpleBlockCount > 0 && chunkData.length > 4096) {
      dataQuality = 'excellent';
    } else if (simpleBlockCount > 0 && chunkData.length > 2048) {
      dataQuality = 'good';
    } else if (simpleBlockCount > 0) {
      dataQuality = 'poor';
    } else {
      dataQuality = 'unusable';
      issues.push('有効な音声データ（SimpleBlock）が検出されません');
      recommendations.push('録音設定を確認してください');
    }
    
    // アライメント推奨の判定（ヘッダーオンリーチャンクの場合はアライメント不要）
    const recommendAlignment = !isHeaderOnly && !hasValidHeader && simpleBlockCount > 0;
    
    if (recommendAlignment) {
      recommendations.push('音声ブロックアライメントを適用することで文字起こし成功率が向上する可能性があります');
    }
    
    if (!hasValidHeader && simpleBlockCount === 0 && !isHeaderOnly) {
      issues.push('WebMヘッダーもSimpleBlockも検出されません');
      recommendations.push('音声録音が正常に動作しているか確認してください');
    }
    
    const diagnosis: ChunkQualityDiagnosis = {
      hasValidHeader,
      estimatedSimpleBlocks: simpleBlockCount,
      recommendAlignment,
      dataQuality,
      isHeaderOnly,
      issues,
      recommendations
    };
    
    this.logger.info('チャンク品質診断完了（改善版）', {
      hasValidHeader,
      isHeaderOnly,
      audioBlockCount: simpleBlockCount,
      dataQuality,
      recommendAlignment,
      issueCount: issues.length,
      recommendationCount: recommendations.length
    });
    
    return diagnosis;
  }
  
  /**
   * チャンク内の音声ブロック数をカウント（SimpleBlock + Block対応）
   */
  private countSimpleBlocks(data: Uint8Array): number {
    let count = 0;
    const searchLimit = Math.min(data.length - 1, this.MAX_SEARCH_BYTES);
    const audioDataStart = this.estimateAudioDataStart(data);
    
    // デバッグ用: データの先頭部分をログ出力
    const headerHex = Array.from(data.slice(0, Math.min(32, data.length)))
      .map(b => b.toString(16).padStart(2, '0').toUpperCase())
      .join(' ');
    
    this.logger.debug('音声ブロックカウント開始', {
      dataSize: data.length,
      searchLimit,
      audioDataStart,
      headerPreview: headerHex
    });
    
    // 音声データ領域から優先的に探索
    const searchStart = Math.max(0, audioDataStart - 50);
    
    for (let i = searchStart; i < searchLimit; i++) {
      // 各パターンをチェック
      for (const pattern of this.AUDIO_BLOCK_PATTERNS) {
        if (this.matchesPattern(data, i, pattern)) {
          // 簡易的な構造チェック
          const validation = this.validateAudioBlockStructure(data, i, pattern);
          if (validation.isValid) {
            count++;
            
            this.logger.debug('有効な音声ブロック発見', {
              position: i,
              count,
              patternName: pattern.name,
              contextHex: Array.from(data.slice(Math.max(0, i - 4), i + 10))
                .map(b => b.toString(16).padStart(2, '0').toUpperCase())
                .join(' ')
            });
            
            // 次のブロックまでスキップ（重複カウント防止）
            const estimatedSize = this.parseVINTSize(data, i + 2);
            if (estimatedSize > 0) {
              i += Math.min(estimatedSize + 10, 200); // 最大200バイトスキップ（拡張）
            } else {
              i += 20; // デフォルトスキップを大きく
            }
            
            break; // 一つのパターンでマッチしたら終了
          }
        }
      }
    }
    
    // 音声データのエントロピー分析で補強
    const hasHighEntropyData = this.detectHighEntropyAudioData(data, audioDataStart);
    
    this.logger.debug('音声ブロックカウント完了', {
      count,
      searchRange: searchLimit,
      audioDataStart,
      hasHighEntropyData,
      dataAnalysis: {
        isWebMHeader: data.length >= 4 && data[0] === 0x1A && data[1] === 0x45 && data[2] === 0xDF && data[3] === 0xA3,
        hasOpusCodecInfo: this.findOpusCodecInfo(data),
        estimatedType: count > 0 || hasHighEntropyData ? 'audio_chunk' : 'header_only'
      }
    });
    
    // ブロックが見つからなくても、高エントロピーデータがある場合は音声データありと判定
    return count > 0 || hasHighEntropyData ? Math.max(count, 1) : 0;
  }
  
  /**
   * 高エントロピー音声データの検出
   */
  private detectHighEntropyAudioData(data: Uint8Array, audioDataStart: number): boolean {
    if (audioDataStart >= data.length) return false;
    
    // 音声データ領域を256バイトごとにサンプリング
    const sampleSize = 256;
    let highEntropyBlocks = 0;
    let totalBlocks = 0;
    
    for (let i = audioDataStart; i < data.length - sampleSize; i += sampleSize) {
      const block = data.slice(i, i + sampleSize);
      const entropy = this.calculateDataEntropy(block);
      
      totalBlocks++;
      if (entropy > 6.5) { // 高エントロピー闾値
        highEntropyBlocks++;
      }
      
      // 最大4ブロックまでサンプリング
      if (totalBlocks >= 4) break;
    }
    
    const highEntropyRatio = totalBlocks > 0 ? highEntropyBlocks / totalBlocks : 0;
    const hasHighEntropyData = highEntropyRatio >= 0.5; // 50%以上が高エントロピー
    
    this.logger.debug('高エントロピーデータ検出', {
      audioDataStart,
      totalBlocks,
      highEntropyBlocks,
      highEntropyRatio: highEntropyRatio.toFixed(2),
      hasHighEntropyData
    });
    
    return hasHighEntropyData;
  }
  
  /**
   * OpusコーデックヘッダーまたはOpusデータの存在を確認
   */
  private findOpusCodecInfo(data: Uint8Array): boolean {
    // "Opus" 文字列の検索 (4F 70 75 73)
    for (let i = 0; i < data.length - 3; i++) {
      if (data[i] === 0x4F && data[i + 1] === 0x70 && 
          data[i + 2] === 0x75 && data[i + 3] === 0x73) {
        return true;
      }
    }
    
    // OpusHead マジックナンバーの検索 (4F 70 75 73 48 65 61 64)
    for (let i = 0; i < data.length - 7; i++) {
      if (data[i] === 0x4F && data[i + 1] === 0x70 && 
          data[i + 2] === 0x75 && data[i + 3] === 0x73 &&
          data[i + 4] === 0x48 && data[i + 5] === 0x65 &&
          data[i + 6] === 0x61 && data[i + 7] === 0x64) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * アライメント処理の統計情報を取得
   */
  getProcessingStats(): {
    totalProcessed: number;
    successfulAlignments: number;
    averageProcessingTime: number;
    averageConfidence: number;
  } {
    // 実装は後続のPhaseで追加予定
    return {
      totalProcessed: 0,
      successfulAlignments: 0,
      averageProcessingTime: 0,
      averageConfidence: 0
    };
  }
  
  /**
   * Validator統合: アライメント前後の品質比較
   */
  async alignWithValidation(chunkData: Uint8Array): Promise<{
    alignmentResult: AlignmentResult;
    originalValidation: ChunkValidationResult | null;
    alignedValidation: ChunkValidationResult | null;
    recommendation: 'use_aligned' | 'use_original' | 'reject_chunk';
    qualityImprovement: number; // -1.0 to 1.0
  }> {
    try {
      this.logger.debug('Validator統合アライメント開始', {
        chunkSize: chunkData.length,
        validatorEnabled: !!this.validator
      });

      // Step 1: 元データの検証
      let originalValidation: ChunkValidationResult | null = null;
      if (this.validator) {
        originalValidation = await this.validator.validateChunk(chunkData);
        this.logger.debug('元データ検証完了', {
          isValid: originalValidation.isValid,
          qualityScore: originalValidation.qualityScore.toFixed(3),
          errorCount: originalValidation.errorCount
        });
      }

      // Step 2: アライメント実行
      const alignmentResult = this.alignChunkToSimpleBlock(chunkData);

      // Step 3: アライメント後データの検証
      let alignedValidation: ChunkValidationResult | null = null;
      if (this.validator && alignmentResult.simpleBlockFound) {
        alignedValidation = await this.validator.validateChunk(alignmentResult.alignedData);
        this.logger.debug('アライメント後データ検証完了', {
          isValid: alignedValidation.isValid,
          qualityScore: alignedValidation.qualityScore.toFixed(3),
          errorCount: alignedValidation.errorCount
        });
      }

      // Step 4: 品質改善度計算と推奨決定
      const qualityImprovement = this.calculateQualityImprovement(originalValidation, alignedValidation);
      const recommendation = this.determineRecommendationWithValidation(
        alignmentResult, originalValidation, alignedValidation, qualityImprovement
      );

      this.logger.info('Validator統合アライメント完了', {
        alignmentApplied: alignmentResult.simpleBlockFound,
        qualityImprovement: qualityImprovement.toFixed(3),
        recommendation,
        originalQuality: originalValidation?.qualityScore.toFixed(3) || 'N/A',
        alignedQuality: alignedValidation?.qualityScore.toFixed(3) || 'N/A'
      });

      return {
        alignmentResult,
        originalValidation,
        alignedValidation,
        recommendation,
        qualityImprovement
      };

    } catch (error) {
      this.logger.error('Validator統合アライメントエラー', error instanceof Error ? error : undefined, error);
      
      // エラー時は通常のアライメントのみ実行
      const alignmentResult = this.alignChunkToSimpleBlock(chunkData);
      return {
        alignmentResult,
        originalValidation: null,
        alignedValidation: null,
        recommendation: alignmentResult.confidence > 0.7 ? 'use_aligned' : 'use_original',
        qualityImprovement: 0
      };
    }
  }

  /**
   * 品質改善度の計算
   */
  private calculateQualityImprovement(
    original: ChunkValidationResult | null, 
    aligned: ChunkValidationResult | null
  ): number {
    if (!original || !aligned) {
      return 0; // 検証データが不足
    }

    // 品質スコアの差分
    const scoreDiff = aligned.qualityScore - original.qualityScore;
    
    // エラー数の改善
    const errorImprovement = (original.errorCount - aligned.errorCount) * 0.1;
    
    // 警告数の改善
    const warningImprovement = (original.warningCount - aligned.warningCount) * 0.05;
    
    // 総合改善度
    const improvement = scoreDiff + errorImprovement + warningImprovement;
    
    return Math.max(-1.0, Math.min(1.0, improvement));
  }

  /**
   * Validation結果を加味した推奨決定
   */
  private determineRecommendationWithValidation(
    alignmentResult: AlignmentResult,
    originalValidation: ChunkValidationResult | null,
    alignedValidation: ChunkValidationResult | null,
    qualityImprovement: number
  ): 'use_aligned' | 'use_original' | 'reject_chunk' {
    
    // 基本的な品質チェック
    if (originalValidation?.qualityScore !== undefined && originalValidation.qualityScore < 0.2) {
      return 'reject_chunk';
    }

    // アライメントが失敗した場合
    if (!alignmentResult.simpleBlockFound || alignmentResult.confidence < 0.5) {
      return 'use_original';
    }

    // Validation結果がない場合は、アライメント結果の診断に依存
    if (!originalValidation || !alignedValidation) {
      return alignmentResult.diagnostics.recommendedAction;
    }

    // 品質改善が明確な場合
    if (qualityImprovement > 0.1) {
      return 'use_aligned';
    }

    // 品質悪化が明確な場合
    if (qualityImprovement < -0.1) {
      return 'use_original';
    }

    // 微妙な場合は、エラー数で判断
    if (alignedValidation.errorCount < originalValidation.errorCount) {
      return 'use_aligned';
    }

    // デフォルトは元データを使用
    return 'use_original';
  }

  /**
   * Validatorの設定更新
   */
  updateValidatorConfig(config: Partial<ValidationConfig>): void {
    if (this.validator) {
      this.validator.updateConfig(config);
      this.logger.info('Validator設定更新', config);
    } else {
      this.logger.warn('Validator未初期化のため設定更新をスキップ');
    }
  }

  /**
   * Validator統計取得
   */
  getValidatorStats() {
    if (this.validator) {
      return this.validator.getValidationStats();
    }
    return null;
  }

  /**
   * Validatorの有効化/無効化
   */
  setValidatorEnabled(enabled: boolean): void {
    if (enabled && !this.validator) {
      this.validator = new WebMChunkValidator({
        enableDeepAnalysis: false,
        strictMode: false,
        performanceMode: 'speed',
        enableCaching: true
      });
      this.logger.info('Validator有効化');
    } else if (!enabled && this.validator) {
      this.validator.cleanup();
      this.validator = null;
      this.logger.info('Validator無効化');
    }
  }

  /**
   * Validatorの状態取得
   */
  isValidatorEnabled(): boolean {
    return !!this.validator;
  }

  /**
   * 生音声データかどうかを判定
   */
  private isRawAudioData(data: Uint8Array): boolean {
    // WebMコンテナのマジックナンバーをチェック
    if (data.length >= 4 && 
        data[0] === 0x1A && data[1] === 0x45 && 
        data[2] === 0xDF && data[3] === 0xA3) {
      return false; // WebMコンテナデータ
    }
    
    // Opusフレームの特徴をチェック
    // Opusフレームは高エントロピーで、一定のパターンを持つ
    let entropyScore = 0;
    const sampleSize = Math.min(1024, data.length);
    
    for (let i = 0; i < sampleSize - 1; i++) {
      const diff = Math.abs(data[i] - data[i + 1]);
      if (diff > 50) entropyScore++;
    }
    
    const entropyRatio = entropyScore / sampleSize;
    return entropyRatio > 0.3; // 30%以上の変化があれば生音声データ
  }
  
  /**
   * 生音声データのOpusフレームアライメント
   */
  private alignRawAudioData(data: Uint8Array, startTime: number): AlignmentResult {
    console.log('🎯 Opusフレームアライメント開始', { dataSize: data.length });
    
    // Opusフレーム境界を検出
    const frameAlignmentResult = this.findOpusFrameBoundary(data);
    
    if (frameAlignmentResult.found) {
      const trimmedBytes = frameAlignmentResult.trimBytes;
      const alignedData = data.slice(trimmedBytes);
      
      console.log('🎯 Opusフレーム境界検出', {
        trimmedBytes,
        confidence: frameAlignmentResult.confidence,
        originalSize: data.length,
        alignedSize: alignedData.length
      });
      
      return this.createAlignmentResult(
        alignedData,
        trimmedBytes,
        true, // simpleBlockFound = true (フレーム境界検出)
        frameAlignmentResult.confidence,
        startTime,
        'use_aligned'
      );
    }
    
    // フレーム境界が見つからない場合は元データを返す
    console.log('🎯 Opusフレーム境界未検出 - 元データを使用');
    return this.createAlignmentResult(
      data,
      0,
      false,
      0.1,
      startTime,
      'use_original'
    );
  }
  
  /**
   * Opusフレーム境界を検出
   */
  private findOpusFrameBoundary(data: Uint8Array): { found: boolean, trimBytes: number, confidence: number } {
    const maxSearchBytes = Math.min(this.MAX_SEARCH_BYTES, data.length);
    
    // Opusフレームは通常、高エントロピーデータの境界で特徴的なパターンを持つ
    let bestTrimPosition = 0;
    let bestConfidence = 0;
    
    for (let i = 0; i < maxSearchBytes; i += 4) { // 4バイトアライメント
      const confidence = this.calculateOpusFrameConfidence(data, i);
      
      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestTrimPosition = i;
      }
    }
    
    // 信頼度闾値を超えた場合のみアライメントを適用
    const found = bestConfidence >= this.CONFIDENCE_THRESHOLD;
    
    return {
      found,
      trimBytes: found ? bestTrimPosition : 0,
      confidence: bestConfidence
    };
  }
  
  /**
   * 指定位置がOpusフレーム境界である可能性を計算
   */
  private calculateOpusFrameConfidence(data: Uint8Array, position: number): number {
    if (position >= data.length - 64) return 0; // 最小フレームサイズを確保
    
    let confidence = 0;
    
    // 1. バイトのエントロピーチェック（フレーム境界では変化が大きい）
    const windowSize = Math.min(32, data.length - position);
    let entropyScore = 0;
    
    for (let i = position; i < position + windowSize - 1; i++) {
      const diff = Math.abs(data[i] - data[i + 1]);
      if (diff > 40) entropyScore++;
    }
    
    const entropyRatio = entropyScore / windowSize;
    confidence += entropyRatio * 0.6; // 60%の重み
    
    // 2. 4バイトアライメントボーナス
    if (position % 4 === 0) {
      confidence += 0.2;
    }
    
    // 3. データの連続性チェック（フレーム内は比較的連続的）
    if (position + 16 < data.length) {
      let continuityScore = 0;
      for (let i = position + 1; i < position + 16; i++) {
        const diff = Math.abs(data[i] - data[i - 1]);
        if (diff < 30) continuityScore++;
      }
      confidence += (continuityScore / 15) * 0.2; // 20%の重み
    }
    
    return Math.min(confidence, 1.0);
  }

  /**
   * リソースのクリーンアップ
   */
  cleanup(): void {
    if (this.validator) {
      this.validator.cleanup();
      this.validator = null;
    }
    this.logger.info('SimpleBlockAligner クリーンアップ完了');
  }
}