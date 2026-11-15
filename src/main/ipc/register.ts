/**
 * 全 IPC ハンドラの登録
 */
import type { MainContext } from './context'
import { registerDialogIpc } from './dialog'
import { registerFileIpc } from './files'
import { registerSettingsIpc } from './settings'
import { registerWindowIpc } from './window'
import { registerTranscriptionIpc } from './transcription'
import { registerSpeechIpc } from './speech'
import { registerModelsIpc } from './models'
import { registerSessionsIpc } from './sessions'

export function registerAllIpc(ctx: MainContext): void {
  registerDialogIpc(ctx)
  registerWindowIpc(ctx)
  registerFileIpc()
  registerSettingsIpc()
  registerTranscriptionIpc()
  registerSpeechIpc(ctx)
  registerModelsIpc(ctx)
  registerSessionsIpc()
}
