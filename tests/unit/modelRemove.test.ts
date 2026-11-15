/**
 * モデル削除のパス解決
 *
 * 回帰防止: removeModel が「モデルルート全体」を削除対象にしていた
 * バグ（renderer がルートパスを送信し、main が無条件 rm -rf していた）。
 *
 * renderer 側: ModelDownloadService.removeModel が models--<org>--<name>
 *              の正しいパスを送ること
 * main 側:    models:removeModel がモデルルート外・ルート自身を拒否すること
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { installElectronAPI } from '../mocks/electronAPI'
import { modelDownloadService } from '@renderer/features/models/ModelDownloadService'

describe('ModelDownloadService.removeModel（renderer）', () => {
  it('モデルディレクトリ（ルートではない）を削除対象に送る', async () => {
    const removeModel = vi.fn().mockResolvedValue(undefined)
    installElectronAPI({
      getModelsPath: vi.fn().mockResolvedValue('/models'),
      removeModel
    })

    await modelDownloadService.removeModel('small')

    expect(removeModel).toHaveBeenCalledWith('/models/models--Systran--faster-whisper-small')
  })

  it('不明なモデルIDは送信前に失敗する', async () => {
    const removeModel = vi.fn().mockResolvedValue(undefined)
    installElectronAPI({
      getModelsPath: vi.fn().mockResolvedValue('/models'),
      removeModel
    })

    await expect(modelDownloadService.removeModel('no-such-model')).rejects.toThrow()
    expect(removeModel).not.toHaveBeenCalled()
  })
})

// ---- main 側のガード ----
// registerModelsIpc を electron/ipcMain をモックして直接呼び、
// ハンドラの拒否動作を検証する。
vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  app: { getPath: () => 'C:/fake/userData' }
}))
vi.mock('../../src/main/services/appLog', () => ({ writeLog: vi.fn() }))
vi.mock('../../src/main/services/modelStore', () => ({
  activeDownloads: new Map(),
  downloadFile: vi.fn(),
  repoToId: vi.fn(),
  resolveModelsRoot: vi.fn(() => 'C:/fake/userData/models'),
  verifyModelInternal: vi.fn()
}))

const fsState = vi.hoisted(() => ({
  rmSync: vi.fn(),
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(() => []),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  renameSync: vi.fn()
}))
vi.mock('fs', () => ({
  default: fsState,
  ...fsState
}))

import { ipcMain } from 'electron'
import { registerModelsIpc } from '../../src/main/ipc/models'

describe('models:removeModel（main ガード）', () => {
  // handle() 経由で登録されたハンドラを取得して直接実行する
  const handlerOf = (channel: string) => {
    const call = vi.mocked(ipcMain.handle).mock.calls.find(([c]) => c === channel)
    if (!call) throw new Error(`handler not registered: ${channel}`)
    return call[1] as (event: unknown, ...args: unknown[]) => Promise<unknown>
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.mocked(ipcMain.handle).mockClear()
    registerModelsIpc({ getMainWindow: () => null } as never)
    fsState.existsSync.mockReturnValue(true)
  })

  const invoke = (...args: unknown[]) =>
    handlerOf('models:removeModel')({ sender: { send: vi.fn() } }, ...args)

  it('モデルルート自身の削除は拒否する（全モデル喪失の防止）', async () => {
    await expect(invoke('C:/fake/userData/models')).rejects.toThrow(/FORBIDDEN_PATH/)
    expect(fsState.rmSync).not.toHaveBeenCalled()
  })

  it('モデルルート外のパスは拒否する（任意削除の防止）', async () => {
    await expect(invoke('C:/Users/victim/Documents')).rejects.toThrow(/FORBIDDEN_PATH/)
    expect(fsState.rmSync).not.toHaveBeenCalled()
  })

  it('モデルルート内のディレクトリは削除できる', async () => {
    await invoke('C:/fake/userData/models/models--Systran--faster-whisper-small')
    expect(fsState.rmSync).toHaveBeenCalledWith(
      expect.stringContaining('models--Systran--faster-whisper-small'),
      { recursive: true, force: true }
    )
  })
})
