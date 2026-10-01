/**
 * preload エントリポイント
 *
 * ここが preload で唯一の副作用（contextBridge への公開）を持つファイル。
 * 型定義は src/shared/types.ts、IPC実装は src/preload/api.ts に分離してある。
 */
import { contextBridge } from 'electron'
import { api } from './api'
import type { ElectronAPI } from '@shared/types'

contextBridge.exposeInMainWorld('electronAPI', api)

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
