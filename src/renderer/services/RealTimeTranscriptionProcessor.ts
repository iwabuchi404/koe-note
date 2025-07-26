/**
 * RealTimeTranscriptionProcessor - 録音中ファイルのリアルタイム文字起こし処理
 * 
 * 録音中のWebMファイルから定期的にデータを取得し、
 * 新しいチャンクが利用可能になったら文字起こしを実行する
 */

import { AudioChunk, ChunkResult } from './ChunkTranscriptionManager';
import { TranscriptionSegment } from '../../preload/preload';
import { TRANSCRIPTION_CONFIG } from '../config/transcriptionConfig';
import { LoggerFactory, LogCategories } from '../utils/LoggerFactory';

export interface RealTimeChunk {
  id: string;
  sequenceNumber: number;
  startTime: number;
  endTime: number;
  filePath: string;
  fileOffset: number;
  duration: number;
  isNew: boolean;
}

export class RealTimeTranscriptionProcessor {
  private isProcessing: boolean = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private lastProcessedOffset: number = 0;
  private chunkSequence: number = 0;
  private processingChunkId: string | null = null;
  private audioFilePath: string = '';
  private chunkSize: number = TRANSCRIPTION_CONFIG.CHUNK.DEFAULT_SIZE; // 秒
  private logger = LoggerFactory.getLogger(LogCategories.TRANSCRIPTION_REALTIME);
  private onChunkCompletedCallbacks: ((chunk: ChunkResult) => void)[] = [];
  private processedChunks: Map<string, ChunkResult> = new Map();
  private consecutiveErrorCount: number = 0;
  private lastErrorTime: number = 0;
  private serverCheckInterval: NodeJS.Timeout | null = null;
  private isServerChecking: boolean = false;

  /**
   * リアルタイム文字起こし開始
   */
  async startRealTimeTranscription(
    audioFilePath: string, 
    chunkSize: number = TRANSCRIPTION_CONFIG.CHUNK.DEFAULT_SIZE
  ): Promise<void> {
    if (this.isProcessing) {
      this.logger.warn('既にリアルタイム処理中です');
      return;
    }

    this.logger.info('リアルタイム文字起こし開始', { audioFilePath, chunkSize });
    
    this.audioFilePath = audioFilePath;
    this.chunkSize = chunkSize;
    this.isProcessing = true;
    this.lastProcessedOffset = 0;
    this.chunkSequence = 0;
    this.processingChunkId = null;
    this.processedChunks.clear();

    // サーバー状態の継続監視を開始
    this.startServerMonitoring();

    // 初回チェックを即座に実行
    console.log('🔍 初回データチェックを実行');
    try {
      await this.checkAndProcessNewData();
    } catch (error) {
      console.error('🚨 初回データチェックエラー:', error);
    }

    // 定期的にファイルをチェックして新しいデータを処理
    this.processingInterval = setInterval(async () => {
      try {
        await this.checkAndProcessNewData();
      } catch (error) {
        console.error('🚨 リアルタイム処理エラー:', error);
      }
    }, TRANSCRIPTION_CONFIG.REALTIME.PROCESSING_INTERVAL); // 設定された間隔でチェック

    console.log(`✅ リアルタイム文字起こしを開始しました (${TRANSCRIPTION_CONFIG.REALTIME.PROCESSING_INTERVAL}ms間隔)`);
  }

  /**
   * 処理停止
   */
  stop(): void {
    console.log('リアルタイム文字起こし停止');
    
    this.isProcessing = false;
    
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    
    // サーバー監視を停止
    this.stopServerMonitoring();
    
    // 処理中フラグをクリア
    this.clearProcessingFlags();
    
    // 強制リセット
    this.forceReset();
  }
  
  /**
   * 処理中フラグをクリア
   */
  private clearProcessingFlags(): void {
    this.logger.debug('処理中フラグクリア開始');
    const processingKeys = Array.from(this.processedChunks.keys()).filter(key => key.startsWith('processing_'));
    this.logger.debug('削除対象の処理中フラグ特定', { processingKeys });
    
    processingKeys.forEach(key => {
      const deleted = this.processedChunks.delete(key);
      this.logger.debug('処理中フラグ削除実行', { key, deleted });
    });
    this.logger.info('処理中フラグクリア完了', { deletedCount: processingKeys.length });
    
    // 削除後の状態を確認
    const remainingProcessingKeys = Array.from(this.processedChunks.keys()).filter(key => key.startsWith('processing_'));
    if (remainingProcessingKeys.length > 0) {
      this.logger.warn('削除後にも処理中フラグが残存', { remainingKeys: remainingProcessingKeys });
    }
  }
  
  /**
   * 古い処理中フラグをクリーンアップ
   */
  private cleanupOldProcessingFlags(): void {
    const now = Date.now();
    const timeout = 3 * 60 * 1000; // 3分
    
    const processingKeys = Array.from(this.processedChunks.keys()).filter(key => key.startsWith('processing_'));
    let cleanedCount = 0;
    
    processingKeys.forEach(key => {
      const chunk = this.processedChunks.get(key);
      if (chunk && chunk.processingTime && (now - chunk.processingTime > timeout)) {
        const deleted = this.processedChunks.delete(key);
        if (deleted) {
          cleanedCount++;
          this.logger.debug('古い処理中フラグ削除', {
            key,
            elapsedTime: Math.round((now - chunk.processingTime) / 1000)
          });
        }
      }
    });
    
    if (cleanedCount > 0) {
      this.logger.info('古い処理中フラグクリーンアップ完了', { cleanedCount });
    }
  }

  /**
   * 新しいデータをチェックして処理
   */
  private async checkAndProcessNewData(): Promise<void> {
    if (!this.isProcessing) return;

    // 処理中フラグの古いエントリをクリーンアップ (5分以上経過したもの)
    this.cleanupOldProcessingFlags();

    // 連続エラーが多い場合は回復待機
    if (this.consecutiveErrorCount >= 3) {
      const timeSinceLastError = Date.now() - this.lastErrorTime;
      if (timeSinceLastError < TRANSCRIPTION_CONFIG.REALTIME.ERROR_RECOVERY_DELAY) {
        this.logger.warn('エラー回復待機中', { consecutiveErrorCount: this.consecutiveErrorCount });
        return;
      } else {
        this.logger.info('エラー回復待機終了', { action: '処理再開' });
        this.consecutiveErrorCount = 0;
      }
    }

    try {
      // 現在のファイルサイズを確認
      const currentFileSize = await window.electronAPI.getFileSize(this.audioFilePath);
      
      this.logger.debug('ファイルサイズチェック', {
        currentFileSize,
        lastProcessedOffset: this.lastProcessedOffset,
        sizeIncrease: currentFileSize - this.lastProcessedOffset
      });
      
      // ファイルサイズが増加している場合のみ処理
      if (currentFileSize > this.lastProcessedOffset && currentFileSize > TRANSCRIPTION_CONFIG.REALTIME.MIN_FILE_SIZE) {
        const dataIncrease = currentFileSize - this.lastProcessedOffset;
        this.logger.debug('新しいデータ検出', { dataIncrease });
        
        // 推定時間を計算（概算: 1秒あたり約16KB）
        const estimatedDuration = Math.max(dataIncrease / TRANSCRIPTION_CONFIG.REALTIME.BYTES_PER_SECOND, 1);
        
        // 設定されたチャンクサイズに基づいて処理判定
        const minProcessingTime = TRANSCRIPTION_CONFIG.REALTIME.MIN_PROCESSING_TIME;
        const chunkDuration = this.chunkSize; // 設定されたチャンクサイズを使用
        
        // 初回チャンクは最小時間チェックを緩和（録音開始直後でも処理可能にする）
        const isFirstChunk = this.chunkSequence === 0;
        const actualMinTime = isFirstChunk ? Math.min(minProcessingTime, this.chunkSize) : minProcessingTime;
        
        if (estimatedDuration >= actualMinTime) {
          this.logger.info('処理開始条件満たしました', {
            estimatedDuration: estimatedDuration.toFixed(1),
            minTime: actualMinTime,
            chunkDuration,
            isFirstChunk
          });
          await this.processNewChunk(currentFileSize, chunkDuration);
        } else {
          this.logger.debug('データ蓄積待機中', {
            estimatedDuration: estimatedDuration.toFixed(1),
            minTime: actualMinTime,
            isFirstChunk
          });
        }
      } else if (currentFileSize <= TRANSCRIPTION_CONFIG.REALTIME.MIN_FILE_SIZE) {
        this.logger.debug('ファイルサイズ小さく録音開始直後の可能性');
      }
      
    } catch (error) {
      this.logger.error('新しいデータチェック中エラー', error instanceof Error ? error : undefined, error);
    }
  }

  /**
   * 新しいチャンクを処理
   */
  private async processNewChunk(currentFileSize: number, chunkDuration: number): Promise<void> {
    const chunkId = `realtime_chunk_${this.chunkSequence}`;
    
    // 固定サイズのチャンクを処理：各チャンクは正確に chunkSize 秒間のデータのみを処理
    const startTime = this.chunkSequence * this.chunkSize;
    const endTime = startTime + this.chunkSize;
    
    this.logger.info('チャンク時間範囲設定', {
      startTime: startTime.toFixed(1),
      endTime: endTime.toFixed(1),
      actualDuration: chunkDuration,
      configuredSize: this.chunkSize,
      sequence: this.chunkSequence
    });
    
    // 既に処理済みのチャンクかチェック
    if (this.processedChunks.has(chunkId)) {
      this.logger.debug('チャンク既に処理済みスキップ', { chunkId });
      return;
    }
    
    // 現在処理中のチャンクと同じかチェック
    if (this.processingChunkId === chunkId) {
      this.logger.debug('チャンク既に処理中スキップ', {
        chunkId,
        currentProcessingChunkId: this.processingChunkId
      });
      return;
    }
    
    // 進行中のチャンクかチェック（重複処理を防ぐ）
    const processingChunkId = `processing_${chunkId}`;
    if (this.processedChunks.has(processingChunkId)) {
      this.logger.debug('チャンク処理中フラグ存在スキップ', { chunkId });
      
      // 処理中フラグの詳細情報を出力
      const processingFlag = this.processedChunks.get(processingChunkId);
      if (processingFlag) {
        const ageInSeconds = (Date.now() - (processingFlag.processingTime || 0)) / 1000;
        this.logger.debug('処理中フラグ詳細確認', {
          processingChunkId,
          ageInSeconds: ageInSeconds.toFixed(1)
        });
        
        // 3分以上経過している場合は強制削除
        if (ageInSeconds > 180) {
          this.logger.warn('古い処理中フラグ強制削除', {
            processingChunkId,
            ageInSeconds: ageInSeconds.toFixed(1)
          });
          this.processedChunks.delete(processingChunkId);
          this.processingChunkId = null;
          // 削除後、再度処理を試行
          return this.processNewChunk(currentFileSize, this.chunkSize);
        }
      }
      
      return;
    }
    
    // 処理中フラグを設定
    this.processingChunkId = chunkId;
    this.processedChunks.set(processingChunkId, {
      chunkId,
      sequenceNumber: this.chunkSequence,
      status: 'processing',
      segments: [],
      confidence: 0,
      processingTime: Date.now()
    });
    
    this.logger.info('新しいチャンク処理開始', {
      chunkId,
      startTime: startTime.toFixed(1),
      endTime: endTime.toFixed(1)
    });
    this.logger.debug('処理中フラグ設定', {
      processingChunkId,
      totalChunksInMap: this.processedChunks.size
    });
    
    let processingCompleted = false;
    
    try {
      // 録音中ファイルから実際のデータを取得して文字起こし実行
      const result = await this.transcribeRecordingChunk(
        this.audioFilePath,
        chunkId,
        this.chunkSequence,
        startTime,
        endTime
      );
      
      if (result) {
        // 結果を保存
        this.processedChunks.set(chunkId, result);
        
        // コールバック実行
        this.onChunkCompletedCallbacks.forEach(callback => callback(result));
        
        this.logger.info('チャンク処理完了', {
          chunkId,
          text: result.segments.map(s => s.text).join(' '),
          segmentCount: result.segments.length,
          confidence: result.confidence
        })
        
        // 次のチャンクの準備
        this.lastProcessedOffset = currentFileSize;
        this.chunkSequence++;
        
        this.logger.debug('チャンク処理次の準備', {
          lastProcessedOffset: this.lastProcessedOffset,
          chunkSequence: this.chunkSequence
        });
        processingCompleted = true;
      } else {
        // 結果がnullでも次のチャンクに進む
        this.lastProcessedOffset = currentFileSize;
        this.chunkSequence++;
        
        this.logger.debug('結果null次のチャンク準備', {
          lastProcessedOffset: this.lastProcessedOffset,
          chunkSequence: this.chunkSequence
        });
        processingCompleted = true;
      }
      
    } catch (error) {
      this.logger.error('チャンク処理エラー', error instanceof Error ? error : undefined, {
        chunkId,
        error: String(error)
      });
      
      // サーバー関連のエラーかチェック
      const errorMessage = String(error);
      if (errorMessage.includes('server') || errorMessage.includes('connection') || errorMessage.includes('timeout') || errorMessage.includes('タイムアウト') || errorMessage.includes('切断')) {
        this.logger.warn('チャンク処理サーバーエラー検出', {
          chunkId,
          errorType: 'server_related'
        });
        
        // 連続エラーカウントを増加
        this.consecutiveErrorCount++;
        this.lastErrorTime = Date.now();
        
        // サーバー状態を確認し、必要に応じて再起動
        try {
          await this.checkServerStatus();
          
          // サーバーが再起動した場合は少し待機
          await new Promise(resolve => setTimeout(resolve, 3000));
          
        } catch (serverError) {
          this.logger.error('サーバー状態確認エラー', serverError instanceof Error ? serverError : undefined, {
            chunkId,
            error: String(serverError)
          });
        }
      }
      
      // エラーチャンクも記録
      const errorResult: ChunkResult = {
        chunkId,
        sequenceNumber: this.chunkSequence,
        status: 'failed',
        segments: [{
          start: startTime,
          end: endTime,
          text: `[エラー] チャンク ${this.chunkSequence + 1}の処理中にエラーが発生しました`
        }],
        confidence: 0,
        processingTime: 0,
        error: String(error)
      };
      
      this.processedChunks.set(chunkId, errorResult);
      this.onChunkCompletedCallbacks.forEach(callback => callback(errorResult));
      
      // エラーでも次のチャンクに進む
      this.lastProcessedOffset = currentFileSize;
      this.chunkSequence++;
      
      console.log(`🎯 エラー時 - 次のチャンクの準備: lastProcessedOffset=${this.lastProcessedOffset}, chunkSequence=${this.chunkSequence}`);
    } finally {
      // 処理中フラグを確実に削除（成功・失敗問わず）
      if (!processingCompleted) {
        const deleted = this.processedChunks.delete(processingChunkId);
        this.processingChunkId = null;
        console.log(`🧹 finally - 処理中フラグ削除: ${processingChunkId} - ${deleted ? '成功' : '失敗または既に削除済み'}`);
      }
    }
  }

  /**
   * 録音中チャンクの文字起こし実行（リトライ機能付き）
   */
  private async transcribeRecordingChunk(
    audioFilePath: string,
    chunkId: string,
    sequenceNumber: number,
    startTime: number,
    endTime: number
  ): Promise<ChunkResult | null> {
    
    let retryCount = 0;
    
    while (retryCount <= TRANSCRIPTION_CONFIG.REALTIME.MAX_RETRY_COUNT) {
      try {
        console.log(`📝 録音中チャンク文字起こし開始: ${chunkId} (試行 ${retryCount + 1}/${TRANSCRIPTION_CONFIG.REALTIME.MAX_RETRY_COUNT + 1})`);
        
        // 録音中ファイルから現在の状態でWAVファイルを作成
        const tempWavPath = await this.createTempWavFromRecording(audioFilePath, chunkId, startTime, endTime);
        
        if (!tempWavPath) {
          console.warn(`WAVファイル作成に失敗: ${chunkId}`);
          return null;
        }
        
        try {
          // 文字起こし実行前にサーバー状態を確認
          const serverRunning = await this.ensureServerRunning();
          if (!serverRunning) {
            console.error('❌ サーバーが利用できません - 処理をスキップ');
            return null;
          }
          
          // 実際の文字起こしAPI呼び出し
          console.log(`🔊 文字起こしAPI呼び出し: ${tempWavPath}`);
          const result = await window.electronAPI.speechTranscribe(tempWavPath);
          
          console.log(`📋 文字起こし結果: ${result.segments.length}セグメント, ${result.duration}秒`);
          
          // 成功したらエラーカウントをリセット
          this.consecutiveErrorCount = 0;
          
          // 結果をChunkResult形式に変換（時間軸調整）
          // 常に開始位置0から処理しているため、時間軸調整は不要
          const chunkResult: ChunkResult = {
            chunkId,
            sequenceNumber,
            status: 'completed',
            segments: result.segments.map(segment => ({
              ...segment,
              start: segment.start,  // 時間軸はそのまま使用
              end: segment.end
            })),
            confidence: result.segments.length > 0 ? 0.8 : 0,
            processingTime: Date.now() // 簡易的な処理時間
          };
          
          console.log(`🎵 時間軸調整完了: ${result.segments.length}セグメント`);
          console.log(`🎵 調整後の時間範囲: ${chunkResult.segments.length > 0 ? chunkResult.segments[0].start.toFixed(1) : 'N/A'}s - ${chunkResult.segments.length > 0 ? chunkResult.segments[chunkResult.segments.length - 1].end.toFixed(1) : 'N/A'}s`);
          
          console.log(`🧹 処理完了 - 処理中フラグを削除: processing_${chunkId}`);
          
          return chunkResult;
          
        } finally {
          // 一時ファイル削除
          try {
            await window.electronAPI.deleteFile(tempWavPath);
            console.log(`🗑️ 一時ファイル削除完了: ${tempWavPath}`);
          } catch (deleteError) {
            console.warn('一時ファイル削除エラー:', deleteError);
          }
        }
        
      } catch (error) {
        console.error(`録音中チャンク文字起こしエラー (${chunkId}) - 試行 ${retryCount + 1}:`, error);
        
        retryCount++;
        this.consecutiveErrorCount++;
        this.lastErrorTime = Date.now();
        
        // サーバー関連のエラーかチェック
        const errorMessage = String(error);
        if (errorMessage.includes('server') || errorMessage.includes('connection') || errorMessage.includes('timeout') || errorMessage.includes('タイムアウト')) {
          console.warn('⚠️ サーバー関連のエラーを検出 - サーバー状態を確認');
          
          // サーバー状態を確認し、必要に応じて再起動
          try {
            await this.checkServerStatus();
            
            // サーバーが再起動した場合は少し待機
            await new Promise(resolve => setTimeout(resolve, 3000));
            
          } catch (serverError) {
            console.error('サーバー状態確認エラー:', serverError);
          }
        }
        
        // 最大リトライ回数に達した場合
        if (retryCount > TRANSCRIPTION_CONFIG.REALTIME.MAX_RETRY_COUNT) {
          console.error(`❌ チャンク ${chunkId} の処理を諦めます (最大リトライ回数に達しました)`);
          throw error;
        }
        
        // リトライ前に待機（エラーの種類に応じて待機時間を調整）
        let waitTime = TRANSCRIPTION_CONFIG.REALTIME.RETRY_DELAY;
        if (errorMessage.includes('server') || errorMessage.includes('connection')) {
          waitTime = 10000; // サーバー関連エラーの場合は10秒待機
        }
        
        console.log(`⏳ ${waitTime}ms後にリトライします...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    return null;
  }

  /**
   * 録音中ファイルから一時WAVファイルを作成（時間範囲に基づいた部分抽出）
   */
  private async createTempWavFromRecording(audioFilePath: string, chunkId: string, startTime: number, endTime: number): Promise<string | null> {
    try {
      console.log(`🎵 録音中ファイルからWAV作成開始: ${audioFilePath}`);
      console.log(`🎵 時間範囲: ${startTime.toFixed(1)}s - ${endTime.toFixed(1)}s (チャンクサイズ: ${endTime - startTime}秒)`);
      
      // チャンクサイズに基づいてファイルサイズを制限
      const chunkDuration = endTime - startTime;
      const maxBytesForChunk = chunkDuration * TRANSCRIPTION_CONFIG.REALTIME.BYTES_PER_SECOND;
      
      console.log(`🎵 チャンクサイズ制限: ${maxBytesForChunk} bytes (${chunkDuration}秒分)`);
      
      // 録音中ファイルの現在の状態を取得
      const partialDataUrl = await window.electronAPI.loadPartialAudioFile(audioFilePath);
      
      if (!partialDataUrl) {
        console.warn('部分データの取得に失敗');
        return null;
      }
      
      // 一時WAVファイルとして保存
      const response = await fetch(partialDataUrl);
      const fullArrayBuffer = await response.arrayBuffer();
      
      if (fullArrayBuffer.byteLength === 0) {
        console.warn('取得したデータが空です');
        return null;
      }
      
      // 指定された時間範囲のデータを抽出
      const startOffset = Math.floor(startTime * TRANSCRIPTION_CONFIG.REALTIME.BYTES_PER_SECOND);
      const endOffset = Math.min(
        Math.floor(endTime * TRANSCRIPTION_CONFIG.REALTIME.BYTES_PER_SECOND),
        fullArrayBuffer.byteLength
      );
      
      console.log(`🎵 時間ベース抽出: ${startOffset} - ${endOffset} bytes (開始: ${startTime}s, 終了: ${endTime}s)`);
      
      // 時間範囲が無効な場合の処理
      if (endOffset <= startOffset) {
        console.warn(`⚠️ 無効な時間範囲: ${startOffset} >= ${endOffset}`);
        return null;
      }
      
      // 開始位置がファイルサイズを超えている場合はまだデータが不足
      if (startOffset >= fullArrayBuffer.byteLength) {
        console.log(`⏳ 開始位置 ${startOffset} がファイルサイズ ${fullArrayBuffer.byteLength} を超過 - データ不足`);
        return null;
      }
      
      // 初回チャンクの場合、開始位置を0に調整
      let actualStartOffset = startOffset;
      let actualEndOffset = endOffset;
      
      if (this.chunkSequence === 0) {
        console.log(`🔄 初回チャンクの処理: 開始位置を0に調整`);
        actualStartOffset = 0;
        actualEndOffset = Math.min(
          Math.floor(this.chunkSize * TRANSCRIPTION_CONFIG.REALTIME.BYTES_PER_SECOND),
          fullArrayBuffer.byteLength
        );
        console.log(`🎵 調整後の時間ベース抽出: ${actualStartOffset} - ${actualEndOffset} bytes`);
      }
      
      // 指定された時間範囲のデータを抽出
      let extractedData = fullArrayBuffer.slice(actualStartOffset, actualEndOffset);
      
      console.log(`🎵 抽出されたデータサイズ: ${extractedData.byteLength} bytes (推定時間: ${(extractedData.byteLength / TRANSCRIPTION_CONFIG.REALTIME.BYTES_PER_SECOND).toFixed(1)}秒)`);
      
      // 抽出データが空の場合
      if (extractedData.byteLength === 0) {
        console.warn('抽出されたデータが空です');
        return null;
      }
      
      // 最大サイズチェック（安全装置）- 1チャンクのみのサイズ
      const expectedChunkSize = this.chunkSize * TRANSCRIPTION_CONFIG.REALTIME.BYTES_PER_SECOND;
      const absoluteMaxSize = expectedChunkSize * 1.5; // 1.5倍の余裕
      if (extractedData.byteLength > absoluteMaxSize) {
        console.warn(`⚠️ 抽出データが期待チャンクサイズを大幅に超過: ${extractedData.byteLength} bytes`);
        console.warn(`⚠️ 期待サイズ: ${expectedChunkSize} bytes (${this.chunkSize}秒), 最大許容: ${absoluteMaxSize} bytes`);
        // 最大サイズに制限
        const limitedData = extractedData.slice(0, absoluteMaxSize);
        console.log(`🔪 データを最大サイズに制限: ${extractedData.byteLength} → ${limitedData.byteLength} bytes`);
        
        const tempFileName = `realtime_${chunkId}_${Date.now()}.wav`;
        const tempFilePath = await window.electronAPI.saveFile(limitedData, tempFileName);
        
        console.log(`💾 一時WAVファイル作成完了: ${tempFilePath} (${limitedData.byteLength} bytes, 推定時間: ${(limitedData.byteLength / TRANSCRIPTION_CONFIG.REALTIME.BYTES_PER_SECOND).toFixed(1)}秒)`);
        return tempFilePath;
      }
      
      const tempFileName = `realtime_${chunkId}_${Date.now()}.wav`;
      const tempFilePath = await window.electronAPI.saveFile(extractedData, tempFileName);
      
      console.log(`💾 一時WAVファイル作成完了: ${tempFilePath} (${extractedData.byteLength} bytes, 推定時間: ${(extractedData.byteLength / TRANSCRIPTION_CONFIG.REALTIME.BYTES_PER_SECOND).toFixed(1)}秒)`);
      return tempFilePath;
      
    } catch (error) {
      console.error('録音中ファイルからのWAV作成エラー:', error);
      return null;
    }
  }

  /**
   * 音声データフォーマットを修正（中間データ用）
   */
  private fixAudioDataFormat(audioData: ArrayBuffer): ArrayBuffer {
    try {
      // 簡単なWAVヘッダーを追加
      const sampleRate = 16000; // 16kHz
      const bitsPerSample = 16;
      const channels = 1;
      const byteRate = sampleRate * channels * bitsPerSample / 8;
      const blockAlign = channels * bitsPerSample / 8;
      const dataSize = audioData.byteLength;
      const fileSize = 36 + dataSize;
      
      const header = new ArrayBuffer(44);
      const view = new DataView(header);
      
      // WAVヘッダー作成
      const writeString = (offset: number, string: string) => {
        for (let i = 0; i < string.length; i++) {
          view.setUint8(offset + i, string.charCodeAt(i));
        }
      };
      
      writeString(0, 'RIFF');
      view.setUint32(4, fileSize, true);
      writeString(8, 'WAVE');
      writeString(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, channels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, byteRate, true);
      view.setUint16(32, blockAlign, true);
      view.setUint16(34, bitsPerSample, true);
      writeString(36, 'data');
      view.setUint32(40, dataSize, true);
      
      // ヘッダーと音声データを結合
      const result = new ArrayBuffer(header.byteLength + audioData.byteLength);
      const resultView = new Uint8Array(result);
      const headerView = new Uint8Array(header);
      const audioView = new Uint8Array(audioData);
      
      resultView.set(headerView, 0);
      resultView.set(audioView, header.byteLength);
      
      console.log(`🎵 WAVヘッダーを追加: ${header.byteLength} + ${audioData.byteLength} = ${result.byteLength} bytes`);
      
      return result;
      
    } catch (error) {
      console.error('音声データフォーマット修正エラー:', error);
      return audioData; // エラーの場合は元のデータを返す
    }
  }

  /**
   * チャンク完了コールバックを追加
   */
  onChunkCompleted(callback: (chunk: ChunkResult) => void): void {
    this.onChunkCompletedCallbacks.push(callback);
  }

  /**
   * 処理済みチャンクを取得
   */
  getProcessedChunks(): Map<string, ChunkResult> {
    return new Map(this.processedChunks);
  }

  /**
   * 処理統計を取得
   */
  getStats() {
    const totalChunks = this.processedChunks.size;
    const completedChunks = Array.from(this.processedChunks.values()).filter(c => c.status === 'completed').length;
    const failedChunks = Array.from(this.processedChunks.values()).filter(c => c.status === 'failed').length;
    
    return {
      isProcessing: this.isProcessing,
      totalChunks,
      completedChunks,
      failedChunks,
      currentSequence: this.chunkSequence,
      lastProcessedOffset: this.lastProcessedOffset,
      consecutiveErrorCount: this.consecutiveErrorCount,
      lastErrorTime: this.lastErrorTime,
      successRate: totalChunks > 0 ? (completedChunks / totalChunks) * 100 : 0
    };
  }

  /**
   * コールバッククリア
   */
  clearCallbacks(): void {
    this.onChunkCompletedCallbacks = [];
  }
  
  /**
   * 強制リセット - 全状態をクリア
   */
  private forceReset(): void {
    console.log('🔄 強制リセット開始');
    
    // 全てのチャンクデータをクリア
    this.processedChunks.clear();
    
    // 処理状態をリセット
    this.lastProcessedOffset = 0;
    this.chunkSequence = 0;
    this.processingChunkId = null;
    this.consecutiveErrorCount = 0;
    this.lastErrorTime = 0;
    
    console.log('🔄 強制リセット完了 - 全状態がクリアされました');
  }
  
  /**
   * 処理中フラグの詳細情報を取得
   */
  getProcessingFlagDetails(): { [key: string]: any } {
    const processingFlags: { [key: string]: any } = {};
    
    Array.from(this.processedChunks.keys())
      .filter(key => key.startsWith('processing_'))
      .forEach(key => {
        const chunk = this.processedChunks.get(key);
        processingFlags[key] = {
          chunkId: chunk?.chunkId,
          status: chunk?.status,
          processingTime: chunk?.processingTime,
          ageInSeconds: chunk?.processingTime ? (Date.now() - chunk.processingTime) / 1000 : 0
        };
      });
    
    return processingFlags;
  }
  
  /**
   * 手動で処理中フラグをクリア（デバッグ用）
   */
  manualClearProcessingFlags(): void {
    console.log('🔧 手動処理中フラグクリア開始');
    const details = this.getProcessingFlagDetails();
    console.log('🔧 現在の処理中フラグ:', details);
    
    const processingKeys = Array.from(this.processedChunks.keys()).filter(key => key.startsWith('processing_'));
    processingKeys.forEach(key => {
      this.processedChunks.delete(key);
      console.log(`🔧 手動削除: ${key}`);
    });
    
    console.log(`🔧 手動処理中フラグクリア完了: ${processingKeys.length}個削除`);
  }
  
  /**
   * サーバー監視を開始
   */
  private startServerMonitoring(): void {
    console.log('🔍 サーバー監視開始');
    
    this.serverCheckInterval = setInterval(async () => {
      if (!this.isProcessing || this.isServerChecking) return;
      
      this.isServerChecking = true;
      try {
        await this.checkServerStatus();
      } catch (error) {
        console.error('サーバー監視エラー:', error);
      } finally {
        this.isServerChecking = false;
      }
    }, 10000); // 10秒ごとにチェック
  }
  
  /**
   * サーバー監視を停止
   */
  private stopServerMonitoring(): void {
    console.log('🔍 サーバー監視停止');
    
    if (this.serverCheckInterval) {
      clearInterval(this.serverCheckInterval);
      this.serverCheckInterval = null;
    }
    
    this.isServerChecking = false;
  }
  
  /**
   * サーバー状態をチェックし、必要に応じて再起動
   */
  private async checkServerStatus(): Promise<void> {
    try {
      const serverStatus = await window.electronAPI.speechGetServerStatus();
      
      if (!serverStatus.isRunning) {
        console.warn('⚠️ サーバーが停止しています - 自動再起動を試行');
        
        // サーバーを再起動
        const restartSuccess = await window.electronAPI.speechStartServer();
        
        if (restartSuccess) {
          console.log('✅ サーバー再起動成功');
          
          // 短時間待機してサーバーが完全に起動するまで待つ
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          // エラーカウントをリセット
          this.consecutiveErrorCount = 0;
          this.lastErrorTime = 0;
          
        } else {
          console.error('❌ サーバー再起動失敗');
          this.consecutiveErrorCount++;
          this.lastErrorTime = Date.now();
        }
      }
    } catch (error) {
      console.error('サーバー状態チェックエラー:', error);
    }
  }
  
  /**
   * 文字起こし実行前にサーバー状態を確認
   */
  private async ensureServerRunning(): Promise<boolean> {
    try {
      const serverStatus = await window.electronAPI.speechGetServerStatus();
      
      if (!serverStatus.isRunning) {
        console.warn('⚠️ 文字起こし実行前にサーバーが停止 - 再起動を試行');
        
        const restartSuccess = await window.electronAPI.speechStartServer();
        
        if (restartSuccess) {
          console.log('✅ 文字起こし前サーバー再起動成功');
          // 短時間待機
          await new Promise(resolve => setTimeout(resolve, 3000));
          return true;
        } else {
          console.error('❌ 文字起こし前サーバー再起動失敗');
          return false;
        }
      }
      
      return true;
    } catch (error) {
      console.error('サーバー状態確認エラー:', error);
      return false;
    }
  }
}