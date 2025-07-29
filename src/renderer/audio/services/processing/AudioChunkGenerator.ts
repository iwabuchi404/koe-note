/**
 * AudioChunkGenerator - 簡素化されたオーディオチャンク生成システム
 * 
 * 旧システムから重要な機能のみを抽出し、
 * 責務を明確にして保守性を向上させたクラス
 * 
 * 責務:
 * - 音声データのバッファリング
 * - 時間ベースのチャンク生成
 * - ファイル保存の管理
 */

import { WebMHeaderProcessor, WebMHeaderInfo } from './WebMHeaderProcessor';
import { LoggerFactory, LogCategories } from '../../../utils/LoggerFactory';

export interface AudioChunkResult {
  chunkBlob: Blob;
  chunkNumber: number;
  startTime: number;
  duration: number;
  dataSize: number;
  filePath?: string;
}

export interface ChunkGeneratorConfig {
  intervalSeconds: number;
  enableFileGeneration: boolean;
  tempFolderPath?: string;
  enableAutoGeneration: boolean;
}

export interface ChunkFileInfo {
  filename: string;
  filepath: string;
  sequenceNumber: number;
  sizeBytes: number;
  duration: number;
  createdAt: number;
  startTimeSeconds?: number;
}

export class AudioChunkGenerator {
  private logger = LoggerFactory.getLogger(LogCategories.AUDIO_CHUNK_GENERATOR);
  private webmProcessor: WebMHeaderProcessor;
  
  // 設定
  private config: ChunkGeneratorConfig;
  private intervalMs: number;
  
  // 状態管理
  private isRecording: boolean = false;
  private recordingStartTime: number = 0;
  private chunkCounter: number = 0;
  private audioDataBuffer: Blob[] = [];
  
  // 自動生成
  private autoGenerationTimer: NodeJS.Timeout | null = null;
  private lastGenerationTime: number = 0;
  
  // ファイル管理
  private savedFiles: ChunkFileInfo[] = [];
  
  // コールバック
  private chunkGeneratedCallbacks: ((result: AudioChunkResult) => void)[] = [];
  private chunkSavedCallbacks: ((fileInfo: ChunkFileInfo) => void)[] = [];
  private errorCallbacks: ((error: Error) => void)[] = [];

  constructor(config: ChunkGeneratorConfig) {
    this.config = { ...config };
    this.intervalMs = config.intervalSeconds * 1000;
    this.webmProcessor = new WebMHeaderProcessor();
    
    this.logger.info('AudioChunkGenerator初期化完了', {
      intervalSeconds: config.intervalSeconds,
      enableFileGeneration: config.enableFileGeneration,
      enableAutoGeneration: config.enableAutoGeneration
    });
  }

  /**
   * 録音開始
   */
  async startRecording(): Promise<void> {
    if (this.isRecording) {
      this.logger.warn('録音は既に開始されています');
      return;
    }

    try {
      this.logger.info('録音開始');
      
      // 状態リセット
      this.isRecording = true;
      this.recordingStartTime = Date.now();
      this.lastGenerationTime = Date.now();
      this.chunkCounter = 0;
      this.audioDataBuffer = [];
      this.savedFiles = [];
      
      // WebMプロセッサーのキャッシュクリア
      this.webmProcessor.clearCache();
      
      // 自動生成開始
      if (this.config.enableAutoGeneration) {
        this.startAutoGeneration();
      }
      
    } catch (error) {
      this.logger.error('録音開始エラー', error instanceof Error ? error : undefined, error);
      this.handleError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * 録音停止
   */
  async stopRecording(): Promise<void> {
    if (!this.isRecording) {
      this.logger.warn('録音は開始されていません');
      return;
    }

    try {
      this.logger.info('録音停止');
      
      this.isRecording = false;
      
      // 自動生成停止
      this.stopAutoGeneration();
      
      // 最終チャンク生成
      if (this.audioDataBuffer.length > 0) {
        await this.generateFinalChunk();
      }
      
    } catch (error) {
      this.logger.error('録音停止エラー', error instanceof Error ? error : undefined, error);
      this.handleError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * 音声データ追加
   */
  async addAudioData(blob: Blob): Promise<void> {
    if (!this.isRecording) {
      this.logger.warn('録音が開始されていないため、データを無視');
      return;
    }

    try {
      this.audioDataBuffer.push(blob);
      
      this.logger.debug('音声データ追加', {
        size: blob.size,
        bufferCount: this.audioDataBuffer.length
      });
      
      // 最初のチャンクからヘッダーを抽出
      if (this.chunkCounter === 0 && this.audioDataBuffer.length === 1) {
        await this.webmProcessor.extractHeaderFromChunk(blob);
        this.logger.info('WebMヘッダー抽出完了');
      }
      
    } catch (error) {
      this.logger.error('音声データ追加エラー', error instanceof Error ? error : undefined, error);
      this.handleError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 自動チャンク生成開始
   */
  private startAutoGeneration(): void {
    if (this.autoGenerationTimer) {
      this.logger.warn('自動生成は既に開始されています');
      return;
    }

    this.logger.info('自動チャンク生成開始', { intervalMs: this.intervalMs });
    
    this.autoGenerationTimer = setInterval(async () => {
      try {
        await this.checkAndGenerateChunk();
      } catch (error) {
        this.logger.error('自動チャンク生成エラー', error instanceof Error ? error : undefined, error);
        this.handleError(error instanceof Error ? error : new Error(String(error)));
      }
    }, 1000); // 1秒間隔でチェック
  }

  /**
   * 自動チャンク生成停止
   */
  private stopAutoGeneration(): void {
    if (this.autoGenerationTimer) {
      clearInterval(this.autoGenerationTimer);
      this.autoGenerationTimer = null;
      this.logger.info('自動チャンク生成停止');
    }
  }

  /**
   * チャンク生成タイミングをチェック
   */
  private async checkAndGenerateChunk(): Promise<void> {
    if (!this.isRecording || this.audioDataBuffer.length === 0) {
      return;
    }

    const now = Date.now();
    const timeSinceLastGeneration = now - this.lastGenerationTime;

    if (timeSinceLastGeneration >= this.intervalMs) {
      this.logger.debug('チャンク生成タイミング', { 
        timeSinceLastGeneration, 
        intervalMs: this.intervalMs 
      });
      
      await this.generateChunk();
      this.lastGenerationTime = now;
    }
  }

  /**
   * チャンク生成
   */
  private async generateChunk(): Promise<AudioChunkResult | null> {
    try {
      if (this.audioDataBuffer.length === 0) {
        this.logger.debug('バッファが空のため、チャンク生成をスキップ');
        return null;
      }

      this.chunkCounter++;
      
      // バッファされた音声データを結合
      const combinedBlob = new Blob(this.audioDataBuffer, { type: 'audio/webm' });
      
      this.logger.debug('チャンク生成開始', {
        chunkNumber: this.chunkCounter,
        dataSize: combinedBlob.size,
        bufferCount: this.audioDataBuffer.length
      });

      // 時間計算
      const startTime = (this.chunkCounter - 1) * this.config.intervalSeconds;
      const duration = this.config.intervalSeconds;

      // WebMヘッダー付きチャンク作成
      let finalChunk: Blob;
      
      if (this.chunkCounter === 1) {
        // 1チャンク目はそのまま（ヘッダー含む）
        finalChunk = combinedBlob;
        this.logger.debug('1チャンク目: 元データを使用');
      } else {
        // 2チャンク目以降はヘッダーを付加
        const chunkData = new Uint8Array(await combinedBlob.arrayBuffer());
        finalChunk = this.webmProcessor.createHeaderedChunk(chunkData, false);
        this.logger.debug('2チャンク目以降: ヘッダー付加完了');
      }

      // バッファクリア
      this.audioDataBuffer = [];

      const result: AudioChunkResult = {
        chunkBlob: finalChunk,
        chunkNumber: this.chunkCounter,
        startTime,
        duration,
        dataSize: finalChunk.size
      };

      // ファイル保存
      if (this.config.enableFileGeneration && this.config.tempFolderPath) {
        try {
          result.filePath = await this.saveChunkToFile(result);
          this.logger.debug('チャンクファイル保存完了', { filePath: result.filePath });
        } catch (saveError) {
          this.logger.error('チャンクファイル保存エラー', saveError instanceof Error ? saveError : undefined, saveError);
        }
      }

      // コールバック実行
      this.executeChunkGeneratedCallbacks(result);

      this.logger.info('チャンク生成完了', {
        chunkNumber: this.chunkCounter,
        startTime,
        duration,
        finalSize: finalChunk.size
      });

      return result;

    } catch (error) {
      this.logger.error('チャンク生成エラー', error instanceof Error ? error : undefined, error);
      this.handleError(error instanceof Error ? error : new Error(String(error)));
      return null;
    }
  }

  /**
   * 最終チャンク生成
   */
  private async generateFinalChunk(): Promise<void> {
    this.logger.info('最終チャンク生成');
    
    if (this.audioDataBuffer.length > 0) {
      await this.generateChunk();
    }
  }

  /**
   * チャンクをファイルに保存
   */
  private async saveChunkToFile(result: AudioChunkResult): Promise<string> {
    if (!this.config.tempFolderPath) {
      throw new Error('一時フォルダパスが設定されていません');
    }

    const filename = `differential_chunk_${result.chunkNumber.toString().padStart(3, '0')}.webm`;
    
    try {
      const arrayBuffer = await result.chunkBlob.arrayBuffer();
      
      if (!window.electronAPI?.saveFile) {
        throw new Error('ElectronAPI.saveFileが利用できません');
      }

      const savedPath = await window.electronAPI.saveFile(
        arrayBuffer, 
        filename, 
        this.config.tempFolderPath
      );

      // ファイル情報を記録
      const fileInfo: ChunkFileInfo = {
        filename,
        filepath: savedPath,
        sequenceNumber: result.chunkNumber,
        sizeBytes: result.dataSize,
        duration: result.duration,
        createdAt: Date.now(),
        startTimeSeconds: result.startTime
      };

      this.savedFiles.push(fileInfo);

      // コールバック実行
      this.executeChunkSavedCallbacks(fileInfo);

      return savedPath;

    } catch (error) {
      this.logger.error('ファイル保存エラー', error instanceof Error ? error : undefined, error);
      throw error;
    }
  }

  /**
   * チャンク生成コールバック実行
   */
  private executeChunkGeneratedCallbacks(result: AudioChunkResult): void {
    this.chunkGeneratedCallbacks.forEach(callback => {
      try {
        callback(result);
      } catch (error) {
        this.logger.error('チャンク生成コールバックエラー', error instanceof Error ? error : undefined, error);
      }
    });
  }

  /**
   * チャンク保存コールバック実行
   */
  private executeChunkSavedCallbacks(fileInfo: ChunkFileInfo): void {
    this.chunkSavedCallbacks.forEach(callback => {
      try {
        callback(fileInfo);
      } catch (error) {
        this.logger.error('チャンク保存コールバックエラー', error instanceof Error ? error : undefined, error);
      }
    });
  }

  /**
   * エラーハンドリング
   */
  private handleError(error: Error): void {
    this.errorCallbacks.forEach(callback => {
      try {
        callback(error);
      } catch (callbackError) {
        this.logger.error('エラーコールバック実行エラー', callbackError instanceof Error ? callbackError : undefined, callbackError);
      }
    });
  }

  // =================================================================
  // 公開API
  // =================================================================

  /**
   * コールバック登録
   */
  onChunkGenerated(callback: (result: AudioChunkResult) => void): void {
    this.chunkGeneratedCallbacks.push(callback);
  }

  onChunkSaved(callback: (fileInfo: ChunkFileInfo) => void): void {
    this.chunkSavedCallbacks.push(callback);
  }

  onError(callback: (error: Error) => void): void {
    this.errorCallbacks.push(callback);
  }

  /**
   * 設定更新
   */
  updateConfig(newConfig: Partial<ChunkGeneratorConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };

    // 間隔変更時の処理
    if (oldConfig.intervalSeconds !== this.config.intervalSeconds) {
      this.intervalMs = this.config.intervalSeconds * 1000;
      
      // 自動生成中の場合は再起動
      if (this.autoGenerationTimer && this.isRecording) {
        this.stopAutoGeneration();
        this.startAutoGeneration();
      }
    }

    this.logger.info('設定更新', { oldConfig, newConfig: this.config });
  }

  /**
   * 統計情報取得
   */
  getStats() {
    return {
      chunkCount: this.chunkCounter,
      bufferSize: this.audioDataBuffer.length,
      savedFiles: this.savedFiles.length,
      isRecording: this.isRecording,
      recordingDuration: this.isRecording ? (Date.now() - this.recordingStartTime) / 1000 : 0
    };
  }

  /**
   * 保存ファイル一覧取得
   */
  getSavedFiles(): ChunkFileInfo[] {
    return [...this.savedFiles];
  }

  /**
   * リセット
   */
  reset(): void {
    this.logger.info('リセット開始');
    
    this.stopAutoGeneration();
    
    this.isRecording = false;
    this.recordingStartTime = 0;
    this.chunkCounter = 0;
    this.audioDataBuffer = [];
    this.savedFiles = [];
    this.lastGenerationTime = 0;
    
    this.webmProcessor.clearCache();
    
    this.logger.info('リセット完了');
  }

  /**
   * クリーンアップ
   */
  cleanup(): void {
    this.logger.info('クリーンアップ開始');
    
    this.stopAutoGeneration();
    
    // データクリア
    this.isRecording = false;
    this.audioDataBuffer = [];
    this.savedFiles = [];
    
    // コールバッククリア
    this.chunkGeneratedCallbacks = [];
    this.chunkSavedCallbacks = [];
    this.errorCallbacks = [];
    
    // WebMプロセッサークリーンアップ
    this.webmProcessor.cleanup();
    
    this.logger.info('クリーンアップ完了');
  }
}