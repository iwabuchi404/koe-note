/**
 * whisper-server 起動コマンド解決ロジック
 *
 * 実測で判明した不具合の回帰テスト。
 * app.getAppPath() が dist/ を指すため、リポジトリルート基準で
 * 探索しないと 2025 年にビルドされた古い exe が起動され、
 * chunkNumber が返らない（プロトコル不一致）状態になっていた。
 */
import { describe, it, expect } from 'vitest'
import path from 'path'
import {
  buildDevPythonCandidates,
  buildExeCandidates,
  resolveProjectRoot,
  type WhisperServerPaths
} from '../../src/main/services/whisperServer'

const PROJECT_ROOT = 'D:\\work\\KoeNote'

const paths: WhisperServerPaths = {
  // Electron が dist/main.js を起動すると app.getAppPath() は dist/ を指す
  appPath: path.join(PROJECT_ROOT, 'dist'),
  resourcesPath: 'C:\\Program Files\\KoeNote\\resources',
  bundleDir: path.join(PROJECT_ROOT, 'dist')
}

describe('resolveProjectRoot', () => {
  it('bundleDir の親がリポジトリルートになる', () => {
    expect(resolveProjectRoot(path.join(PROJECT_ROOT, 'dist'))).toBe(PROJECT_ROOT)
  })

  it('入れ子でも一段上だけ上がる', () => {
    expect(resolveProjectRoot(path.join(PROJECT_ROOT, 'a', 'b'))).toBe(
      path.join(PROJECT_ROOT, 'a')
    )
  })
})

describe('buildDevPythonCandidates', () => {
  it('venv をリポジトリルート基準で探索する', () => {
    expect(buildDevPythonCandidates(PROJECT_ROOT)).toEqual([
      path.join(PROJECT_ROOT, 'whisper-server', '.venv', 'Scripts', 'python.exe'),
      path.join(PROJECT_ROOT, 'whisper-server', '.venv', 'bin', 'python')
    ])
  })

  it('appPath（=dist）基準ではないことを確認する（回帰条件）', () => {
    const wrong = path.join(PROJECT_ROOT, 'dist', 'whisper-server', '.venv', 'Scripts', 'python.exe')
    expect(buildDevPythonCandidates(PROJECT_ROOT)).not.toContain(wrong)
  })
})

describe('buildExeCandidates', () => {
  const candidates = buildExeCandidates(paths)

  it('現在の onedir ビルドが含まれる', () => {
    expect(candidates).toContain(
      path.join(PROJECT_ROOT, 'whisper-server', 'dist', 'whisper-server', 'whisper-server.exe')
    )
  })

  it('パッケージ版の onedir / onefile が優先される', () => {
    expect(candidates[0]).toBe(
      path.join(paths.resourcesPath, 'whisper-server', 'whisper-server.exe')
    )
    expect(candidates[1]).toBe(path.join(paths.resourcesPath, 'whisper-server.exe'))
  })

  it('古い onefile（dist/whisper-server.exe）は候補にしない（回帰条件）', () => {
    expect(candidates).not.toContain(
      path.join(PROJECT_ROOT, 'whisper-server', 'dist', 'whisper-server.exe')
    )
  })

  it('appPath（=dist）配下のパスは候補にしない（回帰条件）', () => {
    const underAppPath = candidates.filter((c) => c.startsWith(paths.appPath + path.sep))
    expect(underAppPath).toHaveLength(0)
  })

  it('候補は重複しない', () => {
    expect(new Set(candidates).size).toBe(candidates.length)
  })

  it('絶対パスだけを含む', () => {
    for (const candidate of candidates) {
      expect(path.isAbsolute(candidate)).toBe(true)
    }
  })
})