/**
 * CoreServicesV2 動作確認テスト
 * 
 * 開発者コンソールで実行して各サービスの動作を確認
 */

import { createCoreServices, testCoreServices } from './index'

/**
 * 手動テスト実行関数
 * ブラウザの開発者コンソールで実行
 */
declare global {
  interface Window {
    testCoreServicesV2: () => Promise<void>
    testRecordingService: () => Promise<void>
    testTranscriptionService: () => Promise<void>
    testFileService: () => Promise<void>
  }
}

/**
 * 全サービス基本動作テスト
 */
window.testCoreServicesV2 = async (): Promise<void> => {
  console.log('🚀 KoeNote CoreServicesV2 動作確認テスト開始')
  console.log('==========================================')
  
  try {
    await testCoreServices()
    console.log('✅ 基本テスト完了')
  } catch (error) {
    console.error('❌ 基本テスト失敗:', error)
  }
}

/**
 * RecordingServiceV2 詳細テスト
 */
window.testRecordingService = async (): Promise<void> => {
  console.log('🎤 RecordingServiceV2 詳細テスト')
  console.log('----------------------------------')
  
  const services = createCoreServices()
  const recordingService = services.recording
  
  try {
    // 1. 初期状態確認
    console.log('1. 初期状態確認')
    console.log('   録音中:', recordingService.isRecording())
    console.log('   現在のセッション:', recordingService.getCurrentSession())
    
    // 2. デバイス取得テスト（実際の録音は行わない）
    console.log('2. 録音設定テスト')
    const config = {
      deviceId: 'default',
      deviceName: 'Default Microphone',
      inputType: 'microphone' as const,
      mimeType: 'audio/webm;codecs=opus',
      quality: 'medium' as const,
      enableRealtimeTranscription: false
    }
    console.log('   設定:', config)
    
    // 実際の録音開始テストは危険なのでスキップ
    console.log('   ⚠️ 実際の録音テストはスキップ（安全のため）')
    
    console.log('✅ RecordingService テスト完了')
    
  } catch (error) {
    console.error('❌ RecordingService テスト失敗:', error)
  }
}

/**
 * TranscriptionServiceV2 詳細テスト
 */
window.testTranscriptionService = async (): Promise<void> => {
  console.log('📝 TranscriptionServiceV2 詳細テスト')
  console.log('------------------------------------')
  
  const services = createCoreServices()
  const transcriptionService = services.transcription
  
  try {
    // 1. 設定テスト
    console.log('1. 文字起こし設定テスト')
    const config = {
      model: 'kotoba-whisper-v1.0',
      quality: 'high' as const,
      language: 'ja' as const,
      enableTimestamp: true,
      enableSpeakerIdentification: false,
      chunkDurationSeconds: 20
    }
    console.log('   設定:', config)
    
    // 2. イベントハンドラー設定テスト
    console.log('2. イベントハンドラー設定')
    transcriptionService.setEventHandlers(
      (progress: any) => console.log('   📊 進捗:', progress),
      (segment: any) => console.log('   📄 セグメント完了:', segment.text),
      (error: any) => console.error('   ❌ エラー:', error)
    )
    console.log('   ✅ ハンドラー設定完了')
    
    // 実際のファイル文字起こしテストは重いのでスキップ
    console.log('   ⚠️ 実際の文字起こしテストはスキップ（処理時間のため）')
    
    console.log('✅ TranscriptionService テスト完了')
    
  } catch (error) {
    console.error('❌ TranscriptionService テスト失敗:', error)
  }
}

/**
 * FileServiceV2 詳細テスト
 */
window.testFileService = async (): Promise<void> => {
  console.log('📁 FileServiceV2 詳細テスト')
  console.log('---------------------------')
  
  const services = createCoreServices()
  const fileService = services.file
  
  try {
    // 1. フォルダ選択テスト（実際は実行しない）
    console.log('1. フォルダ関連機能テスト')
    console.log('   ⚠️ フォルダ選択ダイアログはテストしません')
    
    // 2. ファイル一覧取得テスト
    console.log('2. ファイル一覧取得テスト')
    const fileListResult = await fileService.getAudioFileList()
    
    if (fileListResult.success) {
      console.log('   ✅ ファイル一覧取得成功')
      console.log(`   📊 音声ファイル数: ${fileListResult.data.length}`)
      
      if (fileListResult.data.length > 0) {
        const firstFile = fileListResult.data[0]
        console.log('   📄 最初のファイル:', {
          名前: firstFile.fileName,
          サイズ: `${Math.round(firstFile.size / 1024)}KB`,
          形式: firstFile.format,
          文字起こし: firstFile.hasTranscriptionFile ? 'あり' : 'なし'
        })
        
        // 3. ファイル詳細情報取得テスト
        console.log('3. ファイル詳細情報取得テスト')
        const fileInfoResult = await fileService.getFileInfo(firstFile.filePath)
        
        if (fileInfoResult.success) {
          console.log('   ✅ ファイル情報取得成功')
          console.log('   📊 詳細情報:', {
            ID: fileInfoResult.data.id,
            作成日時: fileInfoResult.data.createdAt.toLocaleString(),
            時間: fileInfoResult.data.duration ? `${fileInfoResult.data.duration}秒` : '不明'
          })
        } else {
          console.warn('   ⚠️ ファイル情報取得失敗:', fileInfoResult.error.message)
        }
      } else {
        console.log('   ℹ️ 音声ファイルが見つかりません')
      }
    } else {
      console.error('   ❌ ファイル一覧取得失敗:', fileListResult.error.message)
    }
    
    // 4. フィルター機能テスト
    console.log('4. フィルター機能テスト')
    const filteredResult = await fileService.getAudioFileList(undefined, {
      extensions: ['webm', 'wav'],
      hasTranscription: true
    })
    
    if (filteredResult.success) {
      console.log('   ✅ フィルター機能動作確認')
      console.log(`   📊 フィルター後ファイル数: ${filteredResult.data.length}`)
    }
    
    console.log('✅ FileService テスト完了')
    
  } catch (error) {
    console.error('❌ FileService テスト失敗:', error)
  }
}

/**
 * エラーハンドリングテスト
 */
async function testErrorHandling(): Promise<void> {
  console.log('⚠️ エラーハンドリングテスト')
  console.log('---------------------------')
  
  const services = createCoreServices()
  
  try {
    // 1. 存在しないファイルへのアクセス
    console.log('1. 存在しないファイルアクセステスト')
    const invalidFileResult = await services.file.getFileInfo('C:\\invalid\\path\\file.wav')
    
    if (!invalidFileResult.success) {
      console.log('   ✅ 予期通りエラーが発生')
      console.log('   📊 エラー情報:', {
        タイプ: invalidFileResult.error.type,
        メッセージ: invalidFileResult.error.message,
        復旧可能: invalidFileResult.error.recoverable
      })
    } else {
      console.warn('   ⚠️ エラーが発生しませんでした（予期しない動作）')
    }
    
    // 2. 不正な録音設定
    console.log('2. 不正な録音設定テスト')
    const invalidConfig = {
      deviceId: 'non-existent-device',
      deviceName: 'Invalid Device',
      inputType: 'invalid-type' as any,
      mimeType: 'invalid/mime-type',
      quality: 'invalid-quality' as any,
      enableRealtimeTranscription: false
    }
    
    console.log('   ⚠️ 不正設定での録音開始は危険なのでスキップ')
    console.log('   📊 テスト設定:', invalidConfig)
    
    console.log('✅ エラーハンドリング テスト完了')
    
  } catch (error) {
    console.error('❌ エラーハンドリング テスト失敗:', error)
  }
}

// ヘルプ表示
console.log(`
🧪 KoeNote CoreServicesV2 テストコマンド:

基本テスト:
  testCoreServicesV2()     - 全サービス基本動作確認

詳細テスト:
  testRecordingService()   - 録音サービス詳細テスト
  testTranscriptionService() - 文字起こしサービス詳細テスト  
  testFileService()        - ファイルサービス詳細テスト
  testErrorHandling()      - エラーハンドリングテスト

使用方法:
  開発者コンソールでテスト関数を実行してください
`)

export {}