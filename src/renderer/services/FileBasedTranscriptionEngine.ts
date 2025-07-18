/**
 * FileBasedTranscriptionEngine - ファイルベース文字起こしエンジン
 * 
 * チャンクファイルを順次処理し、文字起こし結果を統合するシステム
 */

import { ChunkFileInfo } from './ChunkFileWatcher';
import { TranscriptionResult } from '../../preload/preload';
import { AudioDiagnostics, AudioDiagnosticResult } from './AudioDiagnostics';

export interface TranscriptionQueueItem {
  fileInfo: ChunkFileInfo;
  retryCount: number;
  addedAt: number;
  processingStartedAt?: number;
}

export interface TranscriptionError {
  filename: string;
  errorType: 'server_error' | 'file_error' | 'timeout' | 'network_error' | 'audio_quality_error' | 'unknown';
  message: string;
  timestamp: number;
  retryCount: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  suggestedAction?: string;
  processingTime?: number;
}

export interface ProcessingStats {
  totalProcessed: number;
  totalErrors: number;
  totalSkipped: number;
  averageProcessingTime: number;
  isProcessing: boolean;
  currentFile?: string;
  queueLength: number;
  errorRate: number;
  errorsByType: Record<TranscriptionError['errorType'], number>;
  errorsBySeverity: Record<TranscriptionError['severity'], number>;
  successRate: number;
  averageRetryCount: number;
}

export interface TranscriptionEngineConfig {
  maxRetryCount: number;
  processingTimeout: number;
  queueCheckInterval: number;
  enableAutoRetry: boolean;
}

export class FileBasedTranscriptionEngine {
  private processingQueue: TranscriptionQueueItem[] = [];
  private processedFiles: Set<string> = new Set();
  private errorLog: TranscriptionError[] = [];
  private isRunning: boolean = false;
  private currentProcessing: TranscriptionQueueItem | null = null;
  private queueInterval: NodeJS.Timeout | null = null;
  private processingTimes: number[] = [];
  
  private config: TranscriptionEngineConfig = {
    maxRetryCount: 1,
    processingTimeout: 180000, // 3分
    queueCheckInterval: 1000, // 1秒
    enableAutoRetry: true
  };
  
  // コールバック関数
  private onTranscriptionCompleteCallbacks: ((result: TranscriptionResult, fileInfo: ChunkFileInfo) => void)[] = [];
  private onErrorCallbacks: ((error: TranscriptionError) => void)[] = [];
  private onStatsUpdateCallbacks: ((stats: ProcessingStats) => void)[] = [];
  
  constructor(config?: Partial<TranscriptionEngineConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
    console.log('FileBasedTranscriptionEngine初期化完了', this.config);
  }
  
  /**
   * エンジン開始
   */
  start(): void {
    if (this.isRunning) {
      console.warn('TranscriptionEngine既に実行中です');
      return;
    }
    
    this.isRunning = true;
    console.log('FileBasedTranscriptionEngine開始');
    
    // キュー処理のインターバル開始
    this.queueInterval = setInterval(() => {
      this.processQueue();
    }, this.config.queueCheckInterval);
    
    this.updateStats();
  }
  
  /**
   * エンジン停止
   */
  stop(): void {
    if (!this.isRunning) return;
    
    console.log('FileBasedTranscriptionEngine停止');
    this.isRunning = false;
    
    if (this.queueInterval) {
      clearInterval(this.queueInterval);
      this.queueInterval = null;
    }
    
    this.updateStats();
  }
  
  /**
   * チャンクファイルをキューに追加
   */
  addChunkFile(fileInfo: ChunkFileInfo): void {
    // 既に処理済みまたはキューに存在する場合はスキップ
    if (this.processedFiles.has(fileInfo.filename) || 
        this.processingQueue.some(item => item.fileInfo.filename === fileInfo.filename)) {
      return;
    }
    
    const queueItem: TranscriptionQueueItem = {
      fileInfo,
      retryCount: 0,
      addedAt: Date.now()
    };
    
    // シーケンス番号順に挿入
    const insertIndex = this.processingQueue.findIndex(
      item => item.fileInfo.sequenceNumber > fileInfo.sequenceNumber
    );
    
    if (insertIndex === -1) {
      this.processingQueue.push(queueItem);
    } else {
      this.processingQueue.splice(insertIndex, 0, queueItem);
    }
    
    console.log(`キューに追加: ${fileInfo.filename} (シーケンス: ${fileInfo.sequenceNumber})`);
    this.updateStats();
  }
  
  /**
   * キュー処理メインループ
   */
  private async processQueue(): Promise<void> {
    if (!this.isRunning || this.currentProcessing || this.processingQueue.length === 0) {
      return;
    }
    
    // 次の処理対象を取得（先頭から順次）
    const nextItem = this.processingQueue.shift();
    if (!nextItem) return;
    
    this.currentProcessing = nextItem;
    nextItem.processingStartedAt = Date.now();
    
    console.log(`文字起こし開始: ${nextItem.fileInfo.filename}`);
    this.updateStats();
    
    try {
      const startTime = Date.now();
      
      // 文字起こし実行（タイムアウト付き）
      const result = await this.executeTranscriptionWithTimeout(nextItem);
      
      const processingTime = Date.now() - startTime;
      this.processingTimes.push(processingTime);
      
      // 処理時間履歴を最新100件に制限
      if (this.processingTimes.length > 100) {
        this.processingTimes = this.processingTimes.slice(-100);
      }
      
      // 成功処理
      this.processedFiles.add(nextItem.fileInfo.filename);
      console.log(`文字起こし完了: ${nextItem.fileInfo.filename} (${processingTime}ms)`);
      
      // コールバック実行
      this.onTranscriptionCompleteCallbacks.forEach(callback => {
        try {
          callback(result, nextItem.fileInfo);
        } catch (error) {
          console.error('TranscriptionCompleteコールバックエラー:', error);
        }
      });
      
    } catch (error) {
      // エラー処理
      await this.handleTranscriptionError(nextItem, error);
    } finally {
      this.currentProcessing = null;
      this.updateStats();
    }
  }
  
  /**
   * タイムアウト付き文字起こし実行
   */
  private async executeTranscriptionWithTimeout(item: TranscriptionQueueItem): Promise<TranscriptionResult> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`処理タイムアウト: ${this.config.processingTimeout}ms`));
      }, this.config.processingTimeout);
      
      // 実際の文字起こし処理を実行
      this.executeTranscription(item.fileInfo.fullPath)
        .then(result => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }
  
  /**
   * 実際の文字起こし処理（ElectronAPI呼び出し）
   */
  private async executeTranscription(filePath: string): Promise<TranscriptionResult> {
    try {
      // 音声診断を実行（一時的に無効化してクラッシュ問題を切り分け）
      // console.log('🔍 音声ファイル診断を開始:', filePath);
      // const diagnostic = await AudioDiagnostics.analyzeAudioFile(filePath);
      
      // console.log('🔍 音声診断結果:');
      // console.log(AudioDiagnostics.formatDiagnosticResult(diagnostic));
      
      // 音声品質チェック（一時的に無効化）
      // if (!diagnostic.isValid) {
      //   throw new Error(`音声ファイルが無効です: ${diagnostic.error}`);
      // }
      
      // if (!diagnostic.hasAudioContent) {
      //   const recommendations = AudioDiagnostics.getDiagnosticRecommendations(diagnostic);
      //   console.warn('⚠️ 音声コンテンツが検出されませんでした:');
      //   recommendations.forEach(rec => console.warn(`  - ${rec}`));
      //   
      //   // 音声なしでも処理を続行（空の結果を返す）
      //   return {
      //     language: 'ja',
      //     duration: diagnostic.duration,
      //     segments: [],
      //     created_at: Date.now(),
      //     segment_count: 0
      //   };
      // }
      
      // 音声品質が極端に低い場合の警告（一時的に無効化）
      // if (diagnostic.silencePercentage > 90) {
      //   console.warn('⚠️ 音声レベルが非常に低いです。文字起こし精度が低下する可能性があります。');
      // }
      
      const result = await window.electronAPI.speechTranscribe(filePath);
      
      // 結果と診断の整合性チェック（一時的に無効化）
      // if (result.segments.length === 0 && diagnostic.hasAudioContent) {
      //   console.warn('🔍 音声は検出されているが、文字起こし結果が空です。音声品質またはサービス設定を確認してください。');
      //   const recommendations = AudioDiagnostics.getDiagnosticRecommendations(diagnostic);
      //   console.warn('推奨対策:');
      //   recommendations.forEach(rec => console.warn(`  - ${rec}`));
      // }
      
      return result;
    } catch (error) {
      console.error('文字起こしAPI呼び出しエラー:', error);
      throw error;
    }
  }
  
  /**
   * 文字起こしエラーハンドリング（強化版）
   */
  private async handleTranscriptionError(item: TranscriptionQueueItem, error: any): Promise<void> {
    const processingTime = item.processingStartedAt ? Date.now() - item.processingStartedAt : undefined;
    const errorType = this.classifyError(error);
    const severity = this.determineSeverity(errorType, item.retryCount);
    
    const errorInfo: TranscriptionError = {
      filename: item.fileInfo.filename,
      errorType,
      message: error instanceof Error ? error.message : String(error),
      timestamp: Date.now(),
      retryCount: item.retryCount,
      severity,
      suggestedAction: this.getSuggestedAction(errorType),
      processingTime
    };
    
    this.errorLog.push(errorInfo);
    
    console.error(`文字起こしエラー [${severity}]: ${item.fileInfo.filename}`, {
      type: errorType,
      message: errorInfo.message,
      retryCount: item.retryCount,
      action: errorInfo.suggestedAction
    });
    
    // 重要度の高いエラーの場合は即座に通知
    if (severity === 'critical' || severity === 'high') {
      console.warn(`⚠️ 重要エラー: ${errorInfo.suggestedAction}`);
    }
    
    // リトライ判定
    if (this.config.enableAutoRetry && item.retryCount < this.config.maxRetryCount && this.shouldRetry(errorType)) {
      item.retryCount++;
      console.log(`リトライ予定: ${item.fileInfo.filename} (${item.retryCount}/${this.config.maxRetryCount})`);
      
      // リトライ待機時間（エラータイプ別・指数バックオフ）
      const baseDelay = this.getRetryDelay(errorType);
      const retryDelay = Math.min(baseDelay * Math.pow(2, item.retryCount), 30000); // 最大30秒
      
      setTimeout(() => {
        if (this.isRunning) {
          this.processingQueue.unshift(item); // 先頭に追加（優先処理）
          console.log(`リトライ開始: ${item.fileInfo.filename}`);
        }
      }, retryDelay);
      
    } else {
      // 最大リトライ回数に達した場合はスキップ
      console.log(`ファイルスキップ: ${item.fileInfo.filename} (最大リトライ回数に達しました / リトライ不可能なエラー)`);
      this.processedFiles.add(item.fileInfo.filename); // スキップとしてマーク
    }
    
    // エラーコールバック実行
    this.onErrorCallbacks.forEach(callback => {
      try {
        callback(errorInfo);
      } catch (callbackError) {
        console.error('Error callback実行エラー:', callbackError);
      }
    });
  }
  
  /**
   * エラー分類（拡張版）
   */
  private classifyError(error: any): TranscriptionError['errorType'] {
    const message = error instanceof Error ? error.message : String(error);
    const messageLower = message.toLowerCase();
    
    // タイムアウトエラー
    if (messageLower.includes('timeout') || messageLower.includes('タイムアウト')) {
      return 'timeout';
    }
    
    // ネットワークエラー
    if (messageLower.includes('network') || messageLower.includes('connection') ||
        messageLower.includes('接続') || messageLower.includes('ネットワーク') ||
        messageLower.includes('econnrefused') || messageLower.includes('enotfound')) {
      return 'network_error';
    }
    
    // サーバーエラー
    if (messageLower.includes('server') || messageLower.includes('サーバー') ||
        messageLower.includes('500') || messageLower.includes('502') || 
        messageLower.includes('503') || messageLower.includes('504')) {
      return 'server_error';
    }
    
    // 音声品質エラー
    if (messageLower.includes('audio') || messageLower.includes('sound') ||
        messageLower.includes('音声') || messageLower.includes('音質') ||
        messageLower.includes('no audio data') || messageLower.includes('invalid audio')) {
      return 'audio_quality_error';
    }
    
    // ファイルエラー
    if (messageLower.includes('file') || messageLower.includes('ファイル') ||
        messageLower.includes('読み込み') || messageLower.includes('enoent') ||
        messageLower.includes('corrupted') || messageLower.includes('破損')) {
      return 'file_error';
    }
    
    return 'unknown';
  }
  
  /**
   * エラー重要度判定
   */
  private determineSeverity(errorType: TranscriptionError['errorType'], retryCount: number): TranscriptionError['severity'] {
    // リトライ回数が多いほど重要度上昇
    const retryPenalty = retryCount >= 2 ? 1 : 0;
    
    switch (errorType) {
      case 'network_error':
      case 'timeout':
        return retryCount === 0 ? 'low' : 'medium';
        
      case 'server_error':
        return retryCount === 0 ? 'medium' : 'high';
        
      case 'audio_quality_error':
        return 'high'; // 音声品質エラーは通常リトライしても意味がない
        
      case 'file_error':
        return 'critical'; // ファイルエラーは致命的
        
      case 'unknown':
      default:
        return 'medium';
    }
  }
  
  /**
   * エラー別推奨アクション
   */
  private getSuggestedAction(errorType: TranscriptionError['errorType']): string {
    switch (errorType) {
      case 'network_error':
        return 'ネットワーク接続を確認してください';
        
      case 'server_error':
        return 'しばらく待ってから再試行してください';
        
      case 'timeout':
        return 'ファイルサイズが大きい場合は分割を検討してください';
        
      case 'audio_quality_error':
        return '音声ファイルの品質・形式を確認してください';
        
      case 'file_error':
        return 'ファイルの存在と権限を確認してください';
        
      case 'unknown':
      default:
        return 'システム管理者に連絡してください';
    }
  }
  
  /**
   * リトライ可否判定
   */
  private shouldRetry(errorType: TranscriptionError['errorType']): boolean {
    switch (errorType) {
      case 'network_error':
      case 'server_error':
      case 'timeout':
        return true; // これらのエラーはリトライ価値あり
        
      case 'audio_quality_error':
      case 'file_error':
        return false; // これらのエラーはリトライしても意味がない
        
      case 'unknown':
      default:
        return true; // 不明なエラーは一応リトライ
    }
  }
  
  /**
   * エラータイプ別リトライ遅延時間
   */
  private getRetryDelay(errorType: TranscriptionError['errorType']): number {
    switch (errorType) {
      case 'network_error':
        return 2000; // 2秒
        
      case 'server_error':
        return 5000; // 5秒
        
      case 'timeout':
        return 3000; // 3秒
        
      default:
        return 1000; // 1秒
    }
  }
  
  /**
   * 統計情報更新（拡張版）
   */
  private updateStats(): void {
    // エラータイプ別集計
    const errorsByType: Record<TranscriptionError['errorType'], number> = {
      server_error: 0,
      file_error: 0,
      timeout: 0,
      network_error: 0,
      audio_quality_error: 0,
      unknown: 0
    };
    
    // エラー重要度別集計
    const errorsBySeverity: Record<TranscriptionError['severity'], number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0
    };
    
    // エラー統計計算
    let totalRetryCount = 0;
    for (const error of this.errorLog) {
      errorsByType[error.errorType]++;
      errorsBySeverity[error.severity]++;
      totalRetryCount += error.retryCount;
    }
    
    const totalOperations = this.processedFiles.size + this.errorLog.length;
    const successRate = totalOperations > 0 ? (this.processedFiles.size / totalOperations) * 100 : 100;
    const averageRetryCount = this.errorLog.length > 0 ? totalRetryCount / this.errorLog.length : 0;
    
    const stats: ProcessingStats = {
      totalProcessed: this.processedFiles.size,
      totalErrors: this.errorLog.length,
      totalSkipped: this.errorLog.filter(error => error.retryCount >= this.config.maxRetryCount).length,
      averageProcessingTime: this.processingTimes.length > 0 
        ? this.processingTimes.reduce((sum, time) => sum + time, 0) / this.processingTimes.length 
        : 0,
      isProcessing: this.currentProcessing !== null,
      currentFile: this.currentProcessing?.fileInfo.filename,
      queueLength: this.processingQueue.length,
      errorRate: totalOperations > 0 ? (this.errorLog.length / totalOperations) * 100 : 0,
      errorsByType,
      errorsBySeverity,
      successRate,
      averageRetryCount
    };
    
    // 統計コールバック実行
    this.onStatsUpdateCallbacks.forEach(callback => {
      try {
        callback(stats);
      } catch (error) {
        console.error('Stats callback実行エラー:', error);
      }
    });
  }
  
  /**
   * イベントリスナー登録
   */
  onTranscriptionComplete(callback: (result: TranscriptionResult, fileInfo: ChunkFileInfo) => void): void {
    this.onTranscriptionCompleteCallbacks.push(callback);
  }
  
  onError(callback: (error: TranscriptionError) => void): void {
    this.onErrorCallbacks.push(callback);
  }
  
  onStatsUpdate(callback: (stats: ProcessingStats) => void): void {
    this.onStatsUpdateCallbacks.push(callback);
  }
  
  /**
   * 統計情報取得（拡張版）
   */
  getStats(): ProcessingStats {
    // エラータイプ別集計
    const errorsByType: Record<TranscriptionError['errorType'], number> = {
      server_error: 0,
      file_error: 0,
      timeout: 0,
      network_error: 0,
      audio_quality_error: 0,
      unknown: 0
    };
    
    // エラー重要度別集計
    const errorsBySeverity: Record<TranscriptionError['severity'], number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0
    };
    
    // エラー統計計算
    let totalRetryCount = 0;
    for (const error of this.errorLog) {
      errorsByType[error.errorType]++;
      errorsBySeverity[error.severity]++;
      totalRetryCount += error.retryCount;
    }
    
    const totalOperations = this.processedFiles.size + this.errorLog.length;
    const successRate = totalOperations > 0 ? (this.processedFiles.size / totalOperations) * 100 : 100;
    const averageRetryCount = this.errorLog.length > 0 ? totalRetryCount / this.errorLog.length : 0;
    
    return {
      totalProcessed: this.processedFiles.size,
      totalErrors: this.errorLog.length,
      totalSkipped: this.errorLog.filter(error => error.retryCount >= this.config.maxRetryCount).length,
      averageProcessingTime: this.processingTimes.length > 0 
        ? this.processingTimes.reduce((sum, time) => sum + time, 0) / this.processingTimes.length 
        : 0,
      isProcessing: this.currentProcessing !== null,
      currentFile: this.currentProcessing?.fileInfo.filename,
      queueLength: this.processingQueue.length,
      errorRate: totalOperations > 0 ? (this.errorLog.length / totalOperations) * 100 : 0,
      errorsByType,
      errorsBySeverity,
      successRate,
      averageRetryCount
    };
  }
  
  /**
   * エラーログ取得
   */
  getErrorLog(): TranscriptionError[] {
    return [...this.errorLog];
  }
  
  /**
   * 設定更新
   */
  updateConfig(newConfig: Partial<TranscriptionEngineConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('TranscriptionEngine設定更新:', this.config);
  }
  
  /**
   * クリーンアップ
   */
  cleanup(): void {
    this.stop();
    this.processingQueue = [];
    this.processedFiles.clear();
    this.errorLog = [];
    this.onTranscriptionCompleteCallbacks = [];
    this.onErrorCallbacks = [];
    this.onStatsUpdateCallbacks = [];
    this.processingTimes = [];
    
    console.log('FileBasedTranscriptionEngine クリーンアップ完了');
  }
}