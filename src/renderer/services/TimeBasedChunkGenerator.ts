/**
 * TimeBasedChunkGenerator - 時間範囲ベース完全チャンク生成システム
 * 
 * 録音開始からの特定の時間範囲（例：0-5秒、5-10秒、10-15秒）ごとに
 * 完全なWebMファイルを生成します。重複を避けるため、RealtimeTextManagerで
 * 時間範囲による重複除去を行います。
 */

export interface TimeBasedChunkResult {
  chunkBlob: Blob;
  chunkNumber: number;
  absoluteStartTime: number; // 録音開始からの絶対秒数
  absoluteEndTime: number; // 録音開始からの絶対秒数
  duration: number; // チャンクの長さ（秒）
  fileSize: number;
  isComplete: boolean;
}

export interface TimeBasedStats {
  totalChunks: number;
  totalDataSize: number;
  lastChunkSize: number;
  recordingDuration: number;
  currentTimeRange: string;
}

export class TimeBasedChunkGenerator {
  private allChunks: Blob[] = [];
  private chunkCounter: number = 0;
  private recordingStartTime: number = 0;
  private chunkIntervalSeconds: number = 5; // 5秒間隔
  
  constructor(chunkIntervalSeconds: number = 5) {
    this.chunkIntervalSeconds = chunkIntervalSeconds;
    console.log(`🔧 TimeBasedChunkGenerator初期化 (${chunkIntervalSeconds}秒間隔)`);
  }
  
  /**
   * 録音開始
   */
  startRecording(): void {
    this.recordingStartTime = Date.now();
    this.allChunks = [];
    this.chunkCounter = 0;
    console.log('🎬 録音開始 - TimeBasedChunkGenerator');
  }
  
  /**
   * 新しい録音データを追加
   */
  addRecordingData(blob: Blob): void {
    this.allChunks.push(blob);
    console.log(`📝 録音データ追加: ${blob.size} bytes (累計: ${this.allChunks.length}チャンク)`);
  }
  
  /**
   * 時間範囲ベースのチャンクを生成
   * 常に録音開始から現在までの完全なWebMファイルを生成し、
   * 時間範囲情報を付加して重複除去をRealtimeTextManagerに委ねる
   */
  generateTimeBasedChunk(): TimeBasedChunkResult {
    if (this.allChunks.length === 0) {
      throw new Error('録音データがありません');
    }
    
    // 現在の完全なWebMファイルを作成
    const completeBlob = new Blob(this.allChunks, { type: 'audio/webm' });
    this.chunkCounter++;
    
    // 現在の録音時間を計算
    const currentTime = Date.now();
    const elapsedSeconds = (currentTime - this.recordingStartTime) / 1000;
    
    // このチャンクの時間範囲を定義
    const absoluteStartTime = Math.max(0, (this.chunkCounter - 1) * this.chunkIntervalSeconds);
    const absoluteEndTime = Math.min(elapsedSeconds, this.chunkCounter * this.chunkIntervalSeconds);
    const duration = absoluteEndTime - absoluteStartTime;
    
    console.log(`✅ 時間範囲ベースチャンク生成: チャンク${this.chunkCounter}`);
    console.log(`📊 時間範囲: ${absoluteStartTime.toFixed(1)}s - ${absoluteEndTime.toFixed(1)}s (長さ: ${duration.toFixed(1)}s)`);
    console.log(`📊 ファイルサイズ: ${completeBlob.size} bytes`);
    console.log(`📊 実際の録音時間: ${elapsedSeconds.toFixed(1)}s`);
    
    return {
      chunkBlob: completeBlob,
      chunkNumber: this.chunkCounter,
      absoluteStartTime,
      absoluteEndTime,
      duration,
      fileSize: completeBlob.size,
      isComplete: true
    };
  }
  
  /**
   * 統計情報を取得
   */
  getStats(): TimeBasedStats {
    const totalSize = this.allChunks.reduce((sum, chunk) => sum + chunk.size, 0);
    const lastChunkSize = this.allChunks.length > 0 ? this.allChunks[this.allChunks.length - 1].size : 0;
    const recordingDuration = this.recordingStartTime > 0 ? (Date.now() - this.recordingStartTime) / 1000 : 0;
    
    const currentStartTime = Math.max(0, this.chunkCounter * this.chunkIntervalSeconds);
    const currentEndTime = currentStartTime + this.chunkIntervalSeconds;
    const currentTimeRange = `${currentStartTime.toFixed(1)}s - ${currentEndTime.toFixed(1)}s`;
    
    return {
      totalChunks: this.chunkCounter,
      totalDataSize: totalSize,
      lastChunkSize,
      recordingDuration,
      currentTimeRange
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
  getMemoryUsage(): { totalBytes: number; chunkCount: number } {
    const totalBytes = this.allChunks.reduce((sum, chunk) => sum + chunk.size, 0);
    return {
      totalBytes,
      chunkCount: this.allChunks.length
    };
  }
  
  /**
   * リセット（新しい録音開始時）
   */
  reset(): void {
    console.log('🔄 TimeBasedChunkGenerator リセット');
    this.allChunks = [];
    this.chunkCounter = 0;
    this.recordingStartTime = 0;
  }
  
  /**
   * クリーンアップ
   */
  cleanup(): void {
    console.log('🧹 TimeBasedChunkGenerator クリーンアップ');
    this.allChunks = [];
    this.chunkCounter = 0;
    this.recordingStartTime = 0;
  }
}