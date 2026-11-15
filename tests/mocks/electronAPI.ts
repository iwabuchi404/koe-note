/**
 * ElectronAPI のテスト用モック
 *
 * 方針:
 * - `ElectronAPI` 型（src/shared/types.ts）を実装することで、API に
 *   メソッドが追加されるとここが型エラーになり、テストが落ちる
 *   （型によるドリフト検知）
 * - 個別テストでは `installElectronAPI({ ...overrides })` で上書きする
 *
 * 返却値のデフォルトは「空・成功」寄りに揃えている。異常系の検証は
 * 各テストが overrides で明示的に差し込む。
 */
import type { ElectronAPI, AppSettings, TranscriptionFile } from '@shared/types'

type Overrides = Partial<ElectronAPI>

const DEFAULT_SETTINGS: AppSettings = {
  saveFolder: '/mock/save-folder',
  audioQuality: 'medium',
  defaultVolume: 50,
  defaultInputDevice: 'default',
  mp3Bitrate: 128,
  autoTranscribe: true
}

const DEFAULT_TRANSCRIPTION_FILE: TranscriptionFile = {
  metadata: {
    audioFile: 'recording.mp3',
    model: 'small',
    transcribedAt: '2025-01-01T00:00:00.000Z',
    duration: 0,
    segmentCount: 0,
    language: 'ja',
    speakers: []
  },
  segments: [],
  filePath: '/mock/recording.trans.txt',
  isModified: false
}

/** 36バイトの有効なWAV（音声要素が読み込めることのみ担保する） */
const SILENT_WAV_DATA_URL =
  'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj'

export interface ElectronAPIMock extends ElectronAPI {
  /** 登録済みリスナーへイベントを配信する（テスト用） */
  emit: (channel: string, ...args: unknown[]) => void
}

/**
 * 完全な ElectronAPI モックを生成する
 */
export function createElectronAPI(overrides: Overrides = {}): ElectronAPIMock {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>()

  const emit = (channel: string, ...args: unknown[]): void => {
    listeners.get(channel)?.forEach((listener) => listener(...args))
  }

  const subscribe = (channel: string, callback: (...args: unknown[]) => void): (() => void) => {
    const set = listeners.get(channel) ?? new Set()
    set.add(callback)
    listeners.set(channel, set)
    return () => {
      listeners.get(channel)?.delete(callback)
    }
  }

  const api: ElectronAPI = {
    // ---- ダイアログ ----
    selectFolder: vi.fn().mockResolvedValue('/mock/folder'),
    selectFile: vi.fn().mockResolvedValue({ path: '/mock/file.mp3', name: 'file.mp3' }),

    // ---- ファイル操作 ----
    saveFile: vi.fn().mockResolvedValue('/mock/path/file.mp3'),
    saveFileToPath: vi.fn().mockResolvedValue(true),
    saveTextFile: vi.fn().mockResolvedValue(true),
    appendFileToPath: vi.fn().mockResolvedValue(true),
    getFileList: vi.fn().mockResolvedValue([]),
    deleteFile: vi.fn().mockResolvedValue(true),
    loadAudioFile: vi.fn().mockResolvedValue(SILENT_WAV_DATA_URL),
    readFile: vi.fn().mockResolvedValue(new Uint8Array(0)),
    getWorkingDirectory: vi.fn().mockResolvedValue('/mock/save-folder'),

    // ---- 設定 ----
    loadSettings: vi.fn().mockResolvedValue(DEFAULT_SETTINGS),

    // ---- 文字起こしサーバー ----
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
    onSpeechServerStatus: vi.fn((callback) => subscribe('speech:serverStatus', callback)),

    // ---- 文字起こしファイル ----
    loadTranscriptionFile: vi.fn().mockResolvedValue(DEFAULT_TRANSCRIPTION_FILE),
    checkTranscriptionExists: vi.fn().mockResolvedValue(false),
    getTranscriptionPath: vi.fn().mockResolvedValue('/mock/recording.trans.txt'),

    // ---- モデル管理 ----
    getModelsPath: vi.fn().mockResolvedValue('/mock/models'),
    getInstalledModels: vi.fn().mockResolvedValue([]),
    downloadWhisperModel: vi.fn().mockResolvedValue(undefined),
    cancelModelDownload: vi.fn().mockResolvedValue(undefined),
    removeModel: vi.fn().mockResolvedValue(undefined),

    // ---- ウィンドウ操作 ----
    windowMinimize: vi.fn().mockResolvedValue(undefined),
    windowMaximize: vi.fn().mockResolvedValue(undefined),
    windowClose: vi.fn().mockResolvedValue(undefined),
    windowIsMaximized: vi.fn().mockResolvedValue(false),

    // ---- イベント ----
    onModelDownloadProgress: vi.fn((callback) => subscribe('models:downloadProgress', callback)),

    // ---- ログ ----
    logWrite: vi.fn().mockResolvedValue(undefined)
  }

  return Object.assign({ ...api, ...overrides }, { emit })
}

/**
 * window.electronAPI をモックで置き換える
 */
export function installElectronAPI(overrides: Overrides = {}): ElectronAPIMock {
  const api = createElectronAPI(overrides)
  Object.defineProperty(window, 'electronAPI', { value: api, writable: true, configurable: true })
  return api
}
