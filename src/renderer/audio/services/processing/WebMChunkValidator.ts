/**
 * WebMChunkValidator - WebMチャンクの品質検証とエラー診断システム
 * 
 * SimpleBlockアライメントシステムの一部として、
 * チャンクの品質を詳細に分析し、問題を特定する専門クラス
 * 
 * 責務:
 * - WebMチャンクの構造検証
 * - SimpleBlock要素の完整性チェック
 * - 品質評価とスコアリング
 * - エラー診断とレポート生成
 * - パフォーマンス統計の収集
 */

import { LoggerFactory, LogCategories } from '../../../utils/LoggerFactory';

export interface ChunkValidationResult {
  isValid: boolean;
  qualityScore: number; // 0.0 - 1.0
  errorCount: number;
  warningCount: number;
  findings: ValidationFinding[];
  structuralAnalysis: StructuralAnalysis;
  performanceMetrics: PerformanceMetrics;
}

export interface ValidationFinding {
  type: 'error' | 'warning' | 'info';
  category: 'structure' | 'simpleblock' | 'header' | 'data' | 'alignment';
  message: string;
  position?: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  recommendation?: string;
}

export interface StructuralAnalysis {
  hasValidEBMLHeader: boolean;
  hasClusterElements: boolean;
  simpleBlockCount: number;
  estimatedDuration: number;
  dataIntegrity: 'excellent' | 'good' | 'poor' | 'corrupted';
  alignmentQuality: 'perfect' | 'good' | 'acceptable' | 'poor';
}

export interface PerformanceMetrics {
  validationTime: number;
  bytesAnalyzed: number;
  throughputMBps: number;
  memoryUsage: number;
  cacheHitRate: number;
}

export interface ValidationConfig {
  enableDeepAnalysis: boolean;
  strictMode: boolean;
  performanceMode: 'speed' | 'balance' | 'thorough';
  maxAnalysisSize: number;
  enableCaching: boolean;
}

export class WebMChunkValidator {
  private logger = LoggerFactory.getLogger(LogCategories.WEBM_CHUNK_VALIDATOR);
  private config: ValidationConfig;
  private validationCache: Map<string, ChunkValidationResult>;
  private performanceStats: {
    totalValidations: number;
    totalTime: number;
    totalBytes: number;
    cacheHits: number;
  };

  constructor(config: Partial<ValidationConfig> = {}) {
    this.config = {
      enableDeepAnalysis: true,
      strictMode: false,
      performanceMode: 'balance',
      maxAnalysisSize: 10 * 1024 * 1024, // 10MB
      enableCaching: true,
      ...config
    };

    this.validationCache = new Map();
    this.performanceStats = {
      totalValidations: 0,
      totalTime: 0,
      totalBytes: 0,
      cacheHits: 0
    };

    this.logger.info('WebMChunkValidator初期化完了', {
      config: this.config,
      cacheEnabled: this.config.enableCaching
    });
  }

  /**
   * WebMチャンクの包括的検証
   */
  async validateChunk(chunkData: Uint8Array, chunkIndex?: number): Promise<ChunkValidationResult> {
    const startTime = performance.now();
    
    try {
      this.logger.debug('チャンク検証開始', {
        size: chunkData.length,
        chunkIndex,
        performanceMode: this.config.performanceMode
      });

      // キャッシュ確認
      if (this.config.enableCaching) {
        const cacheKey = this.generateCacheKey(chunkData, chunkIndex);
        const cached = this.validationCache.get(cacheKey);
        if (cached) {
          this.performanceStats.cacheHits++;
          this.logger.debug('キャッシュからValidation結果を取得');
          return cached;
        }
      }

      // サイズ制限チェック
      if (chunkData.length > this.config.maxAnalysisSize) {
        return this.createLimitedValidationResult(chunkData, 'size_limit_exceeded');
      }

      // メイン検証処理
      const result = await this.performValidation(chunkData, chunkIndex);

      // パフォーマンス統計更新
      const processingTime = performance.now() - startTime;
      this.updatePerformanceStats(processingTime, chunkData.length);

      // キャッシュに保存
      if (this.config.enableCaching) {
        const cacheKey = this.generateCacheKey(chunkData, chunkIndex);
        this.validationCache.set(cacheKey, result);
        
        // キャッシュサイズ制限
        if (this.validationCache.size > 100) {
          const firstKey = this.validationCache.keys().next().value;
          if (firstKey !== undefined) {
            this.validationCache.delete(firstKey);
          }
        }
      }

      this.logger.info('チャンク検証完了', {
        chunkIndex,
        qualityScore: result.qualityScore.toFixed(3),
        errorCount: result.errorCount,
        warningCount: result.warningCount,
        processingTime: processingTime.toFixed(2) + 'ms'
      });

      return result;

    } catch (error) {
      const processingTime = performance.now() - startTime;
      this.logger.error('チャンク検証エラー', error instanceof Error ? error : undefined, {
        chunkSize: chunkData.length,
        chunkIndex,
        processingTime: processingTime.toFixed(2) + 'ms'
      });

      return this.createErrorValidationResult(chunkData, error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * メイン検証処理
   */
  private async performValidation(chunkData: Uint8Array, chunkIndex?: number): Promise<ChunkValidationResult> {
    const findings: ValidationFinding[] = [];
    let qualityScore = 1.0;
    const validationStartTime = performance.now();

    // 1. 基本構造検証
    const structuralAnalysis = this.analyzeStructure(chunkData, findings);
    
    // 2. SimpleBlock検証
    if (this.config.enableDeepAnalysis) {
      await this.validateSimpleBlocks(chunkData, findings, structuralAnalysis);
    }

    // 3. データ整合性検証
    this.validateDataIntegrity(chunkData, findings, structuralAnalysis);

    // 4. アライメント品質検証
    this.validateAlignmentQuality(chunkData, findings, structuralAnalysis);

    // 5. 品質スコア計算
    qualityScore = this.calculateQualityScore(findings, structuralAnalysis);

    // 6. パフォーマンスメトリクス計算
    const performanceMetrics = this.calculatePerformanceMetrics(
      performance.now() - validationStartTime,
      chunkData.length
    );

    const errorCount = findings.filter(f => f.type === 'error').length;
    const warningCount = findings.filter(f => f.type === 'warning').length;

    return {
      isValid: errorCount === 0 && qualityScore >= 0.6,
      qualityScore,
      errorCount,
      warningCount,
      findings,
      structuralAnalysis,
      performanceMetrics
    };
  }

  /**
   * WebMチャンクの構造分析
   */
  private analyzeStructure(chunkData: Uint8Array, findings: ValidationFinding[]): StructuralAnalysis {
    const analysis: StructuralAnalysis = {
      hasValidEBMLHeader: false,
      hasClusterElements: false,
      simpleBlockCount: 0,
      estimatedDuration: 0,
      dataIntegrity: 'corrupted',
      alignmentQuality: 'poor'
    };

    try {
      // EBMLヘッダー検証
      if (this.hasValidEBMLHeader(chunkData)) {
        analysis.hasValidEBMLHeader = true;
        findings.push({
          type: 'info',
          category: 'header',
          message: 'Valid EBML header detected',
          severity: 'low'
        });
      } else {
        findings.push({
          type: 'warning',
          category: 'header',
          message: 'No valid EBML header found',
          severity: 'medium',
          recommendation: 'Ensure proper WebM header is present'
        });
      }

      // Cluster要素検証
      const clusterPositions = this.findClusterElements(chunkData);
      if (clusterPositions.length > 0) {
        analysis.hasClusterElements = true;
        findings.push({
          type: 'info',
          category: 'structure',
          message: `Found ${clusterPositions.length} cluster elements`,
          severity: 'low'
        });
      }

      // SimpleBlock要素カウント
      analysis.simpleBlockCount = this.countSimpleBlocks(chunkData);
      if (analysis.simpleBlockCount === 0) {
        findings.push({
          type: 'warning',
          category: 'simpleblock',
          message: 'No SimpleBlock elements found',
          severity: 'high',
          recommendation: 'Check if chunk contains valid audio data'
        });
      } else {
        findings.push({
          type: 'info',
          category: 'simpleblock',
          message: `Found ${analysis.simpleBlockCount} SimpleBlock elements`,
          severity: 'low'
        });
      }

      // データ整合性評価
      analysis.dataIntegrity = this.assessDataIntegrity(chunkData, analysis.simpleBlockCount);

      // アライメント品質評価
      analysis.alignmentQuality = this.assessAlignmentQuality(chunkData);

      // 推定再生時間計算（概算）
      analysis.estimatedDuration = this.estimateDuration(chunkData, analysis.simpleBlockCount);

    } catch (error) {
      findings.push({
        type: 'error',
        category: 'structure',
        message: `Structure analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'critical'
      });
    }

    return analysis;
  }

  /**
   * SimpleBlock要素の詳細検証
   */
  private async validateSimpleBlocks(
    chunkData: Uint8Array, 
    findings: ValidationFinding[], 
    structuralAnalysis: StructuralAnalysis
  ): Promise<void> {
    try {
      let simpleBlocksFound = 0;
      let corruptedBlocks = 0;

      // SimpleBlock検索パターン: 0xA3 (SimpleBlock ID)
      for (let i = 0; i < chunkData.length - 4; i++) {
        if (chunkData[i] === 0xA3) {
          const blockAnalysis = this.analyzeSimpleBlockAt(chunkData, i);
          simpleBlocksFound++;

          if (!blockAnalysis.isValid) {
            corruptedBlocks++;
            findings.push({
              type: 'error',
              category: 'simpleblock',
              message: `Corrupted SimpleBlock at position ${i}: ${blockAnalysis.error}`,
              position: i,
              severity: 'high',
              recommendation: 'Check data alignment and integrity'
            });
          } else if (blockAnalysis.hasWarnings) {
            findings.push({
              type: 'warning',
              category: 'simpleblock',
              message: `SimpleBlock warnings at position ${i}: ${blockAnalysis.warnings.join(', ')}`,
              position: i,
              severity: 'medium'
            });
          }
        }
      }

      // SimpleBlock統計の更新
      if (simpleBlocksFound !== structuralAnalysis.simpleBlockCount) {
        findings.push({
          type: 'warning',
          category: 'simpleblock',
          message: `SimpleBlock count mismatch: found ${simpleBlocksFound}, expected ${structuralAnalysis.simpleBlockCount}`,
          severity: 'medium'
        });
      }

      if (corruptedBlocks > 0) {
        findings.push({
          type: 'error',
          category: 'simpleblock',
          message: `${corruptedBlocks} of ${simpleBlocksFound} SimpleBlocks are corrupted`,
          severity: 'critical',
          recommendation: 'Consider re-alignment or data recovery'
        });
      }

    } catch (error) {
      findings.push({
        type: 'error',
        category: 'simpleblock',
        message: `SimpleBlock validation failed: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'high'
      });
    }
  }

  /**
   * データ整合性検証
   */
  private validateDataIntegrity(
    chunkData: Uint8Array, 
    findings: ValidationFinding[], 
    structuralAnalysis: StructuralAnalysis
  ): void {
    try {
      // チェックサム検証（簡易版）
      const dataHash = this.calculateDataHash(chunkData);
      
      // データ密度チェック（連続する0バイトの検出）
      const zeroSequences = this.findZeroSequences(chunkData);
      if (zeroSequences.length > 5) {
        findings.push({
          type: 'warning',
          category: 'data',
          message: `Found ${zeroSequences.length} sequences of zero bytes`,
          severity: 'medium',
          recommendation: 'Check for data padding or corruption'
        });
      }

      // データ分布分析
      const entropy = this.calculateDataEntropy(chunkData.slice(0, Math.min(1024, chunkData.length)));
      if (entropy < 3.0) {
        findings.push({
          type: 'warning',
          category: 'data',
          message: `Low data entropy: ${entropy.toFixed(2)}`,
          severity: 'medium',
          recommendation: 'Data may be highly compressed or contain patterns'
        });
      }

      // サイズ妥当性チェック
      if (chunkData.length < 100) {
        findings.push({
          type: 'warning',
          category: 'data',
          message: `Very small chunk size: ${chunkData.length} bytes`,
          severity: 'medium'
        });
      } else if (chunkData.length > 5 * 1024 * 1024) {
        findings.push({
          type: 'warning',
          category: 'data',
          message: `Large chunk size: ${(chunkData.length / 1024 / 1024).toFixed(1)}MB`,
          severity: 'low'
        });
      }

    } catch (error) {
      findings.push({
        type: 'error',
        category: 'data',
        message: `Data integrity validation failed: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'high'
      });
    }
  }

  /**
   * アライメント品質検証
   */
  private validateAlignmentQuality(
    chunkData: Uint8Array, 
    findings: ValidationFinding[], 
    structuralAnalysis: StructuralAnalysis
  ): void {
    try {
      // チャンク開始位置のSimpleBlock検証
      const startsWithSimpleBlock = this.startsWithSimpleBlock(chunkData);
      if (!startsWithSimpleBlock) {
        findings.push({
          type: 'warning',
          category: 'alignment',
          message: 'Chunk does not start with SimpleBlock',
          severity: 'medium',
          recommendation: 'Consider using SimpleBlock alignment'
        });
      }

      // SimpleBlock境界の妥当性チェック
      const boundaryScore = this.analyzeBoundaryAlignment(chunkData);
      if (boundaryScore < 0.7) {
        findings.push({
          type: 'warning',
          category: 'alignment',
          message: `Poor boundary alignment score: ${boundaryScore.toFixed(3)}`,
          severity: 'medium',
          recommendation: 'Review chunk splitting algorithm'
        });
      }

      // タイムスタンプ連続性チェック（可能な場合）
      const timestampIssues = this.checkTimestampContinuity(chunkData);
      if (timestampIssues.length > 0) {
        findings.push({
          type: 'warning',
          category: 'alignment',
          message: `Timestamp continuity issues: ${timestampIssues.join(', ')}`,
          severity: 'medium'
        });
      }

    } catch (error) {
      findings.push({
        type: 'error',
        category: 'alignment',
        message: `Alignment validation failed: ${error instanceof Error ? error.message : String(error)}`,
        severity: 'medium'
      });
    }
  }

  // ========================================================================
  // ヘルパーメソッド
  // ========================================================================

  private hasValidEBMLHeader(data: Uint8Array): boolean {
    return data.length >= 4 && 
           data[0] === 0x1A && data[1] === 0x45 && 
           data[2] === 0xDF && data[3] === 0xA3;
  }

  private findClusterElements(data: Uint8Array): number[] {
    const positions: number[] = [];
    for (let i = 0; i < data.length - 4; i++) {
      if (data[i] === 0x1F && data[i + 1] === 0x43 && 
          data[i + 2] === 0xB6 && data[i + 3] === 0x75) {
        positions.push(i);
      }
    }
    return positions;
  }

  private countSimpleBlocks(data: Uint8Array): number {
    let count = 0;
    for (let i = 0; i < data.length - 1; i++) {
      if (data[i] === 0xA3) {
        count++;
      }
    }
    return count;
  }

  private assessDataIntegrity(data: Uint8Array, simpleBlockCount: number): 'excellent' | 'good' | 'poor' | 'corrupted' {
    if (simpleBlockCount === 0) return 'corrupted';
    
    const ratio = simpleBlockCount / (data.length / 1000);
    if (ratio > 0.5) return 'excellent';
    if (ratio > 0.2) return 'good';
    if (ratio > 0.05) return 'poor';
    return 'corrupted';
  }

  private assessAlignmentQuality(data: Uint8Array): 'perfect' | 'good' | 'acceptable' | 'poor' {
    if (this.startsWithSimpleBlock(data)) {
      const boundaryScore = this.analyzeBoundaryAlignment(data);
      if (boundaryScore > 0.9) return 'perfect';
      if (boundaryScore > 0.7) return 'good';
      if (boundaryScore > 0.5) return 'acceptable';
    }
    return 'poor';
  }

  private estimateDuration(data: Uint8Array, simpleBlockCount: number): number {
    // 概算: SimpleBlock数に基づく推定（実際のタイムスタンプは解析困難）
    return simpleBlockCount * 0.02; // 20ms per block assumption
  }

  private analyzeSimpleBlockAt(data: Uint8Array, position: number): { isValid: boolean; error?: string; hasWarnings: boolean; warnings: string[] } {
    try {
      if (position + 3 >= data.length) {
        return { isValid: false, error: 'Insufficient data', hasWarnings: false, warnings: [] };
      }

      const warnings: string[] = [];
      
      // Track number check (next byte after 0xA3)
      const trackInfo = data[position + 1];
      if (trackInfo !== 0x81) {
        warnings.push(`Unexpected track info: 0x${trackInfo.toString(16)}`);
      }

      // Size field check
      const sizeField = data[position + 2];
      if (sizeField === 0x00) {
        return { isValid: false, error: 'Invalid size field', hasWarnings: false, warnings: [] };
      }

      return { 
        isValid: true, 
        hasWarnings: warnings.length > 0, 
        warnings 
      };

    } catch (error) {
      return { 
        isValid: false, 
        error: error instanceof Error ? error.message : String(error), 
        hasWarnings: false, 
        warnings: [] 
      };
    }
  }

  private calculateDataHash(data: Uint8Array): number {
    let hash = 0;
    for (let i = 0; i < Math.min(data.length, 1000); i++) {
      hash = ((hash << 5) - hash + data[i]) & 0xffffffff;
    }
    return hash;
  }

  private findZeroSequences(data: Uint8Array): number[] {
    const sequences: number[] = [];
    let consecutiveZeros = 0;
    
    for (let i = 0; i < data.length; i++) {
      if (data[i] === 0) {
        consecutiveZeros++;
      } else {
        if (consecutiveZeros >= 20) {
          sequences.push(consecutiveZeros);
        }
        consecutiveZeros = 0;
      }
    }
    
    return sequences;
  }

  private calculateDataEntropy(data: Uint8Array): number {
    const frequency = new Array(256).fill(0);
    for (const byte of data) {
      frequency[byte]++;
    }
    
    let entropy = 0;
    const length = data.length;
    for (const freq of frequency) {
      if (freq > 0) {
        const p = freq / length;
        entropy -= p * Math.log2(p);
      }
    }
    
    return entropy;
  }

  private startsWithSimpleBlock(data: Uint8Array): boolean {
    return data.length >= 3 && data[0] === 0xA3 && data[1] === 0x81;
  }

  private analyzeBoundaryAlignment(data: Uint8Array): number {
    // SimpleBlock境界の整列度を0-1で評価
    let score = 0.5; // ベーススコア
    
    if (this.startsWithSimpleBlock(data)) {
      score += 0.3;
    }
    
    const simpleBlockCount = this.countSimpleBlocks(data);
    if (simpleBlockCount > 0) {
      score += Math.min(0.2, simpleBlockCount * 0.02);
    }
    
    return Math.min(score, 1.0);
  }

  private checkTimestampContinuity(data: Uint8Array): string[] {
    // 簡易的なタイムスタンプ連続性チェック
    const issues: string[] = [];
    
    // 実装は複雑なため、基本的なパターンのみチェック
    const simpleBlockPositions = [];
    for (let i = 0; i < data.length - 1; i++) {
      if (data[i] === 0xA3) {
        simpleBlockPositions.push(i);
      }
    }
    
    if (simpleBlockPositions.length > 1) {
      const avgDistance = (simpleBlockPositions[simpleBlockPositions.length - 1] - simpleBlockPositions[0]) / 
                         (simpleBlockPositions.length - 1);
      
      if (avgDistance < 50) {
        issues.push('Very small block intervals');
      } else if (avgDistance > 5000) {
        issues.push('Very large block intervals');
      }
    }
    
    return issues;
  }

  private calculateQualityScore(findings: ValidationFinding[], structuralAnalysis: StructuralAnalysis): number {
    let score = 1.0;
    
    // エラー・警告による減点
    for (const finding of findings) {
      if (finding.type === 'error') {
        switch (finding.severity) {
          case 'critical': score -= 0.3; break;
          case 'high': score -= 0.2; break;
          case 'medium': score -= 0.1; break;
          case 'low': score -= 0.05; break;
        }
      } else if (finding.type === 'warning') {
        switch (finding.severity) {
          case 'critical': score -= 0.15; break;
          case 'high': score -= 0.1; break;
          case 'medium': score -= 0.05; break;
          case 'low': score -= 0.02; break;
        }
      }
    }
    
    // 構造分析による加点/減点
    if (structuralAnalysis.hasValidEBMLHeader) score += 0.1;
    if (structuralAnalysis.hasClusterElements) score += 0.05;
    if (structuralAnalysis.simpleBlockCount > 0) score += 0.1;
    
    switch (structuralAnalysis.dataIntegrity) {
      case 'excellent': score += 0.1; break;
      case 'good': score += 0.05; break;
      case 'poor': score -= 0.1; break;
      case 'corrupted': score -= 0.3; break;
    }
    
    switch (structuralAnalysis.alignmentQuality) {
      case 'perfect': score += 0.1; break;
      case 'good': score += 0.05; break;
      case 'acceptable': break;
      case 'poor': score -= 0.1; break;
    }
    
    return Math.max(0.0, Math.min(1.0, score));
  }

  private calculatePerformanceMetrics(processingTime: number, bytesAnalyzed: number): PerformanceMetrics {
    const throughputMBps = (bytesAnalyzed / (1024 * 1024)) / (processingTime / 1000);
    
    return {
      validationTime: processingTime,
      bytesAnalyzed,
      throughputMBps,
      memoryUsage: process.memoryUsage?.()?.heapUsed || 0,
      cacheHitRate: this.performanceStats.totalValidations > 0 ? 
                   this.performanceStats.cacheHits / this.performanceStats.totalValidations : 0
    };
  }

  private generateCacheKey(chunkData: Uint8Array, chunkIndex?: number): string {
    const hash = this.calculateDataHash(chunkData);
    return `${hash}_${chunkData.length}_${chunkIndex || 'unknown'}`;
  }

  private createLimitedValidationResult(chunkData: Uint8Array, reason: string): ChunkValidationResult {
    return {
      isValid: false,
      qualityScore: 0.1,
      errorCount: 1,
      warningCount: 0,
      findings: [{
        type: 'error',
        category: 'structure',
        message: `Validation limited: ${reason}`,
        severity: 'high'
      }],
      structuralAnalysis: {
        hasValidEBMLHeader: false,
        hasClusterElements: false,
        simpleBlockCount: 0,
        estimatedDuration: 0,
        dataIntegrity: 'corrupted',
        alignmentQuality: 'poor'
      },
      performanceMetrics: {
        validationTime: 0,
        bytesAnalyzed: chunkData.length,
        throughputMBps: 0,
        memoryUsage: 0,
        cacheHitRate: 0
      }
    };
  }

  private createErrorValidationResult(chunkData: Uint8Array, error: Error): ChunkValidationResult {
    return {
      isValid: false,
      qualityScore: 0.0,
      errorCount: 1,
      warningCount: 0,
      findings: [{
        type: 'error',
        category: 'structure',
        message: `Validation error: ${error.message}`,
        severity: 'critical'
      }],
      structuralAnalysis: {
        hasValidEBMLHeader: false,
        hasClusterElements: false,
        simpleBlockCount: 0,
        estimatedDuration: 0,
        dataIntegrity: 'corrupted',
        alignmentQuality: 'poor'
      },
      performanceMetrics: {
        validationTime: 0,
        bytesAnalyzed: chunkData.length,
        throughputMBps: 0,
        memoryUsage: 0,
        cacheHitRate: 0
      }
    };
  }

  private updatePerformanceStats(processingTime: number, bytesAnalyzed: number): void {
    this.performanceStats.totalValidations++;
    this.performanceStats.totalTime += processingTime;
    this.performanceStats.totalBytes += bytesAnalyzed;
  }

  // ========================================================================
  // 公開API
  // ========================================================================

  /**
   * バッチ検証（複数チャンクの一括検証）
   */
  async validateChunkBatch(chunks: Uint8Array[]): Promise<ChunkValidationResult[]> {
    const results: ChunkValidationResult[] = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const result = await this.validateChunk(chunks[i], i);
      results.push(result);
    }
    
    this.logger.info('バッチ検証完了', {
      chunkCount: chunks.length,
      validChunks: results.filter(r => r.isValid).length,
      averageQuality: (results.reduce((sum, r) => sum + r.qualityScore, 0) / results.length).toFixed(3)
    });
    
    return results;
  }

  /**
   * 統計情報を取得
   */
  getValidationStats() {
    return {
      ...this.performanceStats,
      cacheSize: this.validationCache.size,
      averageProcessingTime: this.performanceStats.totalValidations > 0 ? 
                           this.performanceStats.totalTime / this.performanceStats.totalValidations : 0,
      averageThroughput: this.performanceStats.totalTime > 0 ? 
                        (this.performanceStats.totalBytes / (1024 * 1024)) / (this.performanceStats.totalTime / 1000) : 0
    };
  }

  /**
   * 設定更新
   */
  updateConfig(newConfig: Partial<ValidationConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };
    
    this.logger.info('Validator設定更新', {
      oldConfig,
      newConfig: this.config
    });
    
    // キャッシュが無効化された場合はクリア
    if (oldConfig.enableCaching && !this.config.enableCaching) {
      this.clearCache();
    }
  }

  /**
   * キャッシュクリア
   */
  clearCache(): void {
    this.validationCache.clear();
    this.logger.debug('Validationキャッシュクリア');
  }

  /**
   * 統計リセット
   */
  resetStats(): void {
    this.performanceStats = {
      totalValidations: 0,
      totalTime: 0,
      totalBytes: 0,
      cacheHits: 0
    };
    this.logger.info('Validation統計リセット');
  }

  /**
   * クリーンアップ
   */
  cleanup(): void {
    this.clearCache();
    this.resetStats();
    this.logger.info('WebMChunkValidator クリーンアップ完了');
  }
}