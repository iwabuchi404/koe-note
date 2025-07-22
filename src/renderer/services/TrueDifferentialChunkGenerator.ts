/**
 * TrueDifferentialChunkGenerator - 真の差分チャンク生成システム（拡張版）
 * 
 * 新しく追加された音声データのみを抽出して、独立した再生可能なWebMファイルを生成します。
 * オーバーラップを排除し、純粋な差分のみを処理します。
 * 
 * Phase 1 機能追加:
 * - 時間ベースの自動チャンク生成
 * - チャンクファイル保存機能
 * - リアルタイム文字起こし連携
 * - 設定ファイルからのチャンクサイズ読み込み
 */

import { TRANSCRIPTION_CONFIG } from '../config/transcriptionConfig';

export interface TrueDifferentialResult {
  chunkBlob: Blob;
  chunkNumber: number;
  startTime: number; // 実際の録音開始からの秒数
  duration: number; // チャンクの長さ（秒）
  dataSize: number;
  isNewData: boolean;
  filePath?: string; // 保存されたファイルパス（保存有効時）
}

export interface ChunkGenerationConfig {
  intervalSeconds: number;        // チャンク間隔（デフォルト5秒）
  enableFileGeneration: boolean;  // ファイル生成有効化
  tempFolderPath?: string;       // 一時フォルダパス
  enableAutoGeneration: boolean; // 自動生成有効化
}

export interface ChunkFileInfo {
  filename: string;
  filepath: string;
  sequenceNumber: number;
  sizeBytes: number;
  duration: number;
  createdAt: number;
}

export interface TrueDifferentialStats {
  totalChunks: number;
  totalDataProcessed: number;
  lastChunkSize: number;
  recordingDuration: number;
}

export class TrueDifferentialChunkGenerator {
  private allChunks: Blob[] = [];
  private processedDataSize: number = 0;
  private chunkCounter: number = 0;
  private recordingStartTime: number = 0;
  private chunkIntervalMs: number = 5000; // 5秒間隔
  private webmHeader: Uint8Array | null = null;
  private isInitialized: boolean = false;
  
  // 新機能用プロパティ
  private config: ChunkGenerationConfig;
  private autoGenerationTimer: NodeJS.Timeout | null = null;
  private lastChunkGenerationTime: number = 0;
  private savedChunkFiles: ChunkFileInfo[] = [];
  
  // コールバック
  private onChunkGeneratedCallbacks: ((result: TrueDifferentialResult) => void)[] = [];
  private onChunkSavedCallbacks: ((fileInfo: ChunkFileInfo) => void)[] = [];
  private onErrorCallbacks: ((error: Error) => void)[] = [];
  
  constructor(chunkIntervalSeconds?: number, config: Partial<ChunkGenerationConfig> = {}) {
    // 設定ファイルからデフォルト値を取得
    const defaultChunkSize = chunkIntervalSeconds ?? TRANSCRIPTION_CONFIG.REALTIME.PROCESSING_INTERVAL / 1000;
    this.chunkIntervalMs = defaultChunkSize * 1000;
    
    // デフォルト設定
    this.config = {
      intervalSeconds: defaultChunkSize,
      enableFileGeneration: false,
      tempFolderPath: undefined,
      enableAutoGeneration: false,
      ...config
    };
    
    console.log(`🔧 TrueDifferentialChunkGenerator初期化 (${defaultChunkSize}秒間隔)`);
    console.log(`📋 設定:`, this.config);
    console.log(`📋 設定ファイルからのデフォルト値: PROCESSING_INTERVAL=${TRANSCRIPTION_CONFIG.REALTIME.PROCESSING_INTERVAL}ms, CHUNK_SIZE=${TRANSCRIPTION_CONFIG.CHUNK.DEFAULT_SIZE}s`);
  }
  
  /**
   * 録音開始（拡張版）
   */
  startRecording(): void {
    this.recordingStartTime = Date.now();
    this.lastChunkGenerationTime = Date.now();
    this.allChunks = [];
    this.processedDataSize = 0;
    this.chunkCounter = 0;
    this.webmHeader = null;
    this.isInitialized = false;
    this.savedChunkFiles = [];
    
    console.log('🎬 録音開始 - TrueDifferentialChunkGenerator（拡張版）');
    
    // 自動チャンク生成開始
    if (this.config.enableAutoGeneration) {
      this.startAutoChunkGeneration();
    }
  }
  
  /**
   * 録音停止（拡張版）
   */
  stopRecording(): void {
    console.log('🛑 録音停止 - TrueDifferentialChunkGenerator');
    
    // 自動チャンク生成停止
    this.stopAutoChunkGeneration();
    
    // 最終チャンクを生成（未処理データがある場合）
    if (this.config.enableAutoGeneration && this.hasUnprocessedData()) {
      this.generateFinalChunk();
    }
  }
  
  /**
   * 新しい録音データを追加（拡張版）
   */
  addRecordingData(blob: Blob): void {
    this.allChunks.push(blob);
    console.log(`📝 録音データ追加: ${blob.size} bytes (累計: ${this.allChunks.length}チャンク)`);
    
    // 最初のチャンクからWebMヘッダーを抽出
    if (!this.isInitialized && this.allChunks.length === 1) {
      this.extractHeaderFromFirstChunk(blob);
    }
    
    // 手動チャンク生成モードでの時間チェック
    if (!this.config.enableAutoGeneration) {
      this.checkManualChunkGeneration();
    }
  }
  
  /**
   * 最初のチャンクからWebMヘッダーを抽出
   */
  private async extractHeaderFromFirstChunk(firstChunk: Blob): Promise<void> {
    try {
      console.log('🎯 最初のチャンクからWebMヘッダーを抽出中...');
      
      const arrayBuffer = await firstChunk.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // WebMヘッダーの検証
      if (uint8Array.length < 4 || 
          uint8Array[0] !== 0x1A || uint8Array[1] !== 0x45 || 
          uint8Array[2] !== 0xDF || uint8Array[3] !== 0xA3) {
        throw new Error('有効なWebMヘッダーが見つかりません');
      }
      
      // ヘッダーサイズを推定（保守的に）
      const headerSize = Math.min(1024, Math.floor(uint8Array.length * 0.3));
      this.webmHeader = uint8Array.slice(0, headerSize);
      
      console.log(`✅ WebMヘッダー抽出完了: ${this.webmHeader.length} bytes`);
      console.log(`📊 ヘッダー内容: ${Array.from(this.webmHeader.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
      
      this.isInitialized = true;
      
    } catch (error) {
      console.error('❌ WebMヘッダー抽出エラー:', error);
      // ヘッダー抽出に失敗した場合でも継続（差分データのみ使用）
      this.isInitialized = true;
    }
  }
  
  /**
   * 純粋な差分チャンクを生成（拡張版）
   */
  async generateTrueDifferentialChunk(forceSave: boolean = false): Promise<TrueDifferentialResult | null> {
    try {
      // 現在の総データサイズを計算
      const currentTotalSize = this.allChunks.reduce((sum, chunk) => sum + chunk.size, 0);
      
      console.log(`🔍 差分チャンク生成開始:`);
      console.log(`  - 現在の総サイズ: ${currentTotalSize} bytes`);
      console.log(`  - 処理済みサイズ: ${this.processedDataSize} bytes`);
      console.log(`  - 新しいデータサイズ: ${currentTotalSize - this.processedDataSize} bytes`);
      
      // 新しいデータがない場合はスキップ
      if (currentTotalSize <= this.processedDataSize) {
        console.log('📝 新しいデータなし - チャンク生成スキップ');
        return null;
      }
      
      // 純粋な差分データを抽出
      const newDataSize = currentTotalSize - this.processedDataSize;
      const newDataChunks: Blob[] = [];
      let collectedSize = 0;
      let tempProcessedSize = this.processedDataSize;
      
      // 必要なチャンクを収集
      for (const chunk of this.allChunks) {
        if (tempProcessedSize > 0) {
          if (tempProcessedSize >= chunk.size) {
            // このチャンクは完全に処理済み
            tempProcessedSize -= chunk.size;
            continue;
          } else {
            // このチャンクの一部が未処理
            const remainingPart = chunk.slice(tempProcessedSize);
            newDataChunks.push(remainingPart);
            collectedSize += remainingPart.size;
            tempProcessedSize = 0;
          }
        } else {
          // このチャンクは完全に未処理
          newDataChunks.push(chunk);
          collectedSize += chunk.size;
        }
      }
      
      if (newDataChunks.length === 0) {
        console.log('📝 新しいデータチャンクなし');
        return null;
      }
      
      // 差分データを結合
      const differentialBlob = new Blob(newDataChunks, { type: 'audio/webm' });
      console.log(`📝 純粋差分データ作成完了: ${differentialBlob.size} bytes`);
      
      // すべてのチャンクにWebMヘッダーを付加して独立再生可能にする
      let finalChunkBlob: Blob;
      if (this.webmHeader) {
        // WebMヘッダー + 差分データで完全なWebMファイルを生成
        const headerAndData = new Uint8Array(this.webmHeader.length + differentialBlob.size);
        headerAndData.set(this.webmHeader, 0);
        const differentialArray = new Uint8Array(await differentialBlob.arrayBuffer());
        headerAndData.set(differentialArray, this.webmHeader.length);
        finalChunkBlob = new Blob([headerAndData], { type: 'audio/webm' });
        console.log(`📝 完全なWebMチャンクファイル生成: ヘッダー${this.webmHeader.length}bytes + データ${differentialBlob.size}bytes`);
      } else {
        // ヘッダーが利用できない場合は差分データのみ（フォールバック）
        finalChunkBlob = differentialBlob;
        console.log(`⚠️ WebMヘッダーなし - 差分データのみでチャンク生成 (再生不可能な可能性)`);
      }
      
      this.chunkCounter++;
      
      // 実際の時間計算
      const elapsedTime = (Date.now() - this.recordingStartTime) / 1000;
      const startTime = Math.max(0, (this.chunkCounter - 1) * (this.chunkIntervalMs / 1000));
      const duration = Math.min(this.chunkIntervalMs / 1000, elapsedTime - startTime);
      
      console.log(`✅ 真の差分チャンク生成完了: チャンク${this.chunkCounter}`);
      console.log(`📊 実時間: 開始${startTime.toFixed(1)}s, 長さ${duration.toFixed(1)}s`);
      console.log(`📊 データサイズ: ${finalChunkBlob.size} bytes`);
      
      // 処理済みサイズを更新
      this.processedDataSize = currentTotalSize;
      
      // ファイル保存機能
      let savedFilePath: string | undefined;
      if (this.config.enableFileGeneration && this.config.tempFolderPath) {
        try {
          savedFilePath = await this.saveChunkToFile(finalChunkBlob, this.chunkCounter, startTime, duration);
          console.log(`✅ チャンクファイル保存完了: ${savedFilePath}`);
        } catch (error) {
          console.error(`❌ チャンクファイル保存エラー:`, error);
          this.handleError(error instanceof Error ? error : new Error(String(error)));
        }
      }
      
      const result: TrueDifferentialResult = {
        chunkBlob: finalChunkBlob,
        chunkNumber: this.chunkCounter,
        startTime,
        duration,
        dataSize: finalChunkBlob.size,
        isNewData: true,
        filePath: savedFilePath
      };
      
      // コールバック実行
      this.onChunkGeneratedCallbacks.forEach(callback => {
        try {
          callback(result);
        } catch (error) {
          console.error('チャンク生成コールバックエラー:', error);
        }
      });
      
      return result;
      
    } catch (error) {
      console.error('❌ 真の差分チャンク生成エラー:', error);
      throw error;
    }
  }
  
  /**
   * 統計情報を取得
   */
  getStats(): TrueDifferentialStats {
    const totalSize = this.allChunks.reduce((sum, chunk) => sum + chunk.size, 0);
    const lastChunkSize = this.allChunks.length > 0 ? this.allChunks[this.allChunks.length - 1].size : 0;
    const recordingDuration = this.recordingStartTime > 0 ? (Date.now() - this.recordingStartTime) / 1000 : 0;
    
    return {
      totalChunks: this.chunkCounter,
      totalDataProcessed: this.processedDataSize,
      lastChunkSize,
      recordingDuration
    };
  }
  
  /**
   * 現在の録音時間を取得
   */
  getCurrentRecordingTime(): number {
    return this.recordingStartTime > 0 ? (Date.now() - this.recordingStartTime) / 1000 : 0;
  }
  
  /**
   * 全チャンクデータを取得（最終ファイル作成用）
   */
  getAllChunks(): Blob[] {
    return [...this.allChunks];
  }
  
  /**
   * メモリ使用量の監視
   */
  getMemoryUsage(): { totalBytes: number; chunkCount: number; processedBytes: number } {
    const totalBytes = this.allChunks.reduce((sum, chunk) => sum + chunk.size, 0);
    return {
      totalBytes,
      chunkCount: this.allChunks.length,
      processedBytes: this.processedDataSize
    };
  }
  
  /**
   * 初期化状態を確認
   */
  isReady(): boolean {
    return this.isInitialized;
  }
  
  /**
   * リセット（新しい録音開始時）（拡張版）
   */
  reset(): void {
    console.log('🔄 TrueDifferentialChunkGenerator リセット');
    
    // 自動チャンク生成停止
    this.stopAutoChunkGeneration();
    
    // データリセット
    this.allChunks = [];
    this.processedDataSize = 0;
    this.chunkCounter = 0;
    this.recordingStartTime = 0;
    this.webmHeader = null;
    this.isInitialized = false;
    this.savedChunkFiles = [];
    this.lastChunkGenerationTime = 0;
  }
  
  /**
   * クリーンアップ（拡張版）
   */
  cleanup(): void {
    console.log('🧹 TrueDifferentialChunkGenerator クリーンアップ');
    
    // 自動チャンク生成停止
    this.stopAutoChunkGeneration();
    
    // データクリア
    this.allChunks = [];
    this.processedDataSize = 0;
    this.chunkCounter = 0;
    this.recordingStartTime = 0;
    this.webmHeader = null;
    this.isInitialized = false;
    this.savedChunkFiles = [];
    this.lastChunkGenerationTime = 0;
    
    // コールバッククリア
    this.onChunkGeneratedCallbacks = [];
    this.onChunkSavedCallbacks = [];
    this.onErrorCallbacks = [];
  }
  
  // =================================================================
  // Phase 1 新機能: 自動チャンク生成機能
  // =================================================================
  
  /**
   * 自動チャンク生成開始
   */
  private startAutoChunkGeneration(): void {
    if (this.autoGenerationTimer) {
      console.warn('⚠️ 自動チャンク生成は既に実行中です');
      return;
    }
    
    console.log(`⏰ 自動チャンク生成開始: ${this.config.intervalSeconds}秒間隔`);
    
    this.autoGenerationTimer = setInterval(async () => {
      try {
        await this.generateTimedChunk();
      } catch (error) {
        console.error('自動チャンク生成エラー:', error);
        this.handleError(error instanceof Error ? error : new Error(String(error)));
      }
    }, this.chunkIntervalMs);
  }
  
  /**
   * 自動チャンク生成停止
   */
  private stopAutoChunkGeneration(): void {
    if (this.autoGenerationTimer) {
      clearInterval(this.autoGenerationTimer);
      this.autoGenerationTimer = null;
      console.log('⏰ 自動チャンク生成停止');
    }
  }
  
  /**
   * 時間ベースのチャンク生成
   */
  private async generateTimedChunk(): Promise<TrueDifferentialResult | null> {
    const now = Date.now();
    const elapsedSinceLastGeneration = now - this.lastChunkGenerationTime;
    
    // 時間チェック
    if (elapsedSinceLastGeneration < this.chunkIntervalMs) {
      console.log(`⏰ チャンク生成間隔未達成: ${elapsedSinceLastGeneration}ms < ${this.chunkIntervalMs}ms`);
      return null;
    }
    
    console.log(`⏰⏰⏰ 時間ベースチャンク生成実行: ${elapsedSinceLastGeneration}ms経過`);
    
    const result = await this.generateTrueDifferentialChunk(false);
    if (result) {
      this.lastChunkGenerationTime = now;
      console.log(`✅ 時間ベースチャンク生成完了: チャンク${result.chunkNumber}`);
    }
    
    return result;
  }
  
  /**
   * 最終チャンク生成（録音停止時）
   */
  private async generateFinalChunk(): Promise<TrueDifferentialResult | null> {
    console.log('🏁 最終チャンク生成中...');
    
    const result = await this.generateTrueDifferentialChunk(true);
    if (result) {
      console.log(`✅ 最終チャンク生成完了: チャンク${result.chunkNumber}`);
    } else {
      console.log('💭 最終チャンク: 新しいデータなし');
    }
    
    return result;
  }
  
  /**
   * 未処理データがあるかチェック
   */
  private hasUnprocessedData(): boolean {
    const currentTotalSize = this.allChunks.reduce((sum, chunk) => sum + chunk.size, 0);
    return currentTotalSize > this.processedDataSize;
  }
  
  /**
   * 手動モード用の時間チェック
   */
  private checkManualChunkGeneration(): void {
    if (!this.recordingStartTime) return;
    
    const now = Date.now();
    const elapsedTime = now - this.recordingStartTime;
    const shouldGenerate = elapsedTime >= (this.chunkCounter + 1) * this.chunkIntervalMs;
    
    if (shouldGenerate) {
      console.log(`🔔 手動モード: チャンク生成タイミング検出 (${elapsedTime}ms経過)`);
      // 手動チャンク生成のフラグを立てるなどの処理がここに入る
      // 現在はログ出力のみ
    }
  }
  
  // =================================================================
  // Phase 1 新機能: ファイル保存機能
  // =================================================================
  
  /**
   * チャンクをファイルに保存
   */
  private async saveChunkToFile(
    chunkBlob: Blob,
    chunkNumber: number,
    startTime: number,
    duration: number
  ): Promise<string> {
    if (!this.config.tempFolderPath) {
      throw new Error('一時フォルダパスが設定されていません');
    }
    
    const filename = `differential_chunk_${chunkNumber.toString().padStart(3, '0')}.webm`;
    const filepath = `${this.config.tempFolderPath}/${filename}`;
    
    console.log(`💾 チャンクファイル保存開始: ${filename}`);
    console.log(`📊 ファイル情報: ${chunkBlob.size} bytes, ${duration.toFixed(1)}秒`);
    
    try {
      // BlobをArrayBufferに変換
      const arrayBuffer = await chunkBlob.arrayBuffer();
      
      // Electron API経由でファイル保存
      if (window.electronAPI && typeof window.electronAPI.saveFile === 'function') {
        const savedPath = await window.electronAPI.saveFile(arrayBuffer, filename, this.config.tempFolderPath);
        
        // ファイル情報を記録
        const fileInfo: ChunkFileInfo = {
          filename,
          filepath: savedPath,
          sequenceNumber: chunkNumber,
          sizeBytes: chunkBlob.size,
          duration,
          createdAt: Date.now()
        };
        
        this.savedChunkFiles.push(fileInfo);
        
        // コールバック実行
        this.onChunkSavedCallbacks.forEach(callback => {
          try {
            callback(fileInfo);
          } catch (error) {
            console.error('チャンク保存コールバックエラー:', error);
          }
        });
        
        console.log(`✅ チャンクファイル保存完了: ${savedPath}`);
        return savedPath;
        
      } else {
        throw new Error('ElectronAPI.saveFileが利用できません');
      }
      
    } catch (error) {
      console.error(`❌ チャンクファイル保存エラー: ${filename}`, error);
      throw error;
    }
  }
  
  /**
   * 保存されたチャンクファイルの情報を取得
   */
  getSavedChunkFiles(): ChunkFileInfo[] {
    return [...this.savedChunkFiles];
  }
  
  /**
   * チャンク保存統計を取得
   */
  getChunkSaveStats() {
    const totalSavedFiles = this.savedChunkFiles.length;
    const totalSavedBytes = this.savedChunkFiles.reduce((sum, file) => sum + file.sizeBytes, 0);
    const totalSavedDuration = this.savedChunkFiles.reduce((sum, file) => sum + file.duration, 0);
    
    return {
      totalSavedFiles,
      totalSavedBytes,
      totalSavedDuration,
      averageFileSize: totalSavedFiles > 0 ? totalSavedBytes / totalSavedFiles : 0,
      averageChunkDuration: totalSavedFiles > 0 ? totalSavedDuration / totalSavedFiles : 0
    };
  }
  
  // =================================================================
  // Phase 3 新機能: チャンクファイル結合とWebM処理
  // =================================================================
  
  /**
   * 保存されたチャンクファイルを結合して完全なWebMファイルを作成
   */
  async generateCombinedWebMFile(): Promise<Blob | null> {
    try {
      if (this.savedChunkFiles.length === 0) {
        console.warn('⚠️ 結合可能なチャンクファイルがありません');
        return null;
      }
      
      console.log(`🔗 チャンクファイル結合開始: ${this.savedChunkFiles.length}個のチャンク`);
      
      // チャンクファイルを順番に読み込み
      const chunkDataArray: Uint8Array[] = [];
      let totalSize = 0;
      
      for (const chunkFile of this.savedChunkFiles.sort((a, b) => a.sequenceNumber - b.sequenceNumber)) {
        try {
          console.log(`📖 チャンクファイル読み込み: ${chunkFile.filename}`);
          
          // ファイルを読み込み（実際の実装ではElectronAPIを使用）
          if (window.electronAPI && typeof window.electronAPI.readFile === 'function') {
            const fileBuffer = await window.electronAPI.readFile(chunkFile.filepath);
            const uint8Array = new Uint8Array(fileBuffer);
            
            // WebMヘッダーを除去して純粋な音声データのみを抽出
            let audioData: Uint8Array;
            if (this.webmHeader && uint8Array.length > this.webmHeader.length) {
              // ヘッダー部分をスキップ
              audioData = uint8Array.slice(this.webmHeader.length);
              console.log(`🔧 ヘッダー除去: ${this.webmHeader.length}bytes → 音声データ${audioData.length}bytes`);
            } else {
              audioData = uint8Array;
              console.log(`📝 音声データ使用: ${audioData.length}bytes`);
            }
            
            chunkDataArray.push(audioData);
            totalSize += audioData.length;
            
          } else {
            console.error(`❌ ファイル読み込みAPI利用不可: ${chunkFile.filename}`);
          }
          
        } catch (fileError) {
          console.error(`❌ チャンクファイル読み込みエラー: ${chunkFile.filename}`, fileError);
        }
      }
      
      if (chunkDataArray.length === 0) {
        console.error('❌ 有効なチャンクデータが見つかりません');
        return null;
      }
      
      // 音声データを結合
      console.log(`🔗 音声データ結合: ${chunkDataArray.length}個 (総サイズ: ${totalSize}bytes)`);
      const combinedAudioData = new Uint8Array(totalSize);
      let offset = 0;
      
      for (const chunkData of chunkDataArray) {
        combinedAudioData.set(chunkData, offset);
        offset += chunkData.length;
      }
      
      // WebMヘッダー + 結合された音声データで最終ファイル作成
      let finalBlob: Blob;
      if (this.webmHeader) {
        const finalData = new Uint8Array(this.webmHeader.length + combinedAudioData.length);
        finalData.set(this.webmHeader, 0);
        finalData.set(combinedAudioData, this.webmHeader.length);
        finalBlob = new Blob([finalData], { type: 'audio/webm' });
        console.log(`✅ 結合WebMファイル作成完了: ヘッダー${this.webmHeader.length}bytes + 音声${combinedAudioData.length}bytes`);
      } else {
        finalBlob = new Blob([combinedAudioData], { type: 'audio/webm' });
        console.log(`✅ 結合ファイル作成完了(ヘッダーなし): ${combinedAudioData.length}bytes`);
      }
      
      return finalBlob;
      
    } catch (error) {
      console.error('❌ チャンクファイル結合エラー:', error);
      throw error;
    }
  }
  
  /**
   * チャンクファイル結合統計を取得
   */
  getCombinationStats() {
    const sortedChunks = this.savedChunkFiles.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
    const totalDuration = sortedChunks.reduce((sum, chunk) => sum + chunk.duration, 0);
    const totalSize = sortedChunks.reduce((sum, chunk) => sum + chunk.sizeBytes, 0);
    
    return {
      totalChunks: sortedChunks.length,
      totalDuration,
      totalSizeBytes: totalSize,
      averageChunkSize: sortedChunks.length > 0 ? totalSize / sortedChunks.length : 0,
      firstChunkTime: sortedChunks.length > 0 ? sortedChunks[0].createdAt : 0,
      lastChunkTime: sortedChunks.length > 0 ? sortedChunks[sortedChunks.length - 1].createdAt : 0,
      chunkSequence: sortedChunks.map(chunk => ({
        sequence: chunk.sequenceNumber,
        duration: chunk.duration,
        size: chunk.sizeBytes
      }))
    };
  }
  
  // =================================================================
  // Phase 1 新機能: コールバックと設定管理
  // =================================================================
  
  /**
   * チャンク生成コールバック登録
   */
  onChunkGenerated(callback: (result: TrueDifferentialResult) => void): void {
    this.onChunkGeneratedCallbacks.push(callback);
  }
  
  /**
   * チャンク保存コールバック登録
   */
  onChunkSaved(callback: (fileInfo: ChunkFileInfo) => void): void {
    this.onChunkSavedCallbacks.push(callback);
  }
  
  /**
   * エラーコールバック登録
   */
  onError(callback: (error: Error) => void): void {
    this.onErrorCallbacks.push(callback);
  }
  
  /**
   * エラーハンドルア
   */
  private handleError(error: Error): void {
    console.error('🚨 TrueDifferentialChunkGeneratorエラー:', error);
    
    this.onErrorCallbacks.forEach(callback => {
      try {
        callback(error);
      } catch (callbackError) {
        console.error('エラーコールバック実行エラー:', callbackError);
      }
    });
  }
  
  /**
   * 設定更新
   */
  updateConfig(newConfig: Partial<ChunkGenerationConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };
    
    // 間隔が変更された場合
    if (oldConfig.intervalSeconds !== this.config.intervalSeconds) {
      this.chunkIntervalMs = this.config.intervalSeconds * 1000;
      
      // 自動生成中の場合は再起動
      if (this.autoGenerationTimer) {
        this.stopAutoChunkGeneration();
        this.startAutoChunkGeneration();
      }
    }
    
    console.log('🔧 設定更新:', { oldConfig, newConfig: this.config });
  }
  
  /**
   * 現在の設定を取得
   */
  getConfig(): ChunkGenerationConfig {
    return { ...this.config };
  }
}