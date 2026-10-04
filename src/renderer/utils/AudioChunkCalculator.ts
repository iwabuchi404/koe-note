/**
 * AudioChunkCalculator - 音声チャンクサイズの換算とプリセット表示
 *
 * 実測のエンコーダ設定（lamejs: モノラル / 44.1kHz / 128kbps）に対する
 * バイト⇔時間の換算は src/shared/audioFormat.ts に集約した。
 * 以前は圧縮率 0.12 を仮定して計算しており、実際早了 35% ずれていた。
 * ここでは UI 用の表示とプリセット定義だけを持つ。
 */

import { chunkBytesForDuration, durationFromBytes } from '@shared/audioFormat'

export interface AudioFormat {
  sampleRate: number // Hz (通常44100)
  bitDepth: number // bit (通常16)
  channels: number // 1=モノ, 2=ステレオ
  /**
   * 旧 API 互換のためのフィールド。
   * 実際の換算には使わない（src/shared/audioFormat.ts を参照）。
   */
  compression: number
}

export class AudioChunkCalculator {
  /** 実際のエンコーダ設定（src/shared/audioFormat.ts が SSOT） */
  private static readonly DEFAULT_FORMAT: AudioFormat = {
    sampleRate: 44100,
    bitDepth: 16,
    channels: 1, // モノラル録音
    compression: 0 // 未使用
  }

  /**
   * 秒数からチャンクサイズ(KB)を計算
   *
   * 128kbps では 1 秒 = 16,000 バイト = 15.6KB。
   */
  static durationToBytes(
    durationSeconds: number,
    format: AudioFormat = AudioChunkCalculator.DEFAULT_FORMAT
  ): number {
    void format
    return Math.round(chunkBytesForDuration(durationSeconds, 'mp3') / 1024)
  }

  /**
   * チャンクサイズ(KB)から秒数を計算
   */
  static bytesToDuration(
    sizeKB: number,
    format: AudioFormat = AudioChunkCalculator.DEFAULT_FORMAT
  ): number {
    void format
    const seconds = durationFromBytes(sizeKB * 1024, 'mp3')
    return Math.round(seconds * 10) / 10 // 小数点1桁で四捨五入
  }

  /**
   * プリセット設定
   */
  static getPresets(): Array<{
    label: string
    durationSeconds: number
    sizeKB: number
    useCase: string
  }> {
    return [
      {
        label: '1秒 (超高速)',
        durationSeconds: 1.0,
        sizeKB: AudioChunkCalculator.durationToBytes(1.0),
        useCase: '字幕生成、リアルタイム翻訳'
      },
      {
        label: '2秒 (高速)',
        durationSeconds: 2.0,
        sizeKB: AudioChunkCalculator.durationToBytes(2.0),
        useCase: 'ライブ配信、即座の反応が必要'
      },
      {
        label: '3秒 (推奨)',
        durationSeconds: 3.0,
        sizeKB: AudioChunkCalculator.durationToBytes(3.0),
        useCase: '会議、講演のリアルタイム文字起こし'
      },
      {
        label: '5秒 (バランス)',
        durationSeconds: 5.0,
        sizeKB: AudioChunkCalculator.durationToBytes(5.0),
        useCase: 'インタビュー、対話'
      },
      {
        label: '10秒 (高精度)',
        durationSeconds: 10.0,
        sizeKB: AudioChunkCalculator.durationToBytes(10.0),
        useCase: '講演録音、長い発話の正確な転写'
      },
      {
        label: '15秒 (最高精度)',
        durationSeconds: 15.0,
        sizeKB: AudioChunkCalculator.durationToBytes(15.0),
        useCase: '音楽、詩、複雑な内容の高精度転写'
      }
    ]
  }

  /**
   * デバッグ用: 各サイズでの推定時間を表示
   */
  static debugSizeChart(): void {
    console.table([
      { 'サイズ': '32KB', '推定時間': AudioChunkCalculator.bytesToDuration(32) + '秒' },
      { 'サイズ': '64KB', '推定時間': AudioChunkCalculator.bytesToDuration(64) + '秒' },
      { 'サイズ': '128KB', '推定時間': AudioChunkCalculator.bytesToDuration(128) + '秒' },
      { 'サイズ': '256KB', '推定時間': AudioChunkCalculator.bytesToDuration(256) + '秒' },
      { 'サイズ': '512KB', '推定時間': AudioChunkCalculator.bytesToDuration(512) + '秒' }
    ])
  }
}