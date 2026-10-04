/**
 * recordingManifest - manifest.json のスキーマと構築ロジック
 *
 * manifest は「実際に保存したバイト数と時刻」だけを書き、
 * 推測値（合計が合わなければバグとして検出する）を入れない。
 */
import { describe, it, expect } from 'vitest'
import {
  CHUNK_DIR_SUFFIX,
  MANIFEST_SUFFIX,
  MANIFEST_VERSION,
  appendChunkToManifest,
  chunkDirName,
  chunkFileName,
  createManifest,
  formatManifest,
  manifestFileName,
  parseManifest,
  validateManifest,
  withTranscription
} from '../../src/shared/recordingManifest'

const BASE = 'recording_20261004_125800'

function newManifest() {
  return createManifest({
    baseName: BASE,
    format: 'mp3',
    createdAt: '2026-10-04T12:58:00.000Z'
  })
}

/** 15秒録音相当（64KB 刻み = 1秒 16,000 byte）を模す */
function appendChunks(manifest: ReturnType<typeof newManifest>, count: number, bytes = 16_000) {
  let m = manifest
  for (let i = 0; i < count; i++) {
    m = appendChunkToManifest(m, {
      bytes,
      recordedAt: `2026-10-04T12:58:0${i}.000Z`
    })
  }
  return m
}

describe('ファイル名生成', () => {
  it('チャンクファイル名は 3 桁ゼロ埋め', () => {
    expect(chunkFileName(0, 'mp3')).toBe('chunk_000.mp3')
    expect(chunkFileName(7, 'mp3')).toBe('chunk_007.mp3')
    expect(chunkFileName(123, 'wav')).toBe('chunk_123.wav')
  })

  it('1000 番以上も崩れない', () => {
    expect(chunkFileName(1234, 'mp3')).toBe('chunk_1234.mp3')
  })

  it('ディレクトリ名と manifest 名は録音名から導出する', () => {
    expect(chunkDirName(BASE)).toBe(`${BASE}${CHUNK_DIR_SUFFIX}`)
    expect(manifestFileName(BASE)).toBe(`${BASE}${MANIFEST_SUFFIX}`)
  })
})

describe('createManifest', () => {
  it('version が SCHEMA 版になる', () => {
    expect(newManifest().version).toBe(MANIFEST_VERSION)
  })

  it('初期状態はチャンク 0 件・合計 0 バイト', () => {
    const m = newManifest()
    expect(m.chunks).toEqual([])
    expect(m.recording.chunkCount).toBe(0)
    expect(m.recording.totalBytes).toBe(0)
    expect(m.recording.estimatedDurationSeconds).toBe(0)
  })

  it('bytesPerSecond は実際のエンコード設定から算出する', () => {
    expect(newManifest().recording.bytesPerSecond).toBe(16_000)
  })

  it('音声ファイル名は録音名から導出する', () => {
    expect(newManifest().recording.audioFile).toBe(`${BASE}.mp3`)
  })

  it('validateManifest は初期状態で問題なし', () => {
    expect(validateManifest(newManifest())).toEqual([])
  })
})

describe('appendChunkToManifest', () => {
  it('チャンク番号は 0 始まりで連番になる', () => {
    const m = appendChunks(newManifest(), 3)
    expect(m.chunks.map((c) => c.chunkNumber)).toEqual([0, 1, 2])
  })

  it('各チャンクの開始位置は前のチャンクの長さの累積になる', () => {
    const m = appendChunks(newManifest(), 4)
    expect(m.chunks.map((c) => c.audioOffsetSeconds)).toEqual([0, 1, 2, 3])
  })

  it('合計バイト数とチャンク数が更新される', () => {
    const m = appendChunks(newManifest(), 5)
    expect(m.recording.totalBytes).toBe(80_000)
    expect(m.recording.chunkCount).toBe(5)
    expect(m.recording.estimatedDurationSeconds).toBe(5)
  })

  it('元の manifest を破壊しない（イミュータブル）', () => {
    const before = newManifest()
    const snapshot = JSON.stringify(before)
    appendChunkToManifest(before, { bytes: 16_000, recordedAt: '2026-10-04T12:58:00.000Z' })
    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it('validateManifest は追記後も整合している', () => {
    expect(validateManifest(appendChunks(newManifest(), 10))).toEqual([])
  })

  it('チャンクごとにサイズが違っても合計が合う', () => {
    let m = newManifest()
    for (const bytes of [10_000, 20_000, 30_000]) {
      m = appendChunkToManifest(m, { bytes, recordedAt: '2026-10-04T12:58:00.000Z' })
    }
    expect(m.recording.totalBytes).toBe(60_000)
    expect(m.chunks.map((c) => c.bytes)).toEqual([10_000, 20_000, 30_000])
    expect(validateManifest(m)).toEqual([])
  })

  it('0 バイトのチャンクでも壊れない', () => {
    const m = appendChunkToManifest(newManifest(), { bytes: 0, recordedAt: 'x' })
    expect(m.chunks[0].durationSeconds).toBe(0)
    expect(validateManifest(m)).toEqual([])
  })
})

describe('withTranscription', () => {
  it('文字起こし情報を設定できる', () => {
    const m = withTranscription(appendChunks(newManifest(), 2), {
      enabled: true,
      model: 'small',
      language: 'ja',
      file: `${BASE}.trans.txt`,
      segmentCount: 3,
      transcribedAt: '2026-10-04T12:59:00.000Z'
    })
    expect(m.transcription.enabled).toBe(true)
    expect(m.transcription.model).toBe('small')
    expect(m.transcription.segmentCount).toBe(3)
  })

  it('元の manifest を破壊しない', () => {
    const before = appendChunks(newManifest(), 1)
    withTranscription(before, { enabled: true, model: 'small' })
    expect(before.transcription.enabled).toBe(false)
  })
})

describe('formatManifest / parseManifest', () => {
  it('往復して同じ内容になる', () => {
    const original = withTranscription(appendChunks(newManifest(), 3), {
      enabled: true,
      model: 'small',
      language: 'ja'
    })
    const parsed = parseManifest(formatManifest(original))
    expect(parsed).toEqual(original)
  })

  it('整形された JSON（末尾改行つき）になる', () => {
    const text = formatManifest(newManifest())
    expect(text.endsWith('\n')).toBe(true)
    expect(text).toContain('\n  "version"')
  })

  it('壊れた JSON は黙って無視せずエラーにする', () => {
    expect(() => parseManifest('{ not json')).toThrow(/JSON/)
  })

  it('version 無しはエラー', () => {
    expect(() => parseManifest('{"recording":{},"chunks":[]}')).toThrow(/version/)
  })

  it('新しい version は拒否する（前方互換守るため）', () => {
    const tooNew = JSON.stringify({ ...newManifest(), version: MANIFEST_VERSION + 1 })
    expect(() => parseManifest(tooNew)).toThrow(/version/)
  })

  it('recording.audioFile 無しはエラー', () => {
    const broken = JSON.stringify({ version: 1, recording: {}, chunks: [] })
    expect(() => parseManifest(broken)).toThrow(/audioFile/)
  })

  it('chunks が配列でなければエラー', () => {
    const broken = JSON.stringify({
      version: 1,
      recording: { audioFile: 'a.mp3' },
      chunks: null
    })
    expect(() => parseManifest(broken)).toThrow(/chunks/)
  })

  it('トップレベルが配列ならエラー', () => {
    expect(() => parseManifest('[]')).toThrow(/version|object|配列/)
  })
})

describe('validateManifest', () => {
  it('合計バイト数の不一致を検出する', () => {
    const m = appendChunks(newManifest(), 3)
    m.recording.totalBytes = 999
    expect(validateManifest(m).some((p) => p.includes('totalBytes'))).toBe(true)
  })

  it('チャンク件数の不一致を検出する', () => {
    const m = appendChunks(newManifest(), 3)
    m.recording.chunkCount = 99
    expect(validateManifest(m).some((p) => p.includes('chunkCount'))).toBe(true)
  })

  it('連番の崩れを検出する', () => {
    const m = appendChunks(newManifest(), 3)
    m.chunks[1].chunkNumber = 7
    expect(validateManifest(m).some((p) => p.includes('連番'))).toBe(true)
  })

  it('estimatedDurationSeconds の不一致を検出する', () => {
    const m = appendChunks(newManifest(), 2)
    m.recording.estimatedDurationSeconds = 999
    expect(validateManifest(m).some((p) => p.includes('estimatedDurationSeconds'))).toBe(true)
  })

  it('bytesPerSecond の改竄を検出する', () => {
    const m = appendChunks(newManifest(), 1)
    m.recording.bytesPerSecond = 999
    expect(validateManifest(m).some((p) => p.includes('bytesPerSecond'))).toBe(true)
  })

  it('負の durationSeconds を検出する', () => {
    const m = appendChunks(newManifest(), 1)
    m.chunks[0].durationSeconds = -1
    expect(validateManifest(m).some((p) => p.includes('durationSeconds'))).toBe(true)
  })
})