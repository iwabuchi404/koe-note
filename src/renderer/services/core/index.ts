/**
 * コアサービス統合エクスポート
 * 
 * すべてのV2サービスクラスと型定義を統合してエクスポート
 */

// サービスクラス
export { RecordingServiceV2 } from './RecordingServiceV2'
export { TranscriptionServiceV2 } from './TranscriptionServiceV2'
export { FileServiceV2 } from './FileServiceV2'

// 録音関連型
export type {
  RecordingConfig,
  RecordingSession,
  RecordingError,
  RecordingResult,
  AudioFile as RecordingAudioFile
} from './RecordingServiceV2'

// 文字起こし関連型
export type {
  TranscriptionConfig,
  AudioFileInfo as TranscriptionAudioFileInfo,
  TranscriptionSegment,
  TranscriptionResult as TranscriptionData,
  TranscriptionProgress,
  RealtimeTranscriptionChunk,
  TranscriptionError,
  TranscriptionResult_T
} from './TranscriptionServiceV2'

// ファイル操作関連型
export type {
  FileInfo,
  AudioFileInfo,
  FolderInfo,
  FileFilter,
  FileError,
  FileResult
} from './FileServiceV2'

// 共通エラー型統合（型の再エクスポート）
import type { RecordingError } from './RecordingServiceV2'
import type { TranscriptionError } from './TranscriptionServiceV2'
import type { FileError } from './FileServiceV2'
export type CoreServiceError = RecordingError | TranscriptionError | FileError

// 統合サービス管理クラス（今後実装）
import type { RecordingServiceV2 } from './RecordingServiceV2'
import type { TranscriptionServiceV2 } from './TranscriptionServiceV2'
import type { FileServiceV2 } from './FileServiceV2'
export interface CoreServiceManager {
  recording: RecordingServiceV2
  transcription: TranscriptionServiceV2
  file: FileServiceV2
}

/**
 * コアサービス初期化ヘルパー
 * 
 * すべてのV2サービスを初期化して統合管理オブジェクトを作成
 */
export function createCoreServices(): CoreServiceManager {
  const { RecordingServiceV2 } = require('./RecordingServiceV2')
  const { TranscriptionServiceV2 } = require('./TranscriptionServiceV2')
  const { FileServiceV2 } = require('./FileServiceV2')
  
  const recording = new RecordingServiceV2()
  const transcription = new TranscriptionServiceV2()
  const file = new FileServiceV2()

  // サービス間のイベント連携設定
  setupServiceIntegration(recording, transcription, file)

  return {
    recording,
    transcription,
    file
  }
}

/**
 * サービス間統合設定
 * 
 * 各サービス間のイベント連携を設定
 * 例：録音完了時に自動で文字起こし開始等
 */
function setupServiceIntegration(
  recording: any,
  transcription: any,
  file: any
): void {
  // 録音完了時のファイル保存通知
  recording.setEventHandlers(
    (session: any) => {
      console.log('Recording status changed:', session.status)
    },
    (error: any) => {
      console.error('Recording error:', error)
    }
  )

  // 文字起こし進捗通知
  transcription.setEventHandlers(
    (progress: any) => {
      console.log('Transcription progress:', progress)
    },
    (segment: any) => {
      console.log('Transcription segment completed:', segment)
    },
    (error: any) => {
      console.error('Transcription error:', error)
    }
  )

  // ファイル変更通知
  file.setEventHandlers(
    (fileInfo: any, changeType: any) => {
      console.log('File changed:', changeType, fileInfo.fileName)
    },
    (error: any) => {
      console.error('File error:', error)
    }
  )
}

/**
 * サービス動作テスト用ヘルパー関数
 * 
 * 開発・デバッグ時に各サービスが単体で動作することを確認
 */
export async function testCoreServices(): Promise<void> {
  console.log('🧪 Core Services Test Started')

  const services = createCoreServices()

  // ファイルサービステスト
  console.log('📁 Testing FileServiceV2...')
  const fileListResult = await services.file.getAudioFileList()
  if (fileListResult.success) {
    console.log(`✅ Found ${fileListResult.data.length} audio files`)
  } else {
    console.error('❌ File service test failed:', fileListResult.error)
  }

  // 録音サービステスト（設定確認のみ）
  console.log('🎤 Testing RecordingServiceV2...')
  console.log(`✅ Recording service initialized, current session: ${services.recording.getCurrentSession()}`)

  // 文字起こしサービステスト（設定確認のみ）
  console.log('📝 Testing TranscriptionServiceV2...')
  console.log('✅ Transcription service initialized')

  console.log('🎉 Core Services Test Completed')
}