/**
 * 作業フォルダ（許可ルート）と設定ファイルの解決
 *
 * 全 file / transcription ハンドラは workspaceRoot() の配下でのみ動作する。
 * 設定の saveFolder を正とし、設定が読めない場合は既定値を使う。
 */
import { app } from 'electron'
import fs from 'fs'
import path from 'path'

// 設定ファイルのパス
export const settingsFilePath = path.join(app.getPath('userData'), 'settings.json')

// デフォルト設定
export function getDefaultSettings() {
  return {
    saveFolder: path.join(app.getPath('desktop'), 'VoiceRecordings'),
    audioQuality: 'medium' as const,
    defaultVolume: 0.8,
    defaultInputDevice: '',
    mp3Bitrate: 192 as const,
    autoTranscribe: false,
  }
}

export function workspaceRoot(): string {
  try {
    if (fs.existsSync(settingsFilePath)) {
      const saved = JSON.parse(fs.readFileSync(settingsFilePath, 'utf-8'))
      if (saved?.saveFolder) {
        return path.resolve(saved.saveFolder)
      }
    }
  } catch {
    // 設定が読めない場合は既定値を使う
  }
  return path.resolve(getDefaultSettings().saveFolder)
}
