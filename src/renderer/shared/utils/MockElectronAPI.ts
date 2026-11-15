/**
 * 開発時のフォールバック用 ElectronAPI モック
 * preload が読み込めなかった場合（window.electronAPI が無い）に使う。
 * ElectronAPI 型を実装しているので、本物の API にメソッドが増減すると
 * ここが型エラーになる（以前は型注釈が無く、main 側と乖離したまま残っていた）。
 */
import type { ElectronAPI } from '@shared/types';

// モックファイルデータ
const mockFiles = [
  {
    id: 'mock-1',
    filename: 'sample_recording.webm',
    filepath: '/mock/path/sample_recording.webm',
    format: 'webm' as const,
    size: 1024000,
    createdAt: new Date('2025-07-28T10:00:00Z'),
    duration: 30,
    hasTranscriptionFile: true,
    transcriptionPath: '/mock/path/sample_recording_transcription.txt'
  },
  {
    id: 'mock-2', 
    filename: 'test_audio.webm',
    filepath: '/mock/path/test_audio.webm',
    format: 'webm' as const,
    size: 2048000,
    createdAt: new Date('2025-07-28T11:00:00Z'),
    duration: 60,
    hasTranscriptionFile: false
  }
]

const mockSettings = {
  saveFolder: '/mock/recordings',
  audioQuality: 'high' as const,
  defaultVolume: 1.0,
  defaultInputDevice: 'default',
  mp3Bitrate: 192 as const,
  autoTranscribe: true
}

export const createMockElectronAPI = (): ElectronAPI => ({
  // ダイアログ
  selectFolder: async () => '/mock/selected/folder',
  
  // ファイル操作
  saveFile: async (buffer: ArrayBuffer, filename: string, subfolder?: string) => {
    console.log('Mock saveFile:', filename, 'size:', buffer.byteLength)
    return `/mock/path/${subfolder ? subfolder + '/' : ''}${filename}`
  },
  
  getFileList: async (folderPath: string) => {
    console.log('Mock getFileList:', folderPath)
    return mockFiles
  },
  
  deleteFile: async (filePath: string) => {
    console.log('Mock deleteFile:', filePath)
    return true
  },
  
  loadAudioFile: async (filePath: string) => {
    console.log('Mock loadAudioFile:', filePath)
    // データURLを返す（実際のテストでは空のオーディオファイル）
    return 'data:audio/webm;base64,GkXfo0AgQoaBAUL3gQFC8oEEQvOBCEKCQAR3ZWJtQoeBAkKFgQIYU4BnQI0VSalmQCgq17FAAw9CQE2AQAZ3aGFtbXlXQUAGd2hhbW15RIlACECPQAAAAAAAFlSua0AxrkAu14EBY8WBAZyBACK1nEADdW5khkAFVl9WUDglhohAA1ZQOiWETkvOhEHNtsqAAlxDQ0xUREZEBEQEREQEREQEREQEREQEREQEREQEREQEREQEREQEREQEREQEREQEREQEREQEREQEREQEREQEREQEREQEREQEREQEQ=='
  },
  
  
  
  
  readFile: async (filePath: string) => {
    console.log('Mock readFile:', filePath)
    return Buffer.from('Mock file content')
  },
  
  // 設定
  loadSettings: async () => {
    console.log('Mock loadSettings')
    return mockSettings
  },
  
  
  // 音声デバイス
  
  // デスクトップキャプチャ
  
  // ウィンドウ操作
  windowMinimize: async () => {
    console.log('Mock windowMinimize')
  },
  
  windowMaximize: async () => {
    console.log('Mock windowMaximize')
  },
  
  windowClose: async () => {
    console.log('Mock windowClose')
  },
  
  windowIsMaximized: async () => {
    console.log('Mock windowIsMaximized')
    return false
  },
  
  // イベントリスナー
  
  
  // デバッグ
  
  
  // 音声認識（Kotoba-Whisper）
  speechGetServerStatus: async () => {
    console.log('Mock speechGetServerStatus')
    return { isRunning: true, pid: 12345 }
  },
  
  speechStartServer: async () => {
    console.log('Mock speechStartServer')
    // 起動できなかった場合は main と同じく例外を投げる契約
  },
  
  speechStopServer: async () => {
    console.log('Mock speechStopServer')
  },
  
  speechTranscribe: async (filePath: string) => {
    console.log('Mock speechTranscribe:', filePath)
    return {
      language: 'ja',
      duration: 30,
      segments: [
        { start: 0, end: 5, text: 'こんにちは' },
        { start: 5, end: 10, text: 'テストです' },
        { start: 10, end: 15, text: 'モック文字起こし結果' }
      ],
      created_at: Date.now(),
      segment_count: 3
    }
  },
  
  speechChangeModel: async (modelName: string) => {
    console.log('Mock speechChangeModel:', modelName)
    return true
  },
  
  // 音声認識イベントリスナー
  
  // 文字起こしファイル操作
  
  loadTranscriptionFile: async (transFilePath: string) => {
    console.log('Mock loadTranscriptionFile:', transFilePath)
    return {
      metadata: {
        audioFile: 'sample.webm',
        model: 'medium',
        transcribedAt: new Date().toISOString(),
        duration: 30,
        segmentCount: 3,
        language: 'ja',
        speakers: [],
        coverage: 95
      },
      segments: [
        { start: 0, end: 5, text: 'こんにちは' },
        { start: 5, end: 10, text: 'テストです' }
      ],
      filePath: transFilePath,
      isModified: false
    }
  },
  
  
  // AI対話記録操作
  
  
  // ファイル関連操作
  checkTranscriptionExists: async (audioFilePath: string) => {
    console.log('Mock checkTranscriptionExists:', audioFilePath)
    return true
  },
  
  getTranscriptionPath: async (audioFilePath: string) => {
    console.log('Mock getTranscriptionPath:', audioFilePath)
    return audioFilePath.replace('.webm', '_transcription.txt')
  },

  // モデル管理
  getModelsPath: async () => '/mock/models',
  getInstalledModels: async () => [],
  downloadWhisperModel: async () => {
    console.log('Mock downloadWhisperModel')
  },
  cancelModelDownload: async () => {
    console.log('Mock cancelModelDownload')
  },
  removeModel: async () => {
    console.log('Mock removeModel')
  },

  // サーバー状態通知
  onSpeechServerStatus: () => {
    console.log('Mock onSpeechServerStatus')
    return () => undefined
  },

  onModelDownloadProgress: () => {
    return () => undefined
  },

  // 追加のファイル操作
  selectFile: async () => null,
  saveFileToPath: async (filePath: string, data: Blob | ArrayBuffer) => {
    console.log('Mock saveFileToPath:', filePath, data)
    return true
  },
  saveTextFile: async (filePath: string, content: string) => {
    console.log('Mock saveTextFile:', filePath, content)
    return true
  },
  getWorkingDirectory: async () => '/mock/path',

  // セッション（v2 録音保存形式）
  sessionCreate: async (meta) => {
    console.log('Mock sessionCreate:', meta)
    return { id: '20261115_134200_x4f2' }
  },
  sessionAppendChunk: async (req) => {
    console.log('Mock sessionAppendChunk:', req.sessionId, req.sourceId)
    return { file: `audio/${req.sourceId}/chunk_000.wav` }
  },
  sessionUpdate: async (sessionId, patch) => {
    console.log('Mock sessionUpdate:', sessionId, patch)
  },
  sessionSaveTranscript: async (sessionId, transcript) => {
    console.log('Mock sessionSaveTranscript:', sessionId, transcript.id)
  },
  sessionList: async () => [],
  sessionLoad: async (sessionId) => {
    throw new Error(`セッションが見つかりません: ${sessionId}`)
  },
  sessionLoadTranscript: async (sessionId, transcriptId) => {
    throw new Error(`transcript が見つかりません: ${sessionId}/${transcriptId}`)
  },

  // ログ（モックでは標準出力へ）
  logWrite: async (message: string) => {
    console.log('[mock log]', message)
  }
  
  
  // チャンク分割文字起こし
  
  
  
  
  
  // 録音中ファイルの処理
})

// グローバルにモックAPIを設定
export const setupMockElectronAPI = () => {
  if (!window.electronAPI) {
    console.log('Setting up mock Electron API for browser environment')
    ;(window as any).electronAPI = createMockElectronAPI()
  }
}
