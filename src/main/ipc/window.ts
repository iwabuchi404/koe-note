/**
 * window:* / log:* — ウィンドウ操作と renderer からのログ転送
 */
import { handle } from './handle'
import { writeLog } from '../services/appLog'
import type { MainContext } from './context'

export function registerWindowIpc(ctx: MainContext): void {
  // ウィンドウ操作
  handle('window:minimize', async (): Promise<void> => {
    const mainWindow = ctx.getMainWindow()
    if (mainWindow) {
      mainWindow.minimize();
    }
  });

  handle('window:maximize', async (): Promise<void> => {
    const mainWindow = ctx.getMainWindow()
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
      } else {
        mainWindow.maximize();
      }
    }
  });

  handle('window:close', async (): Promise<void> => {
    const mainWindow = ctx.getMainWindow()
    if (mainWindow) {
      mainWindow.close();
    }
  });

  handle('window:isMaximized', async (): Promise<boolean> => {
    const mainWindow = ctx.getMainWindow()
    return mainWindow ? mainWindow.isMaximized() : false;
  });

  // ログ出力（rendererプロセスから）
  handle('log:write', async (event, message: string): Promise<void> => {
    writeLog(message);
  });
}
