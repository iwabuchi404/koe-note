/**
 * ChunkTranscriptionQueue - チャンク分割文字起こしの処理キューシステム
 * 
 * チャンクの処理順序管理、並列処理の制御、エラーハンドリングを行う
 * 複数の処理を効率的に管理し、システムリソースを最適化する
 */

import { AudioChunk, ChunkResult } from './ChunkTranscriptionManager';
import { TranscriptionSegment } from '../../preload/preload';
import { LoggerFactory, LogCategories } from '../utils/LoggerFactory';

export interface QueueItem {
  id: string;
  chunk: AudioChunk;
  priority: number;
  retryCount: number;
  maxRetries: number;
  addedAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export interface QueueStats {
  totalItems: number;
  pendingItems: number;
  processingItems: number;
  completedItems: number;
  failedItems: number;
  averageProcessingTime: number;
  totalProcessingTime: number;
  queueStartTime: number;
}

export class ChunkTranscriptionQueue {
  private queue: QueueItem[] = [];
  private processing: Map<string, QueueItem> = new Map();
  private completed: Map<string, ChunkResult> = new Map();
  private failed: Map<string, QueueItem> = new Map();
  private maxConcurrency: number = 1; // 1つずつ順次処理に変更
  private stats: QueueStats;
  private isProcessing: boolean = false;
  private processingCallbacks: ((result: ChunkResult) => void)[] = [];
  private progressCallbacks: ((stats: QueueStats) => void)[] = [];
  private consecutiveErrors: number = 0;
  private lastErrorTime: number = 0;
  private logger = LoggerFactory.getLogger(LogCategories.TRANSCRIPTION_QUEUE);

  constructor(maxConcurrency: number = 1) {
    this.maxConcurrency = maxConcurrency;
    this.stats = {
      totalItems: 0,
      pendingItems: 0,
      processingItems: 0,
      completedItems: 0,
      failedItems: 0,
      averageProcessingTime: 0,
      totalProcessingTime: 0,
      queueStartTime: 0
    };
  }

  /**
   * チャンクをキューに追加
   */
  enqueue(chunk: AudioChunk, priority: number = 0): void {
    const queueItem: QueueItem = {
      id: chunk.id,
      chunk,
      priority,
      retryCount: 0,
      maxRetries: 3,
      addedAt: Date.now()
    };

    // 優先度順で挿入
    const insertIndex = this.queue.findIndex(item => item.priority < priority);
    if (insertIndex === -1) {
      this.queue.push(queueItem);
    } else {
      this.queue.splice(insertIndex, 0, queueItem);
    }

    this.stats.totalItems++;
    this.stats.pendingItems++;
    this.updateStats();

    this.logger.info('チャンクキュー追加', { chunkId: chunk.id, priority, totalItems: this.stats.totalItems });
  }

  /**
   * 処理開始
   */
  async startProcessing(): Promise<void> {
    if (this.isProcessing) {
      this.logger.warn('既に処理中です');
      return;
    }

    this.isProcessing = true;
    this.stats.queueStartTime = Date.now();
    this.logger.info('チャンクキュー処理開始', { maxConcurrency: this.maxConcurrency });

    // 並列処理を開始
    const processingPromises: Promise<void>[] = [];
    for (let i = 0; i < this.maxConcurrency; i++) {
      processingPromises.push(this.processNext());
    }

    await Promise.all(processingPromises);
    this.isProcessing = false;
    this.logger.info('チャンクキュー処理完了', { completedItems: this.stats.completedItems, failedItems: this.stats.failedItems });
  }

  /**
   * 次のチャンクを処理
   */
  private async processNext(): Promise<void> {
    while (this.isProcessing && this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) continue;

      this.stats.pendingItems--;
      this.stats.processingItems++;
      this.processing.set(item.id, item);
      item.startedAt = Date.now();

      try {
        this.logger.info('チャンク処理開始', {
          chunkId: item.id,
          retryCount: item.retryCount + 1,
          maxRetries: item.maxRetries + 1,
          priority: item.priority
        });
        
        const result = await this.processChunk(item.chunk);
        
        // 成功時の処理
        item.completedAt = Date.now();
        const processingTime = item.completedAt - item.startedAt!;
        
        this.processing.delete(item.id);
        this.completed.set(item.id, result);
        
        this.stats.processingItems--;
        this.stats.completedItems++;
        this.stats.totalProcessingTime += processingTime;
        this.stats.averageProcessingTime = this.stats.totalProcessingTime / this.stats.completedItems;
        
        // コールバック実行
        this.processingCallbacks.forEach(callback => callback(result));
        
        this.logger.info('チャンク処理完了', {
          chunkId: item.id,
          processingTime,
          confidence: result.confidence,
          segmentCount: result.segments.length
        });
        
      } catch (error) {
        this.logger.error('チャンク処理エラー', error instanceof Error ? error : undefined, {
          chunkId: item.id,
          retryCount: item.retryCount,
          error: String(error)
        });
        
        // 連続エラーの追跡
        const currentTime = Date.now();
        if (currentTime - this.lastErrorTime < 30000) { // 30秒以内の連続エラー
          this.consecutiveErrors++;
        } else {
          this.consecutiveErrors = 1; // リセット
        }
        this.lastErrorTime = currentTime;
        
        // 連続エラーが5回以上発生した場合は処理を停止
        if (this.consecutiveErrors >= 5 && String(error).includes('音声認識サーバー')) {
          this.logger.warn('連続エラー多発により処理停止', {
            consecutiveErrors: this.consecutiveErrors,
            errorType: 'server_connection',
            action: 'stopping_processing'
          });
          this.isProcessing = false;
          
          // エラー通知をユーザーに送信
          const stopErrorResult: ChunkResult = {
            chunkId: item.chunk.id,
            sequenceNumber: item.chunk.sequenceNumber,
            status: 'failed',
            segments: [{
              start: 0,
              end: 0,
              text: `音声認識サーバーとの接続に問題があります。サーバーを再起動してから、もう一度お試しください。`
            }],
            confidence: 0,
            processingTime: 0,
            error: String(error)
          };
          
          this.processingCallbacks.forEach(callback => callback(stopErrorResult));
          return;
        }
        
        // リトライ処理
        if (item.retryCount < item.maxRetries) {
          item.retryCount++;
          item.error = String(error);
          this.processing.delete(item.id);
          
          // 優先度を下げて再キューイング
          item.priority = Math.max(item.priority - 1, 0);
          
          this.stats.processingItems--;
          this.stats.pendingItems++;
          
          this.logger.info('チャンク再キューイング', {
            chunkId: item.id,
            retryCount: item.retryCount,
            maxRetries: item.maxRetries,
            newPriority: item.priority
          });
          
          // リトライ間隔を設定（指数バックオフ）
          const retryDelay = Math.min(1000 * Math.pow(2, item.retryCount - 1), 5000); // 1秒、2秒、4秒、最大5秒
          this.logger.debug('リトライ待機', { chunkId: item.id, retryDelay });
          
          setTimeout(() => {
            this.queue.push(item);
          }, retryDelay);
          
        } else {
          // 最大リトライ回数に達した場合は失敗として処理
          item.error = String(error);
          this.processing.delete(item.id);
          this.failed.set(item.id, item);
          
          this.stats.processingItems--;
          this.stats.failedItems++;
          
          this.logger.error('チャンク処理最終失敗', undefined, {
            chunkId: item.id,
            error: item.error,
            totalRetries: item.retryCount
          });
          
          // 失敗したチャンクの結果を作成（よりユーザーフレンドリーなメッセージ）
          let errorMessage = `チャンク処理に失敗しました`;
          if (String(error).includes('音声認識サーバーが起動していません')) {
            errorMessage = `音声認識サーバーが起動していません。右パネルの「サーバー起動」ボタンを押してください。`;
          } else if (String(error).includes('通信に失敗')) {
            errorMessage = `音声認識サーバーとの通信に失敗しました。サーバーの状態を確認してください。`;
          }
          
          const failedResult: ChunkResult = {
            chunkId: item.chunk.id,
            sequenceNumber: item.chunk.sequenceNumber,
            status: 'failed',
            segments: [{
              start: item.chunk.startTime,
              end: item.chunk.endTime,
              text: `[チャンク ${item.chunk.sequenceNumber + 1}] ${errorMessage}`
            }],
            confidence: 0,
            processingTime: 0,
            error: String(error)
          };
          
          this.processingCallbacks.forEach(callback => callback(failedResult));
        }
      }
      
      this.updateStats();
    }
  }

  /**
   * 個別チャンクの処理
   */
  private async processChunk(chunk: AudioChunk): Promise<ChunkResult> {
    // 録音中チャンクの場合はリアルタイム文字起こしを実行
    if (chunk.id.startsWith('pending_chunk_') || 
        chunk.id.startsWith('recording_live_chunk_') ||
        chunk.id.startsWith('safe_recording_chunk_') ||
        chunk.id.startsWith('safe_minimal_chunk_') ||
        chunk.id.startsWith('live_real_chunk_') ||
        chunk.id.startsWith('recording_')) {
      this.logger.info('録音中チャンクリアルタイム処理開始', {
        chunkId: chunk.id,
        startTime: chunk.startTime,
        endTime: chunk.endTime,
        sequenceNumber: chunk.sequenceNumber
      });
      
      try {
        // 録音中チャンクでも実際の文字起こしを実行
        const tempFilePath = await this.createTempAudioFile(chunk);
        
        try {
          this.logger.info('録音中チャンク文字起こし開始', {
            chunkId: chunk.id,
            tempFilePath
          });
          
          // 実際のWhisper APIで文字起こし実行
          const result = await window.electronAPI.speechTranscribe(tempFilePath);
          
          this.logger.info('録音中チャンク文字起こし完了', {
            chunkId: chunk.id,
            segments: result.segments.length,
            duration: result.duration,
            language: result.language,
            confidence: result.segments.length > 0 ? 0.8 : 0
          });
          
          // 結果を ChunkResult 形式に変換
          const chunkResult: ChunkResult = {
            chunkId: chunk.id,
            sequenceNumber: chunk.sequenceNumber,
            status: 'completed',
            segments: result.segments.map(segment => ({
              ...segment,
              start: segment.start + chunk.startTime,  // 全体の時間軸に調整
              end: segment.end + chunk.startTime
            })),
            confidence: result.segments.length > 0 ? 0.8 : 0,
            processingTime: 0  // 呼び出し元で設定
          };

          return chunkResult;
          
        } finally {
          // 一時ファイルを削除
          try {
            await window.electronAPI.deleteFile(tempFilePath);
          } catch (error) {
            this.logger.warn('録音中チャンク一時ファイル削除エラー', {
              chunkId: chunk.id,
              tempFilePath,
              error: String(error)
            }, error instanceof Error ? error : undefined);
          }
        }
        
      } catch (error) {
        this.logger.error('録音中チャンク文字起こしエラー', error instanceof Error ? error : undefined, {
          chunkId: chunk.id,
          error: String(error)
        });
        
        // エラーメッセージの詳細化
        let errorMessage = `文字起こし処理中にエラーが発生しました`;
        if (String(error).includes('音声認識サーバーが起動していません')) {
          errorMessage = `音声認識サーバーが起動していません。右パネルの「サーバー起動」ボタンを押してください。`;
        } else if (String(error).includes('通信に失敗')) {
          errorMessage = `音声認識サーバーとの通信に失敗しました。サーバーの状態を確認してください。`;
        }
        
        // エラーの場合はフォールバック結果を返す
        const fallbackResult: ChunkResult = {
          chunkId: chunk.id,
          sequenceNumber: chunk.sequenceNumber,
          status: 'failed',  // ステータスをfailedに変更
          segments: [{
            start: chunk.startTime,
            end: chunk.endTime,
            text: `[チャンク ${chunk.sequenceNumber + 1}] ${errorMessage}`
          }],
          confidence: 0.0,
          processingTime: 1000,
          error: String(error)
        };
        
        this.logger.info('録音中チャンクエラーフォールバック完了', {
          chunkId: chunk.id,
          status: 'failed',
          fallbackMessage: errorMessage
        });
        return fallbackResult;
      }
    }
    
    // 通常のチャンク処理
    const tempFilePath = await this.createTempAudioFile(chunk);
    
    try {
      // Electron API経由で文字起こし実行
      const result = await window.electronAPI.speechTranscribe(tempFilePath);
      
      // 結果を ChunkResult 形式に変換
      const chunkResult: ChunkResult = {
        chunkId: chunk.id,
        sequenceNumber: chunk.sequenceNumber,
        status: 'completed',
        segments: result.segments.map(segment => ({
          ...segment,
          start: segment.start + chunk.startTime,  // 全体の時間軸に調整
          end: segment.end + chunk.startTime
        })),
        confidence: result.segments.length > 0 ? 0.8 : 0,
        processingTime: 0  // 呼び出し元で設定
      };

      return chunkResult;
      
    } finally {
      // 一時ファイルを削除
      try {
        await window.electronAPI.deleteFile(tempFilePath);
      } catch (error) {
        this.logger.warn('一時ファイル削除エラー', {
          tempFilePath,
          error: String(error)
        }, error instanceof Error ? error : undefined);
      }
    }
  }

  /**
   * チャンク用の一時音声ファイルを作成
   */
  private async createTempAudioFile(chunk: AudioChunk): Promise<string> {
    // 録音中のチャンクの場合は、時間範囲を指定してWebMファイルから抽出
    if (chunk.id.includes('recording') || chunk.id.includes('live') || chunk.id.includes('chunk_')) {
      return await this.createWebMChunkFile(chunk);
    }
    
    // 通常の音声データの場合はWAV形式に変換
    const tempFileName = `chunk_${chunk.id}_${Date.now()}.wav`;
    this.logger.debug('WAVチャンクファイル作成', {
      chunkId: chunk.id,
      tempFileName,
      dataType: 'WAV'
    });
    
    try {
      // AudioChunkProcessor の createWavBuffer を使用
      const { AudioChunkProcessor } = await import('../audio/services/processing/AudioChunkProcessor');
      const processor = new AudioChunkProcessor();
      const wavBuffer = processor.createWavBuffer(chunk);
      
      return await window.electronAPI.saveFile(wavBuffer, tempFileName);
    } catch (error) {
      this.logger.error('WAVファイル作成エラー', error instanceof Error ? error : undefined, {
        chunkId: chunk.id,
        tempFileName,
        error: String(error)
      });
      throw new Error(`チャンク ${chunk.id} のWAVファイル作成に失敗しました: ${error}`);
    }
  }

  /**
   * WebMチャンクファイルを作成（WebM形式で保存）
   */
  private async createWebMChunkFile(chunk: AudioChunk): Promise<string> {
    this.logger.info('録音中チャンクファイル作成開始', {
      chunkId: chunk.id,
      startTime: chunk.startTime,
      endTime: chunk.endTime,
      duration: chunk.endTime - chunk.startTime
    });
    
    // チャンクの音声データを詳細に検証
    await this.validateChunkAudioData(chunk);
    
    // WebM形式でそのまま保存
    const webmFileName = `recording_chunk_${chunk.id}.webm`;
    this.logger.debug('録音中チャンクWebMファイル作成', {
      chunkId: chunk.id,
      webmFileName,
      format: 'WebM'
    });
    
    try {
      // AudioDataがArrayBufferの場合はそのまま保存
      if (chunk.audioData instanceof ArrayBuffer && chunk.audioData.byteLength > 0) {
        this.logger.debug('ArrayBufferWebMファイル保存', {
          chunkId: chunk.id,
          dataSize: chunk.audioData.byteLength,
          format: 'WebM'
        });
        
        // WebMヘッダーを検証
        await this.validateWebMHeader(chunk.audioData, chunk);
        
        const filePath = await window.electronAPI.saveFile(chunk.audioData, webmFileName);
        
        // 保存されたファイルのサイズを検証
        await this.validateSavedFile(filePath, chunk);
        
        return filePath;
      } else {
        this.logger.error('チャンク音声データ空または無効', undefined, {
          chunkId: chunk.id,
          audioDataType: typeof chunk.audioData,
          audioDataSize: chunk.audioData instanceof ArrayBuffer ? chunk.audioData.byteLength : 0
        });
        throw new Error(`チャンク ${chunk.id} の音声データが空です。録音データの生成に問題があります。`);
      }
    } catch (error) {
      this.logger.error('録音中チャンクWebMファイル作成エラー', error instanceof Error ? error : undefined, {
        chunkId: chunk.id,
        webmFileName,
        error: String(error)
      });
      
      // エラーの場合は問題をユーザーに通知
      throw new Error(`録音中チャンク ${chunk.id} のWebMファイル作成に失敗しました。録音データが不完全な可能性があります。`);
    }
  }

  /**
   * チャンクの音声データを検証
   */
  private async validateChunkAudioData(chunk: AudioChunk): Promise<void> {
    this.logger.debug('チャンク音声データ検証開始', { chunkId: chunk.id });
    this.logger.debug('チャンク基本情報', {
      chunkId: chunk.id,
      sequenceNumber: chunk.sequenceNumber,
      startTime: chunk.startTime,
      endTime: chunk.endTime,
      duration: chunk.endTime - chunk.startTime,
      sampleRate: chunk.sampleRate,
      channels: chunk.channels,
      overlapWithPrevious: chunk.overlapWithPrevious
    });
    
    if (chunk.audioData instanceof ArrayBuffer) {
      this.logger.debug('音声データタイプArrayBuffer', {
        chunkId: chunk.id,
        audioDataSize: chunk.audioData.byteLength
      });
      
      // ArrayBufferの最初の数バイトを16進数で表示
      const header = new Uint8Array(chunk.audioData.slice(0, Math.min(32, chunk.audioData.byteLength)));
      const headerHex = Array.from(header).map(b => b.toString(16).padStart(2, '0')).join(' ');
      this.logger.debug('音声データヘッダー', {
        chunkId: chunk.id,
        headerHex: headerHex.substring(0, 50) + (headerHex.length > 50 ? '...' : '')
      });
      
      // WebMデータの場合は、Float32Arrayとしての解釈をスキップ
      if (chunk.audioData.byteLength >= 4) {
        // WebMヘッダーチェック（1A 45 DF A3）
        const header = new Uint8Array(chunk.audioData.slice(0, 4));
        const isWebM = header[0] === 0x1A && header[1] === 0x45 && header[2] === 0xDF && header[3] === 0xA3;
        
        if (isWebM) {
          const estimatedDuration = chunk.endTime - chunk.startTime;
          const estimatedBitrate = Math.floor((chunk.audioData.byteLength * 8) / estimatedDuration);
          this.logger.info('WebMフォーマット検出', {
            chunkId: chunk.id,
            format: 'WebM',
            headerType: 'EBML',
            fileSize: chunk.audioData.byteLength,
            estimatedDuration,
            estimatedBitrate: Math.floor(estimatedBitrate / 1000)
          });
        } else {
          // 他の一般的なWebM/EBMLヘッダーパターンもチェック
          const alternativeHeaders = [
            [0x1F, 0x43, 0xB6, 0x75], // Cluster header
            [0x43, 0xC6, 0x81, 0x4D], // セグメント情報
            [0x42, 0x82, 0x84, 0x77]  // WebM DocType
          ];
          
          let isAlternativeWebM = false;
          let detectedHeaderType = '';
          
          for (const altHeader of alternativeHeaders) {
            if (header.length >= altHeader.length && 
                altHeader.every((byte, index) => header[index] === byte)) {
              isAlternativeWebM = true;
              const headerHex = altHeader.map(b => b.toString(16).padStart(2, '0')).join(' ');
              
              if (altHeader[0] === 0x1F) {
                detectedHeaderType = 'Cluster';
              } else if (altHeader[0] === 0x43) {
                detectedHeaderType = 'Segment';
              } else if (altHeader[0] === 0x42) {
                detectedHeaderType = 'DocType';
              }
              
              this.logger.info('WebMフォーマット検出', {
                chunkId: chunk.id,
                format: 'WebM',
                headerType: detectedHeaderType,
                headerPattern: headerHex
              });
              break;
            }
          }
          
          if (!isAlternativeWebM) {
            const headerStr = Array.from(header).map(b => b.toString(16).padStart(2, '0')).join(' ');
            this.logger.warn('未認識データフォーマット', {
              chunkId: chunk.id,
              dataSize: chunk.audioData.byteLength,
              headerPattern: headerStr.substring(0, 50),
              warning: '文字起こしエラーの可能性',
              expectedPatterns: ['1a 45 df a3 (EBML)', '1f 43 b6 75 (Cluster)']
            });
            
            // PCMデータとしての解析も試行しない（サイズが4の倍数でない場合が多いため）
            if (chunk.audioData.byteLength % 4 === 0) {
              try {
                const float32View = new Float32Array(chunk.audioData.slice(0, Math.min(16, chunk.audioData.byteLength)));
                this.logger.debug('Float32Arrayサンプル', {
                  chunkId: chunk.id,
                  samples: Array.from(float32View).slice(0, 4)
                });
              } catch (error) {
                this.logger.warn('Float32Array変換エラー', {
                  chunkId: chunk.id,
                  error: String(error)
                }, error instanceof Error ? error : undefined);
              }
            } else {
              this.logger.debug('Float32Array変換スキップ', {
                chunkId: chunk.id,
                reason: 'データサイズが4の倍数ではない',
                dataSize: chunk.audioData.byteLength
              });
            }
          }
        }
      }
    } else {
      this.logger.debug('音声データ型情報', {
        chunkId: chunk.id,
        audioDataType: typeof chunk.audioData,
        audioDataValue: String(chunk.audioData).substring(0, 100)
      });
    }
    
    this.logger.debug('チャンクソース情報', {
      chunkId: chunk.id,
      sourceFilePath: chunk.sourceFilePath || 'なし'
    });
  }

  /**
   * WebMデータのヘッダーを検証
   */
  private async validateWebMHeader(webmData: ArrayBuffer, chunk: AudioChunk): Promise<void> {
    // console.log(`🔍 WebMデータのヘッダー検証 (チャンク ${chunk.id}):`);
    // console.log(`  - WebMデータサイズ: ${webmData.byteLength} bytes`);
    
    // if (webmData.byteLength < 4) {
    //   console.error(`❌ WebMデータが不完全です。最小4バイト必要ですが、${webmData.byteLength}バイトしかありません。`);
    //   return;
    // }
    
    // const view = new DataView(webmData);
    
    // // WebMヘッダーの検証（EBMLヘッダー）
    // const ebmlHeader = new Uint8Array(webmData.slice(0, Math.min(32, webmData.byteLength)));
    // const headerHex = Array.from(ebmlHeader).map(b => b.toString(16).padStart(2, '0')).join(' ');
    // console.log(`  - EBMLヘッダー (最初32bytes): ${headerHex}`);
    
    // // WebMシグネチャの確認（1A 45 DF A3）
    // const isWebM = ebmlHeader[0] === 0x1A && ebmlHeader[1] === 0x45 && ebmlHeader[2] === 0xDF && ebmlHeader[3] === 0xA3;
    // console.log(`  - WebMシグネチャ: ${isWebM ? '✅ 正常' : '❌ 異常'}`);
    
    // if (!isWebM) {
    //   console.warn(`⚠️ WebMヘッダーが正しくありません。期待値: 1A 45 DF A3, 実際: ${headerHex.substring(0, 11)}`);
    // }
    
    // // データサイズの妥当性チェック
    // const expectedMinSize = Math.floor((chunk.endTime - chunk.startTime) * 1000); // 1KB/秒の最小サイズ
    // const expectedMaxSize = Math.floor((chunk.endTime - chunk.startTime) * 100000); // 100KB/秒の最大サイズ
    
    // console.log(`  - 期待サイズ範囲: ${expectedMinSize} - ${expectedMaxSize} bytes`);
    
    // if (webmData.byteLength < expectedMinSize) {
    //   console.warn(`⚠️ WebMデータサイズが小さすぎます。期待最小値: ${expectedMinSize}, 実際: ${webmData.byteLength}`);
    // } else if (webmData.byteLength > expectedMaxSize) {
    //   console.warn(`⚠️ WebMデータサイズが大きすぎます。期待最大値: ${expectedMaxSize}, 実際: ${webmData.byteLength}`);
    // } else {
    //   console.log(`  - ✅ WebMデータサイズは妥当な範囲内です`);
    // }
    
    // // 検証結果の評価
    // const isValid = isWebM && webmData.byteLength >= expectedMinSize && webmData.byteLength <= expectedMaxSize;
    // console.log(`  - WebMヘッダー検証結果: ${isValid ? '✅ 正常' : '⚠️ 注意が必要'}`);
  }

  /**
   * 生成されたWAVバッファのヘッダーを検証
   */
  private async validateWavHeader(wavBuffer: ArrayBuffer, chunk: AudioChunk): Promise<void> {
    console.log(`🔍 生成WAVバッファのヘッダー検証 (チャンク ${chunk.id}):`);
    console.log(`  - WAVバッファサイズ: ${wavBuffer.byteLength} bytes`);
    
    if (wavBuffer.byteLength < 44) {
      console.error(`❌ WAVヘッダーが不完全です。最小44バイト必要ですが、${wavBuffer.byteLength}バイトしかありません。`);
      return;
    }
    
    const view = new DataView(wavBuffer);
    
    // RIFFヘッダーの検証
    const riffTag = String.fromCharCode(
      view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)
    );
    console.log(`  - RIFFタグ: "${riffTag}" (期待値: "RIFF")`);
    
    const fileSize = view.getUint32(4, true);
    console.log(`  - ファイルサイズ: ${fileSize} bytes (ヘッダー値)`);
    console.log(`  - 実際のサイズ: ${wavBuffer.byteLength} bytes`);
    
    const waveTag = String.fromCharCode(
      view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11)
    );
    console.log(`  - WAVEタグ: "${waveTag}" (期待値: "WAVE")`);
    
    // fmtチャンクの検証
    const fmtTag = String.fromCharCode(
      view.getUint8(12), view.getUint8(13), view.getUint8(14), view.getUint8(15)
    );
    console.log(`  - fmtタグ: "${fmtTag}" (期待値: "fmt ")`);
    
    const fmtSize = view.getUint32(16, true);
    const audioFormat = view.getUint16(20, true);
    const numChannels = view.getUint16(22, true);
    const sampleRate = view.getUint32(24, true);
    const byteRate = view.getUint32(28, true);
    const blockAlign = view.getUint16(32, true);
    const bitsPerSample = view.getUint16(34, true);
    
    console.log(`  - fmtサイズ: ${fmtSize} (期待値: 16)`);
    console.log(`  - オーディオフォーマット: ${audioFormat} (期待値: 1=PCM)`);
    console.log(`  - チャンネル数: ${numChannels} (期待値: ${chunk.channels})`);
    console.log(`  - サンプルレート: ${sampleRate}Hz (期待値: ${chunk.sampleRate}Hz)`);
    console.log(`  - バイトレート: ${byteRate} bytes/sec`);
    console.log(`  - ブロックアライン: ${blockAlign}`);
    console.log(`  - ビット/サンプル: ${bitsPerSample} (期待値: 16)`);
    
    // dataチャンクの検証
    const dataTag = String.fromCharCode(
      view.getUint8(36), view.getUint8(37), view.getUint8(38), view.getUint8(39)
    );
    console.log(`  - dataタグ: "${dataTag}" (期待値: "data")`);
    
    const dataSize = view.getUint32(40, true);
    console.log(`  - データサイズ: ${dataSize} bytes`);
    console.log(`  - 期待データサイズ: ${Math.floor((chunk.endTime - chunk.startTime) * chunk.sampleRate * chunk.channels * 2)} bytes`);
    
    // データ部の最初の数サンプルを検証
    if (wavBuffer.byteLength >= 52) {
      const firstSamples = [];
      for (let i = 0; i < Math.min(8, (dataSize / 2)); i++) {
        const sample = view.getInt16(44 + i * 2, true);
        firstSamples.push(sample);
      }
      console.log(`  - 最初の音声サンプル: [${firstSamples.join(', ')}]`);
    }
    
    // 検証結果の評価
    const isValid = riffTag === 'RIFF' && 
                    waveTag === 'WAVE' && 
                    fmtTag === 'fmt ' && 
                    audioFormat === 1 && 
                    numChannels === chunk.channels && 
                    sampleRate === chunk.sampleRate && 
                    bitsPerSample === 16 && 
                    dataTag === 'data' && 
                    dataSize > 0;
    
    console.log(`  - ヘッダー検証結果: ${isValid ? '✅ 正常' : '❌ 異常'}`);
    
    if (!isValid) {
      console.error(`❌ WAVヘッダーに問題があります。チャンク ${chunk.id} のファイル生成を確認してください。`);
    }
  }

  /**
   * 保存されたファイルを検証
   */
  private async validateSavedFile(filePath: string, chunk: AudioChunk): Promise<void> {
    try {
      const fileSize = await window.electronAPI.getFileSize(filePath);
      this.logger.debug('保存ファイル検証開始', { chunkId: chunk.id });
      this.logger.debug('保存ファイル情報', {
        chunkId: chunk.id,
        filePath,
        fileSize
      });
      
      if (fileSize === 0) {
        this.logger.error('保存ファイルサイズ0バイト', undefined, {
          chunkId: chunk.id,
          filePath,
          fileSize: 0
        });
      } else if (fileSize < 44) {
        this.logger.error('保存ファイルサイズ小さすぎ', undefined, {
          chunkId: chunk.id,
          filePath,
          fileSize,
          minimumSize: 44
        });
      } else {
        this.logger.debug('保存ファイルサイズ正常', {
          chunkId: chunk.id,
          filePath,
          fileSize
        });
      }
    } catch (error) {
      this.logger.error('保存ファイル検証エラー', error instanceof Error ? error : undefined, {
        chunkId: chunk.id,
        filePath,
        error: String(error)
      });
    }
  }


  /**
   * 統計情報を更新
   */
  private updateStats(): void {
    this.progressCallbacks.forEach(callback => callback(this.stats));
  }

  /**
   * 処理停止
   */
  stop(): void {
    this.isProcessing = false;
    this.logger.info('チャンクキュー処理停止');
  }

  /**
   * 完了した結果を取得
   */
  getCompletedResults(): Map<string, ChunkResult> {
    return new Map(this.completed);
  }

  /**
   * 失敗したアイテムを取得
   */
  getFailedItems(): Map<string, QueueItem> {
    return new Map(this.failed);
  }

  /**
   * 統計情報を取得
   */
  getStats(): QueueStats {
    return { ...this.stats };
  }

  /**
   * 処理完了コールバックを追加
   */
  onProcessingComplete(callback: (result: ChunkResult) => void): void {
    this.processingCallbacks.push(callback);
  }

  /**
   * 進捗コールバックを追加
   */
  onProgress(callback: (stats: QueueStats) => void): void {
    this.progressCallbacks.push(callback);
  }

  /**
   * コールバックをクリア
   */
  clearCallbacks(): void {
    this.processingCallbacks = [];
    this.progressCallbacks = [];
  }

  /**
   * キューをクリア
   */
  clear(): void {
    this.queue = [];
    this.processing.clear();
    this.completed.clear();
    this.failed.clear();
    this.stats = {
      totalItems: 0,
      pendingItems: 0,
      processingItems: 0,
      completedItems: 0,
      failedItems: 0,
      averageProcessingTime: 0,
      totalProcessingTime: 0,
      queueStartTime: 0
    };
  }
}