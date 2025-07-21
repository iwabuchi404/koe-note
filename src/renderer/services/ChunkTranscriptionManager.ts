/**
 * ChunkTranscriptionManager - チャンク分割文字起こしの中央制御クラス
 * 
 * 録音ファイルからチャンク分割による高速文字起こしを行うメインコントローラー
 * 10-30秒間隔でチャンク分割し、並列処理による効率的な文字起こしを実現
 */

import { TranscriptionFile, TranscriptionSegment, ChunkSettings, ChunkProgress } from '../../preload/preload';
import { AudioChunkProcessor } from './AudioChunkProcessor';
import { ChunkTranscriptionQueue } from './ChunkTranscriptionQueue';
import { ResultConsolidator } from './ResultConsolidator';
import { RealTimeTranscriptionProcessor } from './RealTimeTranscriptionProcessor';
import { TRANSCRIPTION_CONFIG } from '../config/transcriptionConfig';

// チャンク分割文字起こし用の型定義
export interface AudioChunk {
  id: string;
  sequenceNumber: number;
  startTime: number;        // 録音開始からの時間（秒）
  endTime: number;
  audioData: ArrayBuffer;
  sampleRate: number;
  channels: number;
  overlapWithPrevious: number;  // 前チャンクとの重複時間
  sourceFilePath?: string;  // 元のファイルパス（WebMチャンク抽出用）
}

export interface ChunkResult {
  chunkId: string;
  sequenceNumber: number;
  status: 'processing' | 'completed' | 'failed';
  segments: TranscriptionSegment[];
  confidence: number;
  processingTime: number;
  error?: string;
}

export class ChunkTranscriptionManager {
  private audioChunkProcessor: AudioChunkProcessor;
  private chunkQueue: ChunkTranscriptionQueue;
  private resultConsolidator: ResultConsolidator;
  private realTimeProcessor: RealTimeTranscriptionProcessor;
  private chunks: Map<string, ChunkResult>;
  private progress: ChunkProgress;
  private settings: ChunkSettings;
  private isTranscribing: boolean;
  private isRealTimeMode: boolean;
  private currentAudioFile: string | null;
  private progressCallbacks: ((progress: ChunkProgress) => void)[];
  private chunkCompletedCallbacks: ((chunk: ChunkResult) => void)[];

  constructor() {
    this.audioChunkProcessor = new AudioChunkProcessor();
    this.chunkQueue = new ChunkTranscriptionQueue();
    this.resultConsolidator = new ResultConsolidator();
    this.realTimeProcessor = new RealTimeTranscriptionProcessor();
    this.chunks = new Map();
    this.progress = {
      isTranscribing: false,
      totalChunks: 0,
      processedChunks: 0,
      failedChunks: 0,
      currentProcessingChunk: 0,
      averageProcessingTime: 0,
      estimatedTimeRemaining: 0
    };
    this.settings = {
      chunkSize: TRANSCRIPTION_CONFIG.CHUNK.DEFAULT_SIZE,
      overlapSize: TRANSCRIPTION_CONFIG.CHUNK.DEFAULT_OVERLAP,
      maxConcurrency: TRANSCRIPTION_CONFIG.CHUNK.MAX_CONCURRENCY,
      enableAutoScroll: TRANSCRIPTION_CONFIG.CHUNK.ENABLE_AUTO_SCROLL,
      qualityMode: TRANSCRIPTION_CONFIG.CHUNK.QUALITY_MODE
    };
    this.isTranscribing = false;
    this.isRealTimeMode = false;
    this.currentAudioFile = null;
    this.progressCallbacks = [];
    this.chunkCompletedCallbacks = [];
    
    // キューのコールバック設定
    this.setupQueueCallbacks();
    this.setupRealTimeCallbacks();
  }

  /**
   * キューのコールバック設定
   */
  private setupQueueCallbacks(): void {
    // チャンク処理完了時のコールバック
    this.chunkQueue.onProcessingComplete((result: ChunkResult) => {
      this.chunks.set(result.chunkId, result);
      
      // 進捗を更新
      this.progress.processedChunks++;
      if (result.status === 'failed') {
        this.progress.failedChunks++;
      }
      
      // 処理時間の更新
      this.updateAverageProcessingTime(result.processingTime);
      this.updateEstimatedTimeRemaining();
      
      // コールバックを呼び出し
      this.chunkCompletedCallbacks.forEach(callback => callback(result));
      this.notifyProgress();
    });
    
    // キュー統計更新時のコールバック
    this.chunkQueue.onProgress((stats) => {
      this.progress.currentProcessingChunk = stats.processingItems;
      this.progress.averageProcessingTime = stats.averageProcessingTime;
      this.notifyProgress();
    });
  }

  /**
   * リアルタイム処理のコールバック設定
   */
  private setupRealTimeCallbacks(): void {
    // リアルタイムチャンク完了時のコールバック
    this.realTimeProcessor.onChunkCompleted((result: ChunkResult) => {
      this.chunks.set(result.chunkId, result);
      
      // 進捗を更新
      this.progress.processedChunks++;
      if (result.status === 'failed') {
        this.progress.failedChunks++;
      }
      
      // 処理時間の更新
      this.updateAverageProcessingTime(result.processingTime);
      
      // コールバックを呼び出し
      this.chunkCompletedCallbacks.forEach(callback => callback(result));
      this.notifyProgress();
      
      console.log(`🎆 リアルタイムチャンク完了: ${result.chunkId}`);
    });
  }

  /**
   * 録音ファイルからチャンク分割文字起こしを開始
   */
  async startChunkTranscription(audioFilePath: string): Promise<void> {
    console.log('チャンク分割文字起こし開始:', audioFilePath);
    
    if (this.isTranscribing) {
      throw new Error('既に文字起こし処理中です');
    }

    this.isTranscribing = true;
    this.currentAudioFile = audioFilePath;
    this.chunks.clear();
    this.chunkQueue.clear();

    try {
      // 録音中WebMファイルの場合はリアルタイム処理モードを有効化
      console.log('🔍 ファイルパス分析:', {
        audioFilePath,
        isRecordingFile: audioFilePath.includes('recording_'),
        isWebMFile: audioFilePath.includes('.webm'),
        shouldUseRealTime: audioFilePath.includes('recording_') && audioFilePath.includes('.webm')
      });
      
      if (audioFilePath.includes('recording_') && audioFilePath.includes('.webm')) {
        console.log('🎆 録音中WebMファイル検出 - リアルタイム文字起こしモードを開始');
        console.log('🎆 チャンクサイズ設定:', this.settings.chunkSize, '秒');
        
        this.isRealTimeMode = true;
        
        // リアルタイム処理を開始
        console.log('🔄 RealTimeProcessor.startRealTimeTranscription を呼び出し中...');
        await this.realTimeProcessor.startRealTimeTranscription(
          audioFilePath, 
          this.settings.chunkSize
        );
        console.log('✅ RealTimeProcessor.startRealTimeTranscription 呼び出し完了');
        
        // 進捗状態を初期化（リアルタイムモード）
        this.progress = {
          isTranscribing: true,
          totalChunks: 0, // リアルタイムでは動的に増加
          processedChunks: 0,
          failedChunks: 0,
          currentProcessingChunk: 0,
          averageProcessingTime: 0,
          estimatedTimeRemaining: 0
        };
        
        this.notifyProgress();
        
        console.log('✅ リアルタイム文字起こしモードが開始されました');
        return; // リアルタイムモードは定期処理なので、ここで終了
      }
      
      // 音声ファイルをチャンクに分割（アプリケーションクラッシュ防止）
      console.log('🔍 チャンク処理開始 - アプリケーションクラッシュを防ぐためのtry-catchでラップ');
      
      let audioChunks: any[];
      try {
        audioChunks = await this.audioChunkProcessor.processAudioFile(
          audioFilePath,
          this.settings.chunkSize,
          this.settings.overlapSize
        );
        console.log('🔍 チャンク処理成功:', audioChunks.length, '個のチャンクを生成');
      } catch (chunkProcessingError) {
        console.error('🚨 チャンク処理でエラー発生:', chunkProcessingError);
        
        // その他のエラーは再スロー
        throw chunkProcessingError;
      }

      // 進捗状態を初期化
      this.progress = {
        isTranscribing: true,
        totalChunks: audioChunks.length,
        processedChunks: 0,
        failedChunks: 0,
        currentProcessingChunk: 0,
        averageProcessingTime: 0,
        estimatedTimeRemaining: 0
      };

      // 有効なチャンクが0個の場合の対応
      if (audioChunks.length === 0) {
        console.warn('チャンクが0個です。音声ファイルの情報を確認してください。');
        console.log('音声ファイルパス:', audioFilePath);
        
        // 録音中のファイルに対する処理完了の通知
        this.progress = {
          isTranscribing: false,
          totalChunks: 0,
          processedChunks: 0,
          failedChunks: 0,
          currentProcessingChunk: 0,
          averageProcessingTime: 0,
          estimatedTimeRemaining: 0
        };
        this.notifyProgress();
        
        throw new Error('音声ファイルからチャンクを生成できませんでした。ファイルが短すぎるか、音声データが不足している可能性があります。');
      }
      
      // 録音中のファイルの処理について追加のログ
      if (audioChunks.some(chunk => chunk.id.startsWith('pending_chunk_'))) {
        console.log('録音中のファイルが検出されました。ペンディングチャンクを処理します。');
      }

      // キューの並列数を設定
      this.chunkQueue = new ChunkTranscriptionQueue(this.settings.maxConcurrency);
      this.setupQueueCallbacks();

      // 各チャンクを処理キューに追加（順序に基づく優先度）
      audioChunks.forEach(chunk => {
        const priority = audioChunks.length - chunk.sequenceNumber; // 早いチャンクほど高優先度
        this.chunkQueue.enqueue(chunk, priority);
      });
      
      // チャンク分割開始イベントを発火（総数が確定した時点で）
      window.dispatchEvent(new CustomEvent('chunkTranscriptionStart', { 
        detail: { 
          totalChunks: audioChunks.length,
          chunkSize: this.settings.chunkSize,
          overlapSize: this.settings.overlapSize
        } 
      }));
      
      // キュー処理を開始
      await this.chunkQueue.startProcessing();

      console.log('チャンク分割文字起こし完了:', audioFilePath);
      
    } catch (error) {
      console.error('チャンク分割文字起こしエラー:', error);
      
      // アプリケーション状態を安全にリセット
      this.isTranscribing = false;
      this.currentAudioFile = null;
      this.progress.isTranscribing = false;
      this.chunks.clear();
      this.chunkQueue.clear();
      
      // 進捗状態を通知（UI更新のため）
      this.notifyProgress();
      
      // クリーンアップ処理（メモリリーク防止）
      try {
        this.audioChunkProcessor.cleanup();
      } catch (cleanupError) {
        console.warn('クリーンアップエラー:', cleanupError);
      }
      
      throw error;
    }
  }


  /**
   * 処理停止と結果統合
   */
  async stopAndConsolidate(): Promise<TranscriptionFile> {
    console.log('チャンク分割文字起こし停止・統合開始');
    
    this.isTranscribing = false;
    
    // リアルタイムモードの場合は専用の停止処理
    if (this.isRealTimeMode) {
      console.log('リアルタイムモード停止処理を実行');
      this.realTimeProcessor.stop();
      this.isRealTimeMode = false;
    }
    
    // キューを停止
    this.chunkQueue.stop();
    
    // 完了した結果を取得
    const completedResults = Array.from(this.chunks.values());
    
    console.log(`統合対象のチャンク数: ${completedResults.length}`);
    
    // ResultConsolidatorを使用して結果を統合
    const consolidatedResult = this.resultConsolidator.consolidate(
      completedResults,
      this.currentAudioFile || ''
    );
    
    // 統合統計を取得
    const consolidationStats = this.resultConsolidator.getStats();
    console.log('統合統計:', consolidationStats);
    
    // 状態をリセット
    this.progress.isTranscribing = false;
    this.currentAudioFile = null;
    this.notifyProgress();
    
    return consolidatedResult;
  }


  /**
   * 平均処理時間を更新
   */
  private updateAverageProcessingTime(newTime: number): void {
    const totalProcessed = this.progress.processedChunks;
    const currentAverage = this.progress.averageProcessingTime;
    
    this.progress.averageProcessingTime = 
      (currentAverage * (totalProcessed - 1) + newTime) / totalProcessed;
  }

  /**
   * 推定残り時間を更新
   */
  private updateEstimatedTimeRemaining(): void {
    const remainingChunks = this.progress.totalChunks - this.progress.processedChunks;
    this.progress.estimatedTimeRemaining = 
      remainingChunks * this.progress.averageProcessingTime / this.settings.maxConcurrency;
  }

  /**
   * 進捗通知
   */
  private notifyProgress(): void {
    this.progressCallbacks.forEach(callback => callback(this.progress));
  }

  /**
   * 現在の進捗状況を取得
   */
  getProgress(): ChunkProgress {
    return { ...this.progress };
  }

  /**
   * 設定を更新
   */
  updateSettings(newSettings: Partial<ChunkSettings>): void {
    this.settings = { ...this.settings, ...newSettings };
    
    // 結果統合の設定も更新
    this.resultConsolidator.updateSettings({
      overlapThreshold: this.settings.overlapSize / 2,
      enableTextSmoothing: this.settings.qualityMode !== 'speed',
      enableTimeAdjustment: this.settings.qualityMode !== 'speed'
    });
  }

  /**
   * 進捗リスナーを追加
   */
  onProgress(callback: (progress: ChunkProgress) => void): void {
    this.progressCallbacks.push(callback);
  }

  /**
   * チャンク完了リスナーを追加
   */
  onChunkTranscribed(callback: (chunk: ChunkResult) => void): void {
    this.chunkCompletedCallbacks.push(callback);
  }

  /**
   * リスナーを削除
   */
  removeAllListeners(): void {
    this.progressCallbacks = [];
    this.chunkCompletedCallbacks = [];
    this.chunkQueue.clearCallbacks();
    this.realTimeProcessor.clearCallbacks();
  }
}