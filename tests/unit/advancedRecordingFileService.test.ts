/**
 * AdvancedRecordingFileService.saveChunk のPhase E 契約
 *
 * 検証すること:
 *   1. mp3 は追記される（O(n²) の「全体読み書き」をしない）
 *   2. チャンク単体ファイルが追記ではなく新規保存される
 *   3. manifest.json がチャンク数・合計バイト数と整合している
 *   4. ディレクトリへのパスでしか書き込まない（パスガード）
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AdvancedRecordingFileService } from '@renderer/services/AdvancedRecordingFileService'
import { parseManifest, validateManifest } from '@shared/recordingManifest'
import { installElectronAPI, type ElectronAPIMock } from '../mocks/electronAPI'

const DIR = 'D:\\work\\recordings'
const BASE = 'recording_20261004_125800'

/** 1 秒分 = 128kbps の MP3 チャンク相当 */
function chunkBlob(bytes: number): Blob {
  const data = new Uint8Array(bytes).fill(1)
  const blob = new Blob([data], { type: 'audio/mp3' })
  // jsdom の Blob には arrayBuffer() が無いため、最小限だけ代替する
  if (typeof blob.arrayBuffer === 'function') {
    return blob
  }
  return { arrayBuffer: async () => data.buffer } as unknown as Blob
}

describe('AdvancedRecordingFileService.saveChunk', () => {
  let api: ElectronAPIMock

  beforeEach(() => {
    api = installElectronAPI({
      loadSettings: vi.fn().mockResolvedValue({ saveFolder: DIR } as never)
    })
    AdvancedRecordingFileService.clearManifest(BASE)
    vi.mocked(api.appendFileToPath).mockClear()
    vi.mocked(api.saveFileToPath).mockClear()
    vi.mocked(api.saveTextFile).mockClear()
    vi.mocked(api.readFile).mockClear()
  })

  /** saveTextFile の呼び出しから manifest.json の内容を取得する */
  function lastManifestText(): string {
    const calls = vi.mocked(api.saveTextFile).mock.calls
    const manifestCalls = calls.filter((c) => String(c[0]).endsWith('.manifest.json'))
    return String(manifestCalls[manifestCalls.length - 1]?.[1])
  }

  it('mp3 は追記される（読み込みを行わない）', async () => {
    await AdvancedRecordingFileService.saveChunk(chunkBlob(1600), 0, BASE, 'mp3', DIR)

    expect(api.appendFileToPath).toHaveBeenCalledTimes(1)
    expect(api.appendFileToPath).toHaveBeenCalledWith(
      `${DIR}/${BASE}.mp3`,
      expect.anything()
    )
    // O(n²) の原因だった「既存ファイルの読み込み」がないこと
    expect(api.readFile).not.toHaveBeenCalled()
  })

  it('mp3 を saveFileToPath で上書きしない', async () => {
    await AdvancedRecordingFileService.saveChunk(chunkBlob(1600), 0, BASE, 'mp3', DIR)
    const mp3Writes = vi
      .mocked(api.saveFileToPath)
      .mock.calls.filter((c) => String(c[0]).endsWith(`${BASE}.mp3`))
    expect(mp3Writes).toHaveLength(0)
  })

  it('チャンク単体は追記せず新規保存される', async () => {
    await AdvancedRecordingFileService.saveChunk(chunkBlob(1600), 0, BASE, 'mp3', DIR)

    expect(api.saveFileToPath).toHaveBeenCalledWith(
      `${DIR}/${BASE}.chunks/chunk_000.mp3`,
      expect.anything()
    )
    expect(api.appendFileToPath).not.toHaveBeenCalledWith(
      expect.stringContaining('.chunks'),
      expect.anything()
    )
  })

  it('チャンク番号がファイル名に反映される', async () => {
    await AdvancedRecordingFileService.saveChunk(chunkBlob(1600), 7, BASE, 'mp3', DIR)
    expect(api.saveFileToPath).toHaveBeenCalledWith(
      `${DIR}/${BASE}.chunks/chunk_007.mp3`,
      expect.anything()
    )
  })

  it('wav では拡張子の拡張子にはならない', async () => {
    await AdvancedRecordingFileService.saveChunk(chunkBlob(1600), 0, BASE, 'wav', DIR)
    expect(api.saveFileToPath).toHaveBeenCalledWith(
      `${DIR}/${BASE}.chunks/chunk_000.wav`,
      expect.anything()
    )
  })

  it('manifest.json が保存される', async () => {
    await AdvancedRecordingFileService.saveChunk(chunkBlob(1600), 0, BASE, 'mp3', DIR)
    expect(api.saveTextFile).toHaveBeenCalledWith(
      `${DIR}/${BASE}.manifest.json`,
      expect.any(String)
    )
  })

  it('チャンクごとに manifest が更新され、整合が保たれる', async () => {
    await AdvancedRecordingFileService.saveChunk(chunkBlob(1600), 0, BASE, 'mp3', DIR)
    await AdvancedRecordingFileService.saveChunk(chunkBlob(3200), 1, BASE, 'mp3', DIR)
    await AdvancedRecordingFileService.saveChunk(chunkBlob(1600), 2, BASE, 'mp3', DIR)

    const manifest = parseManifest(lastManifestText())
    expect(manifest.chunks).toHaveLength(3)
    expect(manifest.recording.totalBytes).toBe(6400)
    expect(validateManifest(manifest)).toEqual([])
  })

  it('manifest のチャンク位置は累積になる', async () => {
    await AdvancedRecordingFileService.saveChunk(chunkBlob(3200), 0, BASE, 'mp3', DIR)
    await AdvancedRecordingFileService.saveChunk(chunkBlob(3200), 1, BASE, 'mp3', DIR)

    const manifest = parseManifest(lastManifestText())
    expect(manifest.chunks[0].audioOffsetSeconds).toBe(0)
    expect(manifest.chunks[1].audioOffsetSeconds).toBe(0.2) // 3200 / 16000
  })

  it('manifest の合計バイト数は mp3 の追記量と一致する', async () => {
    const sizes = [1600, 2400, 800]
    for (let i = 0; i < sizes.length; i++) {
      await AdvancedRecordingFileService.saveChunk(chunkBlob(sizes[i]), i, BASE, 'mp3', DIR)
    }

    const appendedTotal = vi
      .mocked(api.appendFileToPath)
      .mock.calls.reduce((sum, c) => sum + (c[1] as Buffer).length, 0)
    const manifest = parseManifest(lastManifestText())
    expect(manifest.recording.totalBytes).toBe(appendedTotal)
  })

  it('追記に失敗したら例外になる（黙って無視しない）', async () => {
    vi.mocked(api.appendFileToPath).mockResolvedValueOnce(false)
    await expect(
      AdvancedRecordingFileService.saveChunk(chunkBlob(1600), 0, BASE, 'mp3', DIR)
    ).rejects.toThrow()
  })

  it('manifest 保存に失敗したら例外になる', async () => {
    vi.mocked(api.saveTextFile).mockResolvedValueOnce(false)
    await expect(
      AdvancedRecordingFileService.saveChunk(chunkBlob(1600), 0, BASE, 'mp3', DIR)
    ).rejects.toThrow()
  })

  it('保存先のディレクトリ下のパスだけを渡す（パストラバールを含らない）', async () => {
    const written: string[] = []
    vi.mocked(api.appendFileToPath).mockImplementation(async (p) => {
      written.push(p)
      return true
    })
    vi.mocked(api.saveFileToPath).mockImplementation(async (p) => {
      written.push(p)
      return true
    })

    await AdvancedRecordingFileService.saveChunk(chunkBlob(1600), 0, BASE, 'mp3', DIR)
    for (const p of written) {
      expect(p.startsWith(DIR)).toBe(true)
      expect(p.includes('..')).toBe(false)
    }
  })
})

describe('manifest の文字起こし情報', () => {
  let api: ElectronAPIMock

  beforeEach(() => {
    api = installElectronAPI({
      loadSettings: vi.fn().mockResolvedValue({ saveFolder: DIR } as never)
    })
    AdvancedRecordingFileService.clearManifest(BASE)
    vi.mocked(api.saveTextFile).mockClear()
  })

  function lastManifestText(): string {
    const calls = vi.mocked(api.saveTextFile).mock.calls
    const m = calls.filter((c) => String(c[0]).endsWith('.manifest.json'))
    return String(m[m.length - 1]?.[1])
  }

  it('ensureManifest が録音開始時の manifest を返す', () => {
    const m = AdvancedRecordingFileService.ensureManifest(BASE, 'mp3', '2026-10-04T12:58:00.000Z')
    expect(m.chunks).toEqual([])
    expect(m.recording.createdAt).toBe('2026-10-04T12:58:00.000Z')
  })

  it('ensureManifest は2回呼んでも同じものを返す', () => {
    const a = AdvancedRecordingFileService.ensureManifest(BASE, 'mp3', '2026-10-04T12:58:00.000Z')
    const b = AdvancedRecordingFileService.ensureManifest(BASE, 'mp3', '2026-10-05T00:00:00.000Z')
    expect(b).toBe(a)
    expect(b.recording.createdAt).toBe('2026-10-04T12:58:00.000Z')
  })

  it('文字起こし情報が manifest に反映される', async () => {
    AdvancedRecordingFileService.ensureManifest(BASE, 'mp3', '2026-10-04T12:58:00.000Z')
    await AdvancedRecordingFileService.saveChunk(chunkBlob(1600), 0, BASE, 'mp3', DIR)

    await AdvancedRecordingFileService.updateTranscriptionInManifest(BASE, {
      enabled: true,
      model: 'small',
      language: 'ja',
      file: `${BASE}.trans.txt`,
      segmentCount: 2,
      transcribedAt: '2026-10-04T12:59:00.000Z'
    })

    const manifest = parseManifest(lastManifestText())
    expect(manifest.transcription.enabled).toBe(true)
    expect(manifest.transcription.model).toBe('small')
    expect(manifest.transcription.segmentCount).toBe(2)
    expect(manifest.transcription.file).toBe(`${BASE}.trans.txt`)
    expect(validateManifest(manifest)).toEqual([])
  })

  it('manifest 未作成時の文字起こし反映は黙って無視される', async () => {
    await expect(
      AdvancedRecordingFileService.updateTranscriptionInManifest('unknown', { enabled: true })
    ).resolves.toBeUndefined()
  })

  it('clearManifest 後は peekManifest が undefined を返す', () => {
    AdvancedRecordingFileService.ensureManifest(BASE, 'mp3', '2026-10-04T12:58:00.000Z')
    expect(AdvancedRecordingFileService.peekManifest(BASE)).toBeDefined()
    AdvancedRecordingFileService.clearManifest(BASE)
    expect(AdvancedRecordingFileService.peekManifest(BASE)).toBeUndefined()
  })
})