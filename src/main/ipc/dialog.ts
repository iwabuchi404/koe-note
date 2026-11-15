/**
 * dialog:* — ファイル/フォルダ選択ダイアログ
 */
import { dialog } from 'electron'
import path from 'path'
import { handle } from './handle'
import type { MainContext } from './context'

export function registerDialogIpc(ctx: MainContext): void {
  // フォルダ選択ダイアログ
  handle('dialog:selectFolder', async (): Promise<string | null> => {
    const mainWindow = ctx.getMainWindow()
    if (!mainWindow) {
      return null;
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '録音ファイルの保存フォルダを選択',
    });

    if (result.canceled) {
      return null;
    }

    return result.filePaths[0];
  });

  // ファイル選択ダイアログ
  handle('dialog:selectFile', async (event, filters?: Array<{ name: string; extensions: string[] }>): Promise<{ path: string; name: string } | null> => {
    const mainWindow = ctx.getMainWindow()
    if (!mainWindow) {
      return null;
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      title: 'ファイルを選択',
      filters: filters || [
        { name: '音声ファイル', extensions: ['wav', 'mp3', 'webm', 'm4a', 'flac'] },
        { name: 'テキストファイル', extensions: ['txt', 'md', 'rtf'] },
        { name: 'すべてのファイル', extensions: ['*'] }
      ]
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const filePath = result.filePaths[0];
    const name = path.basename(filePath);
    return { path: filePath, name };
  });
}
