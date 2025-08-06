import { contextBridge, ipcRenderer } from 'electron';

// ElectronAPIの型定義
export interface ElectronAPI {
  // ダイアログ
  selectFolder: () => Promise<string | null>;
  
  // ファイル操作
  saveFile: (buffer: ArrayBuffer, filename: string, subfolder?: string) => Promise<string>;
  saveFileToPath: (filePath: string, data: ArrayBuffer | Blob) => Promise<boolean>;
  saveTextFile: (filePath: string, content: string) => Promise<boolean>;
  getFileList: (folderPath: string) => Promise<AudioFile[]>;
  deleteFile: (filePath: string) => Promise<boolean>;
  loadAudioFile: (filePath: string) => Promise<string | null>;
  saveMetadata: (filename: string, metadata: any) => Promise<void>;
  getFileSize: (filePath: string) => Promise<number>;
  getDiskSpace: (dirPath: string) => Promise<{ free: number; total: number }>;
  readFile: (filePath: string) => Promise<Buffer>;
  getWorkingDirectory: () => Promise<string>;
  showSaveDialog: (options: { defaultPath: string, filters: Array<{ name: string, extensions: string[] }> }) => Promise<string | null>;
  
  // 設定
  loadSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<void>;
  
  // 音声デバイス
  getInputDevices: () => Promise<MediaDeviceInfo[]>;
  
  // デスクトップキャプチャ
  getDesktopSources: () => Promise<DesktopCapturerSource[]>;
  
  // ウィンドウ操作
  windowMinimize: () => Promise<void>;
  windowMaximize: () => Promise<void>;
  windowClose: () => Promise<void>;
  windowIsMaximized: () => Promise<boolean>;
  
  // イベントリスナー
  onFileSaved: (callback: (data: { filePath: string; filename: string; folder: string }) => void) => void;
  removeAllListeners: (channel: string) => void;
  
  // デバッグ
  debugGetLogs: () => Promise<string>;
  debugClearLogs: () => Promise<void>;
  
  // 音声認識（Kotoba-Whisper）
  speechGetServerStatus: () => Promise<{ isRunning: boolean; pid?: number }>;
  speechStartServer: () => Promise<boolean>;
  speechStopServer: () => Promise<void>;
  speechTranscribe: (filePath: string) => Promise<TranscriptionResult>;
  speechChangeModel: (modelName: string) => Promise<boolean>;
  
  // 音声認識イベントリスナー
  onSpeechProgress: (callback: (progress: SpeechProgress) => void) => void;
  
  // 文字起こしファイル操作
  saveTranscriptionFile: (audioFilePath: string, transcription: TranscriptionFile) => Promise<string>;
  loadTranscriptionFile: (transFilePath: string) => Promise<TranscriptionFile>;
  deleteTranscriptionFile: (transFilePath: string) => Promise<boolean>;
  
  // AI対話記録操作
  saveClipboardCopy: (audioFilePath: string, copyRecord: ClipboardCopyRecord) => Promise<void>;
  loadAIChatFile: (chatFilePath: string) => Promise<AIChatFile>;
  
  // ファイル関連操作
  checkTranscriptionExists: (audioFilePath: string) => Promise<boolean>;
  getTranscriptionPath: (audioFilePath: string) => Promise<string>;
  getAIChatPath: (audioFilePath: string) => Promise<string>;
  
  // チャンク分割文字起こし
  chunkStartTranscription: (audioFilePath: string, settings: ChunkSettings) => Promise<string>;
  chunkStopTranscription: (sessionId: string) => Promise<void>;
  chunkGetProgress: (sessionId: string) => Promise<ChunkProgress>;
  chunkUpdateSettings: (settings: ChunkSettings) => Promise<void>;
  chunkSaveConsolidatedResult: (audioFilePath: string, consolidatedResult: TranscriptionFile) => Promise<string>;
  
  // 録音中ファイルの処理
  loadPartialAudioFile: (audioFilePath: string) => Promise<string | null>;
}

// 型定義
export interface AudioFile {
  id: string;
  filename: string;
  filepath: string;
  format: 'webm' | 'wav' | 'mp3' | 'rt.txt' | 'txt' | 'md';
  size: number;
  createdAt: Date;
  duration?: number;
  transcription?: string;
  inputDevice?: string;
  hasTranscriptionFile?: boolean; // 文字起こしファイルの存在フラグ
  transcriptionPath?: string; // 文字起こしファイルのパス
  transcriptionSize?: number; // 文字起こしファイルのサイズ
  isRecording?: boolean; // 録音中フラグ
  isRealtimeTranscription?: boolean; // リアルタイム文字起こしファイルフラグ
  isTextFile?: boolean; // テキストファイルフラグ
  isAudioFile?: boolean; // 音声ファイルフラグ
  isTranscriptionFile?: boolean; // 文字起こしファイルフラグ
  isPairedFile?: boolean; // ペアファイルフラグ
}

export interface AppSettings {
  saveFolder: string;
  audioQuality: 'low' | 'medium' | 'high';
  defaultVolume: number;
  defaultInputDevice: string;
  mp3Bitrate: 128 | 192 | 320;
  autoTranscribe: boolean;
}

export interface DesktopCapturerSource {
  id: string;
  name: string;
  thumbnail: string; // base64 encoded
}

// 音声認識関連の型定義
export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
  isEdited?: boolean;  // 編集済みフラグ
  words?: Array<{
    start: number;
    end: number;
    word: string;
  }>;
}

export interface TranscriptionResult {
  language: string;
  duration: number;
  segments: TranscriptionSegment[];
  created_at: number;
  segment_count: number;
}

export interface SpeechProgress {
  type: string;
  status: string;
  file_path?: string;
  message?: string;
}

// 文字起こし結果管理用の型定義
export interface TranscriptionMetadata {
  audioFile: string;           // 元音声ファイル名
  model: string;               // 使用モデル名
  transcribedAt: string;       // ISO8601形式の日時
  duration: number;            // 音声長（秒）
  segmentCount: number;        // セグメント数
  language: string;            // 言語コード
  speakers: string[];          // 話者一覧（手動追加）
  coverage: number;            // カバレッジ率（%）
  chunkCount?: number;         // チャンク数（チャンク分割の場合）
  qualityScore?: number;       // 品質スコア（チャンク分割の場合）
}

export interface TranscriptionSegmentExtended {
  start: number;               // 開始時刻（秒）
  end: number;                 // 終了時刻（秒）
  text: string;                // テキスト内容
  speaker?: string;            // 話者名（オプション）
  isEdited?: boolean;          // 編集済みフラグ
}

export interface TranscriptionFile {
  metadata: TranscriptionMetadata;
  segments: TranscriptionSegmentExtended[];
  filePath: string;            // .trans.txtのパス
  isModified: boolean;         // 未保存変更フラグ
}

export interface ClipboardCopyRecord {
  timestamp: string;           // ISO8601形式
  selectedText: string;        // コピーしたテキスト
  segmentIndex?: number;       // 元セグメントインデックス
}

export interface AIChatFile {
  sourceFile: string;          // 元.trans.txtファイル
  createdAt: string;           // 作成日時
  clipboardHistory: ClipboardCopyRecord[];
}

// チャンク分割文字起こし用の型定義
export interface ChunkSettings {
  chunkSize: number;           // チャンクサイズ（秒）
  overlapSize: number;         // オーバーラップサイズ（秒）
  maxConcurrency: number;      // 最大並列処理数
  enableAutoScroll: boolean;   // 自動スクロール有効化
  qualityMode: 'speed' | 'balance' | 'accuracy'; // 品質モード
}

export interface ChunkProgress {
  isTranscribing: boolean;
  totalChunks: number;
  processedChunks: number;
  failedChunks: number;
  currentProcessingChunk: number;
  averageProcessingTime: number;
  estimatedTimeRemaining: number;
}

// Electron APIをレンダラープロセスに公開
const electronAPI: ElectronAPI = {
  // ダイアログ
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),
  
  // ファイル操作
  saveFile: (buffer: ArrayBuffer, filename: string, subfolder?: string) => 
    ipcRenderer.invoke('file:save', Buffer.from(buffer), filename, subfolder),
  saveFileToPath: async (filePath: string, data: ArrayBuffer | Blob) => {
    let buffer: ArrayBuffer;
    if (data instanceof Blob) {
      buffer = await data.arrayBuffer();
    } else {
      buffer = data;
    }
    return ipcRenderer.invoke('file:saveToPath', filePath, Buffer.from(buffer));
  },
  saveTextFile: (filePath: string, content: string) => 
    ipcRenderer.invoke('file:saveText', filePath, content),
  getFileList: (folderPath: string) => 
    ipcRenderer.invoke('file:getList', folderPath),
  deleteFile: (filePath: string) => 
    ipcRenderer.invoke('file:delete', filePath),
  loadAudioFile: (filePath: string) => 
    ipcRenderer.invoke('file:loadAudio', filePath),
  saveMetadata: (filename: string, metadata: any) => 
    ipcRenderer.invoke('file:saveMetadata', filename, metadata),
  getFileSize: (filePath: string) => 
    ipcRenderer.invoke('file:getSize', filePath),
  getDiskSpace: (dirPath: string) => 
    ipcRenderer.invoke('file:getDiskSpace', dirPath),
  readFile: (filePath: string) => 
    ipcRenderer.invoke('file:read', filePath),
  getWorkingDirectory: () =>
    ipcRenderer.invoke('file:getWorkingDirectory'),
  showSaveDialog: (options: { defaultPath: string, filters: Array<{ name: string, extensions: string[] }> }) =>
    ipcRenderer.invoke('dialog:showSaveDialog', options),
  
  // 設定
  loadSettings: () => 
    ipcRenderer.invoke('settings:load'),
  saveSettings: (settings: AppSettings) => 
    ipcRenderer.invoke('settings:save', settings),
  
  // 音声デバイス
  getInputDevices: () => 
    ipcRenderer.invoke('audio:getInputDevices'),
  
  // デスクトップキャプチャ
  getDesktopSources: () => 
    ipcRenderer.invoke('desktop:getSources'),
  
  // ウィンドウ操作
  windowMinimize: () => 
    ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => 
    ipcRenderer.invoke('window:maximize'),
  windowClose: () => 
    ipcRenderer.invoke('window:close'),
  windowIsMaximized: () => 
    ipcRenderer.invoke('window:isMaximized'),
  
  // イベントリスナー
  onFileSaved: (callback: (data: { filePath: string; filename: string; folder: string }) => void) => {
    ipcRenderer.on('file:saved', (event, data) => callback(data));
  },
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },
  
  // デバッグ
  debugGetLogs: () => 
    ipcRenderer.invoke('debug:getLogs'),
  debugClearLogs: () => 
    ipcRenderer.invoke('debug:clearLogs'),
  
  // 音声認識（Kotoba-Whisper）
  speechGetServerStatus: () => 
    ipcRenderer.invoke('speech:getServerStatus'),
  speechStartServer: () => 
    ipcRenderer.invoke('speech:startServer'),
  speechStopServer: () => 
    ipcRenderer.invoke('speech:stopServer'),
  speechTranscribe: (filePath: string) => 
    ipcRenderer.invoke('speech:transcribe', filePath),
  speechChangeModel: (modelName: string) => 
    ipcRenderer.invoke('speech:changeModel', modelName),
  
  // 音声認識イベントリスナー
  onSpeechProgress: (callback: (progress: SpeechProgress) => void) => {
    ipcRenderer.on('speech:progress', (event, progress) => callback(progress));
  },
  
  // 文字起こしファイル操作
  saveTranscriptionFile: (audioFilePath: string, transcription: TranscriptionFile) => 
    ipcRenderer.invoke('transcription:save', audioFilePath, transcription),
  loadTranscriptionFile: (transFilePath: string) => 
    ipcRenderer.invoke('transcription:load', transFilePath),
  deleteTranscriptionFile: (transFilePath: string) => 
    ipcRenderer.invoke('transcription:delete', transFilePath),
  
  // AI対話記録操作
  saveClipboardCopy: (audioFilePath: string, copyRecord: ClipboardCopyRecord) => 
    ipcRenderer.invoke('aichat:saveClipboard', audioFilePath, copyRecord),
  loadAIChatFile: (chatFilePath: string) => 
    ipcRenderer.invoke('aichat:load', chatFilePath),
  
  // ファイル関連操作
  checkTranscriptionExists: (audioFilePath: string) => 
    ipcRenderer.invoke('transcription:exists', audioFilePath),
  getTranscriptionPath: (audioFilePath: string) => 
    ipcRenderer.invoke('transcription:getPath', audioFilePath),
  getAIChatPath: (audioFilePath: string) => 
    ipcRenderer.invoke('aichat:getPath', audioFilePath),
  
  // チャンク分割文字起こし
  chunkStartTranscription: (audioFilePath: string, settings: ChunkSettings) => 
    ipcRenderer.invoke('chunk:startTranscription', audioFilePath, settings),
  chunkStopTranscription: (sessionId: string) => 
    ipcRenderer.invoke('chunk:stopTranscription', sessionId),
  chunkGetProgress: (sessionId: string) => 
    ipcRenderer.invoke('chunk:getProgress', sessionId),
  chunkUpdateSettings: (settings: ChunkSettings) => 
    ipcRenderer.invoke('chunk:updateSettings', settings),
  chunkSaveConsolidatedResult: (audioFilePath: string, consolidatedResult: TranscriptionFile) => 
    ipcRenderer.invoke('chunk:saveConsolidatedResult', audioFilePath, consolidatedResult),
  
  // 録音中ファイルの処理
  loadPartialAudioFile: (audioFilePath: string) => 
    ipcRenderer.invoke('audio:loadPartialFile', audioFilePath),
};

// Context Bridgeを使用してAPIを安全に公開
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// 型定義をグローバルに公開
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}