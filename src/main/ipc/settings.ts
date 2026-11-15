/**
 * settings:* — アプリ設定の読み込み
 */
import fs from 'fs'
import type { AppSettings } from '@shared/types'
import { getDefaultSettings, settingsFilePath } from '../services/workspace'
import { writeLog } from '../services/appLog'
import { handle } from './handle'

export function registerSettingsIpc(): void {
  // 設定の読み込み
  handle('settings:load', async (): Promise<AppSettings> => {
    try {
      if (fs.existsSync(settingsFilePath)) {
        const data = fs.readFileSync(settingsFilePath, 'utf-8');
        const saved = JSON.parse(data);
        return { ...getDefaultSettings(), ...saved };
      }
    } catch (error) {
      writeLog(`設定読み込みエラー: ${error}`);
    }
    return getDefaultSettings();
  });
}
