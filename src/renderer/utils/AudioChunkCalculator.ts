/**
 * AudioChunkCalculator - 音声チャンクサイズと時間の相互変換
 */

export interface AudioFormat {
  sampleRate: number // Hz (通常44100)
  bitDepth: number   // bit (通常16)
  channels: number   // 1=モノ, 2=ステレオ
  compression: number // MP3圧縮率 (0.1-0.15程度)
}

export class AudioChunkCalculator {
  private static readonly DEFAULT_FORMAT: AudioFormat = {
    sampleRate: 44100,
    bitDepth: 16,
    channels: 1, // モノラル録音
    compression: 0.12 // MP3圧縮率約12%
  }

  /**
   * 秒数からチャンクサイズ(KB)を計算
   */
  static durationToBytes(durationSeconds: number, format: AudioFormat = AudioChunkCalculator.DEFAULT_FORMAT): number {
    // 生音声データサイズ計算
    const bytesPerSample = format.bitDepth / 8
    const samplesPerSecond = format.sampleRate * format.channels
    const rawBytesPerSecond = samplesPerSecond * bytesPerSample
    
    // 生データサイズ
    const rawBytes = rawBytesPerSecond * durationSeconds
    
    // MP3圧縮後のサイズ
    const compressedBytes = rawBytes * format.compression
    
    // KB単位で返す
    return Math.round(compressedBytes / 1024)
  }

  /**
   * チャンクサイズ(KB)から秒数を計算
   */
  static bytesToDuration(sizeKB: number, format: AudioFormat = AudioChunkCalculator.DEFAULT_FORMAT): number {
    // KBからバイトに変換
    const compressedBytes = sizeKB * 1024
    
    // 圧縮前の生データサイズを推定
    const rawBytes = compressedBytes / format.compression
    
    // サンプル数計算
    const bytesPerSample = format.bitDepth / 8
    const samplesPerSecond = format.sampleRate * format.channels
    const rawBytesPerSecond = samplesPerSecond * bytesPerSample
    
    // 秒数計算
    const durationSeconds = rawBytes / rawBytesPerSecond
    
    return Math.round(durationSeconds * 10) / 10 // 小数点1桁で四捨五入
  }

  /**
   * 現在の設定に基づいて適切なチャンクサイズを計算
   */
  static calculateOptimalSize(
    mode: 'bytes' | 'duration',
    value: number,
    format?: AudioFormat
  ): { sizeKB: number, durationSeconds: number } {
    const audioFormat = format || AudioChunkCalculator.DEFAULT_FORMAT

    if (mode === 'duration') {
      const sizeKB = AudioChunkCalculator.durationToBytes(value, audioFormat)
      return { sizeKB, durationSeconds: value }
    } else {
      const durationSeconds = AudioChunkCalculator.bytesToDuration(value, audioFormat)
      return { sizeKB: value, durationSeconds }
    }
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