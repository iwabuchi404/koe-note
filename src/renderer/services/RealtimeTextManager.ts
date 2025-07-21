/**
 * RealtimeTextManager - リアルタイムテキスト管理システム
 * 
 * 文字起こし結果の統合・メモリバッファ管理・ファイル書き込みを担当
 */

import { TranscriptionResult, TranscriptionSegment } from '../../preload/preload';
import { ChunkFileInfo } from './ChunkFileWatcher';
import { FileSystemErrorHandler, FileSystemError } from './FileSystemErrorHandler';

export interface RealtimeTextSegment {
  chunkSequence: number;
  chunkFilename: string;
  segmentIndex: number;
  start: number;
  end: number;
  text: string;
  confidence?: number;
  isProcessed: boolean;
  addedAt: number;
}

export interface RealtimeTextMetadata {
  status: 'transcribing' | 'completed' | 'paused' | 'error';
  processedChunks: number;
  totalChunks: number;
  startTime: number;
  lastUpdateTime: number;
  estimatedDuration: number;
  averageProcessingTime: number;
  errorCount: number;
}

export interface RealtimeTextData {
  metadata: RealtimeTextMetadata;
  segments: RealtimeTextSegment[];
  fullText: string;
  isModified: boolean;
}

export interface TextFileConfig {
  writeInterval: number; // ファイル書き込み間隔（ms）
  bufferSize: number; // メモリバッファサイズ制限
  enableAutoSave: boolean;
  fileFormat: 'detailed' | 'simple';
}

export class RealtimeTextManager {
  private textBuffer: RealtimeTextSegment[] = [];
  private metadata: RealtimeTextMetadata;
  private lastRealtimeResult: TranscriptionResult | null = null; // 前回のリアルタイム結果
  private isModified: boolean = false;
  private writeInterval: NodeJS.Timeout | null = null;
  private currentTextFilePath: string | null = null;
  private fileSystemErrorHandler: FileSystemErrorHandler;
  
  private config: TextFileConfig = {
    writeInterval: 3000, // 3秒間隔
    bufferSize: 1000, // 最大1000セグメント
    enableAutoSave: true,
    fileFormat: 'detailed'
  };
  
  // コールバック関数
  private onTextUpdateCallbacks: ((data: RealtimeTextData) => void)[] = [];
  private onFileWriteCallbacks: ((filePath: string) => void)[] = [];
  private onErrorCallbacks: ((error: Error) => void)[] = [];
  
  constructor(config?: Partial<TextFileConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
    
    this.metadata = {
      status: 'transcribing',
      processedChunks: 0,
      totalChunks: 0,
      startTime: Date.now(),
      lastUpdateTime: Date.now(),
      estimatedDuration: 0,
      averageProcessingTime: 0,
      errorCount: 0
    };
    
    // ファイルシステムエラーハンドラー初期化
    this.fileSystemErrorHandler = new FileSystemErrorHandler();
    this.fileSystemErrorHandler.onError((error: FileSystemError) => {
      console.error('ファイルシステムエラー検出:', error);
      this.reportError(new Error(`${error.type}: ${error.originalError.message}`));
    });
    
    console.log('RealtimeTextManager初期化完了', this.config);
  }
  
  /**
   * テキスト管理開始
   */
  start(outputFilePath: string): void {
    this.currentTextFilePath = outputFilePath;
    this.metadata.status = 'transcribing';
    this.metadata.startTime = Date.now();
    this.lastRealtimeResult = null; // リアルタイム結果をリセット
    this.textBuffer = []; // バッファをクリア
    
    console.log(`RealtimeTextManager開始: ${outputFilePath}`);
    
    if (this.config.enableAutoSave) {
      this.startAutoSave();
    }
    
    this.notifyTextUpdate();
  }
  
  /**
   * テキスト管理停止
   */
  stop(): void {
    this.metadata.status = 'completed';
    this.stopAutoSave();
    
    // 最終書き込み
    if (this.currentTextFilePath && this.isModified) {
      this.writeToFile();
    }
    
    console.log('RealtimeTextManager停止');
    this.notifyTextUpdate();
  }
  
  /**
   * チャンク文字起こし結果を追加
   */
  addTranscriptionResult(result: TranscriptionResult, chunkInfo: ChunkFileInfo): void {
    console.log(`文字起こし結果追加: ${chunkInfo.filename} (${result.segments.length}セグメント)`);
    
    // realtime_chunk.webmの場合は差分処理（累積データから新しいセグメントのみ抽出）
    if (chunkInfo.filename === 'realtime_chunk.webm') {
      console.log(`📝 リアルタイムファイル処理: 前回結果との差分を抽出 (チャンク${chunkInfo.sequenceNumber})`);
      console.log(`📝 現在の結果詳細: ${result.segments.length}セグメント, 時間範囲: ${result.segments.length > 0 ? result.segments[0].start.toFixed(1) : 0}s～${result.segments.length > 0 ? result.segments[result.segments.length - 1].end.toFixed(1) : 0}s`);
      
      // 新しいセグメントのみを抽出
      const newSegments = this.extractNewSegments(result, this.lastRealtimeResult);
      console.log(`📝 新しいセグメント: ${newSegments.length}個 (全体: ${result.segments.length}個)`);
      
      if (newSegments.length > 0) {
        // 新しいセグメントをRealtimeTextSegmentに変換
        const realtimeSegments: RealtimeTextSegment[] = newSegments.map((segment: TranscriptionSegment, index: number) => ({
          chunkSequence: chunkInfo.sequenceNumber,
          chunkFilename: chunkInfo.filename,
          segmentIndex: this.textBuffer.length + index, // 連続するインデックス
          start: segment.start,
          end: segment.end,
          text: segment.text,
          confidence: segment.words?.[0]?.word ? 0.9 : 0.8, // 仮の信頼度
          isProcessed: true,
          addedAt: Date.now()
        }));
        
        // 新しいセグメントのみをバッファに追加
        this.textBuffer.push(...realtimeSegments);
        console.log(`📝 バッファに追加: ${realtimeSegments.length}セグメント`);
      } else {
        console.log(`📝 新しいセグメントなし - スキップ`);
      }
      
      // 前回の結果を保存
      this.lastRealtimeResult = result;
      
    } else {
      // 通常のチャンクファイルの場合は該当チャンクのみクリア
      this.textBuffer = this.textBuffer.filter(segment => segment.chunkSequence !== chunkInfo.sequenceNumber);
      
      // セグメントをRealtimeTextSegmentに変換
      const realtimeSegments: RealtimeTextSegment[] = result.segments.map((segment: TranscriptionSegment, index: number) => ({
        chunkSequence: chunkInfo.sequenceNumber,
        chunkFilename: chunkInfo.filename,
        segmentIndex: index,
        start: segment.start,
        end: segment.end,
        text: segment.text,
        confidence: segment.words?.[0]?.word ? 0.9 : 0.8, // 仮の信頼度
        isProcessed: true,
        addedAt: Date.now()
      }));
      
      // バッファに追加（時間順にソート）
      this.textBuffer.push(...realtimeSegments);
      this.textBuffer.sort((a, b) => {
        if (a.chunkSequence !== b.chunkSequence) {
          return a.chunkSequence - b.chunkSequence;
        }
        return a.segmentIndex - b.segmentIndex;
      });
    }
    
    // バッファサイズ制限
    if (this.textBuffer.length > this.config.bufferSize) {
      const excess = this.textBuffer.length - this.config.bufferSize;
      this.textBuffer.splice(0, excess);
      console.log(`バッファサイズ制限により${excess}セグメントを削除`);
    }
    
    // メタデータ更新
    if (chunkInfo.filename === 'realtime_chunk.webm') {
      // リアルタイムファイルの場合はsequenceNumberを使用（1から始まる連番）
      this.metadata.processedChunks = chunkInfo.sequenceNumber;
    } else {
      // 通常のチャンクファイルの場合
      this.metadata.processedChunks = Math.max(this.metadata.processedChunks, chunkInfo.sequenceNumber);
    }
    this.metadata.lastUpdateTime = Date.now();
    this.isModified = true;
    
    // 推定残り時間計算
    this.updateEstimatedDuration();
    
    this.notifyTextUpdate();
    
    console.log(`バッファ更新完了: ${this.textBuffer.length}セグメント (チャンク${chunkInfo.sequenceNumber}の処理完了)`);
  }
  
  /**
   * 前回の結果と比較して新しいセグメントのみを抽出
   */
  private extractNewSegments(currentResult: TranscriptionResult, previousResult: TranscriptionResult | null): TranscriptionSegment[] {
    if (!previousResult || previousResult.segments.length === 0) {
      // 前回の結果がない場合は全てのセグメントが新しい
      console.log(`📝 前回結果なし: 全${currentResult.segments.length}セグメントを新規として処理`);
      return currentResult.segments;
    }
    
    // 前回の最後のセグメントの終了時刻を取得
    const lastEndTime = previousResult.segments.length > 0 
      ? previousResult.segments[previousResult.segments.length - 1].end 
      : 0;
    
    console.log(`📝 前回の最終時刻: ${lastEndTime.toFixed(1)}s`);
    
    // 前回の最終時刻より後に開始するセグメントのみを抽出
    const newSegments = currentResult.segments.filter(segment => {
      // 0.5秒のバッファを設けて重複を避ける
      const isNew = segment.start > (lastEndTime - 0.5);
      if (isNew) {
        console.log(`📝 新しいセグメント検出: [${segment.start.toFixed(1)}s-${segment.end.toFixed(1)}s] "${segment.text.substring(0, 50)}${segment.text.length > 50 ? '...' : ''}"`);
      }
      return isNew;
    });
    
    console.log(`📝 時間ベース差分抽出: 前回最終時刻${lastEndTime.toFixed(1)}s → 新規${newSegments.length}セグメント (全体: ${currentResult.segments.length}セグメント)`);
    return newSegments;
  }
  
  /**
   * エラー報告
   */
  reportError(error: Error): void {
    this.metadata.errorCount++;
    this.metadata.lastUpdateTime = Date.now();
    
    console.error('RealtimeTextManager エラー:', error);
    
    this.onErrorCallbacks.forEach(callback => {
      try {
        callback(error);
      } catch (callbackError) {
        console.error('Error callback実行エラー:', callbackError);
      }
    });
    
    this.notifyTextUpdate();
  }
  
  /**
   * 推定残り時間更新
   */
  private updateEstimatedDuration(): void {
    if (this.metadata.processedChunks > 0) {
      const elapsedTime = Date.now() - this.metadata.startTime;
      const averageTimePerChunk = elapsedTime / this.metadata.processedChunks;
      this.metadata.averageProcessingTime = averageTimePerChunk;
      
      if (this.metadata.totalChunks > 0) {
        const remainingChunks = this.metadata.totalChunks - this.metadata.processedChunks;
        this.metadata.estimatedDuration = remainingChunks * averageTimePerChunk;
      }
    }
  }
  
  /**
   * フルテキスト生成
   */
  private generateFullText(): string {
    if (this.textBuffer.length === 0) {
      return '';
    }
    
    // チャンク・セグメント順にテキストを結合
    const sortedSegments = [...this.textBuffer].sort((a, b) => {
      if (a.chunkSequence !== b.chunkSequence) {
        return a.chunkSequence - b.chunkSequence;
      }
      return a.segmentIndex - b.segmentIndex;
    });
    
    // 時間順重複除去: 同じ時間範囲のセグメントは最新チャンクのもののみ使用
    const uniqueSegments: RealtimeTextSegment[] = [];
    const timeRangeMap = new Map<string, RealtimeTextSegment>();
    
    for (const segment of sortedSegments) {
      const timeKey = `${Math.floor(segment.start)}-${Math.floor(segment.end)}`;
      const existing = timeRangeMap.get(timeKey);
      
      if (!existing || segment.chunkSequence > existing.chunkSequence) {
        timeRangeMap.set(timeKey, segment);
      }
    }
    
    // 時間順に並び替え
    const finalSegments = Array.from(timeRangeMap.values()).sort((a, b) => a.start - b.start);
    
    let fullText = '';
    
    for (const segment of finalSegments) {
      // セグメントテキスト追加
      fullText += segment.text;
      if (!segment.text.endsWith('.') && !segment.text.endsWith('。')) {
        fullText += ' ';
      }
    }
    
    return fullText.trim();
  }
  
  /**
   * 自動保存開始
   */
  private startAutoSave(): void {
    if (this.writeInterval) return;
    
    this.writeInterval = setInterval(() => {
      if (this.isModified && this.currentTextFilePath) {
        this.writeToFile();
      }
    }, this.config.writeInterval);
    
    console.log(`自動保存開始: ${this.config.writeInterval}ms間隔`);
  }
  
  /**
   * 自動保存停止
   */
  private stopAutoSave(): void {
    if (this.writeInterval) {
      clearInterval(this.writeInterval);
      this.writeInterval = null;
      console.log('自動保存停止');
    }
  }
  
  /**
   * ファイル書き込み（エラーハンドリング強化版）
   */
  private async writeToFile(): Promise<void> {
    if (!this.currentTextFilePath) return;
    
    try {
      const fileContent = this.generateFileContent();
      const buffer = new TextEncoder().encode(fileContent);
      
      // ファイル名のみを抽出して拡張子を.rt.txtに変更
      const fileName = this.currentTextFilePath.split('\\').pop() || this.currentTextFilePath.split('/').pop() || this.currentTextFilePath;
      const rtFileName = fileName.replace(/\.webm$/, '.rt.txt');
      
      console.log(`リアルタイムテキストファイル書き込み: ${rtFileName}`);
      
      // 従来のsaveFile APIを使用（FileSystemErrorHandlerを一時的に無効化）
      await window.electronAPI.saveFile(buffer.buffer, rtFileName);
      
      this.isModified = false;
      
      console.log(`✓ リアルタイムテキストファイル書き込み完了: ${rtFileName}`);
      
      this.onFileWriteCallbacks.forEach(callback => {
        try {
          callback(rtFileName);
        } catch (error) {
          console.error('File write callback実行エラー:', error);
        }
      });
      
    } catch (error) {
      // エラーが発生してもループしないように、エラー報告は1回だけ
      if (this.metadata.errorCount < 5) { // 最大5回までエラー報告
        if (error instanceof Error) {
          console.error('ファイル書き込みエラー:', error.message);
          this.reportError(error);
        } else {
          console.error('ファイル書き込みエラー:', error);
          this.reportError(new Error(String(error)));
        }
      } else {
        // エラーが多すぎる場合は自動保存を停止
        console.error('エラーが多すぎるため自動保存を停止します');
        this.stopAutoSave();
      }
    }
  }
  
  /**
   * ファイル内容生成
   */
  private generateFileContent(): string {
    const fullText = this.generateFullText();
    
    if (this.config.fileFormat === 'simple') {
      return fullText;
    }
    
    // 詳細フォーマット
    const content = [
      '# リアルタイム文字起こし結果',
      '',
      '## メタデータ',
      `status: ${this.metadata.status}`,
      `processed_chunks: ${this.metadata.processedChunks}`,
      `total_chunks: ${this.metadata.totalChunks}`,
      `start_time: ${new Date(this.metadata.startTime).toISOString()}`,
      `last_update: ${new Date(this.metadata.lastUpdateTime).toISOString()}`,
      `error_count: ${this.metadata.errorCount}`,
      '',
      '## 本文',
      fullText,
      '',
      '## 処理状況'
    ];
    
    if (this.metadata.status === 'transcribing') {
      content.push('※ リアルタイム文字起こし中...');
      if (this.metadata.estimatedDuration > 0) {
        const estimatedMinutes = Math.ceil(this.metadata.estimatedDuration / 60000);
        content.push(`※ 推定残り時間: 約${estimatedMinutes}分`);
      }
    } else if (this.metadata.status === 'completed') {
      content.push('✓ 文字起こし完了');
    }
    
    // チャンク別詳細情報
    if (this.textBuffer.length > 0) {
      content.push('', '## チャンク詳細');
      
      const chunkGroups = new Map<number, RealtimeTextSegment[]>();
      for (const segment of this.textBuffer) {
        if (!chunkGroups.has(segment.chunkSequence)) {
          chunkGroups.set(segment.chunkSequence, []);
        }
        chunkGroups.get(segment.chunkSequence)!.push(segment);
      }
      
      for (const [chunkSeq, segments] of chunkGroups) {
        content.push(`### チャンク${chunkSeq}: ${segments[0].chunkFilename}`);
        content.push(`セグメント数: ${segments.length}`);
        
        for (const segment of segments) {
          const startTime = Math.floor(segment.start);
          const endTime = Math.floor(segment.end);
          content.push(`[${startTime}s-${endTime}s] ${segment.text}`);
        }
        content.push('');
      }
    }
    
    return content.join('\n');
  }
  
  /**
   * テキスト更新通知
   */
  private notifyTextUpdate(): void {
    const data: RealtimeTextData = {
      metadata: { ...this.metadata },
      segments: [...this.textBuffer],
      fullText: this.generateFullText(),
      isModified: this.isModified
    };
    
    this.onTextUpdateCallbacks.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error('Text update callback実行エラー:', error);
      }
    });
  }
  
  /**
   * イベントリスナー登録
   */
  onTextUpdate(callback: (data: RealtimeTextData) => void): void {
    this.onTextUpdateCallbacks.push(callback);
  }
  
  onFileWrite(callback: (filePath: string) => void): void {
    this.onFileWriteCallbacks.push(callback);
  }
  
  onError(callback: (error: Error) => void): void {
    this.onErrorCallbacks.push(callback);
  }
  
  /**
   * 現在のデータ取得
   */
  getCurrentData(): RealtimeTextData {
    return {
      metadata: { ...this.metadata },
      segments: [...this.textBuffer],
      fullText: this.generateFullText(),
      isModified: this.isModified
    };
  }
  
  /**
   * 設定更新
   */
  updateConfig(newConfig: Partial<TextFileConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...newConfig };
    
    // 自動保存間隔が変更された場合は再起動
    if (oldConfig.writeInterval !== this.config.writeInterval && this.writeInterval) {
      this.stopAutoSave();
      this.startAutoSave();
    }
    
    console.log('RealtimeTextManager設定更新:', this.config);
  }
  
  /**
   * 予想総チャンク数設定
   */
  setTotalChunks(total: number): void {
    this.metadata.totalChunks = total;
    this.metadata.lastUpdateTime = Date.now();
    this.updateEstimatedDuration();
    this.notifyTextUpdate();
  }
  
  /**
   * ステータス更新
   */
  setStatus(status: RealtimeTextMetadata['status']): void {
    this.metadata.status = status;
    this.metadata.lastUpdateTime = Date.now();
    this.notifyTextUpdate();
  }
  
  /**
   * 手動ファイル保存
   */
  async saveToFile(): Promise<void> {
    if (this.currentTextFilePath) {
      await this.writeToFile();
    }
  }
  
  /**
   * ディスク容量チェック
   */
  async checkDiskSpace(filePath: string): Promise<{ available: boolean; freeSpace: number }> {
    try {
      const diskInfo = await this.fileSystemErrorHandler.checkDiskSpace(filePath);
      return {
        available: diskInfo.free > (100 * 1024 * 1024), // 100MB以上
        freeSpace: diskInfo.free
      };
    } catch (error) {
      console.error('ディスク容量チェックエラー:', error);
      return { available: false, freeSpace: 0 };
    }
  }
  
  /**
   * ファイルシステムエラー統計取得
   */
  getFileSystemErrorStats() {
    return this.fileSystemErrorHandler.getErrorStats();
  }
  
  /**
   * クリーンアップ
   */
  cleanup(): void {
    this.stopAutoSave();
    this.fileSystemErrorHandler.cleanup();
    this.textBuffer = [];
    this.isModified = false;
    this.currentTextFilePath = null;
    this.onTextUpdateCallbacks = [];
    this.onFileWriteCallbacks = [];
    this.onErrorCallbacks = [];
    
    console.log('RealtimeTextManager クリーンアップ完了');
  }
}