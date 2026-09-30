/**
 * ElectronAPI のテスト用モック
 *
 * 方針:
 * - `ElectronAPI` 型を実装することで、preload にメソッドが追加されると
 *   ここが型エラーになり、テストが落ちる（型によるドリフト検知）
 * - 個別テストでは `createElectronAPI({ ...overrides })` で上書きする
 */
import type { ElectronAPI } from '../../src/preload/preload'

type Overrides = Partial<ElectronAPI>

const DEFAULT_SETTINGS = {
  saveFolder: '/mock/save-folder',
  audioQuality: 'medium' as const,
  defaultVolume: 50,
  defaultInputDevice: 'default',
  mp3Bitrate: 128 as const,
  autoTranscribe: true
}

/**
 * 完全な ElectronAPI モックを生成する
 */
export function createElectronAPI(overrides: Overrides = {}): ElectronAPI {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>()

  const emit = (channel: string, ...args: unknown[]): void => {
    listeners.get(channel)?.forEach((listener) => listener(...args))
  }

  const subscribe = (channel: string, callback: (...args: unknown[]) => void): void => {
    const set = listeners.get(channel) ?? new Set()
    set.add(callback)
    listeners.set(channel, set)
  }

  const api: ElectronAPI = {
    // ダイアログ
    selectFolder: vi.fn().mockResolvedValue('/mock/folder'),
    selectFile: vi.fn().mockResolvedValue({ path: '/mock/file.wav', name: 'file.wav' }),
    showSaveDialog: vi.fn().mockResolvedValue('/mock/save/file.wav'),

    // ファイル操作
    saveFile: vi.fn().mockResolvedValue('/mock/path/file.mp3'),
    saveFileToPath: vi.fn().mockResolvedValue(true),
    saveTextFile: vi.fn().mockResolvedValue(true),
    getFileList: vi.fn().mockResolvedValue([]),
    deleteFile: vi.fn().mockResolvedValue(true),
    // 36バイトの有効なWAVをdata URLで返す（音声要素が読み込めることのみ担保）
    loadAudioFile: vi.fn().mockResolvedValue(
      'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj'
    ),
    saveMetadata: vi.fn().mockResolvedValue(undefined),
    getFileSize: vi.fn().mockResolvedValue(0),
    getDiskSpace: vi.fn().mockResolvedValue({ free: 1024 * 1024 * 1024, total: 2 * 1024 * 1024 * 1024 }),
    readFile: vi.fn().mockResolvedValue(Buffer.alloc(0)),
    getWorkingDirectory: vi.fn().mockResolvedValue('/mock/save-folder'),

    // 設定
    loadSettings: vi.fn().mockResolvedValue(DEFAULT_SETTINGS),
    saveSettings: vi.fn().mockResolvedValue(undefined),

    // 音声デバイス
    getInputDevices: vi.fn().mockResolvedValue([]),

    // デスクトップキャプチャ
    getDesktopSources: vi.fn().mockResolvedValue([]),

    // ウィンドウ操作
    windowMinimize: vi.fn().mockResolvedValue(undefined),
    windowMaximize: vi.fn().mockResolvedValue(undefined),
    windowClose: vi.fn().mockResolvedValue(undefined),
    windowIsMaximized: vi.fn().mockResolvedValue(false),

    // イベントリスナー
    onFileSaved: vi.fn((callback) => subscribe('file:saved', callback)),
    removeAllListeners: vi.fn((channel: string) => listeners.delete(channel)),

    // デバッグ
    debugGetLogs: vi.fn().mockResolvedValue(''),
    debugClearLogs: vi.fn().mockResolvedValue(undefined),

    // 音声認識（Kotoba-Whisper）
    speechGetServerStatus: vi.fn().mockResolvedValue({ isRunning: false }),
    speechStartServer: vi.fn().mockResolvedValue(true),
    speechStopServer: vi.fn().mockResolvedValue(undefined),
    speechTranscribe: vi.fn().mockResolvedValue({
      language: 'ja',
      duration: 0,
      segments: [],
      created_at: 0,
      segment_count: 0
    }),
    speechChangeModel: vi.fn().mockResolvedValue(true),
    onSpeechProgress: vi.fn((callback) => subscribe('speech:progress', callback)),
    onSpeechServerStatus: vi.fn((callback) => subscribe('speech:serverStatus', callback)),

    // 文字起こしファイル操作
    saveTranscriptionFile: vi.fn().mockResolvedValue('/mock/file.trans.txt'),
    loadTranscriptionFile: vi.fn().mockResolvedValue({
      metadata: {
        audioFile: 'file.mp3',
        model: 'small',
        transcribedAt: '2025-01-01T00:00:00.000Z',
        duration: 0,
        segmentCount: 0,
        language: 'ja',
        speakers: [],
        coverage: 0
      },
      segments: [],
      filePath: '/mock/file.trans.txt',
      isModified: false
    }),
    deleteTranscriptionFile: vi.fn().mockResolvedValue(true),

    // AI対話記録操作
    saveClipboardCopy: vi.fn().mockResolvedValue(undefined),
    loadAIChatFile: vi.fn().mockResolvedValue({
      sourceFile: '/mock/file.trans.txt',
      createdAt: '2025-01-01T00:00:00.000Z',
      clipboardHistory: []
    }),

    // ファイル関連操作
    checkTranscriptionExists: vi.fn().mockResolvedValue(false),
    getTranscriptionPath: vi.fn().mockResolvedValue('/mock/file.trans.txt'),
    getAIChatPath: vi.fn().mockResolvedValue('/mock/file.ai-chat.txt'),

    // チャンク分割文字起こし
    chunkStartTranscription: vi.fn().mockResolvedValue('mock-session-id'),
    chunkStopTranscription: vi.fn().mockResolvedValue(undefined),
    chunkGetProgress: vi.fn().mockResolvedValue({
      isTranscribing: false,
      totalChunks: 0,
      processedChunks: 0,
      failedChunks: 0,
      currentProcessingChunk: 0,
      averageProcessingTime: 0,
      estimatedTimeRemaining: 0
    }),
    chunkUpdateSettings: vi.fn().mockResolvedValue(undefined),
    chunkSaveConsolidatedResult: vi.fn().mockResolvedValue('/mock/file.trans.txt'),

    // 録音中ファイルの処理
    loadPartialAudioFile: vi.fn().mockResolvedValue(null),

    // モデル管理
    getModelsPath: vi.fn().mockResolvedValue('/mock/models'),
    getInstalledModels: vi.fn().mockResolvedValue([]),
    downloadModel: vi.fn().mockResolvedValue(undefined),
    downloadWhisperModel: vi.fn().mockResolvedValue(undefined),
    removeModel: vi.fn().mockResolvedValue(undefined),
    cancelModelDownload: vi.fn().mockResolvedValue(undefined),
    verifyModel: vi.fn().mockResolvedValue({
      valid: true,
      modelId: 'small',
      missingFiles: [],
      corruptFiles: [],
      totalFiles: 4,
      checkedFiles: 4,
      errors: []
    }),
    cleanupCorruptedModel: vi.fn().mockResolvedValue(false),

    // 汎用イベント
    on: vi.fn(subscribe),
    removeListener: vi.fn(),
    logWrite: vi.fn().mockResolvedValue(undefined)
  }

  return { ...api, ...overrides }
}

/**
 * window.electronAPI をモックで置き換える
 */
export function installElectronAPI(overrides: Overrides = {}): ElectronAPI {
  const api = createElectronAPI(overrides)
  Object.defineProperty(window, 'electronAPI', { value: api, writable: true, configurable: true })
  return api
}
