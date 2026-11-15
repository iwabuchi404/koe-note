/**
 * main プロセス共通のファイルロガー
 *
 * userData/app.log にタイムスタンプ付きで追記する。
 * ipc/* と services/* はこの1本を共有する（Electron 依存）。
 */
import { app } from 'electron'
import fs from 'fs'
import path from 'path'

const logFilePath = path.join(app.getPath('userData'), 'app.log')

export function writeLog(message: string): void {
  const timestamp = new Date().toISOString()
  const logMessage = `[${timestamp}] ${message}\n`
  console.log(logMessage.trim())

  try {
    fs.appendFileSync(logFilePath, logMessage)
  } catch (error) {
    console.error('ログファイル書き込みエラー:', error)
  }
}
