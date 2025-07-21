/**
 * ChunkFileWatcher - チャンクファイル監視システム
 * 
 * テンポラリフォルダの新しいチャンクファイルを検出し、
 * 順次処理のためのキューイング機能を提供
 */

// 型定義のインポート
import { ElectronAPI } from '../../preload/preload';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export interface ChunkFileInfo {
  filename: string;
  fullPath: string;
  sequenceNumber: number;
  timestamp: number;
  size: number;
  isReady: boolean; // ファイル書き込み完了フラグ
}

export interface ChunkWatcherStats {
  totalDetected: number;
  totalProcessed: number;
  pendingCount: number;
  isWatching: boolean;
}

export class ChunkFileWatcher {
  private watchFolder: string | null = null;
  private isWatching: boolean = false;
  private detectedFiles: Map<string, ChunkFileInfo> = new Map();
  private processedFiles: Set<string> = new Set();
  private watchInterval: NodeJS.Timeout | null = null;
  private onNewFileCallbacks: ((fileInfo: ChunkFileInfo) => void)[] = [];
  private realtimeChunkCounter: number = 0; // リアルタイムチャンクのカウンター
  
  constructor() {
    // Constructor
  }

  /**
   * フォルダ監視を開始
   */
  startWatching(folderPath: string): void {
    if (this.isWatching) {
      console.warn('既にファイル監視中です');
      return;
    }

    this.watchFolder = folderPath;
    this.isWatching = true;
    this.detectedFiles.clear();
    this.processedFiles.clear();
    this.realtimeChunkCounter = 0; // カウンターをリセット

    console.log(`チャンクファイル監視開始: ${folderPath}`);

    // 1秒間隔でフォルダをチェック
    this.watchInterval = setInterval(async () => {
      try {
        await this.checkForNewFiles();
      } catch (error) {
        console.error('ファイル監視エラー:', error);
      }
    }, 1000);
  }

  /**
   * フォルダ監視を停止
   */
  stopWatching(): void {
    if (!this.isWatching) return;

    console.log('チャンクファイル監視停止');
    
    this.isWatching = false;
    
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
      this.watchInterval = null;
    }

    this.watchFolder = null;
  }

  /**
   * 新しいファイルをチェック
   */
  private async checkForNewFiles(): Promise<void> {
    if (!this.watchFolder) return;

    try {
      // フォルダ内のファイル一覧を取得
      const files = await window.electronAPI.getFileList(this.watchFolder);
      console.log(`📁 ファイル監視チェック: ${this.watchFolder} - ${files.length}個のファイル検出`);
      
      for (const file of files) {
        // チャンクファイルかチェック
        if (this.isChunkFile(file.filename)) {
          const existingFile = this.detectedFiles.get(file.filename);
          
          // 新しいファイルまたはサイズが変更されたファイル
          if (!existingFile || existingFile.size !== file.size) {
            const fileInfo = this.parseChunkFilename(file.filename, file.filepath);
            
            if (fileInfo) {
              // ファイルサイズ安定性チェック
              const stabilityResult = await this.checkFileStability(file.filepath);
              
              if (stabilityResult.isReady) {
                fileInfo.isReady = true;
                fileInfo.size = stabilityResult.size; // ファイルサイズを正しく設定
                this.detectedFiles.set(file.filename, fileInfo);
                
                const actionType = existingFile ? '更新' : '検出';
                console.log(`チャンクファイル${actionType}: ${file.filename} (${fileInfo.size} bytes)`);
                
                // コールバック実行
                this.onNewFileCallbacks.forEach(callback => callback(fileInfo));
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('ファイルリスト取得エラー:', error);
    }
  }

  /**
   * チャンクファイル判定
   */
  private isChunkFile(filename: string): boolean {
    // 従来のchunk_形式に加えて、realtime_chunk.webmも対応
    return /^chunk_\d{5}_\d+\.webm$/.test(filename) || filename === 'realtime_chunk.webm';
  }

  /**
   * チャンクファイル名をパース
   */
  private parseChunkFilename(filename: string, fullPath: string): ChunkFileInfo | null {
    const match = filename.match(/^chunk_(\d{5})_(\d+)\.webm$/);
    
    if (match) {
      return {
        filename,
        fullPath,
        sequenceNumber: parseInt(match[1], 10),
        timestamp: parseInt(match[2], 10),
        size: 0, // 後で設定
        isReady: false
      };
    }
    
    // realtime_chunk.webmの場合
    if (filename === 'realtime_chunk.webm') {
      // リアルタイムチャンクは1から始まる連番を使用
      this.realtimeChunkCounter++;
      return {
        filename,
        fullPath,
        sequenceNumber: this.realtimeChunkCounter,
        timestamp: Date.now(),
        size: 0, // 後で設定
        isReady: false
      };
    }
    
    return null;
  }

  /**
   * ファイル安定性チェック（書き込み完了判定）
   */
  private async checkFileStability(filePath: string): Promise<{isReady: boolean, size: number}> {
    try {
      // 簡易的な安定性チェック：ファイルサイズを2回チェック
      const size1 = await this.getFileSize(filePath);
      await new Promise(resolve => setTimeout(resolve, 500)); // 500ms待機
      const size2 = await this.getFileSize(filePath);
      
      const isStable = size1 === size2 && size1 > 1000; // サイズが安定し、1KB以上
      
      console.log(`ファイル安定性チェック: ${filePath}`);
      console.log(`  - 1回目サイズ: ${size1} bytes`);
      console.log(`  - 2回目サイズ: ${size2} bytes`);
      console.log(`  - 安定性判定: ${isStable ? '安定' : '不安定'}`);
      
      return {
        isReady: isStable,
        size: size2 // 最新のサイズを返す
      };
    } catch (error) {
      console.error(`ファイル安定性チェックエラー: ${filePath}`, error);
      return {
        isReady: false,
        size: 0
      };
    }
  }

  /**
   * ファイルサイズ取得
   */
  private async getFileSize(filePath: string): Promise<number> {
    try {
      // ElectronAPIでファイルサイズを取得（実装が必要）
      return await window.electronAPI.getFileSize(filePath);
    } catch (error) {
      return 0;
    }
  }

  /**
   * 新ファイル検出コールバック追加
   */
  onNewFile(callback: (fileInfo: ChunkFileInfo) => void): void {
    this.onNewFileCallbacks.push(callback);
  }

  /**
   * ファイルを処理済みとしてマーク
   */
  markAsProcessed(filename: string): void {
    this.processedFiles.add(filename);
    console.log(`ファイル処理完了: ${filename}`);
  }

  /**
   * 待機中のファイル一覧を取得（処理順序付き）
   */
  getPendingFiles(): ChunkFileInfo[] {
    const pendingFiles = Array.from(this.detectedFiles.values())
      .filter(file => !this.processedFiles.has(file.filename))
      .sort((a, b) => a.sequenceNumber - b.sequenceNumber); // シーケンス番号順

    return pendingFiles;
  }

  /**
   * 統計情報を取得
   */
  getStats(): ChunkWatcherStats {
    return {
      totalDetected: this.detectedFiles.size,
      totalProcessed: this.processedFiles.size,
      pendingCount: this.getPendingFiles().length,
      isWatching: this.isWatching
    };
  }

  /**
   * クリーンアップ
   */
  cleanup(): void {
    this.stopWatching();
    this.detectedFiles.clear();
    this.processedFiles.clear();
    this.onNewFileCallbacks = [];
  }
}