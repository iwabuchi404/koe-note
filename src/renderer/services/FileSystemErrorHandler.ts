/**
 * FileSystemErrorHandler - ファイルシステムエラー処理
 * 
 * 容量不足、権限エラー、一時的I/Oエラーを検出・回復する
 */

export interface FileSystemError {
  type: 'disk_full' | 'permission_denied' | 'io_error' | 'unknown';
  originalError: Error;
  filePath?: string;
  timestamp: number;
  recoverable: boolean;
  suggestedAction?: string;
}

export interface DiskSpaceInfo {
  free: number;
  total: number;
  used: number;
  percentage: number;
}

export class FileSystemErrorHandler {
  private readonly MIN_FREE_SPACE_MB = 100; // 最小空き容量（MB）
  private readonly RETRY_DELAY_MS = 1000; // リトライ遅延時間
  private readonly MAX_RETRY_COUNT = 3; // 最大リトライ回数
  
  private errorLog: FileSystemError[] = [];
  private onErrorCallbacks: ((error: FileSystemError) => void)[] = [];
  
  constructor() {
    console.log('FileSystemErrorHandler初期化完了');
  }
  
  /**
   * ファイルシステムエラーを分類・処理
   */
  handleFileSystemError(error: Error, filePath?: string): FileSystemError {
    const fsError: FileSystemError = {
      type: this.classifyError(error),
      originalError: error,
      filePath,
      timestamp: Date.now(),
      recoverable: false,
      suggestedAction: undefined
    };
    
    // エラータイプ別の処理
    switch (fsError.type) {
      case 'disk_full':
        fsError.recoverable = false;
        fsError.suggestedAction = 'ディスク容量を確保してください';
        break;
        
      case 'permission_denied':
        fsError.recoverable = false;
        fsError.suggestedAction = 'ファイル/フォルダの権限を確認してください';
        break;
        
      case 'io_error':
        fsError.recoverable = true;
        fsError.suggestedAction = '一時的なエラーです。しばらく待ってからやり直してください';
        break;
        
      default:
        fsError.recoverable = false;
        fsError.suggestedAction = 'システム管理者に連絡してください';
    }
    
    // エラーログに記録
    this.errorLog.push(fsError);
    console.error(`ファイルシステムエラー [${fsError.type}]:`, {
      message: error.message,
      filePath,
      recoverable: fsError.recoverable,
      action: fsError.suggestedAction
    });
    
    // コールバック実行
    this.notifyError(fsError);
    
    return fsError;
  }
  
  /**
   * エラー分類
   */
  private classifyError(error: Error): FileSystemError['type'] {
    const message = error.message.toLowerCase();
    
    // 容量不足
    if (message.includes('no space') || 
        message.includes('disk full') || 
        message.includes('enospc')) {
      return 'disk_full';
    }
    
    // 権限エラー
    if (message.includes('permission denied') || 
        message.includes('access denied') || 
        message.includes('eacces') || 
        message.includes('eperm')) {
      return 'permission_denied';
    }
    
    // I/Oエラー
    if (message.includes('eio') || 
        message.includes('file is busy') || 
        message.includes('resource temporarily unavailable') ||
        message.includes('eagain')) {
      return 'io_error';
    }
    
    return 'unknown';
  }
  
  /**
   * ディスク容量チェック
   */
  async checkDiskSpace(filePath: string): Promise<DiskSpaceInfo> {
    try {
      const stats = await window.electronAPI.getDiskSpace(filePath);
      return {
        free: stats.free,
        total: stats.total,
        used: stats.total - stats.free,
        percentage: ((stats.total - stats.free) / stats.total) * 100
      };
    } catch (error) {
      console.error('ディスク容量取得エラー:', error);
      throw error;
    }
  }
  
  /**
   * 容量不足チェック
   */
  async checkDiskSpaceAvailable(filePath: string): Promise<boolean> {
    try {
      const diskInfo = await this.checkDiskSpace(filePath);
      const freeMB = diskInfo.free / (1024 * 1024);
      
      console.log(`ディスク容量チェック: ${freeMB.toFixed(1)}MB 空き容量`);
      
      return freeMB >= this.MIN_FREE_SPACE_MB;
    } catch (error) {
      console.error('容量チェック失敗:', error);
      return false;
    }
  }
  
  /**
   * リトライ可能操作の実行
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    filePath?: string,
    retryCount: number = 0
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const fsError = this.handleFileSystemError(error as Error, filePath);
      
      // リトライ可能かつ上限未満の場合はリトライ
      if (fsError.recoverable && retryCount < this.MAX_RETRY_COUNT) {
        console.log(`操作リトライ中 (${retryCount + 1}/${this.MAX_RETRY_COUNT}): ${filePath || '不明'}`);
        
        // 遅延後にリトライ
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS * (retryCount + 1)));
        return this.executeWithRetry(operation, filePath, retryCount + 1);
      }
      
      // リトライ不可能または上限到達
      throw fsError;
    }
  }
  
  /**
   * 安全なファイル書き込み
   */
  async safeFileWrite(filePath: string, data: ArrayBuffer): Promise<void> {
    // 容量チェック
    const hasSpace = await this.checkDiskSpaceAvailable(filePath);
    if (!hasSpace) {
      throw this.handleFileSystemError(
        new Error('ディスク容量不足: 最低100MB必要です'),
        filePath
      );
    }
    
    // リトライ付きファイル書き込み
    await this.executeWithRetry(async () => {
      await window.electronAPI.saveFile(data, filePath);
    }, filePath);
  }
  
  /**
   * 安全なファイル読み込み
   */
  async safeFileRead(filePath: string): Promise<Buffer> {
    return this.executeWithRetry(async () => {
      return await window.electronAPI.readFile(filePath);
    }, filePath);
  }
  
  /**
   * エラー通知
   */
  private notifyError(error: FileSystemError): void {
    this.onErrorCallbacks.forEach(callback => {
      try {
        callback(error);
      } catch (callbackError) {
        console.error('FileSystem error callback実行エラー:', callbackError);
      }
    });
  }
  
  /**
   * エラーリスナー登録
   */
  onError(callback: (error: FileSystemError) => void): void {
    this.onErrorCallbacks.push(callback);
  }
  
  /**
   * エラー統計取得
   */
  getErrorStats(): {
    total: number;
    byType: Record<FileSystemError['type'], number>;
    recentErrors: FileSystemError[];
  } {
    const byType: Record<FileSystemError['type'], number> = {
      disk_full: 0,
      permission_denied: 0,
      io_error: 0,
      unknown: 0
    };
    
    for (const error of this.errorLog) {
      byType[error.type]++;
    }
    
    // 最新10件のエラー
    const recentErrors = this.errorLog.slice(-10);
    
    return {
      total: this.errorLog.length,
      byType,
      recentErrors
    };
  }
  
  /**
   * エラーログクリア
   */
  clearErrorLog(): void {
    this.errorLog = [];
    console.log('ファイルシステムエラーログをクリアしました');
  }
  
  /**
   * クリーンアップ
   */
  cleanup(): void {
    this.onErrorCallbacks = [];
    this.errorLog = [];
    console.log('FileSystemErrorHandler クリーンアップ完了');
  }
}