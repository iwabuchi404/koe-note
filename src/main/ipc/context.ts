import type { BrowserWindow } from 'electron'
import type { WhisperServerService } from '../services/whisperServer'

/**
 * IPC 登録時に必要な依存。
 * main.ts が1回だけ組み立て、registerAllIpc に渡す。
 */
export interface MainContext {
  /** 現在のメインウィンドウ（closed 後は null） */
  getMainWindow(): BrowserWindow | null
  whisperServer: WhisperServerService
}
