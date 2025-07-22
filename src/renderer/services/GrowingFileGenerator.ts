/**
 * GrowingFileGenerator - 録音データ管理サービス（シンプル版）
 * 
 * 録音データをメモリ上で蓄積し、旧APIとの互換性を提供
 */

// 旧インターフェースとの互換性維持
export interface GrowingChunkResult {
  chunkBlob: Blob;
  chunkNumber: number;
  startTime: number;
  endTime: number;
  duration: number;
  fileSize: number;
  isComplete: boolean;
}

export interface GrowingStats {
  totalChunks: number;
  totalDataSize: number;
  lastChunkSize: number;
  recordingDuration: number;
}

export class GrowingFileGenerator {
  private allChunks: Blob[] = []
  private chunkCounter: number = 0
  private recordingStartTime: number = 0
  private chunkIntervalSeconds: number = 20
  
  constructor(chunkIntervalSeconds: number = 20) {
    this.chunkIntervalSeconds = chunkIntervalSeconds
    console.log('🎯 GrowingFileGenerator初期化（シンプル版）')
  }
  
  /**
   * リセット（新しい録音開始時）
   */
  reset(): void {
    console.log('🔄 GrowingFileGenerator リセット')
    this.allChunks = []
    this.chunkCounter = 0
    this.recordingStartTime = Date.now()
  }
  
  /**
   * 新しい録音データを追加
   */
  addRecordingData(blob: Blob): void {
    this.allChunks.push(blob)
    console.log(`📝 録音データ追加 ${blob.size} bytes (累計: ${this.allChunks.length}チャンク)`)
  }
  
  /**
   * 現在時点での完全なWebMファイルを生成
   */
  generateCurrentCompleteFile(): GrowingChunkResult {
    if (this.allChunks.length === 0) {
      throw new Error('録音データがありません');
    }
    
    // 現在の完全なWebMファイルを作成
    const completeBlob = new Blob(this.allChunks, { type: 'audio/webm' });
    this.chunkCounter++;
    
    // 現在の録音時間を計算
    const currentTime = Date.now();
    const elapsedSeconds = (currentTime - this.recordingStartTime) / 1000;
    
    // チャンクの時間範囲を計算
    const startTime = Math.max(0, (this.chunkCounter - 1) * this.chunkIntervalSeconds);
    const endTime = Math.min(elapsedSeconds, this.chunkCounter * this.chunkIntervalSeconds);
    const duration = endTime - startTime;
    
    console.log(`✅ 完全ファイル生成: チャンク${this.chunkCounter}`);
    console.log(`📊 時間範囲: ${startTime.toFixed(1)}s - ${endTime.toFixed(1)}s (長さ: ${duration.toFixed(1)}s)`);
    console.log(`📊 ファイルサイズ: ${completeBlob.size} bytes`);
    
    return {
      chunkBlob: completeBlob,
      chunkNumber: this.chunkCounter,
      startTime,
      endTime,
      duration,
      fileSize: completeBlob.size,
      isComplete: true
    };
  }
  
  /**
   * 特定の時間範囲のWebMファイルを生成（将来の機能拡張用）
   */
  generateTimeRangeFile(startSeconds: number, endSeconds: number): GrowingChunkResult {
    // 注意: この機能は複雑なため、現在は完全ファイルのみ対応
    // 将来的にFFmpegやWebAssemblyベースのWebM分割機能を追加予定
    return this.generateCurrentCompleteFile();
  }
  
  /**
   * 統計情報を取得
   */
  getStats(): GrowingStats {
    const totalSize = this.allChunks.reduce((sum, chunk) => sum + chunk.size, 0);
    const lastChunkSize = this.allChunks.length > 0 ? this.allChunks[this.allChunks.length - 1].size : 0;
    const recordingDuration = this.recordingStartTime > 0 ? (Date.now() - this.recordingStartTime) / 1000 : 0;
    
    return {
      totalChunks: this.chunkCounter,
      totalDataSize: totalSize,
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
  getMemoryUsage(): { totalBytes: number; chunkCount: number } {
    const totalBytes = this.allChunks.reduce((sum, chunk) => sum + chunk.size, 0);
    return {
      totalBytes,
      chunkCount: this.allChunks.length
    };
  }
  
  /**
   * クリーンアップ
   */
  cleanup(): void {
    console.log('🧹 GrowingFileGenerator クリーンアップ')
    this.allChunks = []
    this.chunkCounter = 0
    this.recordingStartTime = 0
  }
}