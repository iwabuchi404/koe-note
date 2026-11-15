/**
 * AudioWorkletRecordingService
 * 
 * AudioWorklet + lamejsによるリアルタイムMP3エンコード録音システム
 * MediaRecorder APIを完全に排除し、安定したチャンク生成を実現
 */

// lamejsはグローバルスコープから取得（<script>タグで読み込み済み）
declare const lamejs: any;

import { LoggerFactory, LogCategories } from '@renderer/shared/utils/LoggerFactory'
import {
  TranscriptionWebSocketService,
  type ChunkTranscriptionResult,
  type ChunkTranscriptionProgress
} from './TranscriptionWebSocketService';
import { AudioMixingService, MixingConfig } from './AudioMixingService';
import { captureDesktopAudioStream, toUserFacingDesktopAudioError } from './desktopAudioSource';

const logger = LoggerFactory.getLogger(LogCategories.SERVICE_RECORDING)

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
  audioLevel: number; // 0.0-1.0 の音量レベル
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
  private onChunkTranscriptionResult?: (result: ChunkTranscriptionResult) => void;
  private onChunkTranscriptionProgress?: (progress: ChunkTranscriptionProgress) => void;
  
  // 文字起こし機能
  private transcriptionService: TranscriptionWebSocketService | null = null;
  private transcriptionConfig: TranscriptionConfig | null = null;
  
  // 統計更新タイマー
  private statsTimer: NodeJS.Timeout | null = null;
  
  // 音量レベル解析
  private analyserNode: AnalyserNode | null = null;
  private audioLevelData: Uint8Array | null = null;
  private currentAudioLevel: number = 0;

  // ミックス録音サービス
  private audioMixingService: AudioMixingService | null = null;

  constructor(
    onChunkReadyCallback: (event: ChunkReadyEvent) => void,
    onErrorCallback?: (error: Error) => void,
    onStatsUpdateCallback?: (stats: RecordingStats) => void,
    onTranscriptionResultCallback?: (result: ChunkTranscriptionResult) => void,
    onTranscriptionProgressCallback?: (progress: ChunkTranscriptionProgress) => void
  ) {
    this.onChunkReady = onChunkReadyCallback;
    this.onError = onErrorCallback || ((error) => logger.error('🎵 録音エラー:', error));
    this.onStatsUpdate = onStatsUpdateCallback || (() => {});
    this.onChunkTranscriptionResult = onTranscriptionResultCallback;
    this.onChunkTranscriptionProgress = onTranscriptionProgressCallback;
  }

  /**
   * 文字起こし設定
   */
  setTranscriptionConfig(config: TranscriptionConfig): void {
    this.transcriptionConfig = config;
    logger.debug('🎵 文字起こし設定更新:', config);
  }

  /**
   * 録音開始（音声ソース設定付き）
   */
  async startWithConfig(config: AudioSourceConfig): Promise<void> {
    try {
      logger.debug('🎵 AudioWorkletRecordingService: 録音開始', config);
      
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
    logger.debug('🎵 音声ストリーム取得開始:', config.type);

    switch (config.type) {
      case 'microphone':
        try {
          logger.debug('🎤 マイクロフォン音声取得を開始');
          
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
          
          logger.debug('🎤 マイクロフォンストリーム取得成功');
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
          logger.debug('デスクトップ音声取得を開始（画面共有ダイアログが表示されます）');

          const desktopStream = await captureDesktopAudioStream();
          const audioTracks = desktopStream.getAudioTracks();

          logger.debug('デスクトップストリーム取得成功', { audioTracks: audioTracks.length });
          return desktopStream;

        } catch (error) {
          throw toUserFacingDesktopAudioError(error);
        }

      case 'mix':
        try {
          logger.debug('🎧 マイク＋デスクトップミックス録音開始');
          
          // AudioMixingServiceを使用してミックスストリームを作成
          if (!this.audioMixingService) {
            this.audioMixingService = new AudioMixingService();
          }
          
          const mixingConfig: MixingConfig = {
            enableMicrophone: true,
            enableDesktop: true,
            microphoneDeviceId: config.deviceId,
            desktopSourceId: config.desktopSourceId,
            microphoneGain: 0.7,
            desktopGain: 0.7
          };
          
          const mixedStream = await this.audioMixingService.createMixedStream(mixingConfig);
          logger.debug('🎧 ミックスストリーム作成完了:', {
            audioTracks: mixedStream.getAudioTracks().length,
            videoTracks: mixedStream.getVideoTracks().length
          });
          
          return mixedStream;
          
        } catch (error) {
          logger.error('❌ ミックス録音エラー:', error);
          // フォールバック: マイクのみで録音
          logger.warn('🎵 ミックス録音に失敗、マイクのみで録音を継続します');
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
        }

      default:
        throw new Error(`未対応の音声ソースタイプ: ${config.type}`);
    }
  }

  /**
   * 録音開始（メインロジック）
   */
  async start(stream: MediaStream): Promise<void> {
    try {
      logger.debug('🎵 AudioWorkletRecordingService: 録音初期化開始');
      
      // AudioContext初期化
      this.audioContext = new AudioContext({
        sampleRate: 44100,
        latencyHint: 'interactive'
      });
      
      logger.debug('🎵 AudioContext作成完了:', {
        sampleRate: this.audioContext.sampleRate,
        state: this.audioContext.state
      });

      // AudioWorkletを登録（inline形式で埋め込み）
      const workletCode = this.createPCMProcessorCode();
      const blob = new Blob([workletCode], { type: 'application/javascript' });
      const workletUrl = URL.createObjectURL(blob);
      
      try {
        await this.audioContext.audioWorklet.addModule(workletUrl);
        logger.debug('🎵 AudioWorklet モジュール登録完了');
      } finally {
        URL.revokeObjectURL(workletUrl);
      }

      // AudioWorkletNode作成
      this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor');
      
      // WorkletNodeからのメッセージ処理
      this.workletNode.port.onmessage = (event) => {
        this.handleWorkletMessage(event.data);
      };
      
      logger.debug('🎵 AudioWorkletNode作成完了');

      // 音声ストリームをAudioWorkletに接続
      this.stream = stream;
      this.sourceNode = this.audioContext.createMediaStreamSource(stream);
      
      // 音量レベル解析用AnalyserNode作成
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;
      this.audioLevelData = new Uint8Array(this.analyserNode.frequencyBinCount);
      
      // 接続: SourceNode -> AnalyserNode -> WorkletNode
      this.sourceNode.connect(this.analyserNode);
      this.analyserNode.connect(this.workletNode);
      
      logger.debug('🎵 音声ストリーム接続完了');

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
      
      // 音量レベル更新開始
      this.startAudioLevelUpdates();
      
      // 文字起こし機能の初期化
      if (this.transcriptionConfig?.enabled) {
        try {
          await this.initializeTranscriptionService();
        } catch (error) {
          logger.warn('🎵 文字起こしサービス初期化失敗、録音は継続します:', error);
          // 文字起こしサービスの初期化に失敗しても録音は継続
          this.transcriptionService = null;
        }
      }
      
      logger.debug('🎵 AudioWorkletRecordingService: 録音開始完了');
      
    } catch (error) {
      logger.error('🎵 録音開始エラー:', error);
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
    `;
  }

  /**
   * 文字起こしサービス初期化
   */
  private async initializeTranscriptionService(): Promise<void> {
    if (!this.transcriptionConfig?.enabled) {
      logger.debug('🎵 文字起こし機能は無効です');
      return;
    }

    try {
      logger.debug('🎵 文字起こしサービス初期化開始');
      
      const serverUrl = this.transcriptionConfig.serverUrl || 'ws://localhost:8770';
      
      this.transcriptionService = new TranscriptionWebSocketService(serverUrl, {
        onConnectionChange: (connected) => {
          logger.debug('🎵 文字起こしサーバー接続状態:', connected);
        },
        onChunkTranscriptionResult: (result) => {
          logger.debug('🎵 文字起こし結果受信:', result.text);
          this.onChunkTranscriptionResult?.(result);
        },
        onChunkTranscriptionProgress: (progress) => {
          logger.debug('🎵 文字起こし進捗:', progress.status);
          this.onChunkTranscriptionProgress?.(progress);
        },
        onError: (error) => {
          logger.error('🎵 文字起こしエラー:', error);
          this.onError(new Error(`文字起こしエラー: ${error}`));
        }
      });

      // サーバーに接続
      const connected = await this.transcriptionService.connect();
      if (connected) {
        logger.debug('🎵 文字起こしサービス初期化完了');
      } else {
        logger.warn('🎵 文字起こしサーバーへの接続に失敗');
      }
      
    } catch (error) {
      logger.error('🎵 文字起こしサービス初期化エラー:', error);
      this.transcriptionService = null;
    }
  }

  /**
   * MP3エンコーダー初期化（lamejsグローバル変数使用）
   */
  private initializeMp3Encoder(): void {
    try {
      logger.debug('🎵 MP3エンコーダー初期化開始');
      
      // lamejsが定義されているかチェック（グローバル変数）
      if (typeof lamejs === 'undefined') {
        throw new Error('lamejsライブラリがグローバルスコープにロードされていません。index.htmlのscriptタグを確認してください。');
      }
      
      logger.debug('🎵 グローバルlamejs確認:', { 
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
      logger.debug('🎵 MP3エンコーダー初期化完了');
      
    } catch (error) {
      logger.error('🎵 MP3エンコーダー初期化エラー:', error);
      
      // エラー時はフォールバック（WAV形式）
      logger.warn('🎵 MP3エンコーダー初期化失敗、WAV形式にフォールバック');
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
          logger.debug('🎵 Worklet統計:', data);
          break;
          
        case 'error':
          logger.error('🎵 Workletエラー:', data.message);
          this.onError(new Error(`AudioWorkletエラー: ${data.message}`));
          break;
          
        default:
          logger.warn('🎵 未知のWorkletメッセージ:', data.type);
      }
    } catch (error) {
      logger.error('🎵 Workletメッセージ処理エラー:', error);
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
      logger.error('🎵 PCMデータ処理エラー:', error);
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
      logger.error('🎵 WAVファイル作成エラー:', error);
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
      
      logger.debug('🎵 チャンク生成完了:', {
        chunkNumber: this.chunkCount,
        size: chunkBlob.size,
        bufferChunks: this.mp3Buffer.length
      });
      
      // コールバック呼び出し
      this.onChunkReady(chunkEvent);
      
      // 文字起こしサーバーにチャンクを送信（非同期で実行）
      // 録音中のみ送信
      if (this.isRecording) {
        this.sendChunkForTranscription(chunkEvent).catch(error => {
          logger.error('🎵 文字起こしチャンク送信エラー:', error);
        });
      } else {
        logger.debug('🎵 録音停止中のためチャンク送信をスキップ:', chunkEvent.chunkNumber);
      }
      
      // バッファクリア
      this.mp3Buffer = [];
      
    } catch (error) {
      logger.error('🎵 チャンクフラッシュエラー:', error);
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
          processedSamples: this.processedSamples,
          audioLevel: this.currentAudioLevel
        };
        
        this.onStatsUpdate(stats);
      }
    }, 1000); // 1秒間隔
  }

  /**
   * 音量レベル更新開始
   */
  private startAudioLevelUpdates(): void {
    const updateAudioLevel = () => {
      if (this.isRecording && this.analyserNode && this.audioLevelData) {
        this.analyserNode.getByteFrequencyData(this.audioLevelData);
        
        // 平均音量レベルを計算 (0-255 -> 0.0-1.0)
        const average = this.audioLevelData.reduce((sum, value) => sum + value, 0) / this.audioLevelData.length;
        this.currentAudioLevel = average / 255;
        
        // 次のフレームで再実行
        requestAnimationFrame(updateAudioLevel);
      }
    };
    
    // 初回実行
    requestAnimationFrame(updateAudioLevel);
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
    logger.debug('🎵 AudioWorkletRecordingService: 録音停止開始');
    
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
            logger.warn('🎵 MP3エンコーダーフラッシュエラー:', error);
          }
        }
        
        // 録音停止フラグを設定（最終チャンク送信を禁止）
        this.isRecording = false;
        
        // 残りのデータをチャンクとして生成（文字起こし送信はスキップ）
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
      
      logger.debug('🎵 AudioWorkletRecordingService: 録音停止完了', {
        chunksGenerated: this.chunkCount,
        totalDataSize: this.totalDataSize
      });
      
      return finalBlob;
      
    } catch (error) {
      logger.error('🎵 録音停止エラー:', error);
      throw error;
    }
  }

  /**
   * リソースクリーンアップ
   */
  private async cleanup(): Promise<void> {
    logger.debug('🎵 AudioWorkletRecordingService: クリーンアップ開始');
    
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
      
      // AnalyserNode切断
      if (this.analyserNode) {
        this.analyserNode.disconnect();
        this.analyserNode = null;
      }
      
      // SourceNode切断
      if (this.sourceNode) {
        this.sourceNode.disconnect();
        this.sourceNode = null;
      }
      
      // 音量レベルデータクリア
      this.audioLevelData = null;
      this.currentAudioLevel = 0;
      
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

      // ミックス録音サービス切断
      if (this.audioMixingService) {
        await this.audioMixingService.cleanup();
        this.audioMixingService = null;
      }
      
      logger.debug('🎵 AudioWorkletRecordingService: クリーンアップ完了');
      
    } catch (error) {
      logger.error('🎵 クリーンアップエラー:', error);
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
      processedSamples: this.processedSamples,
      audioLevel: this.currentAudioLevel
    };
  }

  /**
   * チャンクサイズ閾値設定
   */
  setChunkSizeThreshold(sizeInBytes: number): void {
    this.chunkSizeThreshold = Math.max(64 * 1024, sizeInBytes); // 最小64KB
    logger.debug('🎵 チャンクサイズ閾値更新:', this.chunkSizeThreshold);
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
      logger.debug(`🎵 チャンク#${chunkEvent.chunkNumber}を文字起こしサーバーに送信開始`);

      // TranscriptionChunk形式に変換
      const transcriptionChunk = {
        chunkNumber: chunkEvent.chunkNumber,
        audioData: chunkEvent.chunk,
        timestamp: chunkEvent.timestamp
      };

      // サーバーに送信
      const success = await this.transcriptionService.sendChunkForTranscription(transcriptionChunk);
      
      if (success) {
        logger.debug(`🎵 チャンク#${chunkEvent.chunkNumber}送信成功`);
      } else {
        logger.warn(`🎵 チャンク#${chunkEvent.chunkNumber}送信失敗`);
      }

    } catch (error) {
      logger.error('🎵 文字起こしチャンク送信処理エラー:', error);
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
        logger.debug('🎵 文字起こしサービス切断完了');
      } catch (error) {
        logger.error('🎵 文字起こしサービス切断エラー:', error);
      }
    }
  }
}