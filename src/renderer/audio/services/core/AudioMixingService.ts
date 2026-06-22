/**
 * オーディオミキシングサービス
 * Web Audio APIを使用してマイク音声とデスクトップ音声をミキシングする
 */

import { LoggerFactory, LogCategories } from '../../../utils/LoggerFactory'

const logger = LoggerFactory.getLogger(LogCategories.SERVICE_AUDIO_MIXING)

export interface MixingConfig {
  enableMicrophone: boolean;
  enableDesktop: boolean;
  microphoneDeviceId?: string;
  desktopSourceId?: string;
  microphoneGain: number; // 0.0 - 1.0
  desktopGain: number;    // 0.0 - 1.0
}

export interface AudioLevels {
  microphoneLevel: number;
  desktopLevel: number;
  mixedLevel: number;
}

export class AudioMixingService {
  private audioContext: AudioContext | null = null;
  private microphoneStream: MediaStream | null = null;
  private desktopStream: MediaStream | null = null;
  private mixedStream: MediaStream | null = null;
  
  // Web Audio API ノード
  private microphoneSource: MediaStreamAudioSourceNode | null = null;
  private desktopSource: MediaStreamAudioSourceNode | null = null;
  private microphoneGain: GainNode | null = null;
  private desktopGain: GainNode | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  
  // 音声レベル監視用
  private microphoneAnalyser: AnalyserNode | null = null;
  private desktopAnalyser: AnalyserNode | null = null;
  private mixedAnalyser: AnalyserNode | null = null;
  
  // レベル監視タイマー
  private levelMonitoringTimer: NodeJS.Timeout | null = null;
  private onLevelsUpdate: ((levels: AudioLevels) => void) | null = null;
  
  constructor() {
    logger.debug('🎛️ AudioMixingService初期化');
  }
  
  /**
   * ミキシングストリーム作成
   */
  async createMixedStream(config: MixingConfig): Promise<MediaStream> {
    try {
      logger.debug('🎬 ミキシングストリーム作成開始', config);
      
      // AudioContext初期化
      if (!this.audioContext) {
        this.audioContext = new AudioContext();
        logger.debug('🔊 AudioContext作成完了');
      }
      
      // 既存のストリームをクリーンアップ
      await this.cleanup();
      
      // 出力先ノード作成
      this.destination = this.audioContext.createMediaStreamDestination();
      logger.debug('📡 出力先ノード作成完了');
      
      // マイク音声の設定
      if (config.enableMicrophone) {
        await this.setupMicrophoneStream(config.microphoneDeviceId, config.microphoneGain);
      }
      
      // デスクトップ音声の設定
      if (config.enableDesktop) {
        await this.setupDesktopStream(config.desktopSourceId, config.desktopGain);
      }
      
      // 少なくとも一つの音声ソースが必要
      if (!config.enableMicrophone && !config.enableDesktop) {
        throw new Error('マイクまたはデスクトップ音声の少なくとも一方を有効にしてください');
      }
      
      // ミキシング済みストリームを取得
      this.mixedStream = this.destination.stream;
      
      // 音声レベル監視開始
      this.startLevelMonitoring();
      
      logger.debug('✅ ミキシングストリーム作成完了', {
        audioTracks: this.mixedStream.getAudioTracks().length,
        micEnabled: config.enableMicrophone,
        desktopEnabled: config.enableDesktop
      });
      
      return this.mixedStream;
      
    } catch (error) {
      logger.error('❌ ミキシングストリーム作成エラー:', error);
      await this.cleanup();
      throw error;
    }
  }
  
  /**
   * マイク音声ストリーム設定
   */
  private async setupMicrophoneStream(deviceId?: string, gainValue: number = 0.7): Promise<void> {
    try {
      logger.debug('🎤 マイク音声設定開始', { deviceId, gainValue });
      
      // マイクストリーム取得
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 48000,
          channelCount: 2
        },
        video: false
      };
      
      this.microphoneStream = await navigator.mediaDevices.getUserMedia(constraints);
      logger.debug('🎤 マイクストリーム取得完了');
      
      // Web Audio APIノード作成
      this.microphoneSource = this.audioContext!.createMediaStreamSource(this.microphoneStream);
      this.microphoneGain = this.audioContext!.createGain();
      this.microphoneAnalyser = this.audioContext!.createAnalyser();
      
      // ゲイン設定
      this.microphoneGain.gain.value = gainValue;
      
      // アナライザー設定
      this.microphoneAnalyser.fftSize = 256;
      this.microphoneAnalyser.smoothingTimeConstant = 0.8;
      
      // ノード接続
      this.microphoneSource.connect(this.microphoneGain);
      this.microphoneGain.connect(this.microphoneAnalyser);
      this.microphoneAnalyser.connect(this.destination!);
      
      logger.debug('✅ マイク音声設定完了');
      
    } catch (error) {
      logger.error('❌ マイク音声設定エラー:', error);
      throw new Error(`マイク音声の設定に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * デスクトップ音声ストリーム設定
   */
  private async setupDesktopStream(sourceId?: string, gainValue: number = 0.8): Promise<void> {
    try {
      logger.debug('🖥️ デスクトップ音声設定開始', { sourceId, gainValue });
      
      // getDisplayMediaでデスクトップ音声取得
      // @ts-ignore
      this.desktopStream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: {
          width: { ideal: 1 },
          height: { ideal: 1 }
        }
      });
      
      logger.debug('🖥️ デスクトップストリーム取得完了');
      
      // 映像トラックを削除（音声のみ使用）
      const videoTracks = this.desktopStream.getVideoTracks();
      videoTracks.forEach(track => {
        track.stop();
        this.desktopStream!.removeTrack(track);
      });
      
      // Web Audio APIノード作成
      this.desktopSource = this.audioContext!.createMediaStreamSource(this.desktopStream);
      this.desktopGain = this.audioContext!.createGain();
      this.desktopAnalyser = this.audioContext!.createAnalyser();
      
      // ゲイン設定
      this.desktopGain.gain.value = gainValue;
      
      // アナライザー設定
      this.desktopAnalyser.fftSize = 256;
      this.desktopAnalyser.smoothingTimeConstant = 0.8;
      
      // ノード接続
      this.desktopSource.connect(this.desktopGain);
      this.desktopGain.connect(this.desktopAnalyser);
      this.desktopAnalyser.connect(this.destination!);
      
      logger.debug('✅ デスクトップ音声設定完了');
      
    } catch (error) {
      logger.error('❌ デスクトップ音声設定エラー:', error);
      throw new Error(`デスクトップ音声の設定に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * 音声レベル監視開始
   */
  private startLevelMonitoring(): void {
    if (this.levelMonitoringTimer) {
      clearInterval(this.levelMonitoringTimer);
    }
    
    // 100ms間隔で音声レベルを監視
    this.levelMonitoringTimer = setInterval(() => {
      const levels = this.getCurrentLevels();
      if (this.onLevelsUpdate) {
        this.onLevelsUpdate(levels);
      }
    }, 100);
    
    logger.debug('📊 音声レベル監視開始');
  }
  
  /**
   * 現在の音声レベル取得
   */
  private getCurrentLevels(): AudioLevels {
    const levels: AudioLevels = {
      microphoneLevel: 0,
      desktopLevel: 0,
      mixedLevel: 0
    };
    
    // マイクレベル取得
    if (this.microphoneAnalyser) {
      const bufferLength = this.microphoneAnalyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      this.microphoneAnalyser.getByteFrequencyData(dataArray);
      
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      levels.microphoneLevel = Math.min(1.0, (sum / bufferLength) / 128);
    }
    
    // デスクトップレベル取得
    if (this.desktopAnalyser) {
      const bufferLength = this.desktopAnalyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      this.desktopAnalyser.getByteFrequencyData(dataArray);
      
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      levels.desktopLevel = Math.min(1.0, (sum / bufferLength) / 128);
    }
    
    // ミックス後レベル（概算）
    levels.mixedLevel = Math.min(1.0, levels.microphoneLevel + levels.desktopLevel);
    
    return levels;
  }
  
  /**
   * 音声ゲイン調整
   */
  updateGains(microphoneGain: number, desktopGain: number): void {
    if (this.microphoneGain) {
      this.microphoneGain.gain.value = Math.max(0, Math.min(1, microphoneGain));
    }
    if (this.desktopGain) {
      this.desktopGain.gain.value = Math.max(0, Math.min(1, desktopGain));
    }
    
    logger.debug('🎚️ ゲイン更新:', { microphoneGain, desktopGain });
  }
  
  /**
   * 音声レベル更新コールバック設定
   */
  setLevelsUpdateCallback(callback: (levels: AudioLevels) => void): void {
    this.onLevelsUpdate = callback;
  }
  
  /**
   * ミキシング済みストリーム取得
   */
  getMixedStream(): MediaStream | null {
    return this.mixedStream;
  }
  
  /**
   * ミキシング状態確認
   */
  isActive(): boolean {
    return this.mixedStream !== null && this.mixedStream.active;
  }
  
  /**
   * クリーンアップ
   */
  async cleanup(): Promise<void> {
    logger.debug('🧹 AudioMixingService クリーンアップ開始');
    
    // レベル監視停止
    if (this.levelMonitoringTimer) {
      clearInterval(this.levelMonitoringTimer);
      this.levelMonitoringTimer = null;
    }
    
    // Web Audio APIノードの切断
    if (this.microphoneSource) {
      this.microphoneSource.disconnect();
      this.microphoneSource = null;
    }
    if (this.desktopSource) {
      this.desktopSource.disconnect();
      this.desktopSource = null;
    }
    if (this.microphoneGain) {
      this.microphoneGain.disconnect();
      this.microphoneGain = null;
    }
    if (this.desktopGain) {
      this.desktopGain.disconnect();
      this.desktopGain = null;
    }
    
    // ストリーム停止
    if (this.microphoneStream) {
      this.microphoneStream.getTracks().forEach(track => track.stop());
      this.microphoneStream = null;
    }
    if (this.desktopStream) {
      this.desktopStream.getTracks().forEach(track => track.stop());
      this.desktopStream = null;
    }
    
    // アナライザーをnullに設定
    this.microphoneAnalyser = null;
    this.desktopAnalyser = null;
    this.mixedAnalyser = null;
    this.destination = null;
    this.mixedStream = null;
    
    // AudioContextは保持（再利用のため）
    
    logger.debug('✅ AudioMixingService クリーンアップ完了');
  }
}