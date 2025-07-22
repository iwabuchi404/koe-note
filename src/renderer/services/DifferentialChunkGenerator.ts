/**
 * DifferentialChunkGenerator - 差分チャンク生成システム
 * 
 * メモリ上でWebMデータを蓄積し、差分部分のみを切り出して
 * 再生可能なチャンクファイルを生成します
 */

export interface ChunkGenerationResult {
  chunkBlob: Blob;
  chunkNumber: number;
  dataSize: number;
  totalSize: number;
  isFirstChunk: boolean;
}

export interface GenerationStats {
  totalChunks: number;
  totalDataSize: number;
  lastChunkSize: number;
  headerSize: number;
}

export class DifferentialChunkGenerator {
  private allChunks: Blob[] = [];
  private webmHeader: Uint8Array | null = null;
  private lastProcessedSize: number = 0;
  private chunkCounter: number = 0;
  private isInitialized: boolean = false;
  private overlapDuration: number = 2000; // 2秒のオーバーラップ（バイト換算は動的計算）
  
  constructor() {
    console.log('🔧 DifferentialChunkGenerator初期化');
  }
  
  /**
   * 新しい録音データを追加
   */
  addRecordingData(blob: Blob): void {
    this.allChunks.push(blob);
    console.log(`📝 録音データ追加: ${blob.size} bytes (累計: ${this.allChunks.length}チャンク)`);
    
    // 最初のチャンクからヘッダーを抽出
    if (!this.isInitialized && this.allChunks.length === 1) {
      this.initializeHeaderFromFirstChunk(blob);
    }
  }
  
  /**
   * 最初のチャンクからWebMヘッダーを抽出・保持
   */
  private async initializeHeaderFromFirstChunk(firstChunk: Blob): Promise<void> {
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
      
      // より保守的なヘッダーサイズ推定
      // 最初のチャンクが小さい場合は、より小さなヘッダーサイズを使用
      let estimatedHeaderSize: number;
      if (uint8Array.length < 1024) {
        // 1KB未満の場合は、半分をヘッダーとする
        estimatedHeaderSize = Math.floor(uint8Array.length * 0.5);
      } else if (uint8Array.length < 4096) {
        // 4KB未満の場合は、1/3をヘッダーとする
        estimatedHeaderSize = Math.floor(uint8Array.length * 0.33);
      } else {
        // 4KB以上の場合は、従来通り
        estimatedHeaderSize = Math.min(2048, Math.floor(uint8Array.length * 0.1));
      }
      
      this.webmHeader = uint8Array.slice(0, estimatedHeaderSize);
      
      console.log(`✅ WebMヘッダー抽出完了: ${this.webmHeader.length} bytes`);
      console.log(`📊 ヘッダー内容: ${Array.from(this.webmHeader.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
      
      this.isInitialized = true;
      
    } catch (error) {
      console.error('❌ WebMヘッダー抽出エラー:', error);
      throw error;
    }
  }
  
  /**
   * 現在蓄積されているデータから差分チャンクを生成
   */
  async generateDifferentialChunk(): Promise<ChunkGenerationResult | null> {
    if (!this.isInitialized || !this.webmHeader) {
      console.warn('⚠️ ヘッダーが初期化されていません');
      return null;
    }
    
    try {
      // 現在の完全なWebMデータを生成
      const currentFullBlob = new Blob(this.allChunks, { type: 'audio/webm' });
      const currentTotalSize = currentFullBlob.size;
      
      console.log(`🔍 差分チャンク生成開始:`);
      console.log(`  - 現在の総サイズ: ${currentTotalSize} bytes`);
      console.log(`  - 前回処理済みサイズ: ${this.lastProcessedSize} bytes`);
      console.log(`  - 差分サイズ: ${currentTotalSize - this.lastProcessedSize} bytes`);
      
      // 新しいデータがない場合はスキップ
      if (currentTotalSize <= this.lastProcessedSize) {
        console.log('📝 新しいデータなし - チャンク生成スキップ');
        return null;
      }
      
      // オーバーラップを考慮した開始位置を計算
      // 2秒分のオーバーラップを推定（44.1kHz * 16bit * 1ch * 2秒 ≈ 176KB程度）
      const estimatedOverlapBytes = Math.min(
        Math.floor(currentTotalSize * 0.1), // 全体の10%まで
        Math.max(8192, this.lastProcessedSize * 0.2) // 最低8KB、前回の20%まで
      );
      
      const overlapStartPosition = Math.max(
        this.webmHeader!.length, // ヘッダー以降から
        this.lastProcessedSize - estimatedOverlapBytes
      );
      
      console.log(`📝 オーバーラップ計算:`);
      console.log(`  - 推定オーバーラップ: ${estimatedOverlapBytes} bytes`);
      console.log(`  - オーバーラップ開始位置: ${overlapStartPosition} bytes`);
      console.log(`  - 前回終了位置: ${this.lastProcessedSize} bytes`);
      
      // オーバーラップ付きデータを切り出し
      const chunkDataBlob = currentFullBlob.slice(overlapStartPosition);
      const chunkArrayBuffer = await chunkDataBlob.arrayBuffer();
      const chunkData = new Uint8Array(chunkArrayBuffer);
      
      console.log(`📝 オーバーラップ付きチャンクデータ切り出し完了: ${chunkData.length} bytes`);
      
      const chunkBlob = new Blob([chunkData], { type: 'audio/webm' });
      this.chunkCounter++;
      
      console.log(`✅ オーバーラップ付きチャンク生成完了: チャンク${this.chunkCounter} (${chunkBlob.size} bytes)`);
      console.log(`📊 構成: オーバーラップ開始位置${overlapStartPosition}bytes + データ${chunkData.length}bytes`);
      
      // 処理済みサイズを更新
      this.lastProcessedSize = currentTotalSize;
      
      return {
        chunkBlob,
        chunkNumber: this.chunkCounter,
        dataSize: chunkData.length,
        totalSize: currentTotalSize,
        isFirstChunk: this.chunkCounter === 1
      };
      
    } catch (error) {
      console.error('❌ 差分チャンク生成エラー:', error);
      throw error;
    }
  }
  
  /**
   * 統計情報を取得
   */
  getStats(): GenerationStats {
    const totalSize = this.allChunks.reduce((sum, chunk) => sum + chunk.size, 0);
    const lastChunkSize = this.allChunks.length > 0 ? this.allChunks[this.allChunks.length - 1].size : 0;
    
    return {
      totalChunks: this.chunkCounter,
      totalDataSize: totalSize,
      lastChunkSize,
      headerSize: this.webmHeader?.length || 0
    };
  }
  
  /**
   * 初期化状態を確認
   */
  isReady(): boolean {
    return this.isInitialized && this.webmHeader !== null;
  }
  
  /**
   * リセット（新しい録音開始時）
   */
  reset(): void {
    console.log('🔄 DifferentialChunkGenerator リセット');
    this.allChunks = [];
    this.webmHeader = null;
    this.lastProcessedSize = 0;
    this.chunkCounter = 0;
    this.isInitialized = false;
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
   * 全チャンクデータを取得（最終ファイル作成用）
   */
  getAllChunks(): Blob[] {
    return [...this.allChunks];
  }
  
  /**
   * クリーンアップ
   */
  cleanup(): void {
    console.log('🧹 DifferentialChunkGenerator クリーンアップ');
    this.allChunks = [];
    this.webmHeader = null;
    this.lastProcessedSize = 0;
    this.chunkCounter = 0;
    this.isInitialized = false;
  }
}