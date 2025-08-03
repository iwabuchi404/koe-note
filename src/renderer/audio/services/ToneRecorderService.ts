/**
 * ToneRecorderService - Tone.js + lamejs による録音サービス
 * 
 * AudioWorkletNode対応、ScriptProcessorNode不使用
 * 最小限の録音・MP3エンコード・保存機能
 */

import * as Tone from 'tone';
// lamejsはグローバルスコープから取得（<script>タグで読み込み済み）
declare const lamejs: any;
import { AudioMixingService, MixingConfig } from './core/AudioMixingService';

export interface AudioSourceConfig {
  type: 'microphone' | 'desktop' | 'mix';
  deviceId?: string;
  desktopSourceId?: string;
}

export class ToneRecorderService {
  private recorder: Tone.Recorder | null = null;
  private stream: MediaStream | null = null;
  private isRecording: boolean = false;
  private chunks: Blob[] = [];
  private recordingStartTime: number = 0;
  private audioMixingService: AudioMixingService;

  // リアルタイムでチャンクを受け取るためのコールバック
  private onChunkReady: (chunk: Blob) => void;

  constructor(onChunkReadyCallback: (chunk: Blob) => void) {
    this.onChunkReady = onChunkReadyCallback;
    this.audioMixingService = new AudioMixingService();
  }

  async startWithConfig(config: AudioSourceConfig): Promise<void> {
    const stream = await this.getAudioStream(config);
    return this.start(stream);
  }

  private async getAudioStream(config: AudioSourceConfig): Promise<MediaStream> {
    console.log('🎵 ToneRecorderService: 音声ストリーム取得開始', config);

    switch (config.type) {
      case 'microphone':
        const mixingConfigMic: MixingConfig = {
          enableMicrophone: true,
          enableDesktop: false,
          microphoneDeviceId: config.deviceId,
          microphoneGain: 0.8,
          desktopGain: 0.0
        };
        return await this.audioMixingService.createMixedStream(mixingConfigMic);

      case 'desktop':
        const mixingConfigDesktop: MixingConfig = {
          enableMicrophone: false,
          enableDesktop: true,
          desktopSourceId: config.desktopSourceId,
          microphoneGain: 0.0,
          desktopGain: 0.8
        };
        return await this.audioMixingService.createMixedStream(mixingConfigDesktop);

      case 'mix':
        const mixingConfigMix: MixingConfig = {
          enableMicrophone: true,
          enableDesktop: true,
          microphoneDeviceId: config.deviceId,
          desktopSourceId: config.desktopSourceId,
          microphoneGain: 0.7,
          desktopGain: 0.7
        };
        return await this.audioMixingService.createMixedStream(mixingConfigMix);

      default:
        throw new Error(`未対応の音声ソースタイプ: ${config.type}`);
    }
  }


  async start(stream: MediaStream): Promise<void> {
    try {
      console.log('🎵 ToneRecorderService: 録音開始処理開始');
      
      // Tone.jsの初期化
      if (Tone.getContext().state !== 'running') {
        await Tone.start();
        console.log('🎵 ToneRecorderService: Tone.js AudioContext開始');
      }

      this.stream = stream;
      this.chunks = [];
      this.recordingStartTime = Date.now();

      // MediaStreamからTone.jsのUserMediaに接続
      const userMedia = new Tone.UserMedia();
      await userMedia.open();
      
      console.log('🎵 ToneRecorderService: UserMedia接続成功');

      // Tone.Recorderを作成（内部でAudioWorkletNodeを使用）
      this.recorder = new Tone.Recorder();
      
      // UserMediaをRecorderに接続
      userMedia.connect(this.recorder);
      
      console.log('🎵 ToneRecorderService: Recorder接続完了');

      // 録音開始
      this.recorder.start();
      this.isRecording = true;
      
      console.log('🎵 ToneRecorderService: 録音開始成功');

      // 定期的にチャンクを生成（20秒間隔）
      this.startChunkGeneration();

    } catch (error) {
      console.error('🎵 ToneRecorderService: 録音開始エラー:', error);
      throw error;
    }
  }

  private startChunkGeneration(): void {
    const chunkInterval = setInterval(async () => {
      if (!this.isRecording || !this.recorder) {
        clearInterval(chunkInterval);
        return;
      }

      try {
        // 現在の録音データを取得（BlobとしてWAVデータが返される）
        const recordingBlob = await this.recorder.stop();
        
        console.log('🎵 ToneRecorderService: チャンク生成', {
          size: recordingBlob.size,
          type: recordingBlob.type
        });

        // WebMファイルをそのまま使用（変換でクラッシュを回避）
        const audioBlob = recordingBlob;
        
        // チャンクコールバックを呼び出し
        this.onChunkReady(audioBlob);
        this.chunks.push(audioBlob);

        // 録音を再開（チャンク生成後）
        if (this.isRecording) {
          this.recorder.start();
        }

      } catch (error) {
        console.error('🎵 ToneRecorderService: チャンク生成エラー:', error);
        clearInterval(chunkInterval);
      }
    }, 20000); // 20秒間隔
  }

  private async convertBlobToMp3(recordingBlob: Blob): Promise<Blob> {
    console.log('🎵 ToneRecorderService: Blob→MP3変換開始');
    
    // BlobをArrayBufferに変換
    const arrayBuffer = await recordingBlob.arrayBuffer();
    
    // AudioContextでArrayBufferをAudioBufferにデコード
    const audioContext = Tone.getContext().rawContext as AudioContext;
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    return this.encodeToMp3(audioBuffer);
  }

  private async encodeToMp3(audioBuffer: AudioBuffer): Promise<Blob> {
    console.log('🎵 ToneRecorderService: MP3エンコード開始');
    
    // AudioBufferからPCMデータを抽出
    const pcmData = audioBuffer.getChannelData(0); // モノラル
    const sampleRate = audioBuffer.sampleRate;
    
    // PCMデータをInt16に変換
    const int16Data = new Int16Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      int16Data[i] = Math.max(-32768, Math.min(32767, pcmData[i] * 32768));
    }

    // lamejsでMP3エンコード（グローバルスコープから取得）
    const mp3encoder = new lamejs.Mp3Encoder(1, sampleRate, 128); // モノラル, サンプルレート, ビットレート128kbps
    const mp3Data: Int8Array[] = [];
    
    const blockSize = 1152; // MP3フレームサイズ
    for (let i = 0; i < int16Data.length; i += blockSize) {
      const chunk = int16Data.subarray(i, i + blockSize);
      const mp3buf = mp3encoder.encodeBuffer(chunk);
      if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
      }
    }
    
    // 最終フレーム
    const mp3buf = mp3encoder.flush();
    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }

    // BlobとしてMP3データを返す
    const mp3Blob = new Blob(mp3Data, { type: 'audio/mp3' });
    
    console.log('🎵 ToneRecorderService: MP3エンコード完了', {
      originalSize: int16Data.length * 2,
      mp3Size: mp3Blob.size,
      compressionRatio: (int16Data.length * 2) / mp3Blob.size
    });
    
    return mp3Blob;
  }

  async stop(): Promise<Blob> {
    return new Promise(async (resolve, reject) => {
      try {
        console.log('🎵 ToneRecorderService: 録音停止処理開始');
        
        if (!this.recorder || !this.isRecording) {
          console.log('🎵 ToneRecorderService: レコーダーが非アクティブ');
          resolve(new Blob(this.chunks, { type: 'audio/mp3' }));
          return;
        }

        this.isRecording = false;

        // 最終チャンクを取得
        const finalRecordingBlob = await this.recorder.stop();
        console.log('🎵 ToneRecorderService: 最終チャンク取得完了');
        
        // 最終チャンクをそのまま使用
        this.chunks.push(finalRecordingBlob);

        // 全チャンクを結合（WebM形式として保存）
        const finalBlob = new Blob(this.chunks, { type: 'audio/webm' });
        
        // ストリームを停止
        this.stream?.getTracks().forEach(track => track.stop());

        // AudioMixingServiceのクリーンアップ
        await this.audioMixingService.cleanup();

        const recordingDuration = (Date.now() - this.recordingStartTime) / 1000;
        console.log('🎵 ToneRecorderService: 録音停止完了', {
          finalSize: finalBlob.size,
          duration: recordingDuration,
          chunks: this.chunks.length
        });

        // リソースクリーンアップ
        this.recorder.dispose();
        this.recorder = null;

        resolve(finalBlob);
        
      } catch (error) {
        console.error('🎵 ToneRecorderService: 録音停止エラー:', error);
        reject(error);
      }
    });
  }

  getCurrentState(): string {
    return this.isRecording ? 'recording' : 'inactive';
  }

  getChunkCount(): number {
    return this.chunks.length;
  }

  getDuration(): number {
    return this.isRecording ? (Date.now() - this.recordingStartTime) / 1000 : 0;
  }
}