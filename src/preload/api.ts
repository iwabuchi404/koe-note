/**
 * preload の IPC 実装
 *
 * 型は src/shared/types.ts を参照する。ここでは Electron の
 * ipcRenderer を呼び出すだけにして、型定義や副作用を持たない。
 */
import { ipcRenderer } from 'electron'
import type { ElectronAPI } from '@shared/types'

export const api: ElectronAPI = {
  // ---- ダイアログ ----
  selectFolder: () => ipcRenderer.invoke('dialog:selectFolder'),

  selectFile: (filters) => ipcRenderer.invoke('dialog:selectFile', filters),

  // ---- ファイル操作 ----
  saveFile: (buffer: ArrayBuffer, filename: string, subfolder?: string) =>
    ipcRenderer.invoke('file:save', Buffer.from(buffer), filename, subfolder),

  saveFileToPath: async (filePath: string, data: ArrayBuffer | Blob) => {
    const arrayBuffer = data instanceof Blob ? await data.arrayBuffer() : data
    return ipcRenderer.invoke('file:saveToPath', filePath, Buffer.from(arrayBuffer))
  },

  saveTextFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('file:saveText', filePath, content),

  appendFileToPath: async (filePath: string, data: ArrayBuffer | Blob) => {
    const arrayBuffer = data instanceof Blob ? await data.arrayBuffer() : data
    return ipcRenderer.invoke('file:appendToPath', filePath, Buffer.from(arrayBuffer))
  },

  getFileList: (folderPath: string) => ipcRenderer.invoke('file:getList', folderPath),

  deleteFile: (filePath: string) => ipcRenderer.invoke('file:delete', filePath),

  loadAudioFile: (filePath: string) => ipcRenderer.invoke('file:loadAudio', filePath),

  readFile: async (filePath: string): Promise<Uint8Array> => {
    const buffer = await ipcRenderer.invoke('file:read', filePath)
    return new Uint8Array(buffer)
  },

  getWorkingDirectory: () => ipcRenderer.invoke('file:getWorkingDirectory'),

  // ---- 設定 ----
  loadSettings: () => ipcRenderer.invoke('settings:load'),

  // ---- 文字起こしサーバー ----
  speechGetServerStatus: () => ipcRenderer.invoke('speech:getServerStatus'),

  speechStartServer: () => ipcRenderer.invoke('speech:startServer'),

  speechStopServer: () => ipcRenderer.invoke('speech:stopServer'),

  speechTranscribe: (filePath: string) => ipcRenderer.invoke('speech:transcribe', filePath),

  speechChangeModel: (modelName: string) => ipcRenderer.invoke('speech:changeModel', modelName),

  onSpeechServerStatus: (callback) => {
    ipcRenderer.on('speech:serverStatus', (_event, status) => callback(status))
  },

  // ---- 文字起こしファイル ----
  loadTranscriptionFile: (transFilePath: string) =>
    ipcRenderer.invoke('transcription:load', transFilePath),

  checkTranscriptionExists: (audioFilePath: string) =>
    ipcRenderer.invoke('transcription:exists', audioFilePath),

  getTranscriptionPath: (audioFilePath: string) =>
    ipcRenderer.invoke('transcription:getPath', audioFilePath),

  // ---- モデル管理 ----
  getModelsPath: () => ipcRenderer.invoke('models:getModelsPath'),

  getInstalledModels: () => ipcRenderer.invoke('models:getInstalledModels'),

  downloadWhisperModel: (modelId: string) =>
    ipcRenderer.invoke('models:downloadWhisperModel', modelId),

  cancelModelDownload: (modelId: string) => ipcRenderer.invoke('models:cancelDownload', modelId),

  // 旧APIは modelId を無視してモデルディレクトリ全体を受けていた。
  // main 側 handlers:removeModel の実装校正は Phase D で揃える。
  removeModel: (modelId: string) => ipcRenderer.invoke('models:removeModel', modelId),

  // ---- ウィンドウ操作 ----
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),

  windowMaximize: () => ipcRenderer.invoke('window:maximize'),

  windowClose: () => ipcRenderer.invoke('window:close'),

  windowIsMaximized: () => ipcRenderer.invoke('window:isMaximized'),

  // ---- 汎用イベント ----
  on: <TArgs extends unknown[]>(channel: string, callback: (event: unknown, ...args: TArgs) => void) =>
    ipcRenderer.on(channel, callback as never),

  removeListener: <TArgs extends unknown[]>(
    channel: string,
    callback: (event: unknown, ...args: TArgs) => void
  ) => ipcRenderer.removeListener(channel, callback as never),

  // ---- ログ ----
  logWrite: (message: string) => ipcRenderer.invoke('log:write', message)
}
