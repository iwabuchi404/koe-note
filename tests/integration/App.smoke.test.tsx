/**
 * 実行中のUIツリー（App から到達可能なもの）のスモークテスト
 *
 * 目的: デッドコード削除・リファクタリング中に、
 * 「到達可能なliveツリーが壊れていない」ことを最速で検知する。
 * 振る舞いの詳細ではなく、マウントが通ることと
 * 左パネル→ファイル一覧という主要経路が動くことを担保する。
 *
 * 注意: この環境では Testing Library の findBy* が別 document を掴む事例が
 * 確認できているため、render が返した container を within() で直接検索し、
 * 待機は waitFor で行う。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, within, waitFor } from '@testing-library/react'
import App from '@renderer/app/App'
import { installElectronAPI } from '../mocks/electronAPI'
import type { AudioFile } from '@shared/types'

const buildAudioFile = (overrides: Partial<AudioFile> = {}): AudioFile => ({
  id: 'file-1',
  filename: 'sample_recording.mp3',
  filepath: '/mock/sample_recording.mp3',
  format: 'mp3',
  size: 1024,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  ...overrides
})

describe('App スモークテスト', () => {
  beforeEach(() => {
    installElectronAPI()
  })

  it('App がクラッシュせずにマウントされる', () => {
    const { container } = render(<App />)
    expect(within(container).getByTestId('main-layout')).toBeInTheDocument()
  })

  it('空のファイル一覧でもエラー表示に遷移しない', async () => {
    const { container } = render(<App />)
    await waitFor(() => {
      expect(within(container).getByTestId('main-layout')).toBeInTheDocument()
    })
    expect(within(container).queryByText(/エラーが発生/)).not.toBeInTheDocument()
  })

  it('ファイル一覧に音声ファイルがレンダリングされる', async () => {
    installElectronAPI({
      getFileList: vi.fn().mockResolvedValue([
        buildAudioFile({
          hasTranscriptionFile: true,
          transcriptionPath: '/mock/sample_recording.trans.txt'
        })
      ]),
      checkTranscriptionExists: vi.fn().mockResolvedValue(true),
      getTranscriptionPath: vi.fn().mockResolvedValue('/mock/sample_recording.trans.txt')
    })

    const { container } = render(<App />)

    // loadSettings → getFileList → checkTranscriptionExists の非同期チェーンを踏む
    await waitFor(() => {
      expect(within(container).getByText('sample_recording.mp3')).toBeInTheDocument()
    })
    expect(window.electronAPI.getFileList).toHaveBeenCalledWith('/mock/save-folder')
  })
})
