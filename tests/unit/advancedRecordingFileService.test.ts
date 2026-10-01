/**
 * AdvancedRecordingFileService.appendTranscription のテスト
 *
 * 実測で発見していた問題:
 * - ヘッダーが初回作成時の値のまま（segment_count: 1, duration: 0.000）
 * - model がハードコード
 * - タイムスタンプが結果の到着時刻
 *
 * ここでは electronAPI を型に追従したモック（tests/mocks）に差し替え、
 * 書き出したファイルの中身を検証する。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { AdvancedRecordingFileService } from '@renderer/services/AdvancedRecordingFileService'
import { installElectronAPI } from '../mocks/electronAPI'

const WORKDIR = '/mock/save-folder'

/** saveTextFile で書き込まれた内容を保持する簡易ファイルシステム */
function createFileSystemMock(initial: Record<string, string> = {}) {
  const files = new Map<string, string>(Object.entries(initial))
  const api = installElectronAPI({
    readFile: vi.fn(async (filePath: string) => {
      if (!files.has(filePath)) {
        throw new Error(`ENOENT: ${filePath}`)
      }
      return Buffer.from(files.get(filePath)!, 'utf-8')
    }),
    saveTextFile: vi.fn(async (filePath: string, content: string) => {
      files.set(filePath, content)
      return true
    })
  })
  return { files, api }
}

const baseParams = {
  baseName: 'recording_2026_10_01_0200',
  audioFileName: 'recording_2026_10_01_0200.mp3',
  model: 'small',
  language: 'ja',
  transcribedAt: '2026-10-01T02:00:13.937Z',
  workingDirectory: WORKDIR
}

const TRANS_PATH = `${WORKDIR}/recording_2026_10_01_0200.trans.txt`

describe('appendTranscription', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('初回はヘッダーとセグメント1行を書き出す', async () => {
    const { files } = createFileSystemMock()

    await AdvancedRecordingFileService.appendTranscription({
      ...baseParams,
      chunkNumber: 1,
      audioOffsetSeconds: 0,
      text: '最初のセグメント',
      segmentCount: 1,
      durationSeconds: 4.096
    })

    const content = files.get(TRANS_PATH)!
    expect(content).toContain('model: small')
    expect(content).toContain('duration: 4.096')
    expect(content).toContain('segment_count: 1')
    expect(content).toContain('[00:00:00.0] 最初のセグメント')
  })

  it('追記時にヘッダーの segment_count と duration を更新する', async () => {
    const { files } = createFileSystemMock()

    await AdvancedRecordingFileService.appendTranscription({
      ...baseParams,
      chunkNumber: 1,
      audioOffsetSeconds: 0,
      text: '一つ目',
      segmentCount: 1,
      durationSeconds: 4.096
    })
    await AdvancedRecordingFileService.appendTranscription({
      ...baseParams,
      chunkNumber: 2,
      audioOffsetSeconds: 4.096,
      text: '二つ目',
      segmentCount: 2,
      durationSeconds: 8.192
    })

    const content = files.get(TRANS_PATH)!
    expect(content).toContain('segment_count: 2')
    expect(content).toContain('duration: 8.192')
  })

  it('追記時にヘッダーが重複しない', async () => {
    const { files } = createFileSystemMock()

    for (let i = 1; i <= 3; i++) {
      await AdvancedRecordingFileService.appendTranscription({
        ...baseParams,
        chunkNumber: i,
        audioOffsetSeconds: (i - 1) * 4.096,
        text: `セグメント${i}`,
        segmentCount: i,
        durationSeconds: i * 4.096
      })
    }

    const content = files.get(TRANS_PATH)!
    expect(content.match(/^---$/gm)?.length).toBe(2)
    expect(content).toContain('[00:00:00.0] セグメント1')
    expect(content).toContain('[00:00:04.0] セグメント2')
    expect(content).toContain('[00:00:08.1] セグメント3')
    // セグメント行は3行のまま（ヘッダー書き換えで複製されない）
    expect(content.split('\n').filter((l) => l.startsWith('[')).length).toBe(3)
  })

  it('transcribed_at は渡された値をそのまま書く（呼び出し側がセッション開始時刻を固定する）', async () => {
    const { files } = createFileSystemMock()

    await AdvancedRecordingFileService.appendTranscription({
      ...baseParams,
      chunkNumber: 1,
      audioOffsetSeconds: 0,
      text: 'a',
      segmentCount: 1,
      durationSeconds: 4.096
    })
    await AdvancedRecordingFileService.appendTranscription({
      ...baseParams,
      chunkNumber: 2,
      audioOffsetSeconds: 4.096,
      text: 'b',
      segmentCount: 2,
      durationSeconds: 8.192
    })

    const content = files.get(TRANS_PATH)!
    // ヘッダーは毎回作り直すため transcribed_at が2つ残ることは無い。
    // 値がセッション内で一定かどうかは RecordingContext 側の責務
    // （transcriptionStartedAtRef が初回のみ設定する）。
    expect(content.match(/transcribed_at:/g)?.length).toBe(1)
    expect(content).toContain('transcribed_at: 2026-10-01T02:00:13.937Z')
  })

  it('話者ラベルが空配列のまま出力される（話者分離は未実装）', async () => {
    const { files } = createFileSystemMock()
    await AdvancedRecordingFileService.appendTranscription({
      ...baseParams,
      chunkNumber: 1,
      audioOffsetSeconds: 0,
      text: 'a',
      segmentCount: 1,
      durationSeconds: 4.096
    })
    expect(files.get(TRANS_PATH)!).toContain('speakers: []')
  })

  it('保存先ディレクトリ未指定なら設定のsaveFolderを使う', async () => {
    const { files, api } = createFileSystemMock()
    await AdvancedRecordingFileService.appendTranscription({
      ...baseParams,
      workingDirectory: undefined,
      chunkNumber: 1,
      audioOffsetSeconds: 0,
      text: 'a',
      segmentCount: 1,
      durationSeconds: 4.096
    })
    expect(api.loadSettings).toHaveBeenCalled()
    expect(files.has('/mock/save-folder/recording_2026_10_01_0200.trans.txt')).toBe(true)
  })
})
