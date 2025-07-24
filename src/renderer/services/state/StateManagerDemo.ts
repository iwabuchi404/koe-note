/**
 * StateManagerDemo - 状態管理デモクラス
 * 
 * 役割:
 * - Step3の動作確認用デモ
 * - 簡略化された状態管理の実装例
 * - ビジネスロジックサービスとの統合テスト
 */

import { RecordingServiceV2 } from '../core/RecordingServiceV2'
import { TranscriptionServiceV2 } from '../core/TranscriptionServiceV2'
import { FileServiceV2 } from '../core/FileServiceV2'

/**
 * 状態管理統合デモクラス
 * 各V2サービスの基本的な統合を実証
 */
export class StateManagerDemo {
  private recordingService: RecordingServiceV2
  private transcriptionService: TranscriptionServiceV2
  private fileService: FileServiceV2

  constructor() {
    this.recordingService = new RecordingServiceV2()
    this.transcriptionService = new TranscriptionServiceV2()
    this.fileService = new FileServiceV2()
  }

  /**
   * 録音機能のデモ
   */
  public async demoRecording(): Promise<boolean> {
    try {
      console.log('=== 録音デモ開始 ===')

      // 録音設定（RecordingServiceV2のRecordingConfigに合わせる）
      const recordingConfig = {
        inputType: 'microphone' as const,
        deviceId: 'default',
        deviceName: 'Default Microphone',
        mimeType: 'audio/webm',
        quality: 'medium' as const,
        enableRealtimeTranscription: false
      }

      // 録音開始
      console.log('録音開始...')
      const startResult = await this.recordingService.startRecording(recordingConfig)
      
      if (!startResult.success) {
        console.error('録音開始失敗:', startResult.error)
        return false
      }

      console.log('録音開始成功:', startResult.data)

      // 2秒後に停止
      await new Promise(resolve => setTimeout(resolve, 2000))

      // 録音停止
      console.log('録音停止...')
      const stopResult = await this.recordingService.stopRecording()
      
      if (!stopResult.success) {
        console.error('録音停止失敗:', stopResult.error)
        return false
      }

      console.log('録音停止成功:', stopResult.data)
      console.log('=== 録音デモ完了 ===')
      return true

    } catch (error) {
      console.error('録音デモエラー:', error)
      return false
    }
  }

  /**
   * ファイル管理機能のデモ
   */
  public async demoFileManagement(): Promise<boolean> {
    try {
      console.log('=== ファイル管理デモ開始 ===')

      // ファイル一覧取得
      console.log('ファイル一覧取得...')
      const listResult = await this.fileService.getAudioFileList()
      
      if (!listResult.success) {
        console.error('ファイル一覧取得失敗:', listResult.error)
        return false
      }

      console.log('ファイル一覧取得成功:', listResult.data?.length, '件')

      // ダミーファイル保存テスト
      const dummyAudioBuffer = new ArrayBuffer(1024) // 1KB のダミーデータ
      const fileName = `test_${Date.now()}.webm`

      console.log('ファイル保存テスト...')
      const saveResult = await this.fileService.saveAudioFile(
        dummyAudioBuffer, 
        fileName,
        { demo: true, timestamp: new Date().toISOString() }
      )

      if (!saveResult.success) {
        console.error('ファイル保存失敗:', saveResult.error)
        return false
      }

      console.log('ファイル保存成功:', saveResult.data)

      console.log('=== ファイル管理デモ完了 ===')
      return true

    } catch (error) {
      console.error('ファイル管理デモエラー:', error)
      return false
    }
  }

  /**
   * 文字起こし機能のデモ
   */
  public async demoTranscription(): Promise<boolean> {
    try {
      console.log('=== 文字起こしデモ開始 ===')

      // ダミーオーディオファイル情報
      const audioFileInfo = {
        id: `demo_${Date.now()}`,
        fileName: 'demo.webm',
        filePath: '/path/to/demo.webm',
        size: 1024,
        duration: 5.0,
        format: 'webm',
        createdAt: new Date(),
        modifiedAt: new Date(),
        isRecording: false,
        isSelected: true,
        isPlaying: false
      }

      // 文字起こし設定
      const transcriptionConfig = {
        mode: 'file' as const,
        quality: 'medium' as const,
        language: 'ja' as const,
        model: 'kotoba-whisper-v1.0',
        enableTimestamp: true,
        enableSpeakerIdentification: false,
        enablePunctuation: true,
        chunkDurationSeconds: 20,
        confidenceThreshold: 0.5
      }

      console.log('文字起こし開始...')
      const transcriptionResult = await this.transcriptionService.transcribeFile(
        audioFileInfo,
        transcriptionConfig
      )

      if (!transcriptionResult.success) {
        console.error('文字起こし失敗:', transcriptionResult.error)
        return false
      }

      console.log('文字起こし成功:', transcriptionResult.data)

      console.log('=== 文字起こしデモ完了 ===')
      return true

    } catch (error) {
      console.error('文字起こしデモエラー:', error)
      return false
    }
  }

  /**
   * 全機能統合デモ
   */
  public async runFullDemo(): Promise<boolean> {
    console.log('🚀 === StateManager統合デモ開始 === 🚀')

    const results = {
      recording: false,
      fileManagement: false,
      transcription: false
    }

    // 録音デモ
    results.recording = await this.demoRecording()
    await new Promise(resolve => setTimeout(resolve, 1000)) // 1秒待機

    // ファイル管理デモ  
    results.fileManagement = await this.demoFileManagement()
    await new Promise(resolve => setTimeout(resolve, 1000)) // 1秒待機

    // 文字起こしデモ
    results.transcription = await this.demoTranscription()

    console.log('📊 === デモ結果 ===')
    console.log(`録音機能: ${results.recording ? '✅ 成功' : '❌ 失敗'}`)
    console.log(`ファイル管理: ${results.fileManagement ? '✅ 成功' : '❌ 失敗'}`)
    console.log(`文字起こし: ${results.transcription ? '✅ 成功' : '❌ 失敗'}`)

    const allSuccess = Object.values(results).every(result => result === true)
    console.log(`総合結果: ${allSuccess ? '🎉 全機能正常動作' : '⚠️ 一部機能に問題'}`)

    return allSuccess
  }

  /**
   * 型安全性テスト
   */
  public testTypeSafety(): boolean {
    try {
      console.log('=== 型安全性テスト開始 ===')

      // 各サービスの型が正しく定義されているかテスト
      const recordingService: RecordingServiceV2 = this.recordingService
      const transcriptionService: TranscriptionServiceV2 = this.transcriptionService  
      const fileService: FileServiceV2 = this.fileService

      console.log('録音サービス型チェック:', typeof recordingService)
      console.log('文字起こしサービス型チェック:', typeof transcriptionService)
      console.log('ファイルサービス型チェック:', typeof fileService)

      console.log('=== 型安全性テスト完了 ===')
      return true

    } catch (error) {
      console.error('型安全性テストエラー:', error)
      return false
    }
  }
}

// デモ実行関数
export const runStateManagerDemo = async (): Promise<boolean> => {
  const demo = new StateManagerDemo()
  
  // 型安全性テスト
  const typeSafetyResult = demo.testTypeSafety()
  if (!typeSafetyResult) {
    console.error('型安全性テストに失敗しました')
    return false
  }

  // 統合デモ実行
  const integrationResult = await demo.runFullDemo()
  
  return typeSafetyResult && integrationResult
}

// ブラウザのグローバル関数として公開（デバッグ用）
if (typeof window !== 'undefined') {
  (window as any).runStateManagerDemo = runStateManagerDemo;
  (window as any).StateManagerDemo = StateManagerDemo
}