/**
 * E2Eテスト用のモックElectronAPI
 * ブラウザ環境でElectronAPIが利用できない場合に使用
 */

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

export const createMockElectronAPI = () => ({
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
  
  saveMetadata: async (filename: string, metadata: any) => {
    console.log('Mock saveMetadata:', filename, metadata)
  },
  
  getFileSize: async (filePath: string) => {
    console.log('Mock getFileSize:', filePath)
    return 1024000
  },
  
  getDiskSpace: async (dirPath: string) => {
    console.log('Mock getDiskSpace:', dirPath)
    return { free: 10000000000, total: 50000000000 }
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
  
  saveSettings: async (settings: any) => {
    console.log('Mock saveSettings:', settings)
  },
  
  // 音声デバイス
  getInputDevices: async () => {
    console.log('Mock getInputDevices')
    return [
      { deviceId: 'default', label: 'Default Microphone', kind: 'audioinput' as const, groupId: 'group1' }
    ]
  },
  
  // デスクトップキャプチャ
  getDesktopSources: async () => {
    console.log('Mock getDesktopSources')
    return []
  },
  
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
  onFileSaved: (callback: (data: any) => void) => {
    console.log('Mock onFileSaved listener registered')
    // モックでは何もしない
  },
  
  removeAllListeners: (channel: string) => {
    console.log('Mock removeAllListeners:', channel)
  },
  
  // デバッグ
  debugGetLogs: async () => {
    console.log('Mock debugGetLogs')
    return 'Mock debug logs'
  },
  
  debugClearLogs: async () => {
    console.log('Mock debugClearLogs')
  },
  
  // 音声認識（Kotoba-Whisper）
  speechGetServerStatus: async () => {
    console.log('Mock speechGetServerStatus')
    return { isRunning: true, pid: 12345 }
  },
  
  speechStartServer: async () => {
    console.log('Mock speechStartServer')
    return true
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
  onSpeechProgress: (callback: (progress: any) => void) => {
    console.log('Mock onSpeechProgress listener registered')
  },
  
  // 文字起こしファイル操作
  saveTranscriptionFile: async (audioFilePath: string, transcription: any) => {
    console.log('Mock saveTranscriptionFile:', audioFilePath)
    return '/mock/path/transcription.txt'
  },
  
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
  
  deleteTranscriptionFile: async (transFilePath: string) => {
    console.log('Mock deleteTranscriptionFile:', transFilePath)
    return true
  },
  
  // AI対話記録操作
  saveClipboardCopy: async (audioFilePath: string, copyRecord: any) => {
    console.log('Mock saveClipboardCopy:', audioFilePath)
  },
  
  loadAIChatFile: async (chatFilePath: string) => {
    console.log('Mock loadAIChatFile:', chatFilePath)
    return {
      sourceFile: 'sample.txt',
      createdAt: new Date().toISOString(),
      clipboardHistory: []
    }
  },
  
  // ファイル関連操作
  checkTranscriptionExists: async (audioFilePath: string) => {
    console.log('Mock checkTranscriptionExists:', audioFilePath)
    return true
  },
  
  getTranscriptionPath: async (audioFilePath: string) => {
    console.log('Mock getTranscriptionPath:', audioFilePath)
    return audioFilePath.replace('.webm', '_transcription.txt')
  },
  
  getAIChatPath: async (audioFilePath: string) => {
    console.log('Mock getAIChatPath:', audioFilePath)
    return audioFilePath.replace('.webm', '_chat.json')
  },
  
  // チャンク分割文字起こし
  chunkStartTranscription: async (audioFilePath: string, settings: any) => {
    console.log('Mock chunkStartTranscription:', audioFilePath, settings)
    return 'mock-session-id'
  },
  
  chunkStopTranscription: async (sessionId: string) => {
    console.log('Mock chunkStopTranscription:', sessionId)
  },
  
  chunkGetProgress: async (sessionId: string) => {
    console.log('Mock chunkGetProgress:', sessionId)
    return {
      isTranscribing: false,
      totalChunks: 10,
      processedChunks: 10,
      failedChunks: 0,
      currentProcessingChunk: 10,
      averageProcessingTime: 2000,
      estimatedTimeRemaining: 0
    }
  },
  
  chunkUpdateSettings: async (settings: any) => {
    console.log('Mock chunkUpdateSettings:', settings)
  },
  
  chunkSaveConsolidatedResult: async (audioFilePath: string, consolidatedResult: any) => {
    console.log('Mock chunkSaveConsolidatedResult:', audioFilePath)
    return '/mock/path/consolidated.txt'
  },
  
  // 録音中ファイルの処理
  loadPartialAudioFile: async (audioFilePath: string) => {
    console.log('Mock loadPartialAudioFile:', audioFilePath)
    return 'data:audio/webm;base64,mock-partial-audio-data'
  }
})

// グローバルにモックAPIを設定
export const setupMockElectronAPI = () => {
  if (!window.electronAPI) {
    console.log('Setting up mock Electron API for browser environment')
    ;(window as any).electronAPI = createMockElectronAPI()
  }
}