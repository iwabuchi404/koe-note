/**
 * IPC ハンドラの登録
 *
 * 全ハンドラはここで包む。役割は3つ:
 *   1. 例外を必ず AppError に正規化し、[CODE] 付きメッセージにして投げる
 *      （Electron は独自プロパティを跨げないため code はメッセージに載せる）
 *   2. 例外をログに残す
 *   3. 番兵（false / null / []）を返さない
 *
 * 此前はハンドラごとに throw / 番兵 / メッセージ再分類 が混在していた。
 */
import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { toAppError, type AppErrorCode } from '../core/errors'
import { formatIpcError } from '@shared/ipcError'
import type { IpcContract } from '@shared/ipcContract'

export interface IpcContext {
  log: (message: string) => void
}

let context: IpcContext = { log: () => undefined }

/** ロガーを注入する（main.ts の初期化時に呼ぶ） */
export function setIpcContext(next: IpcContext): void {
  context = next
}

/**
 * ハンドラを登録する
 *
 * チャンネル名・引数・返り値は src/shared/ipcContract.ts の契約に従う。
 * 契約外のチャンネル名や食い違うシグネチャはここでコンパイルエラーになる。
 * 例外は必ず AppError に変換されて投げられる。
 */
export function handle<C extends keyof IpcContract>(
  channel: C,
  handler: (
    event: IpcMainInvokeEvent,
    ...args: IpcContract[C]['req']
  ) => Promise<IpcContract[C]['res']> | IpcContract[C]['res']
): void {
  ipcMain.handle(channel, async (event, ...args: unknown[]) => {
    try {
      return await (handler as (e: IpcMainInvokeEvent, ...a: unknown[]) => unknown)(
        event,
        ...args
      )
    } catch (error) {
      const appError = toAppError(error)
      context.log(`IPC ${channel} 失敗 [${appError.code}]: ${appError.message}`)
      throw new Error(formatIpcError(appError.code as AppErrorCode, appError.message))
    }
  })
}
