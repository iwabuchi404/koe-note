/**
 * RealtimeTextManager - リアルタイムテキスト管理システム
 * 
 * 文字起こし結果の統合・メモリバッファ管理・ファイル書き込みを担当
 */

import { TranscriptionResult, TranscriptionSegment } from '../../preload/preload';
import { ChunkFileInfo } from './ChunkFileWatcher';
import { FileSystemErrorHandler, FileSystemError } from './FileSystemErrorHandler';
import { TRANSCRIPTION_CONFIG } from '../config/transcriptionConfig';

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
    this.textBuffer = []; // バッファをクリア
    this.isModified = false; // 初期状態をfalseに設定
    
    console.log(`📝 RealtimeTextManager開始: ${outputFilePath}`);
    console.log(`📝 設定: enableAutoSave=${this.config.enableAutoSave}, writeInterval=${this.config.writeInterval}ms`);
    
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
    
    console.log(`📝 RealtimeTextManager停止開始: isModified=${this.isModified}, currentTextFilePath=${this.currentTextFilePath}, textBuffer.length=${this.textBuffer.length}`);
    
    // 最終書き込み（データがある場合は必ず実行）
    if (this.currentTextFilePath && (this.isModified || this.textBuffer.length > 0)) {
      console.log(`📝 最終書き込み実行中...`);
      this.writeToFile();
    } else {
      console.log(`📝 最終書き込みスキップ: currentTextFilePath=${!!this.currentTextFilePath}, isModified=${this.isModified}, textBuffer.length=${this.textBuffer.length}`);
    }
    
    console.log('📝 RealtimeTextManager停止完了');
    this.notifyTextUpdate();
  }
  
  /**
   * チャンク文字起こし結果を追加
   */
  addTranscriptionResult(result: TranscriptionResult, chunkInfo: ChunkFileInfo): void {
    console.log(`文字起こし結果追加: ${chunkInfo.filename} (${result.segments.length}セグメント)`);
    
    // timerange_chunk_ファイルの場合は時間範囲ベースのフィルタリングを実行
    if (chunkInfo.filename.startsWith('timerange_chunk_')) {
      console.log(`📝 時間範囲ベースチャンク処理: ${chunkInfo.filename}`);
      this.processTimeRangeBasedChunk(result, chunkInfo);
      return;
    }
    
    // 従来のチャンクファイル処理
    // 該当チャンクのみクリア
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
    
    // バッファサイズ制限
    if (this.textBuffer.length > this.config.bufferSize) {
      const excess = this.textBuffer.length - this.config.bufferSize;
      this.textBuffer.splice(0, excess);
      console.log(`バッファサイズ制限により${excess}セグメントを削除`);
    }
    
    // メタデータ更新（全て通常のチャンクファイルとして処理）
    this.metadata.processedChunks = Math.max(this.metadata.processedChunks, chunkInfo.sequenceNumber);
    this.metadata.lastUpdateTime = Date.now();
    const wasModified = this.isModified;
    this.isModified = true;
    
    console.log(`📝 isModifiedをtrueに設定: ${realtimeSegments.length}セグメント追加 (前の状態: ${wasModified})`);
    
    // 推定残り時間計算
    this.updateEstimatedDuration();
    
    this.notifyTextUpdate();
    
    console.log(`バッファ更新完了: ${this.textBuffer.length}セグメント (チャンク${chunkInfo.sequenceNumber}の処理完了)`);
  }
  
  /**
   * 時間範囲ベースチャンクの処理（重複除去）
   */
  private processTimeRangeBasedChunk(result: TranscriptionResult, chunkInfo: ChunkFileInfo): void {
    // チャンク番号から時間範囲を計算
    const chunkNumber = chunkInfo.sequenceNumber;
    const chunkIntervalSeconds = TRANSCRIPTION_CONFIG.CHUNK.DEFAULT_SIZE; // 設定値を使用
    const expectedStartTime = (chunkNumber - 1) * chunkIntervalSeconds;
    const expectedEndTime = chunkNumber * chunkIntervalSeconds;
    
    console.log(`📝 時間範囲フィルタリング: チャンク${chunkNumber}`);
    console.log(`📝 期待時間範囲: ${expectedStartTime.toFixed(1)}s - ${expectedEndTime.toFixed(1)}s`);
    
    // この時間範囲内のセグメントのみを抽出
    const filteredSegments = result.segments.filter(segment => {
      // セグメントがこのチャンクの時間範囲に含まれるかチェック
      const segmentInRange = segment.start >= expectedStartTime && segment.start < expectedEndTime;
      
      if (segmentInRange) {
        console.log(`📝 時間範囲内セグメント: [${segment.start.toFixed(1)}s-${segment.end.toFixed(1)}s] "${segment.text.substring(0, 30)}${segment.text.length > 30 ? '...' : ''}"`);
      }
      
      return segmentInRange;
    });
    
    console.log(`📝 フィルタリング結果: ${filteredSegments.length}セグメント (全体から${result.segments.length}セグメント)`);
    
    if (filteredSegments.length > 0) {
      // 既存の同じ時間範囲のセグメントを削除
      this.textBuffer = this.textBuffer.filter(segment => {
        const segmentInTimeRange = segment.start >= expectedStartTime && segment.start < expectedEndTime;
        return !segmentInTimeRange; // この時間範囲外のセグメントのみ保持
      });
      
      // 新しいセグメントをRealtimeTextSegmentに変換
      const realtimeSegments: RealtimeTextSegment[] = filteredSegments.map((segment: TranscriptionSegment, index: number) => ({
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
      this.textBuffer.sort((a, b) => a.start - b.start); // 開始時間順にソート
      
      console.log(`📝 時間範囲ベース追加完了: ${realtimeSegments.length}セグメント`);
      
      // メタデータ更新
      this.metadata.processedChunks = Math.max(this.metadata.processedChunks, chunkInfo.sequenceNumber);
      this.metadata.lastUpdateTime = Date.now();
      const wasModified = this.isModified;
      this.isModified = true;
      
      console.log(`📝 時間範囲ベース: isModifiedをtrueに設定: ${realtimeSegments.length}セグメント追加 (前の状態: ${wasModified})`);
      
      // 推定残り時間計算
      this.updateEstimatedDuration();
      
      this.notifyTextUpdate();
    } else {
      console.log(`📝 この時間範囲に新しいセグメントなし`);
    }
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
    console.log(`📝 generateFullText開始: textBuffer.length=${this.textBuffer.length}`);
    
    if (this.textBuffer.length === 0) {
      console.log(`📝 generateFullText: バッファが空のため空文字列を返す`);
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
    
    const finalText = fullText.trim();
    console.log(`📝 generateFullText完了: ${finalText.length}文字, プレビュー: "${finalText.substring(0, 100)}..."`);
    return finalText;
  }
  
  /**
   * 自動保存開始
   */
  private startAutoSave(): void {
    if (this.writeInterval) return;
    
    this.writeInterval = setInterval(() => {
      console.log(`🔄 自動保存チェック: isModified=${this.isModified}, currentTextFilePath=${this.currentTextFilePath}`);
      if (this.isModified && this.currentTextFilePath) {
        console.log(`📝 自動保存実行中...`);
        this.writeToFile();
      } else {
        console.log(`📝 自動保存スキップ (変更なしまたはパスなし)`);
      }
    }, this.config.writeInterval);
    
    console.log(`🔄 自動保存開始: ${this.config.writeInterval}ms間隔`);
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
    console.log(`📝 writeToFile呼び出し: currentTextFilePath=${this.currentTextFilePath}, isModified=${this.isModified}`);
    
    if (!this.currentTextFilePath) {
      console.log(`❌ currentTextFilePathがnullのため書き込みスキップ`);
      return;
    }
    
    try {
      const fileContent = this.generateFileContent();
      const buffer = new TextEncoder().encode(fileContent);
      
      // ファイル名のみを抽出して拡張子を.rt.txtに変更
      const fullPath = this.currentTextFilePath;
      const fileName = fullPath.split('\\').pop() || fullPath.split('/').pop() || fullPath;
      
      // ファイル名にパスが含まれている場合は、ファイル名部分のみを抽出
      const baseFileName = fileName.includes('/') ? fileName.split('/').pop() : fileName;
      const rtFileName = (baseFileName || fileName).replace(/\.txt$/, '').replace(/\.webm$/, '') + '.rt.txt';
      
      console.log(`📝 ファイル名抽出: fullPath="${fullPath}", fileName="${fileName}", baseFileName="${baseFileName}", rtFileName="${rtFileName}"`);
      
      console.log(`📝 リアルタイムテキストファイル書き込み開始: ${rtFileName}`);
      console.log(`📝 元ファイルパス: ${this.currentTextFilePath}`);
      console.log(`📝 ファイル内容サイズ: ${fileContent.length}文字, ${buffer.byteLength}バイト`);
      console.log(`📝 ファイル内容プレビュー:`, fileContent.substring(0, 200) + '...');
      
      // ElectronAPI saveFileにファイル名のみを指定（サブフォルダなし）
      // saveFileは既に設定フォルダに保存するため、パスの重複を避ける
      console.log(`📝 ElectronAPI saveFile呼び出し開始: buffer=${buffer.byteLength}bytes, filename="${rtFileName}"`);
      
      const saveResult = await window.electronAPI.saveFile(buffer.buffer, rtFileName);
      console.log(`📝 ElectronAPI saveFile結果:`, saveResult);
      
      this.isModified = false;
      console.log(`📝 isModifiedをfalseに設定 (書き込み完了後)`);
      
      console.log(`✅ リアルタイムテキストファイル書き込み完了: ${rtFileName}`);
      
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
          console.error('📝 ファイル書き込みエラー:', error.message);
          this.reportError(error);
        } else {
          console.error('📝 ファイル書き込みエラー:', error);
          this.reportError(new Error(String(error)));
        }
      } else {
        // エラーが多すぎる場合は自動保存を停止
        console.error('📝 エラーが多すぎるため自動保存を停止します');
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