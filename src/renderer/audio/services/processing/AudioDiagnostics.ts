/**
 * 音声ファイル診断システム
 * チャンクファイルの音声品質と内容を分析
 */

export interface AudioDiagnosticResult {
  hasAudioContent: boolean
  duration: number
  averageVolume: number
  peakVolume: number
  silencePercentage: number
  sampleRate: number
  channelCount: number
  format: string
  fileSize: number
  isValid: boolean
  error?: string
}

export class AudioDiagnostics {
  /**
   * 音声ファイルの診断を実行
   */
  static async analyzeAudioFile(filePath: string): Promise<AudioDiagnosticResult> {
    try {
      console.log('🔍 音声ファイル診断開始:', filePath)
      
      // ファイルサイズ確認
      const fileSize = await window.electronAPI.getFileSize(filePath)
      console.log('📏 ファイルサイズ:', fileSize, 'bytes')
      
      // 音声ファイルを読み込んでAudioBufferに変換
      const audioBuffer = await this.loadAudioBuffer(filePath)
      
      if (!audioBuffer) {
        return {
          hasAudioContent: false,
          duration: 0,
          averageVolume: 0,
          peakVolume: 0,
          silencePercentage: 100,
          sampleRate: 0,
          channelCount: 0,
          format: 'unknown',
          fileSize,
          isValid: false,
          error: 'AudioBufferの作成に失敗'
        }
      }
      
      // 音声データ分析
      const analysis = this.analyzeAudioBuffer(audioBuffer)
      
      const result: AudioDiagnosticResult = {
        hasAudioContent: analysis.averageVolume > 0.001, // 非常に小さい音声も検出
        duration: audioBuffer.duration,
        averageVolume: analysis.averageVolume,
        peakVolume: analysis.peakVolume,
        silencePercentage: analysis.silencePercentage,
        sampleRate: audioBuffer.sampleRate,
        channelCount: audioBuffer.numberOfChannels,
        format: 'webm',
        fileSize,
        isValid: true
      }
      
      console.log('🔍 音声分析結果:', result)
      return result
      
    } catch (error) {
      console.error('❌ 音声診断エラー:', error)
      
      return {
        hasAudioContent: false,
        duration: 0,
        averageVolume: 0,
        peakVolume: 0,
        silencePercentage: 100,
        sampleRate: 0,
        channelCount: 0,
        format: 'unknown',
        fileSize: 0,
        isValid: false,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
  
  /**
   * 音声ファイルをAudioBufferに変換
   */
  private static async loadAudioBuffer(filePath: string): Promise<AudioBuffer | null> {
    try {
      // FileSystem APIを使用してファイルを読み込み
      const audioData = await window.electronAPI.readFile(filePath)
      
      // AudioContextを作成
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      
      // ArrayBufferをAudioBufferにデコード
      const audioBuffer = await audioContext.decodeAudioData(audioData.buffer)
      
      console.log('🎵 AudioBuffer作成成功:', {
        duration: audioBuffer.duration,
        sampleRate: audioBuffer.sampleRate,
        channels: audioBuffer.numberOfChannels
      })
      
      return audioBuffer
      
    } catch (error) {
      console.error('❌ AudioBuffer作成エラー:', error)
      return null
    }
  }
  
  /**
   * AudioBufferの音声データを分析
   */
  private static analyzeAudioBuffer(audioBuffer: AudioBuffer): {
    averageVolume: number
    peakVolume: number
    silencePercentage: number
  } {
    const channelData = audioBuffer.getChannelData(0) // 最初のチャンネルを分析
    const length = channelData.length
    
    let sum = 0
    let peak = 0
    let silentSamples = 0
    const silenceThreshold = 0.001 // サイレンス判定閾値
    
    for (let i = 0; i < length; i++) {
      const sample = Math.abs(channelData[i])
      sum += sample
      
      if (sample > peak) {
        peak = sample
      }
      
      if (sample < silenceThreshold) {
        silentSamples++
      }
    }
    
    const averageVolume = sum / length
    const silencePercentage = (silentSamples / length) * 100
    
    console.log('📊 音声データ統計:', {
      averageVolume,
      peakVolume: peak,
      silencePercentage,
      totalSamples: length,
      silentSamples
    })
    
    return {
      averageVolume,
      peakVolume: peak,
      silencePercentage
    }
  }
  
  /**
   * 診断結果をわかりやすい形式で出力
   */
  static formatDiagnosticResult(result: AudioDiagnosticResult): string {
    if (!result.isValid) {
      return `❌ 音声診断失敗: ${result.error || '不明なエラー'}`
    }
    
    const lines = [
      `🔍 音声ファイル診断結果`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `📁 ファイルサイズ: ${(result.fileSize / 1024).toFixed(1)} KB`,
      `⏱️  再生時間: ${result.duration.toFixed(2)} 秒`,
      `🎵 サンプルレート: ${result.sampleRate} Hz`,
      `🔊 チャンネル数: ${result.channelCount}`,
      `📊 平均音量: ${(result.averageVolume * 100).toFixed(3)}%`,
      `📈 ピーク音量: ${(result.peakVolume * 100).toFixed(3)}%`,
      `🔇 サイレンス率: ${result.silencePercentage.toFixed(1)}%`,
      `✅ 音声検出: ${result.hasAudioContent ? 'あり' : 'なし'}`,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    ]
    
    return lines.join('\n')
  }
  
  /**
   * 問題の診断と推奨対策を提供
   */
  static getDiagnosticRecommendations(result: AudioDiagnosticResult): string[] {
    const recommendations: string[] = []
    
    if (!result.isValid) {
      recommendations.push('ファイルが破損している可能性があります。録音を再試行してください。')
      return recommendations
    }
    
    if (result.fileSize < 1000) {
      recommendations.push('ファイルサイズが非常に小さいです。録音が正常に開始されていない可能性があります。')
    }
    
    if (result.duration < 1) {
      recommendations.push('録音時間が短すぎます。最低1秒以上の録音が必要です。')
    }
    
    if (result.silencePercentage > 95) {
      recommendations.push('音声がほとんど検出されていません。マイクの接続と音量を確認してください。')
    }
    
    if (result.averageVolume < 0.001) {
      recommendations.push('音量が非常に小さいです。マイクの音量を上げてください。')
    }
    
    if (result.peakVolume < 0.01) {
      recommendations.push('音声レベルが低すぎます。話者がマイクに近づいて話してください。')
    }
    
    if (result.sampleRate < 16000) {
      recommendations.push('サンプルレートが低すぎます。音声認識の精度が低下する可能性があります。')
    }
    
    if (!result.hasAudioContent) {
      recommendations.push('音声コンテンツが検出されませんでした。録音環境を確認してください。')
    }
    
    if (recommendations.length === 0) {
      recommendations.push('音声ファイルは正常に見えます。Kotoba-Whisperサービスの設定を確認してください。')
    }
    
    return recommendations
  }
}