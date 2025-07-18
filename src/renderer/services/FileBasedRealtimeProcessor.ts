/**
 * FileBasedRealtimeProcessor - ファイルベースリアルタイム文字起こし統合制御
 * 
 * ChunkFileWatcher、FileBasedTranscriptionEngine、RealtimeTextManagerを統合して
 * ファイルベースのリアルタイム文字起こしシステムを提供
 */

import { ChunkFileWatcher, ChunkFileInfo, ChunkWatcherStats } from './ChunkFileWatcher';
import { FileBasedTranscriptionEngine, ProcessingStats, TranscriptionError } from './FileBasedTranscriptionEngine';
import { RealtimeTextManager, RealtimeTextData } from './RealtimeTextManager';
import { TranscriptionResult } from '../../preload/preload';

export interface RealtimeProcessorConfig {
  // ファイル監視設定
  fileCheckInterval: number;
  
  // 文字起こし設定
  maxRetryCount: number;
  processingTimeout: number;
  enableAutoRetry: boolean;
  
  // テキスト管理設定
  textWriteInterval: number;
  enableAutoSave: boolean;
  textFormat: 'detailed' | 'simple';
}

export interface RealtimeProcessorStats {
  // システム全体
  isRunning: boolean;
  startTime: number;
  
  // ファイル監視
  watchingFolder: string | null;
  fileWatcherStats: ChunkWatcherStats;
  
  // 文字起こし処理
  transcriptionStats: ProcessingStats;
  
  // テキスト管理
  textData: RealtimeTextData;
  
  // パフォーマンス
  totalProcessingTime: number;
  systemResourceUsage: 'low' | 'medium' | 'high';
}

export class FileBasedRealtimeProcessor {
  private chunkWatcher: ChunkFileWatcher;
  private transcriptionEngine: FileBasedTranscriptionEngine;
  private textManager: RealtimeTextManager;
  
  private isRunning: boolean = false;
  private startTime: number = 0;
  private currentWatchFolder: string | null = null;
  private currentOutputFile: string | null = null;
  
  private config: RealtimeProcessorConfig = {
    fileCheckInterval: 1000,
    maxRetryCount: 1,
    processingTimeout: 180000,
    enableAutoRetry: true,
    textWriteInterval: 3000,
    enableAutoSave: true,
    textFormat: 'detailed'
  };
  
  // コールバック関数
  private onStatsUpdateCallbacks: ((stats: RealtimeProcessorStats) => void)[] = [];
  private onErrorCallbacks: ((error: Error) => void)[] = [];
  private onTranscriptionCompleteCallbacks: ((result: TranscriptionResult, chunkInfo: ChunkFileInfo) => void)[] = [];
  
  constructor(config?: Partial<RealtimeProcessorConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
    
    // 各コンポーネントを初期化
    this.chunkWatcher = new ChunkFileWatcher();
    
    this.transcriptionEngine = new FileBasedTranscriptionEngine({
      maxRetryCount: this.config.maxRetryCount,
      processingTimeout: this.config.processingTimeout,
      queueCheckInterval: 1000,
      enableAutoRetry: this.config.enableAutoRetry
    });
    
    this.textManager = new RealtimeTextManager({
      writeInterval: this.config.textWriteInterval,
      enableAutoSave: this.config.enableAutoSave,
      fileFormat: this.config.textFormat,
      bufferSize: 1000
    });
    
    this.setupEventHandlers();
    
    console.log('FileBasedRealtimeProcessor初期化完了', this.config);
  }
  
  /**
   * イベントハンドラー設定
   */
  private setupEventHandlers(): void {
    // ファイル監視 → 文字起こしエンジン
    this.chunkWatcher.onNewFile((fileInfo: ChunkFileInfo) => {
      console.log(`新しいチャンクファイル検出: ${fileInfo.filename}`);
      this.transcriptionEngine.addChunkFile(fileInfo);
      this.updateStats();
    });
    
    // 文字起こしエンジン → テキスト管理
    this.transcriptionEngine.onTranscriptionComplete((result: TranscriptionResult, chunkInfo: ChunkFileInfo) => {
      console.log(`文字起こし完了: ${chunkInfo.filename} → ${result.segments.length}セグメント`);
      this.textManager.addTranscriptionResult(result, chunkInfo);
      
      // 外部コールバック実行
      this.onTranscriptionCompleteCallbacks.forEach(callback => {
        try {
          callback(result, chunkInfo);
        } catch (error) {
          console.error('TranscriptionComplete callback エラー:', error);
        }
      });
      
      this.updateStats();
    });
    
    // 文字起こしエンジンエラー → エラーハンドリング
    this.transcriptionEngine.onError((error: TranscriptionError) => {
      console.error('文字起こしエラー:', error);
      const errorObj = new Error(`文字起こしエラー [${error.filename}]: ${error.message}`);
      this.handleError(errorObj);
    });
    
    // テキスト管理エラー → エラーハンドリング
    this.textManager.onError((error: Error) => {
      console.error('テキスト管理エラー:', error);
      this.handleError(error);
    });
    
    // テキスト更新 → 統計更新 → UI通知
    this.textManager.onTextUpdate((textData) => {
      this.updateStats();
      
      // UIに統計とテキストデータを通知
      this.notifyUI('textUpdate', { textData, stats: this.getStats() });
    });
    
    // 統計更新のインターバル設定
    setInterval(() => {
      if (this.isRunning) {
        this.updateStats();
        this.updateProgress(); // 進行状況もUIに通知
      }
    }, 5000); // 5秒間隔
  }
  
  /**
   * リアルタイム文字起こし開始
   */
  async start(watchFolderPath: string, outputFilePath: string): Promise<void> {
    if (this.isRunning) {
      throw new Error('FileBasedRealtimeProcessor は既に実行中です');
    }
    
    try {
      console.log(`FileBasedRealtimeProcessor開始: ${watchFolderPath} → ${outputFilePath}`);
      
      this.isRunning = true;
      this.startTime = Date.now();
      this.currentWatchFolder = watchFolderPath;
      this.currentOutputFile = outputFilePath;
      
      // 各コンポーネントを順次開始
      console.log('1. テキスト管理開始...');
      this.textManager.start(outputFilePath);
      
      console.log('2. 文字起こしエンジン開始...');
      this.transcriptionEngine.start();
      
      console.log('3. ファイル監視開始...');
      this.chunkWatcher.startWatching(watchFolderPath);
      
      console.log('✓ FileBasedRealtimeProcessor 開始完了');
      this.updateStats();
      
    } catch (error) {
      // エラー時はクリーンアップ
      this.isRunning = false;
      this.currentWatchFolder = null;
      this.currentOutputFile = null;
      
      console.error('FileBasedRealtimeProcessor開始エラー:', error);
      throw error;
    }
  }
  
  /**
   * リアルタイム文字起こし停止
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.warn('FileBasedRealtimeProcessor は実行中ではありません');
      return;
    }
    
    try {
      console.log('FileBasedRealtimeProcessor停止中...');
      
      // 各コンポーネントを順次停止
      console.log('1. ファイル監視停止...');
      this.chunkWatcher.stopWatching();
      
      console.log('2. 文字起こしエンジン停止...');
      this.transcriptionEngine.stop();
      
      console.log('3. テキスト管理停止...');
      this.textManager.stop();
      
      this.isRunning = false;
      this.currentWatchFolder = null;
      this.currentOutputFile = null;
      
      console.log('✓ FileBasedRealtimeProcessor 停止完了');
      this.updateStats();
      
    } catch (error) {
      console.error('FileBasedRealtimeProcessor停止エラー:', error);
      this.handleError(error instanceof Error ? error : new Error(String(error)));
    }
  }
  
  /**
   * 一時停止
   */
  pause(): void {
    if (!this.isRunning) return;
    
    console.log('FileBasedRealtimeProcessor一時停止');
    this.transcriptionEngine.stop();
    this.textManager.setStatus('paused');
    this.updateStats();
  }
  
  /**
   * 再開
   */
  resume(): void {
    if (!this.isRunning) return;
    
    console.log('FileBasedRealtimeProcessor再開');
    this.transcriptionEngine.start();
    this.textManager.setStatus('transcribing');
    this.updateStats();
  }
  
  /**
   * 手動ファイル保存
   */
  async saveToFile(): Promise<void> {
    if (this.isRunning) {
      await this.textManager.saveToFile();
    }
  }
  
  /**
   * エラーハンドリング
   */
  private handleError(error: Error): void {
    console.error('システムエラー:', error);
    
    // RealtimeTextManagerからのエラーの場合は、無限ループを防ぐため
    // reportErrorを呼び出さずに直接外部コールバックのみ実行
    const isTextManagerError = error.message.includes('ファイル書き込みエラー') || 
                                error.message.includes('リアルタイム文字起こしエラー');
    
    if (!isTextManagerError) {
      // テキスト管理以外のエラーのみ報告
      this.textManager.reportError(error);
    }
    
    // 外部コールバック実行
    this.onErrorCallbacks.forEach(callback => {
      try {
        callback(error);
      } catch (callbackError) {
        console.error('Error callback実行エラー:', callbackError);
      }
    });
    
    this.updateStats();
  }
  
  /**
   * 統計情報更新
   */
  private updateStats(): void {
    const stats: RealtimeProcessorStats = {
      isRunning: this.isRunning,
      startTime: this.startTime,
      watchingFolder: this.currentWatchFolder,
      fileWatcherStats: this.chunkWatcher.getStats(),
      transcriptionStats: this.transcriptionEngine.getStats(),
      textData: this.textManager.getCurrentData(),
      totalProcessingTime: this.isRunning ? Date.now() - this.startTime : 0,
      systemResourceUsage: this.calculateResourceUsage()
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
   * システムリソース使用量計算
   */
  private calculateResourceUsage(): 'low' | 'medium' | 'high' {
    const transcriptionStats = this.transcriptionEngine.getStats();
    const textData = this.textManager.getCurrentData();
    
    // 処理中ファイル数、エラー率、バッファサイズから判定
    const queueLength = transcriptionStats.queueLength;
    const errorRate = transcriptionStats.errorRate;
    const segmentCount = textData.segments.length;
    
    if (queueLength > 10 || errorRate > 20 || segmentCount > 500) {
      return 'high';
    } else if (queueLength > 5 || errorRate > 10 || segmentCount > 200) {
      return 'medium';
    } else {
      return 'low';
    }
  }
  
  /**
   * イベントリスナー登録
   */
  onStatsUpdate(callback: (stats: RealtimeProcessorStats) => void): void {
    this.onStatsUpdateCallbacks.push(callback);
  }
  
  onError(callback: (error: Error) => void): void {
    this.onErrorCallbacks.push(callback);
  }
  
  onTranscriptionComplete(callback: (result: TranscriptionResult, chunkInfo: ChunkFileInfo) => void): void {
    this.onTranscriptionCompleteCallbacks.push(callback);
  }
  
  /**
   * 現在の統計情報取得
   */
  getStats(): RealtimeProcessorStats {
    return {
      isRunning: this.isRunning,
      startTime: this.startTime,
      watchingFolder: this.currentWatchFolder,
      fileWatcherStats: this.chunkWatcher.getStats(),
      transcriptionStats: this.transcriptionEngine.getStats(),
      textData: this.textManager.getCurrentData(),
      totalProcessingTime: this.isRunning ? Date.now() - this.startTime : 0,
      systemResourceUsage: this.calculateResourceUsage()
    };
  }
  
  /**
   * 設定更新
   */
  updateConfig(newConfig: Partial<RealtimeProcessorConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    // 各コンポーネントの設定も更新
    this.transcriptionEngine.updateConfig({
      maxRetryCount: this.config.maxRetryCount,
      processingTimeout: this.config.processingTimeout,
      enableAutoRetry: this.config.enableAutoRetry
    });
    
    this.textManager.updateConfig({
      writeInterval: this.config.textWriteInterval,
      enableAutoSave: this.config.enableAutoSave,
      fileFormat: this.config.textFormat
    });
    
    console.log('FileBasedRealtimeProcessor設定更新:', this.config);
  }
  
  /**
   * 実行状態確認
   */
  isActive(): boolean {
    return this.isRunning;
  }
  
  /**
   * 現在の処理中ファイル取得
   */
  getCurrentProcessingFile(): string | null {
    const stats = this.transcriptionEngine.getStats();
    return stats.currentFile || null;
  }
  
  /**
   * エラーログ取得
   */
  getErrorLog(): TranscriptionError[] {
    return this.transcriptionEngine.getErrorLog();
  }
  
  /**
   * UI通知
   */
  private notifyUI(eventType: string, data: any): void {
    try {
      const event = new CustomEvent('fileBasedRealtimeUpdate', {
        detail: {
          type: eventType,
          timestamp: Date.now(),
          ...data
        }
      });
      
      window.dispatchEvent(event);
      console.log(`UI通知送信: ${eventType}`, data);
    } catch (error) {
      console.error('UI通知エラー:', error);
    }
  }
  
  /**
   * 自動スクロール機能
   */
  enableAutoScroll(): void {
    this.notifyUI('autoScroll', { action: 'enable' });
  }
  
  /**
   * 進行状況表示
   */
  updateProgress(): void {
    const stats = this.getStats();
    const progress = {
      processedChunks: stats.textData.metadata.processedChunks,
      totalChunks: stats.textData.metadata.totalChunks,
      successRate: stats.transcriptionStats.successRate,
      errorRate: stats.transcriptionStats.errorRate,
      isProcessing: stats.transcriptionStats.isProcessing,
      currentFile: stats.transcriptionStats.currentFile
    };
    
    this.notifyUI('progress', progress);
  }
  
  /**
   * クリーンアップ
   */
  cleanup(): void {
    console.log('FileBasedRealtimeProcessor クリーンアップ開始');
    
    try {
      // 実行中の場合は停止
      if (this.isRunning) {
        this.stop();
      }
      
      // 最終UI通知
      this.notifyUI('cleanup', {});
      
      // 各コンポーネントをクリーンアップ
      this.chunkWatcher.cleanup();
      this.transcriptionEngine.cleanup();
      this.textManager.cleanup();
      
      // コールバック配列をクリア
      this.onStatsUpdateCallbacks = [];
      this.onErrorCallbacks = [];
      this.onTranscriptionCompleteCallbacks = [];
      
      console.log('✓ FileBasedRealtimeProcessor クリーンアップ完了');
    } catch (error) {
      console.error('クリーンアップエラー:', error);
    }
  }
}