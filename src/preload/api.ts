/**
 * preload の IPC 実装
 *
 * ワイヤ契約は src/shared/ipcContract.ts。invoke/subscribe ヘルパが
 * チャンネル名・引数・戻り値を契約どおりに検査するため、ここで
 * チャンネル名を間違えてもコンパイルエラーになる。
 *
 * preload の役割は「wire 型 ⇔ renderer 向け型」の変換のみ
 * （ArrayBuffer/Blob → Uint8Array、Uint8Array 戻り値のラップなど）。
 */
import { ipcRenderer } from 'electron'
import type { ElectronAPI } from '@shared/types'
import type { IpcContract, IpcEvents } from '@shared/ipcContract'

const invoke = <C extends keyof IpcContract>(
  channel: C,
  ...args: IpcContract[C]['req']
): Promise<IpcContract[C]['res']> => ipcRenderer.invoke(channel, ...args)

/** push イベントを購読し、解除関数を返す */
const subscribe = <E extends keyof IpcEvents>(
  channel: E,
  callback: (payload: IpcEvents[E]) => void
): (() => void) => {
  const listener = (_event: unknown, payload: IpcEvents[E]) => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

/**
 * ArrayBuffer | Blob を Uint8Array に変換する
 *
 * contextBridge の realm 境界を越えると instanceof Blob が機能しないため、
 * arrayBuffer() の有無で Blob を判定する（duck-typing）。
 */
const toUint8Array = async (data: ArrayBuffer | Blob): Promise<Uint8Array> => {
  const arrayBuffer =
    typeof (data as Blob).arrayBuffer === 'function'
      ? await (data as Blob).arrayBuffer()
      : (data as ArrayBuffer)
  return new Uint8Array(arrayBuffer)
}

export const api: ElectronAPI = {
  // ---- ダイアログ ----
  selectFolder: () => invoke('dialog:selectFolder'),

  selectFile: (filters) => invoke('dialog:selectFile', filters),

  // ---- ファイル操作 ----
  saveFile: (buffer: ArrayBuffer, filename: string, subfolder?: string) =>
    invoke('file:save', new Uint8Array(buffer), filename, subfolder),

  saveFileToPath: async (filePath: string, data: ArrayBuffer | Blob) =>
    invoke('file:saveToPath', filePath, await toUint8Array(data)),

  saveTextFile: (filePath: string, content: string) =>
    invoke('file:saveText', filePath, content),

  getFileList: (folderPath: string) => invoke('file:getList', folderPath),

  deleteFile: (filePath: string) => invoke('file:delete', filePath),

  loadAudioFile: (filePath: string) => invoke('file:loadAudio', filePath),

  readFile: async (filePath: string): Promise<Uint8Array> => {
    const buffer = await invoke('file:read', filePath)
    return new Uint8Array(buffer)
  },

  getWorkingDirectory: () => invoke('file:getWorkingDirectory'),

  // ---- 設定 ----
  loadSettings: () => invoke('settings:load'),

  // ---- 文字起こしサーバー ----
  speechGetServerStatus: () => invoke('speech:getServerStatus'),

  speechStartServer: () => invoke('speech:startServer'),

  speechStopServer: () => invoke('speech:stopServer'),

  speechTranscribe: (filePath: string) => invoke('speech:transcribe', filePath),

  speechChangeModel: (modelName: string) => invoke('speech:changeModel', modelName),

  onSpeechServerStatus: (callback) => subscribe('speech:serverStatus', callback),

  // ---- 文字起こしファイル ----
  loadTranscriptionFile: (transFilePath: string) =>
    invoke('transcription:load', transFilePath),

  checkTranscriptionExists: (audioFilePath: string) =>
    invoke('transcription:exists', audioFilePath),

  getTranscriptionPath: (audioFilePath: string) =>
    invoke('transcription:getPath', audioFilePath),

  // ---- モデル管理 ----
  getModelsPath: () => invoke('models:getModelsPath'),

  getInstalledModels: () => invoke('models:getInstalledModels'),

  downloadWhisperModel: (modelId: string) =>
    invoke('models:downloadWhisperModel', modelId),

  cancelModelDownload: (modelId: string) => invoke('models:cancelDownload', modelId),

  // 実引数はモデルIDではなく削除対象のディレクトリパス（ipcContract の注記参照）
  removeModel: (modelPath: string) => invoke('models:removeModel', modelPath),

  onModelDownloadProgress: (callback) => subscribe('models:downloadProgress', callback),

  // ---- セッション（v2 録音保存形式） ----
  sessionCreate: (meta) => invoke('sessions:create', meta),

  sessionAppendChunk: async (req) =>
    invoke('sessions:appendChunk', { ...req, data: await toUint8Array(req.data) }),

  sessionUpdate: (sessionId, patch) => invoke('sessions:update', sessionId, patch),

  sessionSaveTranscript: (sessionId, transcript) =>
    invoke('sessions:saveTranscript', sessionId, transcript),

  sessionList: () => invoke('sessions:list'),

  sessionLoad: (sessionId) => invoke('sessions:load', sessionId),

  sessionLoadTranscript: (sessionId, transcriptId) =>
    invoke('sessions:loadTranscript', sessionId, transcriptId),

  // ---- ライブ文字起こし（WS は main が保持） ----
  transcriptionConnect: (serverUrl, language) =>
    invoke('transcription:connect', serverUrl, language),

  transcriptionSendChunk: async (chunk) =>
    invoke('transcription:sendChunk', { ...chunk, data: await toUint8Array(chunk.data) }),

  transcriptionDisconnect: () => invoke('transcription:disconnect'),

  onTranscriptionConnection: (callback) => subscribe('transcription:connection', callback),

  onTranscriptionResult: (callback) => subscribe('transcription:result', callback),

  onTranscriptionProgress: (callback) => subscribe('transcription:progress', callback),

  onTranscriptionError: (callback) => subscribe('transcription:error', callback),

  // ---- ウィンドウ操作 ----
  windowMinimize: () => invoke('window:minimize'),

  windowMaximize: () => invoke('window:maximize'),

  windowClose: () => invoke('window:close'),

  windowIsMaximized: () => invoke('window:isMaximized'),

  // ---- ログ ----
  logWrite: (message: string) => invoke('log:write', message)
}
