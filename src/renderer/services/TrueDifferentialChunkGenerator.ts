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
  private minimalWebMHeader: Uint8Array | null = null;
  private isInitialized: boolean = false;
  
  // バッファベース分割用プロパティ
  private continuousData: Blob[] = [];
  
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
    this.minimalWebMHeader = null;
    this.isInitialized = false;
    this.savedChunkFiles = [];
    this.continuousData = [];
    
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
   * 新しい録音データを追加（バッファベース版）
   */
  addRecordingData(blob: Blob): void {
    // 連続データバッファに追加
    this.continuousData.push(blob);
    console.log(`📝 録音データ追加: ${blob.size} bytes (バッファ: ${this.continuousData.length}チャンク)`);
    
    // 最初のチャンクからWebMヘッダーを抽出
    if (!this.isInitialized && this.continuousData.length === 1) {
      this.extractHeaderFromFirstChunk(blob);
    }
    
    // 手動チャンク生成モードでの時間チェック
    if (!this.config.enableAutoGeneration) {
      this.checkManualChunkGeneration();
    }
  }
  
  /**
   * 最初のチャンクからWebMヘッダーを抽出（改良版）
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
      
      // より精密なWebMヘッダーサイズ特定
      let headerSize = this.findWebMHeaderEnd(uint8Array);
      
      // フォールバック: サイズが特定できない場合は保守的なサイズを使用
      if (headerSize <= 0) {
        headerSize = Math.min(2048, Math.floor(uint8Array.length * 0.1)); // より大きめに設定
        console.log(`⚠️ ヘッダーサイズ自動検出失敗 - フォールバック: ${headerSize} bytes`);
      } else {
        console.log(`🔍 WebMヘッダーサイズ自動検出: ${headerSize} bytes`);
      }
      
      this.webmHeader = uint8Array.slice(0, headerSize);
      
      // ヘッダー内のDocTypeをmatroskaからwebmに修正
      this.fixDocTypeInHeader();
      
      // 最小限のWebMヘッダーも作成（2チャンク目以降用）
      this.createMinimalWebMHeader();
      
      console.log(`✅ WebMヘッダー抽出完了: ${this.webmHeader.length} bytes`);
      console.log(`📊 ヘッダー先頭: ${Array.from(this.webmHeader.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ').toUpperCase()}`);
      console.log(`📊 ヘッダー末尾: ${Array.from(this.webmHeader.slice(-16)).map(b => b.toString(16).padStart(2, '0')).join(' ').toUpperCase()}`);
      
      this.isInitialized = true;
      
    } catch (error) {
      console.error('❌ WebMヘッダー抽出エラー:', error);
      // ヘッダー抽出に失敗した場合でも継続（差分データのみ使用）
      this.isInitialized = true;
    }
  }
  
  /**
   * 抽出されたヘッダー内のDocTypeをmatroskaからwebmに修正
   */
  private fixDocTypeInHeader(): void {
    if (!this.webmHeader) return;
    
    try {
      console.log(`🔍 DocType修正開始: ヘッダーサイズ ${this.webmHeader.length} bytes`);
      console.log(`🔍 ヘッダー内容: ${Array.from(this.webmHeader.slice(0, 64)).map(b => b.toString(16).padStart(2, '0')).join(' ').toUpperCase()}`);
      
      // DocType要素（0x4282）を探す
      for (let i = 0; i < this.webmHeader.length - 12; i++) {
        if (this.webmHeader[i] === 0x42 && this.webmHeader[i + 1] === 0x82) {
          console.log(`🎯 DocType要素発見 (位置: ${i})`);
          
          // DocType要素を発見
          const sizePos = i + 2;
          const dataPos = i + 3;
          const sizeValue = this.webmHeader[sizePos];
          
          console.log(`📊 DocTypeサイズ: 0x${sizeValue.toString(16).padStart(2, '0')} (${sizeValue} bytes)`);
          
          // サイズに応じてDocTypeテキストを読み取り
          let docTypeLength = 0;
          let actualDataPos = dataPos;
          
          if (sizeValue === 0x88) {
            // 8バイト = "matroska"
            docTypeLength = 8;
          } else if (sizeValue === 0x84) {
            // 4バイト = "webm"
            docTypeLength = 4;
          } else if ((sizeValue & 0x80) === 0x80) {
            // 可変長サイズの場合
            docTypeLength = sizeValue & 0x7F;
          } else {
            console.log(`❓ 不明なサイズ形式: 0x${sizeValue.toString(16)}`);
            continue;
          }
          
          if (docTypeLength > 0 && actualDataPos + docTypeLength <= this.webmHeader.length) {
            const originalText = Array.from(this.webmHeader.slice(actualDataPos, actualDataPos + docTypeLength))
              .map(b => String.fromCharCode(b)).join('');
            
            console.log(`📝 現在のDocType: "${originalText}" (${docTypeLength}文字)`);
            
            if (originalText === 'matroska') {
              console.log(`🔧 DocType修正開始: "${originalText}" → "webm"`);
              
              // サイズを8から4に変更
              this.webmHeader[sizePos] = 0x84; // 4バイト
              
              // "webm"を書き込み (4バイト)
              this.webmHeader[actualDataPos] = 0x77; // 'w'
              this.webmHeader[actualDataPos + 1] = 0x65; // 'e'
              this.webmHeader[actualDataPos + 2] = 0x62; // 'b'
              this.webmHeader[actualDataPos + 3] = 0x6D; // 'm'
              
              // 残りのバイトを後ろにシフト（4バイト短縮）
              const newLength = this.webmHeader.length - 4;
              const newHeader = new Uint8Array(newLength);
              
              // 修正前部分をコピー
              newHeader.set(this.webmHeader.slice(0, actualDataPos + 4), 0);
              
              // 修正後部分をコピー（8バイト先から4バイト先にシフト）
              if (actualDataPos + 8 < this.webmHeader.length) {
                newHeader.set(this.webmHeader.slice(actualDataPos + 8), actualDataPos + 4);
              }
              
              this.webmHeader = newHeader;
              
              console.log(`✅ DocType修正完了: ヘッダーサイズ ${newLength} bytes`);
              console.log(`🔍 修正後ヘッダー: ${Array.from(this.webmHeader.slice(0, 64)).map(b => b.toString(16).padStart(2, '0')).join(' ').toUpperCase()}`);
              return;
            } else if (originalText === 'webm') {
              console.log(`✅ DocTypeは既にwebmです`);
              return;
            }
          }
        }
      }
      
      console.log(`💭 DocType修正スキップ: DocType要素が見つかりません`);
      
    } catch (error) {
      console.error('❌ DocType修正エラー:', error);
    }
  }
  
  /**
   * 2チャンク目以降用の最小限WebMヘッダーを作成
   */
  private createMinimalWebMHeader(): void {
    try {
      // 最小限のWebMヘッダー（EBML + Segment開始のみ）
      // DocTypeを"webm"に修正してWeb標準プレイヤーでの再生を可能にする
      const minimalHeader = new Uint8Array([
        // EBML Header
        0x1A, 0x45, 0xDF, 0xA3, // EBML
        0x9B, // Size (可変長) - webmに変更したため1バイト減
        0x42, 0x86, 0x81, 0x01, // EBMLVersion = 1
        0x42, 0xF7, 0x81, 0x01, // EBMLReadVersion = 1  
        0x42, 0xF2, 0x81, 0x04, // EBMLMaxIDLength = 4
        0x42, 0xF3, 0x81, 0x08, // EBMLMaxSizeLength = 8
        0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6D, // DocType = "webm" (4文字)
        0x42, 0x87, 0x81, 0x02, // DocTypeVersion = 2
        0x42, 0x85, 0x81, 0x02, // DocTypeReadVersion = 2
        
        // Segment start
        0x18, 0x53, 0x80, 0x67, // Segment
        0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF // Unknown size (streaming)
      ]);
      
      this.minimalWebMHeader = minimalHeader;
      console.log(`🔧 最小限WebMヘッダー作成: ${this.minimalWebMHeader.length} bytes`);
      console.log(`📊 最小ヘッダー: ${Array.from(this.minimalWebMHeader).map(b => b.toString(16).padStart(2, '0')).join(' ').toUpperCase()}`);
      
    } catch (error) {
      console.error('❌ 最小限WebMヘッダー作成エラー:', error);
      this.minimalWebMHeader = null;
    }
  }
  
  /**
   * WebMタイムスタンプを0にリセット（2チャンク目以降用）
   */
  private adjustClusterTimestamp(chunkData: Uint8Array, chunkIndex: number): Uint8Array {
    try {
      console.log(`🕒 タイムスタンプリセット開始: チャンク${chunkIndex + 1}`);
      
      // 新しいチャンクデータをコピー
      const adjustedData = new Uint8Array(chunkData);
      let adjustmentCount = 0;
      
      // Cluster要素（0x1F43B675）を探してTimecodeを0にリセット
      for (let i = 0; i < adjustedData.length - 8; i++) {
        if (adjustedData[i] === 0x1F && adjustedData[i + 1] === 0x43 && 
            adjustedData[i + 2] === 0xB6 && adjustedData[i + 3] === 0x75) {
          
          console.log(`🎯 Cluster要素発見 (位置: ${i})`);
          
          // Cluster内のTimecode要素（0xE7）を探してリセット
          for (let j = i + 8; j < Math.min(i + 64, adjustedData.length - 4); j++) {
            if (adjustedData[j] === 0xE7) {
              console.log(`🎯 Timecode要素発見 (位置: ${j}) - 0にリセット`);
              
              // Timecodeの値を0にリセット
              const sizePos = j + 1;
              const dataPos = j + 2;
              
              if (dataPos + 3 < adjustedData.length) {
                // タイムコードサイズ: 通常1〜4バイト
                const originalSize = adjustedData[sizePos];
                console.log(`📊 元のTimecodeサイズ: ${originalSize} bytes`);
                
                // タイムコードを0にリセット（1バイトで十分）
                adjustedData[sizePos] = 0x81; // サイズ1バイト（0x80 | 1）
                adjustedData[dataPos] = 0x00; // タイムコード値 = 0
                
                // 残りの古いデータをクリア
                for (let k = 1; k < originalSize && (dataPos + k) < adjustedData.length; k++) {
                  adjustedData[dataPos + k] = 0x00;
                }
                
                adjustmentCount++;
                console.log(`✅ Clusterタイムコードリセット完了`);
              }
              break;
            }
          }
        }
      }
      
      // SimpleBlock要素（0xA3）のタイムスタンプもリセット
      for (let i = 0; i < adjustedData.length - 8; i++) {
        if (adjustedData[i] === 0xA3) {
          console.log(`🎯 SimpleBlock要素発見 (位置: ${i})`);
          
          // SimpleBlockの構造: ID(1) + Size(1-8) + TrackNumber(1-8) + Timecode(2) + Flags(1) + Data
          const sizePos = i + 1;
          let dataSizeBytes = 1;
          
          // サイズフィールドの長さを特定
          if ((adjustedData[sizePos] & 0x80) === 0) {
            // 可変長サイズの場合は複雑だが、簡易的に処理
            dataSizeBytes = 1;
          }
          
          const trackNumPos = sizePos + dataSizeBytes;
          let trackNumBytes = 1;
          
          // TrackNumber長さを特定（簡易版）
          if ((adjustedData[trackNumPos] & 0x80) === 0) {
            trackNumBytes = 1;
          }
          
          const timecodePos = trackNumPos + trackNumBytes;
          
          // SimpleBlockのタイムコードは2バイト（符号付き16bit）
          if (timecodePos + 1 < adjustedData.length) {
            const originalTimecode = (adjustedData[timecodePos] << 8) | adjustedData[timecodePos + 1];
            console.log(`📊 元のSimpleBlockタイムコード: ${originalTimecode}`);
            
            // タイムコードを0にリセット
            adjustedData[timecodePos] = 0x00;
            adjustedData[timecodePos + 1] = 0x00;
            
            adjustmentCount++;
            console.log(`✅ SimpleBlockタイムコードリセット完了`);
          }
        }
      }
      
      console.log(`✅ タイムスタンプリセット完了: ${adjustmentCount}個の要素を調整`);
      return adjustedData;
      
    } catch (error) {
      console.error('❌ タイムスタンプリセットエラー:', error);
      return chunkData;
    }
  }
  
  /**
   * 可変長整数エンコード（WebM用）
   */
  private encodeVariableInt(value: number): Uint8Array {
    if (value < 0xFF) {
      return new Uint8Array([value]);
    } else if (value < 0xFFFF) {
      return new Uint8Array([0x40 | (value >> 8), value & 0xFF]);
    } else if (value < 0xFFFFFF) {
      return new Uint8Array([0x20 | (value >> 16), (value >> 8) & 0xFF, value & 0xFF]);
    } else {
      return new Uint8Array([0x10 | (value >> 24), (value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF]);
    }
  }
  
  /**
   * WebMヘッダーの終端を検出
   */
  private findWebMHeaderEnd(data: Uint8Array): number {
    try {
      // WebMのメタデータ部分の終了を示すCluster要素を探す
      // Cluster ID: 0x1F43B675
      for (let i = 0; i < Math.min(data.length - 8, 4096); i++) {
        if (data[i] === 0x1F && data[i + 1] === 0x43 && 
            data[i + 2] === 0xB6 && data[i + 3] === 0x75) {
          console.log(`🔍 Cluster要素検出 (位置: ${i}) - ヘッダー終端と判定`);
          return i;
        }
      }
      
      // Cluster要素が見つからない場合は、より保守的な範囲を返す
      return 0; // 検出失敗
    } catch (error) {
      console.error('WebMヘッダー終端検出エラー:', error);
      return 0;
    }
  }
  
  /**
   * WebMヘッダー付きの完全チャンクファイルを生成
   */
  async generateTrueDifferentialChunk(forceSave: boolean = false): Promise<TrueDifferentialResult | null> {
    try {
      // 未処理のチャンクがあるかチェック
      if (this.chunkCounter >= this.allChunks.length) {
        console.log('📝 新しいMediaRecorderチャンクなし - スキップ');
        return null;
      }
      
      // 最新の未処理チャンクを取得
      const currentChunkIndex = this.chunkCounter;
      const mediaRecorderChunk = this.allChunks[currentChunkIndex];
      
      if (!mediaRecorderChunk) {
        console.log('📝 MediaRecorderチャンクが存在しません - スキップ');
        return null;
      }
      
      console.log(`🔍 チャンク処理開始: インデックス${currentChunkIndex}`);
      console.log(`📊 元チャンクサイズ: ${mediaRecorderChunk.size} bytes`);
      
      // チャンクの内容を確認
      const chunkArray = new Uint8Array(await mediaRecorderChunk.arrayBuffer());
      const hasWebMHeader = chunkArray.length >= 4 && 
                           chunkArray[0] === 0x1A && chunkArray[1] === 0x45 && 
                           chunkArray[2] === 0xDF && chunkArray[3] === 0xA3;
      
      console.log(`🔍 WebMヘッダー検出: ${hasWebMHeader ? 'あり' : 'なし'}`);
      console.log(`📊 データ先頭: ${Array.from(chunkArray.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ').toUpperCase()}`);
      
      let finalChunkBlob: Blob;
      
      if (hasWebMHeader || currentChunkIndex === 0) {
        // 1チャンク目 または すでにヘッダーがある場合はそのまま使用
        finalChunkBlob = mediaRecorderChunk;
        console.log(`✅ 完全WebMファイルとして処理: ${finalChunkBlob.size} bytes`);
      } else {
        // 2チャンク目以降でヘッダーがない場合: 最小限のヘッダーを付加
        if (this.minimalWebMHeader) {
          // Cluster要素を探して適切な位置にタイムスタンプを調整
          const adjustedChunkData = this.adjustClusterTimestamp(chunkArray, currentChunkIndex);
          const headerAndData = new Uint8Array(this.minimalWebMHeader.length + adjustedChunkData.length);
          headerAndData.set(this.minimalWebMHeader, 0);
          headerAndData.set(adjustedChunkData, this.minimalWebMHeader.length);
          finalChunkBlob = new Blob([headerAndData], { type: 'audio/webm' });
          console.log(`🔧 最小限WebMヘッダー+調整済みデータ: ヘッダー${this.minimalWebMHeader.length}bytes + データ${adjustedChunkData.length}bytes = ${finalChunkBlob.size}bytes`);
        } else if (this.webmHeader) {
          // フォールバック: 元のヘッダーを使用
          const headerAndData = new Uint8Array(this.webmHeader.length + chunkArray.length);
          headerAndData.set(this.webmHeader, 0);
          headerAndData.set(chunkArray, this.webmHeader.length);
          finalChunkBlob = new Blob([headerAndData], { type: 'audio/webm' });
          console.log(`🔧 フォールバック: 元WebMヘッダー付加: ヘッダー${this.webmHeader.length}bytes + データ${chunkArray.length}bytes = ${finalChunkBlob.size}bytes`);
        } else {
          // ヘッダーが利用できない場合はそのまま（フォールバック）
          finalChunkBlob = mediaRecorderChunk;
          console.log(`⚠️ WebMヘッダー利用不可 - 元データを使用: ${finalChunkBlob.size} bytes`);
        }
      }
      
      // 時間計算
      const chunkStartTime = currentChunkIndex * (this.chunkIntervalMs / 1000);
      const elapsedTime = (Date.now() - this.recordingStartTime) / 1000;
      const actualDuration = Math.min(this.chunkIntervalMs / 1000, elapsedTime - chunkStartTime);
      
      this.chunkCounter++;
      
      console.log(`✅ チャンクファイル生成完了: チャンク${this.chunkCounter} (独立再生可能)`);
      console.log(`📊 時間範囲: ${chunkStartTime.toFixed(1)}s - ${(chunkStartTime + actualDuration).toFixed(1)}s (長さ: ${actualDuration.toFixed(1)}s)`);
      console.log(`📊 最終ファイルサイズ: ${finalChunkBlob.size} bytes`);
      
      // 処理済みサイズを更新（実際にはインデックスベースで管理）
      this.processedDataSize = this.allChunks.slice(0, this.chunkCounter).reduce((sum, chunk) => sum + chunk.size, 0);
      
      // ファイル保存機能
      let savedFilePath: string | undefined;
      if (this.config.enableFileGeneration && this.config.tempFolderPath) {
        try {
          savedFilePath = await this.saveChunkToFile(finalChunkBlob, this.chunkCounter, chunkStartTime, actualDuration);
          console.log(`✅ チャンクファイル保存完了: ${savedFilePath}`);
        } catch (error) {
          console.error(`❌ チャンクファイル保存エラー:`, error);
          this.handleError(error instanceof Error ? error : new Error(String(error)));
        }
      }
      
      const result: TrueDifferentialResult = {
        chunkBlob: finalChunkBlob,
        chunkNumber: this.chunkCounter,
        startTime: chunkStartTime,
        duration: actualDuration,
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
    this.minimalWebMHeader = null;
    this.isInitialized = false;
    this.savedChunkFiles = [];
    this.lastChunkGenerationTime = 0;
    this.continuousData = [];
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
    this.minimalWebMHeader = null;
    this.isInitialized = false;
    this.savedChunkFiles = [];
    this.lastChunkGenerationTime = 0;
    this.continuousData = [];
    
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
   * 時間ベースのチャンク生成（バッファベース版）
   */
  private async generateTimedChunk(): Promise<TrueDifferentialResult | null> {
    const now = Date.now();
    const elapsedSinceLastGeneration = now - this.lastChunkGenerationTime;
    
    // 時間チェック
    if (elapsedSinceLastGeneration < this.chunkIntervalMs) {
      console.log(`⏰ チャンク生成間隔未達成: ${elapsedSinceLastGeneration}ms < ${this.chunkIntervalMs}ms`);
      return null;
    }
    
    // 連続データバッファから20秒分のチャンクを作成
    if (this.continuousData.length === 0) {
      console.log(`📝 連続データバッファが空 - チャンク生成スキップ`);
      return null;
    }
    
    console.log(`⏰⏰⏰ 時間ベースチャンク生成実行: ${elapsedSinceLastGeneration}ms経過`);
    
    const result = await this.generateBufferBasedChunk();
    if (result) {
      this.lastChunkGenerationTime = now;
      console.log(`✅ 時間ベースチャンク生成完了: チャンク${result.chunkNumber}`);
    }
    
    return result;
  }
  
  /**
   * バッファベースのチャンク生成
   */
  private async generateBufferBasedChunk(): Promise<TrueDifferentialResult | null> {
    try {
      if (this.continuousData.length === 0) {
        console.log('📝 連続データバッファが空 - スキップ');
        return null;
      }
      
      // 全ての連続データを結合して一つの大きなBlobを作成
      const combinedBlob = new Blob(this.continuousData, { type: 'audio/webm' });
      console.log(`🔗 連続データ結合: ${this.continuousData.length}個のチャンク → ${combinedBlob.size} bytes`);
      
      // 結合されたデータを処理済みチャンクとして追加
      this.allChunks.push(combinedBlob);
      
      // 現在のチャンクインデックス
      const currentChunkIndex = this.chunkCounter;
      
      // 時間計算
      const chunkStartTime = currentChunkIndex * (this.chunkIntervalMs / 1000);
      const actualDuration = this.chunkIntervalMs / 1000; // 20秒固定
      
      this.chunkCounter++;
      
      let finalChunkBlob: Blob;
      
      if (currentChunkIndex === 0) {
        // 1チャンク目はそのまま使用（ヘッダー付き）
        finalChunkBlob = combinedBlob;
        console.log(`✅ 1チャンク目として処理: ${finalChunkBlob.size} bytes`);
      } else {
        // 2チャンク目以降は修正済みの完全ヘッダーを使用（最小限ヘッダーではなく）
        if (this.webmHeader) {
          // 修正済み完全ヘッダー + データの結合
          const headerAndData = new Uint8Array(this.webmHeader.length + combinedBlob.size);
          headerAndData.set(this.webmHeader, 0);
          
          const dataArray = new Uint8Array(await combinedBlob.arrayBuffer());
          headerAndData.set(dataArray, this.webmHeader.length);
          
          finalChunkBlob = new Blob([headerAndData], { type: 'audio/webm' });
          console.log(`🔧 修正済み完全ヘッダー付きチャンク: ヘッダー${this.webmHeader.length}bytes + データ${combinedBlob.size}bytes = ${finalChunkBlob.size}bytes`);
        } else if (this.minimalWebMHeader) {
          // フォールバック: 最小限ヘッダー使用
          const headerAndData = new Uint8Array(this.minimalWebMHeader.length + combinedBlob.size);
          headerAndData.set(this.minimalWebMHeader, 0);
          
          const dataArray = new Uint8Array(await combinedBlob.arrayBuffer());
          headerAndData.set(dataArray, this.minimalWebMHeader.length);
          
          finalChunkBlob = new Blob([headerAndData], { type: 'audio/webm' });
          console.log(`🔧 最小限ヘッダー付きチャンク: ヘッダー${this.minimalWebMHeader.length}bytes + データ${combinedBlob.size}bytes = ${finalChunkBlob.size}bytes`);
        } else {
          // 最終フォールバック
          finalChunkBlob = combinedBlob;
          console.log(`⚠️ ヘッダーなしでフォールバック: ${finalChunkBlob.size} bytes`);
        }
      }
      
      console.log(`✅ バッファベースチャンク生成完了: チャンク${this.chunkCounter}`);
      console.log(`📊 時間範囲: ${chunkStartTime.toFixed(1)}s - ${(chunkStartTime + actualDuration).toFixed(1)}s`);
      console.log(`📊 最終ファイルサイズ: ${finalChunkBlob.size} bytes`);
      
      // バッファをクリア
      this.continuousData = [];
      
      // ファイル保存機能
      let savedFilePath: string | undefined;
      if (this.config.enableFileGeneration && this.config.tempFolderPath) {
        try {
          savedFilePath = await this.saveChunkToFile(finalChunkBlob, this.chunkCounter, chunkStartTime, actualDuration);
          console.log(`✅ チャンクファイル保存完了: ${savedFilePath}`);
        } catch (error) {
          console.error(`❌ チャンクファイル保存エラー:`, error);
          this.handleError(error instanceof Error ? error : new Error(String(error)));
        }
      }
      
      const result: TrueDifferentialResult = {
        chunkBlob: finalChunkBlob,
        chunkNumber: this.chunkCounter,
        startTime: chunkStartTime,
        duration: actualDuration,
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
      console.error('❌ バッファベースチャンク生成エラー:', error);
      throw error;
    }
  }
  
  /**
   * 最終チャンク生成（録音停止時）
   */
  private async generateFinalChunk(): Promise<TrueDifferentialResult | null> {
    console.log('🏁 最終チャンク生成中...');
    
    // 残っているバッファデータがあれば処理
    if (this.continuousData.length > 0) {
      console.log(`🏁 残りのバッファデータを処理: ${this.continuousData.length}個のチャンク`);
      const result = await this.generateBufferBasedChunk();
      if (result) {
        console.log(`✅ 最終チャンク生成完了: チャンク${result.chunkNumber}`);
        return result;
      }
    }
    
    console.log('💭 最終チャンク: 新しいデータなし');
    return null;
  }
  
  /**
   * 未処理データがあるかチェック
   */
  private hasUnprocessedData(): boolean {
    return this.continuousData.length > 0;
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