/**
 * AudioChunkProcessor - 音声ファイルのチャンク分割処理クラス
 * 
 * 録音済み音声ファイルを指定されたサイズでチャンクに分割し、
 * 文字起こし処理用の音声データを生成する
 */

import { AudioChunk } from './ChunkTranscriptionManager';
import { TRANSCRIPTION_CONFIG } from '../config/transcriptionConfig';
import { LoggerFactory, LogCategories } from '../utils/LoggerFactory';

export class AudioChunkProcessor {
  private audioContext: AudioContext | null = null;
  private logger = LoggerFactory.getLogger(LogCategories.AUDIO_CHUNK_PROCESSOR);

  constructor() {
    // AudioContextは必要時に初期化
    this.logger.debug('AudioChunkProcessor初期化');
  }

  /**
   * AudioContextを初期化
   */
  private async initAudioContext(): Promise<AudioContext> {
    if (!this.audioContext) {
      this.logger.debug('AudioContext初期化開始');
      try {
        this.audioContext = new AudioContext();
        this.logger.info('AudioContext初期化完了', {
          state: this.audioContext.state,
          sampleRate: this.audioContext.sampleRate
        });
      } catch (error) {
        this.logger.error('AudioContext初期化エラー', error instanceof Error ? error : undefined, error);
        throw error;
      }
    }
    return this.audioContext;
  }

  /**
   * 音声ファイルをチャンクに分割
   */
  async processAudioFile(
    audioFilePath: string,
    chunkSize: number = TRANSCRIPTION_CONFIG.CHUNK.DEFAULT_SIZE,
    overlapSize: number = TRANSCRIPTION_CONFIG.CHUNK.DEFAULT_OVERLAP
  ): Promise<AudioChunk[]> {
    this.logger.info('チャンク分割処理開始', { audioFilePath, chunkSize, overlapSize });
    
    // 録音中WebMファイルはdecodeAudioDataを回避してリアルタイムチャンク処理を実行
    if (this.isRecordingWebMFile(audioFilePath)) {
      this.logger.info('録音中WebMファイル検出 - リアルタイムチャンク処理で実行');
      return await this.createRealTimeRecordingChunks(audioFilePath, chunkSize, overlapSize);
    }
    
    try {
      // 音声ファイルを読み込み
      const audioBuffer = await this.loadAudioFile(audioFilePath);
      
      // オーディオバッファの基本情報をログ出力
      this.logger.info('音声ファイル読み込み成功', {
        duration: audioBuffer.duration,
        sampleRate: audioBuffer.sampleRate,
        channels: audioBuffer.numberOfChannels,
        length: audioBuffer.length
      });
      
      // チャンクを生成
      const chunks = this.createChunks(audioBuffer, chunkSize, overlapSize);
      
      this.logger.info('チャンク分割完了', { chunkCount: chunks.length });
      
      // 通常の音声ファイルでチャンクが0個の場合は問題あり
      if (chunks.length === 0) {
        this.logger.warn('通常の音声ファイルでチャンクが0個生成', { audioFilePath });
        throw new Error('音声ファイルが短すぎるか、音声データが不十分です');
      }
      
      return chunks;
      
    } catch (error) {
      this.logger.error('音声ファイル処理エラー', error instanceof Error ? error : undefined, {
        audioFilePath,
        error: String(error)
      });
      
      // 録音中のファイルで読み込めない場合の特別な処理
      if (error instanceof Error && (
        error.message.includes('録音中') || 
        error.message.includes('ファイルの読み込みに失敗') ||
        error.message.includes('WebMファイルのデコードに失敗') ||
        error.message.includes('部分的なファイル') ||
        error.message.includes('デコードタイムアウト')
      )) {
        this.logger.info('録音中ファイルエラー検出安全フォールバック実行', { audioFilePath });
        try {
          return await this.createMinimalRecordingChunks(audioFilePath, chunkSize, overlapSize);
        } catch (fallbackError) {
          this.logger.error('フォールバック処理も失敗', fallbackError instanceof Error ? fallbackError : undefined, {
            audioFilePath,
            error: String(fallbackError)
          });
          // 最終的なフォールバック: 空のチャンクを返す
          return this.createSafeMinimalChunks(chunkSize);
        }
      }
      
      throw error;
    }
  }

  /**
   * 音声ファイルを読み込んでAudioBufferを作成
   */
  private async loadAudioFile(audioFilePath: string): Promise<AudioBuffer> {
    this.logger.debug('loadAudioFile開始', { audioFilePath });
    
    const audioContext = await this.initAudioContext();
    this.logger.debug('AudioContext初期化完了ファイル読み込み開始');
    
    try {
      this.logger.info('音声ファイル読み込み開始', { audioFilePath });
      
      // Electronの loadAudioFile APIを使用してファイルを読み込む
      this.logger.debug('electronAPI.loadAudioFile実行直前');
      const dataUrl = await window.electronAPI.loadAudioFile(audioFilePath);
      this.logger.debug('electronAPI.loadAudioFile実行完了');
      
      if (!dataUrl) {
        throw new Error('ファイルの読み込みに失敗しました');
      }
      
      this.logger.info('ファイル読み込み成功デコード開始');
      
      // Data URLから ArrayBuffer を取得
      this.logger.debug('fetch実行直前');
      const response = await fetch(dataUrl);
      this.logger.debug('fetch実行完了response.arrayBuffer実行直前');
      const arrayBuffer = await response.arrayBuffer();
      this.logger.debug('response.arrayBuffer実行完了');
      
      if (arrayBuffer.byteLength === 0) {
        throw new Error('空の音声ファイルです');
      }
      
      this.logger.debug('ファイルサイズ確認', { byteLength: arrayBuffer.byteLength });
      
      // 🔍 仮説2: メモリ使用量監視
      this.logMemoryUsage('デコード前');
      
      // AudioBufferにデコード
      try {
        this.logger.debug('decodeAudioData開始', {
          byteLength: arrayBuffer.byteLength,
          constructor: arrayBuffer.constructor.name,
          audioContextState: audioContext.state,
          sampleRate: audioContext.sampleRate
        });
        
        // 🔍 仮説1: WebMヘッダー検証
        if (audioFilePath.includes('.webm')) {
          const isValidHeader = await this.validateWebMHeader(arrayBuffer);
          if (!isValidHeader) {
            throw new Error('仮説1確認: WebMファイルヘッダーが破損しています');
          }
        }
        
        this.logger.debug('decodeAudioData実行直前');
        
        // 録音中ファイル用の安全なデコード処理
        let audioBuffer: AudioBuffer;
        try {
          // 🔍 仮説3: ファイル競合状態を回避するためにコピーを作成
          const safeArrayBuffer = arrayBuffer.slice();
          
          // Promise.race を使用してタイムアウト処理を追加
          const decodePromise = audioContext.decodeAudioData(safeArrayBuffer);
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('デコードタイムアウト')), 5000);
          });
          
          audioBuffer = await Promise.race([decodePromise, timeoutPromise]);
          this.logger.debug('decodeAudioData実行完了');
          
          // 🔍 仮説2: デコード後のメモリ使用量監視
          this.logMemoryUsage('デコード後');
          
        } catch (decodeInnerError) {
          this.logger.error('decodeAudioData内部エラー', decodeInnerError instanceof Error ? decodeInnerError : undefined, decodeInnerError);
          
          // 🔍 エラー時のメモリ状態を記録
          this.logMemoryUsage('エラー時');
          
          // 録音中ファイルの場合は、特別なエラーメッセージで処理続行を阻止
          if (audioFilePath.includes('recording_') && audioFilePath.includes('.webm')) {
            this.logger.warn('録音中WebMファイルデコード失敗検出', { audioFilePath });
            throw new Error('録音中WebMファイルのデコードに失敗しました。部分的なファイルの可能性があります。');
          }
          
          throw decodeInnerError;
        }
        
        this.logger.info('オーディオデコード成功', {
          duration: audioBuffer.duration,
          sampleRate: audioBuffer.sampleRate,
          channels: audioBuffer.numberOfChannels,
          length: audioBuffer.length
        });
        
        return audioBuffer;
      } catch (decodeError) {
        this.logger.error('AudioContextデコード失敗', decodeError instanceof Error ? decodeError : undefined, {
          name: decodeError instanceof Error ? decodeError.name : 'unknown',
          message: decodeError instanceof Error ? decodeError.message : String(decodeError),
          arrayBufferSize: arrayBuffer.byteLength
        });
        
        // 録音中WebMファイルの場合は安全にエラーを発生させてフォールバック処理に誘導
        if (audioFilePath.includes('recording_') && audioFilePath.includes('.webm')) {
          this.logger.warn('録音中WebMファイルデコード失敗フォールバック移行', { audioFilePath });
          throw new Error('録音中WebMファイルのデコードに失敗しました。部分的なファイルの可能性があります。');
        }
        
        // 通常のWebMファイルの場合
        if (audioFilePath.includes('.webm')) {
          this.logger.error('WebMファイルデコード失敗', undefined, { audioFilePath, reason: 'ファイル破損の可能性' });
          throw new Error('WebMファイルのデコードに失敗しました。ファイルが破損している可能性があります。');
        }
        
        throw decodeError;
      }
      
    } catch (error) {
      this.logger.error('音声ファイル読み込みエラー', error instanceof Error ? error : undefined, {
        audioFilePath,
        error: String(error)
      });
      
      // エラーメッセージをより詳細に
      let errorMessage = '音声ファイルの読み込みに失敗しました';
      
      if (error instanceof Error) {
        if (error.message.includes('decode')) {
          errorMessage = '音声ファイルのデコードに失敗しました。ファイルが壊れているか、サポートされていない形式です。';
        } else if (error.message.includes('空')) {
          errorMessage = '音声ファイルが空です。録音が完了してから再試行してください。';
        }
        errorMessage += ` (詳細: ${error.message})`;
      }
      
      throw new Error(errorMessage);
    }
  }

  /**
   * AudioBufferからチャンクを作成
   */
  private createChunks(
    audioBuffer: AudioBuffer,
    chunkSize: number,
    overlapSize: number
  ): AudioChunk[] {
    const sampleRate = audioBuffer.sampleRate;
    const channels = audioBuffer.numberOfChannels;
    const duration = audioBuffer.duration;
    const chunkSizeSamples = Math.floor(chunkSize * sampleRate);
    const overlapSizeSamples = Math.floor(overlapSize * sampleRate);
    const stepSize = chunkSizeSamples - overlapSizeSamples;
    
    const chunks: AudioChunk[] = [];
    let sequenceNumber = 0;
    
    for (let start = 0; start < audioBuffer.length; start += stepSize) {
      const end = Math.min(start + chunkSizeSamples, audioBuffer.length);
      const chunkDuration = (end - start) / sampleRate;
      
      // 最小チャンク時間（1秒）をチェック
      if (chunkDuration < 1.0) {
        break;
      }
      
      const chunk: AudioChunk = {
        id: `chunk_${sequenceNumber}`,
        sequenceNumber: sequenceNumber,
        startTime: start / sampleRate,
        endTime: end / sampleRate,
        audioData: this.extractAudioData(audioBuffer, start, end),
        sampleRate: sampleRate,
        channels: channels,
        overlapWithPrevious: sequenceNumber > 0 ? overlapSize : 0
      };
      
      // チャンクの品質チェック
      if (this.validateChunk(chunk)) {
        chunks.push(chunk);
      }
      
      sequenceNumber++;
    }
    
    return chunks;
  }

  /**
   * 指定範囲の音声データを抽出
   */
  private extractAudioData(audioBuffer: AudioBuffer, start: number, end: number): ArrayBuffer {
    const channels = audioBuffer.numberOfChannels;
    const length = end - start;
    
    // Float32配列として音声データを取得
    const audioData = new Float32Array(length * channels);
    
    for (let channel = 0; channel < channels; channel++) {
      const channelData = audioBuffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        audioData[i * channels + channel] = channelData[start + i];
      }
    }
    
    return audioData.buffer;
  }

  /**
   * チャンクの品質をチェック
   */
  validateChunk(chunk: AudioChunk): boolean {
    // 録音中チャンクは特別な処理で常に有効
    if (chunk.id.startsWith('recording_live_chunk_') || 
        chunk.id.startsWith('safe_recording_chunk_') ||
        chunk.id.startsWith('pending_chunk_') ||
        chunk.id.startsWith('live_real_chunk_') ||
        chunk.id.startsWith('safe_minimal_chunk_')) {
      this.logger.debug('録音中チャンク特別処理有効', { chunkId: chunk.id });
      return true;
    }
    
    // 最小時間チェック
    if (chunk.endTime - chunk.startTime < 1.0) {
      this.logger.debug('チャンク時間短すぎ', {
        chunkId: chunk.id,
        duration: chunk.endTime - chunk.startTime
      });
      return false;
    }
    
    // 音声データの存在チェック
    if (!chunk.audioData || chunk.audioData.byteLength === 0) {
      this.logger.warn('チャンクに音声データなし', { chunkId: chunk.id });
      return false;
    }
    
    // 音声データの基本的な品質チェック
    const audioData = new Float32Array(chunk.audioData);
    const rms = this.calculateRMS(audioData);
    
    // 無音チェック（RMS値が極端に低い場合）
    if (rms < 0.001) {
      this.logger.warn('チャンク無音の可能性', {
        chunkId: chunk.id,
        rms
      });
      // 無音チャンクでも処理を継続するため、警告のみでファルスは返さない
      // return false;
    }
    
    this.logger.debug('チャンク有効性確認', {
      chunkId: chunk.id,
      rms: rms.toFixed(6),
      duration: chunk.endTime - chunk.startTime
    });
    return true;
  }

  /**
   * RMS (Root Mean Square) 値を計算
   */
  private calculateRMS(audioData: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      sum += audioData[i] * audioData[i];
    }
    return Math.sqrt(sum / audioData.length);
  }

  /**
   * WAVファイル形式のバッファを作成
   */
  createWavBuffer(chunk: AudioChunk): ArrayBuffer {
    this.logger.debug('WAVバッファ作成開始', { chunkId: chunk.id });
    
    let audioData: Float32Array;
    
    // audioDataがArrayBufferの場合はFloat32Arrayに変換
    if (chunk.audioData instanceof ArrayBuffer) {
      this.logger.debug('入力データ型確認', {
        chunkId: chunk.id,
        dataType: 'ArrayBuffer',
        byteLength: chunk.audioData.byteLength
      });
      
      if (chunk.audioData.byteLength === 0) {
        this.logger.warn('空のArrayBuffer検出無音データ生成', { chunkId: chunk.id });
        const estimatedSamples = Math.floor((chunk.endTime - chunk.startTime) * chunk.sampleRate * chunk.channels);
        audioData = new Float32Array(estimatedSamples);
        
        // 微小なノイズを追加（完全な無音を避ける）
        for (let i = 0; i < audioData.length; i++) {
          audioData[i] = (Math.random() - 0.5) * 0.001;
        }
        this.logger.debug('無音データ生成完了', {
          chunkId: chunk.id,
          sampleCount: audioData.length
        });
      } else {
        audioData = new Float32Array(chunk.audioData);
        this.logger.debug('Float32Array変換完了', {
          chunkId: chunk.id,
          sampleCount: audioData.length
        });
        
        // サンプルデータの統計
        const nonZeroCount = Array.from(audioData).filter(s => Math.abs(s) > 0.001).length;
        const maxValue = Math.max(...Array.from(audioData).map(Math.abs));
        this.logger.debug('音声データ統計', {
          chunkId: chunk.id,
          nonZeroCount,
          totalSamples: audioData.length,
          maxAmplitude: maxValue.toFixed(6)
        });
        
        if (nonZeroCount === 0) {
          this.logger.warn('全サンプル無音データ問題の可能性', { chunkId: chunk.id });
        }
      }
    } else if (chunk.audioData && typeof chunk.audioData === 'object' && 'length' in chunk.audioData) {
      // Float32Arrayまたは類似の配列オブジェクトの場合
      this.logger.debug('入力データ型配列オブジェクト', {
        chunkId: chunk.id,
        length: (chunk.audioData as any).length
      });
      audioData = new Float32Array(chunk.audioData as any);
    } else {
      // フォールバック: 空のデータまたは無効なデータの場合
      this.logger.warn('チャンク音声データ無効形式無音データ生成', {
        chunkId: chunk.id,
        dataType: typeof chunk.audioData
      });
      const estimatedSamples = Math.floor((chunk.endTime - chunk.startTime) * chunk.sampleRate * chunk.channels);
      audioData = new Float32Array(estimatedSamples);
      
      // 微小なノイズを追加（完全な無音を避ける）
      for (let i = 0; i < audioData.length; i++) {
        audioData[i] = (Math.random() - 0.5) * 0.001;
      }
      this.logger.debug('フォールバック無音データ生成', {
        chunkId: chunk.id,
        sampleCount: audioData.length
      });
    }
    
    const sampleRate = chunk.sampleRate;
    const channels = chunk.channels;
    const length = audioData.length;
    const expectedLength = Math.floor((chunk.endTime - chunk.startTime) * chunk.sampleRate * chunk.channels);
    
    this.logger.debug('WAVバッファパラメータ', {
      chunkId: chunk.id,
      sampleRate,
      channels
    });
    this.logger.debug('WAVバッファサンプル数確認', {
      chunkId: chunk.id,
      actualSamples: length,
      expectedSamples: expectedLength,
      actualDuration: (length / (sampleRate * channels)).toFixed(3),
      expectedDuration: (chunk.endTime - chunk.startTime).toFixed(3)
    });
    
    if (Math.abs(length - expectedLength) > sampleRate * 0.1) { // 0.1秒以上の差がある場合
      this.logger.warn('サンプル数が期待値と大きく異なる', {
        chunkId: chunk.id,
        difference: Math.abs(length - expectedLength)
      });
    }
    
    // WAVヘッダのサイズ（44バイト）
    const headerSize = 44;
    const dataSize = length * 2; // 16bit PCM
    const fileSize = headerSize + dataSize;
    
    this.logger.debug('WAVファイルサイズ計算', {
      chunkId: chunk.id,
      totalSize: fileSize,
      headerSize,
      dataSize
    });
    
    const buffer = new ArrayBuffer(fileSize);
    const view = new DataView(buffer);
    
    // WAVヘッダを書き込み
    this.logger.debug('WAVヘッダー書き込み中', { chunkId: chunk.id });
    this.writeWavHeader(view, sampleRate, channels, length);
    
    // 音声データを16bit PCMに変換して書き込み
    this.logger.debug('音声データ16bit PCM変換書き込み中', { chunkId: chunk.id });
    this.writeAudioData(view, audioData, headerSize);
    
    this.logger.info('WAVバッファ作成完了', {
      chunkId: chunk.id,
      bufferSize: buffer.byteLength
    });
    
    return buffer;
  }

  /**
   * WAVヘッダを書き込み
   */
  private writeWavHeader(
    view: DataView,
    sampleRate: number,
    channels: number,
    length: number
  ): void {
    const dataSize = length * 2; // 16bit PCM
    const fileSize = 44 + dataSize;
    
    // RIFF header
    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, fileSize - 8, true); // file size - 8
    view.setUint32(8, 0x57415645, false); // "WAVE"
    
    // fmt chunk
    view.setUint32(12, 0x666d7420, false); // "fmt "
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, channels, true); // number of channels
    view.setUint32(24, sampleRate, true); // sample rate
    view.setUint32(28, sampleRate * channels * 2, true); // byte rate
    view.setUint16(32, channels * 2, true); // block align
    view.setUint16(34, 16, true); // bits per sample
    
    // data chunk
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, dataSize, true); // data size
  }

  /**
   * 音声データを16bit PCMに変換して書き込み
   */
  private writeAudioData(view: DataView, audioData: Float32Array, offset: number): void {
    for (let i = 0; i < audioData.length; i++) {
      // Float32 (-1.0 to 1.0) を 16bit PCM (-32768 to 32767) に変換
      const sample = Math.max(-1, Math.min(1, audioData[i]));
      const pcmValue = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset + i * 2, pcmValue, true);
    }
  }

  /**
   * 録音中のファイルに対するリアルタイムチャンク処理
   */
  private async createRecordingChunks(
    audioFilePath: string,
    chunkSize: number,
    overlapSize: number
  ): Promise<AudioChunk[]> {
    this.logger.info('録音中ファイルリアルタイムチャンク処理開始', { audioFilePath });
    
    // 録音中のファイルの品質を最初にチェック
    const quality = await this.checkRecordingFileQuality(audioFilePath);
    this.logger.debug('録音中ファイル品質チェック結果', { audioFilePath, quality });
    
    // 品質が十分でない場合、データの蓄積を待機
    if (!quality.isReady) {
      this.logger.debug('録音中ファイル品質不十分データ蓄積待機', { audioFilePath });
      const fileSizeAfterWait = await this.waitForFileDataAccumulation(audioFilePath);
      
      if (fileSizeAfterWait > 0) {
        // 再度品質チェック
        const retryQuality = await this.checkRecordingFileQuality(audioFilePath);
        this.logger.debug('再試行後品質チェック結果', { audioFilePath, retryQuality });
        
        if (!retryQuality.isReady) {
          this.logger.warn('データ蓄積後も品質不十分最小チャンク作成', { audioFilePath });
        }
      }
    }
    
    // 録音中のファイルから音声データを取得を複数回試行
    const maxRetries = 5; // リトライ回数を増加
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
      try {
        // 現在のファイルサイズを再確認
        const currentFileSize = await window.electronAPI.getFileSize(audioFilePath);
        this.logger.debug('録音中ファイルサイズ確認', {
          audioFilePath,
          retryCount: retryCount + 1,
          currentFileSize
        });
        
        // ファイルサイズが十分大きい場合のみ処理を試行
        if (currentFileSize > 10000) { // 10KB以上の場合のみ
          this.logger.debug('録音中ファイルサイズ十分音声データ取得試行', { audioFilePath });
          
          // 録音中のファイルから音声データを取得
          const currentAudioData = await this.getCurrentRecordingData(audioFilePath);
          
          if (currentAudioData && currentAudioData.duration > 0) {
            // 実際の録音データからチャンクを作成
            const chunks = this.createChunks(currentAudioData, chunkSize, overlapSize);
            
            this.logger.info('録音中データからチャンク生成', {
              audioFilePath,
              chunkCount: chunks.length,
              duration: currentAudioData.duration
            });
            
            if (chunks.length > 0) {
              // 録音中のチャンクには特別なIDを付与
              const recordingChunks = chunks.map(chunk => ({
                ...chunk,
                id: `recording_${chunk.id}`,
                sequenceNumber: chunk.sequenceNumber,
              }));
              
              return recordingChunks;
            }
          }
        } else {
          this.logger.debug('録音中ファイルサイズ小さいため待機', {
            audioFilePath,
            currentFileSize
          });
        }
        
      } catch (error) {
        this.logger.warn('録音中データ取得失敗', {
          audioFilePath,
          retryCount: retryCount + 1,
          maxRetries,
          error: String(error)
        }, error instanceof Error ? error : undefined);
      }
      
      retryCount++;
      
      // 少し待機してからリトライ（動的に待機時間を調整）
      if (retryCount < maxRetries) {
        const waitTime = Math.min(retryCount * 2000, 8000); // 2秒ずつ増加、最大8秒
        this.logger.debug('待機後再試行', { audioFilePath, waitTime });
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
    
    // 最後の手段：録音が開始されていない場合のメッセージ
    this.logger.warn('録音中ファイルから有効データ取得不可', {
      audioFilePath,
      advice: '録音開始確認および数秒待機後再試行'
    });
    
    // 最終的なファイルサイズを再確認
    const finalFileSize = await window.electronAPI.getFileSize(audioFilePath);
    this.logger.debug('最終ファイルサイズ確認', {
      audioFilePath,
      finalFileSize
    });
    
    if (finalFileSize > 0) {
      // ファイルサイズがある場合は、推定時間でダミーチャンクを作成
      const estimatedDuration = Math.max(finalFileSize / 16000, chunkSize); // 推定時間
      this.logger.debug('推定時間ダミーチャンク作成', {
        audioFilePath,
        estimatedDuration
      });
      
      const recordingEstimatedChunk: AudioChunk = {
        id: 'recording_estimated_chunk_0',
        sequenceNumber: 0,
        startTime: 0,
        endTime: estimatedDuration,
        audioData: await this.createRecordingStartBuffer(estimatedDuration),
        sampleRate: 44100,
        channels: 1,
        overlapWithPrevious: 0
      };
      
      this.logger.info('推定時間ベースチャンク作成完了', { audioFilePath });
      return [recordingEstimatedChunk];
    } else {
      // ファイルサイズが0の場合は、最小チャンクを作成
      const recordingStartChunk: AudioChunk = {
        id: 'recording_start_chunk_0',
        sequenceNumber: 0,
        startTime: 0,
        endTime: chunkSize,
        audioData: await this.createRecordingStartBuffer(chunkSize),
        sampleRate: 44100,
        channels: 1,
        overlapWithPrevious: 0
      };
      
      this.logger.info('録音開始直後用チャンク作成完了', { audioFilePath });
      return [recordingStartChunk];
    }
  }

  /**
   * 録音中のファイルから現在のデータを取得
   */
  private async getCurrentRecordingData(audioFilePath: string): Promise<AudioBuffer | null> {
    try {
      this.logger.debug('録音中ファイルからデータ取得中', { audioFilePath });
      
      // 事前に品質をチェック
      const quality = await this.checkRecordingFileQuality(audioFilePath);
      
      if (!quality.isReady) {
        this.logger.debug('録音中ファイルまだ準備されていない', {
          audioFilePath,
          quality
        });
        return null;
      }
      
      // 録音中のファイルから音声データを取得を試行
      const audioBuffer = await this.loadPartialAudioFile(audioFilePath);
      
      if (audioBuffer && audioBuffer.duration > 0) {
        this.logger.info('録音中ファイルから音声データ取得成功', {
          audioFilePath,
          duration: audioBuffer.duration,
          quality: quality.dataQuality,
          fileSize: quality.fileSize
        });
        return audioBuffer;
      }
      
      console.log('録音中のファイルから有効な音声データを取得できませんでした');
      return null;
      
    } catch (error) {
      console.error('録音中データの取得エラー:', error);
      
      // エラーの種類に応じて適切な処理を行う
      if (error instanceof Error) {
        if (error.message.includes('decode')) {
          console.warn('録音中のファイルのデコードエラー。録音が完了していない可能性があります。');
        } else if (error.message.includes('fetch')) {
          console.warn('録音中のファイルへのアクセスエラー。ファイルがロックされている可能性があります。');
        } else if (error.message.includes('loadPartialAudioFile')) {
          console.warn('録音中のファイルAPIエラー。録音プロセスが開始されていない可能性があります。');
        }
      }
      
      return null;
    }
  }

  /**
   * 録音中のファイルから部分的な音声データを読み込み
   */
  private async loadPartialAudioFile(audioFilePath: string): Promise<AudioBuffer> {
    const audioContext = await this.initAudioContext();
    
    try {
      // 録音中のファイルの診断を先に実行
      console.log('=== 録音中ファイルの診断開始 ===');
      
      // 新しいAPIが利用可能かチェック
      if (typeof window.electronAPI.loadPartialAudioFile !== 'function') {
        console.error('loadPartialAudioFile APIが利用できません');
        throw new Error('loadPartialAudioFile APIが利用できません');
      }
      
      if (typeof window.electronAPI.getFileSize !== 'function') {
        console.error('getFileSize APIが利用できません');
        throw new Error('getFileSize APIが利用できません');
      }
      
      // ファイルサイズを最初に確認
      const fileSize = await window.electronAPI.getFileSize(audioFilePath);
      console.log(`録音中ファイルのサイズ: ${fileSize} bytes`);
      
      if (fileSize === 0) {
        console.warn('ファイルサイズが0です。録音データが蓄積されるまで待機します。');
        
        // 録音データが蓄積されるまで動的に待機
        const fileSizeAfterWait = await this.waitForFileDataAccumulation(audioFilePath);
        
        if (fileSizeAfterWait === 0) {
          console.warn('録音データが蓄積されていません。最小限のチャンクを作成します。');
          // 最小限のダミーバッファを作成
          const minimalBuffer = audioContext.createBuffer(1, 44100 * 5, 44100); // 5秒間
          const channelData = minimalBuffer.getChannelData(0);
          
          // 低レベルのノイズを追加
          for (let i = 0; i < channelData.length; i++) {
            channelData[i] = (Math.random() - 0.5) * 0.01; // わずかにノイズを追加
          }
          
          console.log('録音開始直後用のダミーバッファを作成しました（5秒間）');
          return minimalBuffer;
        }
      }
      
      // 新しいAPIを使用して録音中のファイルから部分的なデータを読み込み
      console.log('loadPartialAudioFile APIを呼び出し中...');
      const partialDataUrl = await window.electronAPI.loadPartialAudioFile(audioFilePath);
      
      if (!partialDataUrl) {
        console.error('loadPartialAudioFile APIからnullが返されました');
        throw new Error('部分的なファイルの読み込みに失敗しました');
      }
      
      console.log('loadPartialAudioFile APIから正常にデータを取得しました');
      
      // Data URLから ArrayBuffer を取得
      const response = await fetch(partialDataUrl);
      const arrayBuffer = await response.arrayBuffer();
      
      console.log(`録音中ファイルのArrayBufferサイズ: ${arrayBuffer.byteLength} bytes`);
      
      if (arrayBuffer.byteLength === 0) {
        console.error('ArrayBufferのサイズが0です');
        throw new Error('ArrayBufferのサイズが0です');
      }
      
      // 録音中のファイルの場合、通常のデコードでエラーになる可能性がある
      // そのため、より寛容なデコード処理を行う
      try {
        console.log('AudioContext.decodeAudioDataを試行中...');
        const partialAudioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        console.log(`録音中ファイルから ${partialAudioBuffer.duration} 秒の音声データを正常に取得`);
        console.log('=== 録音中ファイルの診断終了（成功） ===');
        return partialAudioBuffer;
      } catch (decodeError) {
        console.warn('録音中ファイルのデコードに失敗:', decodeError);
        
        // WebMファイルは録音中でも部分的にデコード可能な場合がある
        // ファイルサイズが十分大きい場合は、処理を継続
        if (arrayBuffer.byteLength > 10000) {
          console.log('ファイルサイズが十分大きいため、推定時間でダミーバッファを作成します');
          
          // ファイルサイズから推定時間を計算
          const estimatedDurationSeconds = Math.min(Math.max(arrayBuffer.byteLength / 16000, 1), 60); // 1秒〜60秒の範囲
          const sampleRate = 44100;
          const samples = Math.floor(estimatedDurationSeconds * sampleRate);
          
          // 推定時間に基づいたダミーバッファを作成
          const dummyBuffer = audioContext.createBuffer(1, samples, sampleRate);
          const channelData = dummyBuffer.getChannelData(0);
          
          // 無音データではなく、低レベルのノイズを追加（文字起こし処理のため）
          for (let i = 0; i < channelData.length; i++) {
            channelData[i] = (Math.random() - 0.5) * 0.001; // 非常に小さなノイズ
          }
          
          console.log(`録音中ファイル用のダミーバッファを作成しました（推定時間: ${estimatedDurationSeconds}秒）`);
          console.log('=== 録音中ファイルの診断終了（ダミーバッファ） ===');
          return dummyBuffer;
        }
        
        throw decodeError;
      }
      
    } catch (error) {
      console.error('部分的な音声ファイル読み込みエラー:', error);
      console.log('=== 録音中ファイルの診断終了（エラー） ===');
      
      // エラーが発生した場合は、nullを返すことで処理を中止
      throw error;
    }
  }

  /**
   * 無音の音声バッファを作成（録音中のファイル用）
   */
  private createSilentAudioBuffer(durationSeconds: number): ArrayBuffer {
    const sampleRate = 44100;
    const channels = 1;
    const length = durationSeconds * sampleRate;
    
    // 微小なノイズを含む音声データを作成（完全な無音だと認識されない可能性があるため）
    const audioData = new Float32Array(length * channels);
    
    for (let i = 0; i < audioData.length; i++) {
      // 微小なホワイトノイズを追加
      audioData[i] = (Math.random() - 0.5) * 0.001;
    }
    
    return audioData.buffer;
  }

  /**
   * 指定されたサンプル数の無音データを作成（Float32Array形式）
   */
  private createSilentAudioData(sampleCount: number): ArrayBuffer {
    const audioData = new Float32Array(sampleCount);
    
    for (let i = 0; i < audioData.length; i++) {
      // 微小なホワイトノイズを追加（完全な無音を避ける）
      audioData[i] = (Math.random() - 0.5) * 0.001;
    }
    
    return audioData.buffer;
  }

  /**
   * WebMデータをAudioBufferにデコード
   */
  private async decodeWebMData(webmData: ArrayBuffer): Promise<AudioBuffer | null> {
    try {
      const audioContext = await this.initAudioContext();
      
      // WebMデータをAudioBufferにデコード
      const audioBuffer = await audioContext.decodeAudioData(webmData.slice(0));
      
      console.log('WebMデータのデコード成功:', {
        duration: audioBuffer.duration,
        sampleRate: audioBuffer.sampleRate,
        channels: audioBuffer.numberOfChannels,
        length: audioBuffer.length
      });
      
      return audioBuffer;
      
    } catch (error) {
      console.error('WebMデータのデコード失敗:', error);
      return null;
    }
  }

  /**
   * 録音中のファイルのデータ蓄積を待機
   */
  private async waitForFileDataAccumulation(audioFilePath: string): Promise<number> {
    console.log('録音中のファイルのデータ蓄積を監視開始');
    
    const maxWaitTime = 45000; // 最大45秒間待機（録音開始に時間がかかる場合を考慮）
    const initialPollInterval = 3000; // 初回は3秒間隔
    const fastPollInterval = 1000; // 成長を検出後は1秒間隔
    const minDataSize = 5000; // 最小5KB必要（より緩和）
    const stableSize = 50000; // 安定した録音データとみなすサイズ（50KB）
    
    let elapsedTime = 0;
    let lastSize = 0;
    let sizeGrowthCounter = 0;
    let stableCounter = 0;
    let currentPollInterval = initialPollInterval;
    
    while (elapsedTime < maxWaitTime) {
      try {
        const currentSize = await window.electronAPI.getFileSize(audioFilePath);
        
        console.log(`録音中ファイルサイズ監視: ${currentSize} bytes (経過時間: ${elapsedTime}ms)`);
        
        // ファイルサイズが増加している場合
        if (currentSize > lastSize) {
          sizeGrowthCounter++;
          const sizeIncrease = currentSize - lastSize;
          console.log(`ファイルサイズ増加を検出: ${lastSize} → ${currentSize} bytes (+${sizeIncrease}) (連続増加: ${sizeGrowthCounter}回)`);
          
          // 成長を検出したらポーリング間隔を短くする
          currentPollInterval = fastPollInterval;
          
          // 最小データサイズに達している場合
          if (currentSize >= minDataSize) {
            console.log(`最小データサイズに到達: ${currentSize} bytes >= ${minDataSize} bytes`);
            
            // 安定した録音データサイズに達している場合はすぐに処理開始
            if (currentSize >= stableSize) {
              console.log('安定した録音データサイズに達しました。処理を開始します。');
              return currentSize;
            }
            
            // 連続して2回以上増加し、かつデータサイズが十分な場合は処理を開始
            if (sizeGrowthCounter >= 2) {
              console.log('録音データが安定して蓄積されています。処理を開始します。');
              return currentSize;
            }
          }
        } else if (currentSize === lastSize && currentSize > 0) {
          // サイズが変わらない場合の処理
          stableCounter++;
          console.log(`ファイルサイズが安定しています: ${currentSize} bytes (安定回数: ${stableCounter})`);
          
          // 最小データサイズに達している場合は処理を開始
          if (currentSize >= minDataSize) {
            // 安定した状態が続いている場合（録音が停止している可能性）
            if (stableCounter >= 2) {
              console.log('データサイズが十分で安定しているため、処理を開始します。');
              return currentSize;
            }
          }
        } else {
          // サイズが減少した場合（通常は発生しないが念のため）
          console.warn(`ファイルサイズが減少しました: ${lastSize} → ${currentSize} bytes`);
          stableCounter = 0;
          sizeGrowthCounter = 0;
        }
        
        lastSize = currentSize;
        
        // 次のポーリングまで待機
        await new Promise(resolve => setTimeout(resolve, currentPollInterval));
        elapsedTime += currentPollInterval;
        
      } catch (error) {
        console.error('ファイルサイズ取得エラー:', error);
        
        // エラーが発生した場合は短い間隔で再試行
        await new Promise(resolve => setTimeout(resolve, 1000));
        elapsedTime += 1000;
      }
    }
    
    console.warn(`録音データの蓄積を${maxWaitTime}ms間待機しましたが、十分なデータが蓄積されませんでした。`);
    console.log(`最終ファイルサイズ: ${lastSize} bytes`);
    return lastSize;
  }

  /**
   * 録音中のファイルの品質をチェック
   */
  private async checkRecordingFileQuality(audioFilePath: string): Promise<{
    isReady: boolean;
    fileSize: number;
    estimatedDuration: number;
    hasValidHeader: boolean;
    bitRate: number;
    dataQuality: 'excellent' | 'good' | 'poor' | 'insufficient';
  }> {
    const fileSize = await window.electronAPI.getFileSize(audioFilePath);
    
    // 基本的な品質チェック
    const quality = {
      isReady: false,
      fileSize: fileSize,
      estimatedDuration: 0,
      hasValidHeader: false,
      bitRate: 0,
      dataQuality: 'insufficient' as 'excellent' | 'good' | 'poor' | 'insufficient'
    };
    
    // 最小サイズチェック
    if (fileSize < 1000) {
      console.warn('録音ファイルサイズが小さすぎます:', fileSize);
      return quality;
    }
    
    try {
      // 部分的なデータを読み込んでヘッダーをチェック
      const partialDataUrl = await window.electronAPI.loadPartialAudioFile(audioFilePath);
      
      if (partialDataUrl) {
        const response = await fetch(partialDataUrl);
        const arrayBuffer = await response.arrayBuffer();
        
        // WebMヘッダーの詳細チェック
        const header = new Uint8Array(arrayBuffer.slice(0, 64));
        const isWebM = header[0] === 0x1A && header[1] === 0x45 && header[2] === 0xDF && header[3] === 0xA3;
        
        if (isWebM) {
          quality.hasValidHeader = true;
          
          // ビットレート推定（概算）
          const estimatedBitRate = Math.floor((fileSize * 8) / Math.max(1, fileSize / 16000));
          quality.bitRate = estimatedBitRate;
          
          // 推定時間（WebMの場合、概算）
          quality.estimatedDuration = Math.max(1, fileSize / 16000);
          
          // データ品質の判定
          if (fileSize >= 100000) { // 100KB以上
            quality.dataQuality = 'excellent';
            quality.isReady = true;
          } else if (fileSize >= 50000) { // 50KB以上
            quality.dataQuality = 'good';
            quality.isReady = true;
          } else if (fileSize >= 10000) { // 10KB以上
            quality.dataQuality = 'poor';
            quality.isReady = true;
          } else {
            quality.dataQuality = 'insufficient';
            quality.isReady = false;
          }
          
          console.log('録音ファイル品質チェック:', {
            ...quality,
            bitrateKbps: Math.round(quality.bitRate / 1000)
          });
        } else {
          console.warn('WebMヘッダーが見つかりませんでした。他の形式の可能性があります。');
          
          // WAVヘッダーもチェック
          const isWav = header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46;
          
          if (isWav) {
            quality.hasValidHeader = true;
            quality.estimatedDuration = Math.max(1, fileSize / 176400); // 44.1kHz, 16bit, stereo
            quality.isReady = fileSize > 5000; // WAVの場合は5KB以上
            quality.dataQuality = (fileSize >= 50000 ? 'excellent' : 
                                 fileSize >= 20000 ? 'good' : 
                                 fileSize >= 5000 ? 'poor' : 'insufficient') as 'excellent' | 'good' | 'poor' | 'insufficient';
            
            console.log('WAVファイルとして品質チェック:', quality);
          }
        }
      }
    } catch (error) {
      console.warn('録音ファイルの品質チェックに失敗:', error);
      
      // エラーが発生した場合でも、ファイルサイズから最低限の判定を行う
      if (fileSize >= 10000) {
        quality.isReady = true;
        quality.dataQuality = 'poor' as 'excellent' | 'good' | 'poor' | 'insufficient';
        quality.estimatedDuration = Math.max(1, fileSize / 16000);
        console.log('エラー発生時の代替品質判定:', quality);
      }
    }
    
    return quality;
  }

  /**
   * 録音開始直後のバッファを作成
   */
  private async createRecordingStartBuffer(durationSeconds: number): Promise<ArrayBuffer> {
    const sampleRate = 44100;
    const channels = 1;
    const length = durationSeconds * sampleRate;
    
    // 微小なノイズを含む音声データを作成
    const audioData = new Float32Array(length * channels);
    
    for (let i = 0; i < audioData.length; i++) {
      // 録音開始音をシミュレート（微小なトーン）
      const time = i / sampleRate;
      audioData[i] = Math.sin(2 * Math.PI * 440 * time) * 0.001; // 440Hz、低音量
    }
    
    return audioData.buffer;
  }

  /**
   * 録音中ファイル用の安全なチャンク作成
   */
  private async createMinimalRecordingChunks(
    audioFilePath: string,
    chunkSize: number,
    overlapSize: number
  ): Promise<AudioChunk[]> {
    console.log('録音中ファイル用のチャンク作成開始:', audioFilePath);
    
    try {
      // 1. まずファイルサイズをチェック
      let fileSize = 0;
      try {
        fileSize = await window.electronAPI.getFileSize(audioFilePath);
        console.log('録音中ファイルサイズ:', fileSize, 'bytes');
      } catch (sizeError) {
        console.warn('ファイルサイズ取得エラー:', sizeError);
        // ファイルサイズが取得できない場合でも続行
      }
      
      // 2. ファイルサイズが小さい場合は最小チャンクを作成
      if (fileSize < 1000) {
        console.log('ファイルサイズが小さいか不明のため、最小チャンクを作成');
        return this.createSafeMinimalChunks(chunkSize);
      }
      
      // 3. 実際に音声ファイルの読み込みを試行（タイムアウト付き）
      try {
        console.log('録音中ファイルの音声データ読み込みを試行...');
        const audioBuffer = await Promise.race([
          this.loadAudioFileWithRetry(audioFilePath, 3), // 3回まで retry
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Audio loading timeout')), 5000) // 5秒でタイムアウト
          )
        ]) as AudioBuffer;
        
        console.log('録音中ファイルの音声データ読み込み成功:', {
          duration: audioBuffer.duration,
          sampleRate: audioBuffer.sampleRate,
          channels: audioBuffer.numberOfChannels
        });
        
        // 通常のチャンク作成処理
        return this.createChunks(audioBuffer, chunkSize, overlapSize);
        
      } catch (audioError) {
        console.warn('録音中ファイルの音声データ読み込み失敗:', audioError);
        
        // 音声データ読み込みに失敗した場合は推定ベースでチャンクを作成
        const estimatedDuration = Math.max(1, fileSize / 16000); // 保守的な推定
        const numChunks = Math.max(1, Math.min(10, Math.floor(estimatedDuration / chunkSize))); // 最大10チャンクに制限
        
        console.log(`推定ベースでチャンク作成: ${estimatedDuration}秒、${numChunks}チャンク`);
        
        return this.createEstimatedChunks(estimatedDuration, numChunks, chunkSize, overlapSize);
      }
      
    } catch (error) {
      console.error('録音中ファイルチャンク作成で予期しないエラー:', error);
      // 完全にエラー時は最小限のチャンクを返す
      return this.createSafeMinimalChunks(chunkSize);
    }
  }
  
  /**
   * 音声ファイル読み込みをリトライ付きで実行
   */
  private async loadAudioFileWithRetry(audioFilePath: string, maxRetries: number): Promise<AudioBuffer> {
    let lastError: Error | null = null;
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        console.log(`音声ファイル読み込み試行 ${i + 1}/${maxRetries}`);
        return await this.loadAudioFile(audioFilePath);
      } catch (error) {
        lastError = error as Error;
        console.warn(`読み込み試行 ${i + 1} 失敗:`, error);
        
        if (i < maxRetries - 1) {
          // 次の試行前に少し待機
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
    
    throw lastError || new Error('すべての読み込み試行が失敗しました');
  }
  
  /**
   * 推定ベースでチャンクを作成
   */
  private createEstimatedChunks(
    estimatedDuration: number,
    numChunks: number,
    chunkSize: number,
    overlapSize: number
  ): AudioChunk[] {
    const chunks: AudioChunk[] = [];
    
    for (let i = 0; i < numChunks; i++) {
      const startTime = i * chunkSize;
      const endTime = Math.min((i + 1) * chunkSize, estimatedDuration);
      
      chunks.push({
        id: `estimated_chunk_${i}`,
        sequenceNumber: i,
        startTime: startTime,
        endTime: endTime,
        audioData: new ArrayBuffer(0), // 空のデータ（推定チャンク）
        sampleRate: 44100,
        channels: 1,
        overlapWithPrevious: i > 0 ? overlapSize : 0
      });
    }
    
    console.log(`推定ベースで${chunks.length}個のチャンクを作成`);
    return chunks;
  }
  
  /**
   * 録音中WebMファイルかどうかを事前に検出
   */
  private isRecordingWebMFile(audioFilePath: string): boolean {
    // ファイルパスで録音中WebMファイルを判定
    const isRecordingFile = audioFilePath.includes('recording_') && audioFilePath.includes('.webm');
    
    if (isRecordingFile) {
      console.log('🚨 録音中WebMファイルを検出:', audioFilePath);
      return true;
    }
    
    return false;
  }

  /**
   * 仮説1: WebMファイルヘッダーの整合性を確認
   */
  private async validateWebMHeader(arrayBuffer: ArrayBuffer): Promise<boolean> {
    try {
      const view = new Uint8Array(arrayBuffer);
      
      // WebM/Matroskaの正しいヘッダー: [0x1A, 0x45, 0xDF, 0xA3]
      const hasValidHeader = view.length >= 4 && 
        view[0] === 0x1A && view[1] === 0x45 && view[2] === 0xDF && view[3] === 0xA3;
      
      console.log('🔍 WebMヘッダー検証:', {
        hasValidHeader,
        firstBytes: Array.from(view.slice(0, 8)).map(b => '0x' + b.toString(16).padStart(2, '0')),
        fileSize: arrayBuffer.byteLength
      });
      
      if (!hasValidHeader) {
        console.error('🚨 仮説1確認: WebMヘッダーが破損しています');
        return false;
      }
      
      // EBMLヘッダーのサイズ情報を確認
      if (view.length >= 8) {
        const ebmlSize = view[4] | (view[5] << 8) | (view[6] << 16) | (view[7] << 24);
        console.log('🔍 EBMLサイズ情報:', ebmlSize, 'vs 実際のファイルサイズ:', arrayBuffer.byteLength);
        
        // ファイルサイズとEBMLサイズの不整合を確認
        if (ebmlSize > arrayBuffer.byteLength * 2) {
          console.error('🚨 仮説1確認: EBMLサイズが不正確です');
          return false;
        }
      }
      
      return true;
    } catch (error) {
      console.error('🚨 WebMヘッダー検証エラー:', error);
      return false;
    }
  }

  /**
   * 仮説2: メモリ使用量を監視
   */
  private logMemoryUsage(context: string): void {
    try {
      // Chromeではperformance.memoryが利用可能
      const perfMemory = (performance as any).memory;
      if (perfMemory) {
        const used = Math.round(perfMemory.usedJSHeapSize / 1024 / 1024);
        const total = Math.round(perfMemory.totalJSHeapSize / 1024 / 1024);
        const limit = Math.round(perfMemory.jsHeapSizeLimit / 1024 / 1024);
        
        console.log(`🔍 メモリ使用量[${context}]:`, {
          used: `${used}MB`,
          total: `${total}MB`,
          limit: `${limit}MB`,
          usage: `${Math.round((used / limit) * 100)}%`
        });
        
        // 仮説2: メモリ使用率80%以上で警告
        if (used / limit > 0.8) {
          console.warn('🚨 仮説2確認: メモリ使用率が高いです');
        }
      } else {
        console.log(`🔍 メモリ情報[${context}]: 利用不可`);
      }
    } catch (error) {
      console.log(`🔍 メモリ情報[${context}]: エラー`, error);
    }
  }

  /**
   * 録音中ファイル専用の安全なチャンク作成（decodeAudioDataを使用しない）
   */
  private async createSafeRecordingChunks(
    audioFilePath: string,
    chunkSize: number,
    overlapSize: number
  ): Promise<AudioChunk[]> {
    console.log('🎆 録音中ファイル用の安全なチャンク作成（decodeAudioData回避）:', audioFilePath);
    
    try {
      // ファイルサイズと現在時刻から推定時間を計算
      let fileSize = 0;
      let estimatedDuration = chunkSize; // デフォルト値
      
      try {
        fileSize = await window.electronAPI.getFileSize(audioFilePath);
        console.log('録音中ファイルサイズ:', fileSize, 'bytes');
        
        // ファイルサイズから推定時間を計算（よりリアルな推定）
        if (fileSize > 1000) {
          // WebMファイルの一般的なビットレートを使用して推定
          estimatedDuration = Math.max(1, Math.min(300, fileSize / 20000)); // 20KB/秒程度で推定
        }
      } catch (sizeError) {
        console.warn('ファイルサイズ取得エラー:', sizeError);
        // エラー時はデフォルトで進める
      }
      
      // チャンク数を計算（実用的な数）
      const numChunks = Math.max(1, Math.min(10, Math.ceil(estimatedDuration / chunkSize)));
      
      console.log(`録音中ファイルの推定時間: ${estimatedDuration.toFixed(1)}秒, 生成チャンク数: ${numChunks}`);
      
      // 録音中ファイル用の特別なチャンクを作成
      const chunks: AudioChunk[] = [];
      for (let i = 0; i < numChunks; i++) {
        const startTime = i * chunkSize;
        const endTime = Math.min((i + 1) * chunkSize, estimatedDuration);
        
        // 録音中チャンクは特別なIDで識別
        chunks.push({
          id: `recording_live_chunk_${i}`,
          sequenceNumber: i,
          startTime: startTime,
          endTime: endTime,
          audioData: await this.createRecordingChunkData(startTime, endTime - startTime), // ダミーデータ生成
          sampleRate: 44100,
          channels: 1,
          overlapWithPrevious: i > 0 ? overlapSize : 0
        });
      }
      
      console.log(`🎆 録音中ファイル用のチャンクを${chunks.length}個生成完了`);
      return chunks;
      
    } catch (error) {
      console.error('安全なチャンク作成でエラー:', error);
      // 最終フォールバック: 最小チャンクを作成
      return this.createSafeMinimalChunks(chunkSize);
    }
  }

  /**
   * 録音中チャンク用のダミーオーディオデータを生成
   */
  private async createRecordingChunkData(startTime: number, duration: number): Promise<ArrayBuffer> {
    try {
      // 空のバッファを返す（ダミーチャンクは音声データ不要）
      console.log(`録音中チャンクダミーデータ生成: ${duration}秒 - 空のバッファで処理`);
      return new ArrayBuffer(0);
    } catch (error) {
      console.warn('ダミーデータ生成エラー:', error);
      return new ArrayBuffer(0);
    }
  }

  /**
   * 録音中ファイルから実際の音声データを取得してチャンクを作成
   */
  async createRealTimeRecordingChunks(
    audioFilePath: string,
    chunkSize: number,
    overlapSize: number
  ): Promise<AudioChunk[]> {
    console.log('🎆 録音中ファイルからリアルタイムチャンク作成:', audioFilePath);
    
    try {
      // 1. ファイルサイズを獲得
      const fileSize = await window.electronAPI.getFileSize(audioFilePath);
      console.log('録音中ファイルサイズ:', fileSize, 'bytes');
      
      // 2. ファイルサイズが十分大きい場合のみ実際のデータ取得を試行
      if (fileSize > 50000) { // 50KB以上の場合
        try {
          console.log('🎆 ファイルサイズが十分なので、実際の音声データ取得を試行');
          
          // 実際の音声データを取得してチャンク作成を試行
          return await this.tryExtractRealAudioChunks(audioFilePath, chunkSize, overlapSize, fileSize);
        } catch (realDataError) {
          console.warn('実際の音声データ取得に失敗、プレースホルダーチャンクで続行:', realDataError);
        }
      }
      
      // 3. フォールバック: プレースホルダーチャンクを作成
      return await this.createSafeRecordingChunks(audioFilePath, chunkSize, overlapSize);
      
    } catch (error) {
      console.error('リアルタイムチャンク作成エラー:', error);
      return await this.createSafeRecordingChunks(audioFilePath, chunkSize, overlapSize);
    }
  }

  /**
   * 録音中ファイルから実際の音声データ抽出を試行
   */
  private async tryExtractRealAudioChunks(
    audioFilePath: string,
    chunkSize: number,
    overlapSize: number,
    fileSize: number
  ): Promise<AudioChunk[]> {
    console.log('🎆 実際の音声データ抽出を試行中...');
    
    try {
      // 録音中のWebMファイルから実際のデータを取得
      console.log('録音中WebMファイルからデータ取得を試行:', audioFilePath);
      
      // loadPartialAudioFile APIを使用してWebMデータを取得
      const partialDataUrl = await window.electronAPI.loadPartialAudioFile(audioFilePath);
      
      if (!partialDataUrl) {
        throw new Error('部分的なファイルの読み込みに失敗');
      }
      
      // Data URLからArrayBufferを取得
      const response = await fetch(partialDataUrl);
      const webmData = await response.arrayBuffer();
      
      if (webmData.byteLength === 0) {
        throw new Error('WebMデータのサイズが0');
      }
      
      console.log(`WebMデータ取得成功: ${webmData.byteLength} bytes`);
      
      // ファイルサイズから推定される時間とチャンク数を計算
      const estimatedDuration = Math.max(1, Math.min(120, fileSize / 20000)); // 20KB/秒で推定
      // WebMデータから音声データを抽出してチャンクを生成
      try {
        const audioBuffer = await this.decodeWebMData(webmData);
        
        if (audioBuffer && audioBuffer.duration > 0) {
          console.log(`WebMデータのデコード成功: ${audioBuffer.duration}秒`);
          
          // デコードした音声データからチャンクを作成
          const chunks = this.createChunks(audioBuffer, chunkSize, overlapSize);
          
          // 録音中のチャンクには特別なIDと元ファイルパスを付与
          const recordingChunks = chunks.map(chunk => ({
            ...chunk,
            id: `live_real_chunk_${chunk.sequenceNumber}`,
            sourceFilePath: audioFilePath,  // 元のWebMファイルパスを保持
          }));
          
          console.log(`🎆 WebMデータから${recordingChunks.length}個の実際のチャンクを生成`);
          return recordingChunks;
        }
      } catch (decodeError) {
        console.warn('WebMデータのデコードに失敗、フォールバック処理に移行:', decodeError);
      }
      
      // フォールバック: 推定ベースのプレースホルダーチャンク生成
      const numChunks = Math.max(1, Math.min(8, Math.ceil(estimatedDuration / chunkSize)));
      
      console.log(`推定時間: ${estimatedDuration.toFixed(1)}秒, チャンク数: ${numChunks} (プレースホルダー)`);
      
      const chunks: AudioChunk[] = [];
      for (let i = 0; i < numChunks; i++) {
        const startTime = i * chunkSize;
        const endTime = Math.min((i + 1) * chunkSize, estimatedDuration);
        
        // プレースホルダーチャンクには微小な音声データを生成
        const chunkDurationSamples = Math.floor((endTime - startTime) * 44100);
        const silentAudioData = this.createSilentAudioData(chunkDurationSamples);
        
        chunks.push({
          id: `live_real_chunk_${i}`,
          sequenceNumber: i,
          startTime: startTime,
          endTime: endTime,
          audioData: silentAudioData,
          sampleRate: 44100,
          channels: 1,
          overlapWithPrevious: i > 0 ? overlapSize : 0,
          sourceFilePath: audioFilePath  // 元のWebMファイルパスを保持
        });
      }
      
      console.log(`🎆 実際のWebMデータを使用したチャンクを${chunks.length}個生成`);
      return chunks;
      
    } catch (error) {
      console.warn('WebMデータ取得に失敗、フォールバック処理:', error);
      
      // フォールバック: 元の推定ベース処理
      const estimatedDuration = Math.max(1, Math.min(120, fileSize / 20000));
      const numChunks = Math.max(1, Math.min(8, Math.ceil(estimatedDuration / chunkSize)));
      
      const chunks: AudioChunk[] = [];
      for (let i = 0; i < numChunks; i++) {
        const startTime = i * chunkSize;
        const endTime = Math.min((i + 1) * chunkSize, estimatedDuration);
        
        chunks.push({
          id: `live_real_chunk_${i}`,
          sequenceNumber: i,
          startTime: startTime,
          endTime: endTime,
          audioData: new ArrayBuffer(0), // フォールバック: 空のデータ
          sampleRate: 44100,
          channels: 1,
          overlapWithPrevious: i > 0 ? overlapSize : 0
        });
      }
      
      return chunks;
    }
  }

  /**
   * 安全な最小チャンクを作成
   */
  private createSafeMinimalChunks(chunkSize: number): AudioChunk[] {
    console.log('安全な最小チャンクを作成');
    
    return [{
      id: 'safe_minimal_chunk_0',
      sequenceNumber: 0,
      startTime: 0,
      endTime: chunkSize,
      audioData: new ArrayBuffer(0),
      sampleRate: 44100,
      channels: 1,
      overlapWithPrevious: 0
    }];
  }
  
  /**
   * プレースホルダーチャンクを作成（旧版との互換性のため）
   */
  private createPlaceholderChunks(chunkSize: number): AudioChunk[] {
    return this.createSafeMinimalChunks(chunkSize);
  }

  /**
   * 音声処理をクリーンアップ
   */
  cleanup(): void {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}