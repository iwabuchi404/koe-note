/**
 * AudioWorkletRecordingService
 * 
 * AudioWorklet + lamejsによるリアルタイムMP3エンコード録音システム
 * MediaRecorder APIを完全に排除し、安定したチャンク生成を実現
 */

// lamejsはグローバルスコープから取得（<script>タグで読み込み済み）
declare const lamejs: any;

import { TranscriptionWebSocketService, TranscriptionResult, TranscriptionProgress } from './TranscriptionWebSocketService';

export interface AudioSourceConfig {
  type: 'microphone' | 'desktop' | 'mix';
  deviceId?: string;
  desktopSourceId?: string;
}

export interface ChunkReadyEvent {
  chunk: Blob;
  chunkNumber: number;
  timestamp: number;
  size: number;
}

export interface RecordingStats {
  duration: number;
  chunksGenerated: number;
  totalDataSize: number;
  currentBitrate: number;
  processedSamples: number;
}

export interface TranscriptionConfig {
  enabled: boolean;
  serverUrl?: string;
  language?: string;
}

export class AudioWorkletRecordingService {
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private stream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  
  // MP3エンコーダー
  private mp3Encoder: any | null = null;
  private mp3Buffer: Int8Array[] = [];
  private chunkSizeThreshold: number = 64 * 1024; // 64KB（文字起こし送信を考慮してサイズを縮小）
  
  // 録音状態
  private isRecording: boolean = false;
  private recordingStartTime: number = 0;
  private chunkCount: number = 0;
  private totalDataSize: number = 0;
  private processedSamples: number = 0;
  
  // コールバック
  private onChunkReady: (event: ChunkReadyEvent) => void;
  private onError: (error: Error) => void;
  private onStatsUpdate: (stats: RecordingStats) => void;
  private onTranscriptionResult?: (result: TranscriptionResult) => void;
  private onTranscriptionProgress?: (progress: TranscriptionProgress) => void;
  
  // 文字起こし機能
  private transcriptionService: TranscriptionWebSocketService | null = null;
  private transcriptionConfig: TranscriptionConfig | null = null;
  
  // 統計更新タイマー
  private statsTimer: NodeJS.Timeout | null = null;

  constructor(
    onChunkReadyCallback: (event: ChunkReadyEvent) => void,
    onErrorCallback?: (error: Error) => void,
    onStatsUpdateCallback?: (stats: RecordingStats) => void,
    onTranscriptionResultCallback?: (result: TranscriptionResult) => void,
    onTranscriptionProgressCallback?: (progress: TranscriptionProgress) => void
  ) {
    this.onChunkReady = onChunkReadyCallback;
    this.onError = onErrorCallback || ((error) => console.error('🎵 録音エラー:', error));
    this.onStatsUpdate = onStatsUpdateCallback || (() => {});
    this.onTranscriptionResult = onTranscriptionResultCallback;
    this.onTranscriptionProgress = onTranscriptionProgressCallback;
  }

  /**
   * 文字起こし設定
   */
  setTranscriptionConfig(config: TranscriptionConfig): void {
    this.transcriptionConfig = config;
    console.log('🎵 文字起こし設定更新:', config);
  }

  /**
   * 録音開始（音声ソース設定付き）
   */
  async startWithConfig(config: AudioSourceConfig): Promise<void> {
    try {
      console.log('🎵 AudioWorkletRecordingService: 録音開始', config);
      
      // 音声ストリーム取得
      const stream = await this.getAudioStream(config);
      await this.start(stream);
      
    } catch (error) {
      this.onError(error as Error);
      throw error;
    }
  }

  /**
   * 音声ストリーム取得
   */
  private async getAudioStream(config: AudioSourceConfig): Promise<MediaStream> {
    console.log('🎵 音声ストリーム取得開始:', config.type);

    switch (config.type) {
      case 'microphone':
        try {
          console.log('🎤 マイクロフォン音声取得を開始');
          
          const micStream = await navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: config.deviceId ? { exact: config.deviceId } : undefined,
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
              sampleRate: 44100,
              channelCount: 1 // モノラル
            },
            video: false
          });
          
          console.log('🎤 マイクロフォンストリーム取得成功');
          return micStream;
          
        } catch (error) {
          if (error instanceof Error) {
            if (error.name === 'AbortError' || error.message.includes('aborted')) {
              throw new Error('マイクロフォンアクセスがキャンセルされました。ブラウザダイアログで「許可」をクリックしてください。');
            } else if (error.name === 'NotAllowedError') {
              throw new Error('マイクロフォンアクセスが拒否されました。ブラウザ設定でマイクロフォンを許可してください。');
            } else if (error.name === 'NotFoundError') {
              throw new Error('マイクロフォンデバイスが見つかりません。マイクが接続されているか確認してください。');
            }
          }
          throw error;
        }

      case 'desktop':
        try {
          console.log('🖥️ デスクトップ音声取得を開始（画面共有ダイアログが表示されます）');
          
          // @ts-ignore - getDisplayMediaの音声取得
          const desktopStream = await navigator.mediaDevices.getDisplayMedia({
            audio: {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
              sampleRate: 44100
            },
            video: { width: { ideal: 1 }, height: { ideal: 1 } }
          });
          
          console.log('🖥️ デスクトップストリーム取得成功');
          
          // 映像トラックを削除
          const videoTracks = desktopStream.getVideoTracks();
          videoTracks.forEach(track => {
            track.stop();
            desktopStream.removeTrack(track);
          });
          
          // 音声トラックが存在するかチェック
          const audioTracks = desktopStream.getAudioTracks();
          if (audioTracks.length === 0) {
            throw new Error('デスクトップ音声が取得できませんでした。画面共有時に「システム音声を共有」にチェックを入れてください。');
          }
          
          console.log('🎵 デスクトップ音声トラック確認完了:', audioTracks.length);
          return desktopStream;
          
        } catch (error) {
          if (error instanceof Error) {
            if (error.name === 'AbortError' || error.message.includes('aborted')) {
              throw new Error('デスクトップ音声の取得がキャンセルされました。画面共有ダイアログで「共有」をクリックし、「システム音声を共有」にチェックを入れてください。');
            } else if (error.name === 'NotAllowedError') {
              throw new Error('デスクトップ音声の取得が拒否されました。ブラウザ設定で画面共有を許可してください。');
            } else if (error.name === 'NotFoundError') {
              throw new Error('デスクトップ音声デバイスが見つかりません。システム音声が有効か確認してください。');
            }
          }
          throw error;
        }

      case 'mix':
        // ミックス録音（簡易実装：マイクのみ、実際の混合は後で実装）
        console.warn('🎵 ミックス録音は現在マイクのみです');
        return await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: config.deviceId ? { exact: config.deviceId } : undefined,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            sampleRate: 44100,
            channelCount: 1
          },
          video: false
        });

      default:
        throw new Error(`未対応の音声ソースタイプ: ${config.type}`);
    }
  }

  /**
   * 録音開始（メインロジック）
   */
  async start(stream: MediaStream): Promise<void> {
    try {
      console.log('🎵 AudioWorkletRecordingService: 録音初期化開始');
      
      // AudioContext初期化
      this.audioContext = new AudioContext({
        sampleRate: 44100,
        latencyHint: 'interactive'
      });
      
      console.log('🎵 AudioContext作成完了:', {
        sampleRate: this.audioContext.sampleRate,
        state: this.audioContext.state
      });

      // AudioWorkletを登録（inline形式で埋め込み）
      const workletCode = this.createPCMProcessorCode();
      const blob = new Blob([workletCode], { type: 'application/javascript' });
      const workletUrl = URL.createObjectURL(blob);
      
      try {
        await this.audioContext.audioWorklet.addModule(workletUrl);
        console.log('🎵 AudioWorklet モジュール登録完了');
      } finally {
        URL.revokeObjectURL(workletUrl);
      }

      // AudioWorkletNode作成
      this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor');
      
      // WorkletNodeからのメッセージ処理
      this.workletNode.port.onmessage = (event) => {
        this.handleWorkletMessage(event.data);
      };
      
      console.log('🎵 AudioWorkletNode作成完了');

      // 音声ストリームをAudioWorkletに接続
      this.stream = stream;
      this.sourceNode = this.audioContext.createMediaStreamSource(stream);
      this.sourceNode.connect(this.workletNode);
      
      console.log('🎵 音声ストリーム接続完了');

      // MP3エンコーダー初期化
      this.initializeMp3Encoder();
      
      // 録音状態初期化
      this.isRecording = true;
      this.recordingStartTime = Date.now();
      this.chunkCount = 0;
      this.totalDataSize = 0;
      this.processedSamples = 0;
      this.mp3Buffer = [];
      
      // 統計更新開始
      this.startStatsUpdates();
      
      // 文字起こし機能の初期化
      if (this.transcriptionConfig?.enabled) {
        try {
          await this.initializeTranscriptionService();
        } catch (error) {
          console.warn('🎵 文字起こしサービス初期化失敗、録音は継続します:', error);
          // 文字起こしサービスの初期化に失敗しても録音は継続
          this.transcriptionService = null;
        }
      }
      
      console.log('🎵 AudioWorkletRecordingService: 録音開始完了');
      
    } catch (error) {
      console.error('🎵 録音開始エラー:', error);
      await this.cleanup();
      throw error;
    }
  }

  /**
   * PCMProcessorWorkletのコードを生成
   */
  private createPCMProcessorCode(): string {
    return `
      /**
       * PCMProcessorWorklet - AudioWorkletProcessorベースのPCMデータ取得
       */
      class PCMProcessorWorklet extends AudioWorkletProcessor {
        constructor() {
          super();
          this.processCount = 0;
          this.lastReportTime = 0;
          console.log('🎵 PCMProcessorWorklet: 初期化完了');
        }

        process(inputs, outputs, parameters) {
          const input = inputs[0];
          
          if (!input || input.length === 0) {
            return true;
          }

          const channelData = input[0];
          
          if (!channelData || channelData.length === 0) {
            return true;
          }

          try {
            // PCMデータをメインスレッドに送信
            this.port.postMessage({
              type: 'pcm-data',
              data: channelData,
              sampleRate: sampleRate,
              timestamp: currentTime,
              frameCount: channelData.length
            });

            this.processCount++;

            // 1秒ごとに処理統計をレポート
            if (currentTime - this.lastReportTime >= 1.0) {
              this.port.postMessage({
                type: 'stats',
                processCount: this.processCount,
                sampleRate: sampleRate,
                timestamp: currentTime
              });
              this.lastReportTime = currentTime;
            }

          } catch (error) {
            console.error('🎵 PCMProcessorWorklet: データ送信エラー:', error);
            
            this.port.postMessage({
              type: 'error',
              message: error.message,
              timestamp: currentTime
            });
          }

          return true;
        }
      }

      // AudioWorkletProcessorとして登録
      registerProcessor('pcm-processor', PCMProcessorWorklet);
      console.log('🎵 PCMProcessorWorklet: AudioWorkletProcessor登録完了');
    `;
  }

  /**
   * 文字起こしサービス初期化
   */
  private async initializeTranscriptionService(): Promise<void> {
    if (!this.transcriptionConfig?.enabled) {
      console.log('🎵 文字起こし機能は無効です');
      return;
    }

    try {
      console.log('🎵 文字起こしサービス初期化開始');
      
      const serverUrl = this.transcriptionConfig.serverUrl || 'ws://localhost:8770';
      
      this.transcriptionService = new TranscriptionWebSocketService(serverUrl, {
        onConnectionChange: (connected) => {
          console.log('🎵 文字起こしサーバー接続状態:', connected);
        },
        onTranscriptionResult: (result) => {
          console.log('🎵 文字起こし結果受信:', result.text);
          this.onTranscriptionResult?.(result);
        },
        onTranscriptionProgress: (progress) => {
          console.log('🎵 文字起こし進捗:', progress.status);
          this.onTranscriptionProgress?.(progress);
        },
        onError: (error) => {
          console.error('🎵 文字起こしエラー:', error);
          this.onError(new Error(`文字起こしエラー: ${error}`));
        }
      });

      // サーバーに接続
      const connected = await this.transcriptionService.connect();
      if (connected) {
        console.log('🎵 文字起こしサービス初期化完了');
      } else {
        console.warn('🎵 文字起こしサーバーへの接続に失敗');
      }
      
    } catch (error) {
      console.error('🎵 文字起こしサービス初期化エラー:', error);
      this.transcriptionService = null;
    }
  }

  /**
   * MP3エンコーダー初期化（lamejsグローバル変数使用）
   */
  private initializeMp3Encoder(): void {
    try {
      console.log('🎵 MP3エンコーダー初期化開始');
      
      // lamejsが定義されているかチェック（グローバル変数）
      if (typeof lamejs === 'undefined') {
        throw new Error('lamejsライブラリがグローバルスコープにロードされていません。index.htmlのscriptタグを確認してください。');
      }
      
      console.log('🎵 グローバルlamejs確認:', { 
        lamejs: typeof lamejs, 
        Mp3Encoder: typeof lamejs?.Mp3Encoder,
        keys: lamejs ? Object.keys(lamejs) : 'undefined'
      });
      
      // Mp3Encoderが使用可能かチェック
      if (!lamejs || typeof lamejs.Mp3Encoder !== 'function') {
        throw new Error('lamejs.Mp3Encoderが関数として定義されていません');
      }
      
      // モノラル、44.1kHz、128kbps
      this.mp3Encoder = new lamejs.Mp3Encoder(1, 44100, 128);
      console.log('🎵 MP3エンコーダー初期化完了');
      
    } catch (error) {
      console.error('🎵 MP3エンコーダー初期化エラー:', error);
      
      // エラー時はフォールバック（WAV形式）
      console.warn('🎵 MP3エンコーダー初期化失敗、WAV形式にフォールバック');
      this.mp3Encoder = {
        isWavFallback: true,
        initialized: true,
        sampleRate: 44100,
        channels: 1
      };
    }
  }

  /**
   * AudioWorkletからのメッセージ処理
   */
  private handleWorkletMessage(data: any): void {
    try {
      switch (data.type) {
        case 'pcm-data':
          this.processPcmData(data.data, data.frameCount);
          break;
          
        case 'stats':
          // Worklet側の統計情報（デバッグ用）
          console.log('🎵 Worklet統計:', data);
          break;
          
        case 'error':
          console.error('🎵 Workletエラー:', data.message);
          this.onError(new Error(`AudioWorkletエラー: ${data.message}`));
          break;
          
        default:
          console.warn('🎵 未知のWorkletメッセージ:', data.type);
      }
    } catch (error) {
      console.error('🎵 Workletメッセージ処理エラー:', error);
      this.onError(error as Error);
    }
  }

  /**
   * PCMデータ処理・MP3エンコード
   */
  private processPcmData(pcmData: Float32Array, frameCount: number): void {
    if (!this.mp3Encoder || !this.isRecording) {
      return;
    }

    try {
      // Float32ArrayをInt16Arrayに変換（MP3エンコード用）
      const int16Data = new Int16Array(frameCount);
      for (let i = 0; i < frameCount; i++) {
        // Float32 (-1.0 to 1.0) を Int16 (-32768 to 32767) に変換
        const sample = Math.max(-1, Math.min(1, pcmData[i]));
        int16Data[i] = sample * 32767;
      }

      // MP3エンコーダーの種類に応じて処理を分岐
      if (this.mp3Encoder.isWavFallback) {
        // WAVフォールバック：PCMデータを直接保存
        const pcmBuffer = new Int8Array(int16Data.buffer);
        this.mp3Buffer.push(pcmBuffer);
        this.totalDataSize += pcmBuffer.length;
      } else {
        // lamejsでMP3エンコード
        const mp3buf = this.mp3Encoder.encodeBuffer(int16Data);
        
        if (mp3buf && mp3buf.length > 0) {
          // エンコード結果をバッファに追加
          this.mp3Buffer.push(new Int8Array(mp3buf));
          this.totalDataSize += mp3buf.length;
        }
      }

      this.processedSamples += frameCount;

      // チャンクサイズチェック
      this.checkAndFlushChunk();
      
    } catch (error) {
      console.error('🎵 PCMデータ処理エラー:', error);
      this.onError(error as Error);
    }
  }

  /**
   * PCMデータからWAVファイルを作成
   */
  private createWavBlob(pcmBuffers: Int8Array[]): Blob {
    try {
      // PCMデータのサイズを計算
      const totalPcmSize = pcmBuffers.reduce((sum, buffer) => sum + buffer.length, 0);
      const sampleRate = 44100;
      const channels = 1;
      const bitsPerSample = 16;
      
      // WAVヘッダーサイズ
      const headerSize = 44;
      const fileSize = headerSize + totalPcmSize - 8;
      
      // WAVヘッダーを作成
      const wavHeader = new ArrayBuffer(headerSize);
      const view = new DataView(wavHeader);
      
      // RIFFヘッダー
      const writeString = (offset: number, str: string) => {
        for (let i = 0; i < str.length; i++) {
          view.setUint8(offset + i, str.charCodeAt(i));
        }
      };
      
      writeString(0, 'RIFF');
      view.setUint32(4, fileSize, true);
      writeString(8, 'WAVE');
      
      // fmtチャンク
      writeString(12, 'fmt ');
      view.setUint32(16, 16, true); // fmtチャンクサイズ
      view.setUint16(20, 1, true);  // PCMフォーマット
      view.setUint16(22, channels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * channels * bitsPerSample / 8, true); // バイトレート
      view.setUint16(32, channels * bitsPerSample / 8, true); // ブロックアライン
      view.setUint16(34, bitsPerSample, true);
      
      // dataチャンク
      writeString(36, 'data');
      view.setUint32(40, totalPcmSize, true);
      
      // ヘッダーとPCMデータを結合
      const wavData = [new Uint8Array(wavHeader), ...pcmBuffers];
      
      return new Blob(wavData, { type: 'audio/wav' });
      
    } catch (error) {
      console.error('🎵 WAVファイル作成エラー:', error);
      // エラー時はPCMデータをそのまま返す
      return new Blob(pcmBuffers, { type: 'audio/pcm' });
    }
  }

  /**
   * チャンクサイズチェック・フラッシュ
   */
  private checkAndFlushChunk(): void {
    // バッファサイズを計算
    const currentBufferSize = this.mp3Buffer.reduce((total, chunk) => total + chunk.length, 0);
    
    if (currentBufferSize >= this.chunkSizeThreshold) {
      this.flushChunk();
    }
  }

  /**
   * チャンクフラッシュ（Blob生成・コールバック呼び出し）
   */
  private flushChunk(): void {
    if (this.mp3Buffer.length === 0) {
      return;
    }

    try {
      // MP3またはWAVチャンクをBlobとして生成
      let chunkBlob: Blob;
      
      if (this.mp3Encoder.isWavFallback) {
        // WAVフォールバック
        chunkBlob = this.createWavBlob(this.mp3Buffer);
      } else {
        // MP3エンコード
        chunkBlob = new Blob(this.mp3Buffer, { type: 'audio/mp3' });
      }
      
      this.chunkCount++;
      
      // チャンクイベント発火
      const chunkEvent: ChunkReadyEvent = {
        chunk: chunkBlob,
        chunkNumber: this.chunkCount,
        timestamp: Date.now(),
        size: chunkBlob.size
      };
      
      console.log('🎵 チャンク生成完了:', {
        chunkNumber: this.chunkCount,
        size: chunkBlob.size,
        bufferChunks: this.mp3Buffer.length
      });
      
      // コールバック呼び出し
      this.onChunkReady(chunkEvent);
      
      // 文字起こしサーバーにチャンクを送信（非同期で実行）
      this.sendChunkForTranscription(chunkEvent).catch(error => {
        console.error('🎵 文字起こしチャンク送信エラー:', error);
      });
      
      // バッファクリア
      this.mp3Buffer = [];
      
    } catch (error) {
      console.error('🎵 チャンクフラッシュエラー:', error);
      this.onError(error as Error);
    }
  }

  /**
   * 統計更新開始
   */
  private startStatsUpdates(): void {
    this.statsTimer = setInterval(() => {
      if (this.isRecording) {
        const stats: RecordingStats = {
          duration: (Date.now() - this.recordingStartTime) / 1000,
          chunksGenerated: this.chunkCount,
          totalDataSize: this.totalDataSize,
          currentBitrate: this.calculateCurrentBitrate(),
          processedSamples: this.processedSamples
        };
        
        this.onStatsUpdate(stats);
      }
    }, 1000); // 1秒間隔
  }

  /**
   * 現在のビットレート計算
   */
  private calculateCurrentBitrate(): number {
    const duration = (Date.now() - this.recordingStartTime) / 1000;
    if (duration === 0) return 0;
    
    return (this.totalDataSize * 8) / duration; // bps
  }

  /**
   * 録音停止
   */
  async stop(): Promise<Blob> {
    console.log('🎵 AudioWorkletRecordingService: 録音停止開始');
    
    try {
      this.isRecording = false;
      
      // 最終チャンクをフラッシュ
      if (this.mp3Encoder) {
        // MP3エンコーダーの場合は残りデータをフラッシュ
        if (!this.mp3Encoder.isWavFallback && this.mp3Encoder.flush) {
          try {
            const finalMp3buf = this.mp3Encoder.flush();
            if (finalMp3buf && finalMp3buf.length > 0) {
              this.mp3Buffer.push(new Int8Array(finalMp3buf));
            }
          } catch (error) {
            console.warn('🎵 MP3エンコーダーフラッシュエラー:', error);
          }
        }
        
        // 残りのデータをチャンクとして生成
        if (this.mp3Buffer.length > 0) {
          this.flushChunk();
        }
      }
      
      // 統計更新停止
      if (this.statsTimer) {
        clearInterval(this.statsTimer);
        this.statsTimer = null;
      }
      
      // 全チャンクを統合した最終ファイルを生成（オプション）
      const finalBlobType = this.mp3Encoder?.isWavFallback ? 'audio/wav' : 'audio/mp3';
      const finalBlob = new Blob([], { type: finalBlobType });
      
      // クリーンアップ
      await this.cleanup();
      
      console.log('🎵 AudioWorkletRecordingService: 録音停止完了', {
        chunksGenerated: this.chunkCount,
        totalDataSize: this.totalDataSize
      });
      
      return finalBlob;
      
    } catch (error) {
      console.error('🎵 録音停止エラー:', error);
      throw error;
    }
  }

  /**
   * リソースクリーンアップ
   */
  private async cleanup(): Promise<void> {
    console.log('🎵 AudioWorkletRecordingService: クリーンアップ開始');
    
    try {
      // 統計更新停止
      if (this.statsTimer) {
        clearInterval(this.statsTimer);
        this.statsTimer = null;
      }
      
      // AudioWorkletNode切断
      if (this.workletNode) {
        this.workletNode.disconnect();
        this.workletNode = null;
      }
      
      // SourceNode切断
      if (this.sourceNode) {
        this.sourceNode.disconnect();
        this.sourceNode = null;
      }
      
      // ストリーム停止
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
      }
      
      // AudioContext停止
      if (this.audioContext && this.audioContext.state !== 'closed') {
        await this.audioContext.close();
        this.audioContext = null;
      }
      
      // エンコーダークリア
      this.mp3Encoder = null;
      this.mp3Buffer = [];
      
      // 文字起こしサービス切断
      await this.disconnectTranscriptionService();
      
      console.log('🎵 AudioWorkletRecordingService: クリーンアップ完了');
      
    } catch (error) {
      console.error('🎵 クリーンアップエラー:', error);
    }
  }

  /**
   * 現在の録音状態を取得
   */
  getCurrentState(): string {
    return this.isRecording ? 'recording' : 'inactive';
  }

  /**
   * 録音統計を取得
   */
  getCurrentStats(): RecordingStats {
    return {
      duration: this.isRecording ? (Date.now() - this.recordingStartTime) / 1000 : 0,
      chunksGenerated: this.chunkCount,
      totalDataSize: this.totalDataSize,
      currentBitrate: this.calculateCurrentBitrate(),
      processedSamples: this.processedSamples
    };
  }

  /**
   * チャンクサイズ閾値設定
   */
  setChunkSizeThreshold(sizeInBytes: number): void {
    this.chunkSizeThreshold = Math.max(64 * 1024, sizeInBytes); // 最小64KB
    console.log('🎵 チャンクサイズ閾値更新:', this.chunkSizeThreshold);
  }

  /**
   * 文字起こしサーバーへのチャンク送信
   */
  private async sendChunkForTranscription(chunkEvent: ChunkReadyEvent): Promise<void> {
    if (!this.transcriptionService || !this.transcriptionConfig?.enabled) {
      // 文字起こし機能が無効の場合はスキップ
      return;
    }

    try {
      console.log(`🎵 チャンク#${chunkEvent.chunkNumber}を文字起こしサーバーに送信開始`);

      // TranscriptionChunk形式に変換
      const transcriptionChunk = {
        chunkNumber: chunkEvent.chunkNumber,
        audioData: chunkEvent.chunk,
        timestamp: chunkEvent.timestamp
      };

      // サーバーに送信
      const success = await this.transcriptionService.sendChunkForTranscription(transcriptionChunk);
      
      if (success) {
        console.log(`🎵 チャンク#${chunkEvent.chunkNumber}送信成功`);
      } else {
        console.warn(`🎵 チャンク#${chunkEvent.chunkNumber}送信失敗`);
      }

    } catch (error) {
      console.error('🎵 文字起こしチャンク送信処理エラー:', error);
      throw error;
    }
  }

  /**
   * 文字起こしサービスの切断
   */
  private async disconnectTranscriptionService(): Promise<void> {
    if (this.transcriptionService) {
      try {
        this.transcriptionService.disconnect();
        this.transcriptionService = null;
        console.log('🎵 文字起こしサービス切断完了');
      } catch (error) {
        console.error('🎵 文字起こしサービス切断エラー:', error);
      }
    }
  }
}