/**
 * fileLibrary の分類・ペアリング・一覧取得
 *
 * 録音ファイルと .trans.txt のペア表示はライブラリ画面の根幹。
 * 過去に「ペアにならない」「録音中ファイルが誤表示される」系の問題が
 * あったため、分類ルールをテストで固定する。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  classifyFileName,
  audioFormatOf,
  buildFileList,
  listFiles,
  readDurationFromMeta,
  type FileEntry
} from '../../src/main/services/fileLibrary'

const entry = (name: string, overrides: Partial<FileEntry> = {}): FileEntry => ({
  name,
  size: 100,
  createdAt: new Date('2025-01-01T00:00:00Z'),
  duration: 0,
  ...overrides
})

describe('classifyFileName', () => {
  it('.trans.txt は text ではなく transcription', () => {
    expect(classifyFileName('a.trans.txt')).toBe('transcription')
  })

  it('旧形式 _transcription.txt も transcription', () => {
    expect(classifyFileName('a_transcription.txt')).toBe('transcription')
  })

  it('.rt.txt は realtime-transcription', () => {
    expect(classifyFileName('a.rt.txt')).toBe('realtime-transcription')
  })

  it('音声拡張子は audio', () => {
    expect(classifyFileName('a.mp3')).toBe('audio')
    expect(classifyFileName('a.wav')).toBe('audio')
    expect(classifyFileName('a.webm')).toBe('audio')
  })

  it('txt/md は text、それ以外は other', () => {
    expect(classifyFileName('a.txt')).toBe('text')
    expect(classifyFileName('a.md')).toBe('text')
    expect(classifyFileName('a.png')).toBe('other')
    expect(classifyFileName('manifest.json')).toBe('other')
  })
})

describe('audioFormatOf', () => {
  it('拡張子をそのまま返す', () => {
    expect(audioFormatOf('a.mp3')).toBe('mp3')
    expect(audioFormatOf('a.wav')).toBe('wav')
    expect(audioFormatOf('a.webm')).toBe('webm')
  })
})

describe('buildFileList', () => {
  it('音声と .trans.txt をペアリングする', () => {
    const files = buildFileList([
      entry('rec.mp3', { size: 1000 }),
      entry('rec.trans.txt', { size: 200 })
    ])

    expect(files).toHaveLength(1)
    expect(files[0].isPairedFile).toBe(true)
    expect(files[0].hasTranscriptionFile).toBe(true)
    expect(files[0].transcriptionPath).toBe('rec.trans.txt')
    expect(files[0].transcriptionSize).toBe(200)
  })

  it('旧形式 _transcription.txt もペアリングする', () => {
    const files = buildFileList([
      entry('rec.mp3'),
      entry('rec_transcription.txt')
    ])

    expect(files).toHaveLength(1)
    expect(files[0].isPairedFile).toBe(true)
  })

  it('文字起こしが無い音声はペアなしで残る', () => {
    const files = buildFileList([entry('rec.mp3')])

    expect(files).toHaveLength(1)
    expect(files[0].isPairedFile).toBe(false)
    expect(files[0].hasTranscriptionFile).toBe(false)
  })

  it('音声の無い文字起こしは単独で残る', () => {
    const files = buildFileList([entry('orphan.trans.txt')])

    expect(files).toHaveLength(1)
    expect(files[0].isTranscriptionFile).toBe(true)
    expect(files[0].isTextFile).toBe(true)
    expect(files[0].isPairedFile).toBe(false)
  })

  it('同名音声が2つあっても文字起こしは1つにしか割り当てない', () => {
    const files = buildFileList([
      entry('rec.mp3', { createdAt: new Date('2025-01-02') }),
      entry('rec.wav', { createdAt: new Date('2025-01-01') }),
      entry('rec.trans.txt')
    ])

    const paired = files.filter((f) => f.isPairedFile)
    const unpaired = files.filter((f) => f.isAudioFile && !f.isPairedFile)
    expect(paired).toHaveLength(1)
    expect(unpaired).toHaveLength(1)
  })

  it('作成日時の降順にソートする', () => {
    const files = buildFileList([
      entry('old.mp3', { createdAt: new Date('2025-01-01') }),
      entry('new.mp3', { createdAt: new Date('2025-01-03') }),
      entry('mid.mp3', { createdAt: new Date('2025-01-02') })
    ])

    expect(files.map((f) => f.filename)).toEqual(['new.mp3', 'mid.mp3', 'old.mp3'])
  })

  it('.rt.txt は isRealtimeTranscription として残す', () => {
    const files = buildFileList([entry('rec.rt.txt')])

    expect(files).toHaveLength(1)
    expect(files[0].isRealtimeTranscription).toBe(true)
  })
})

describe('listFiles / readDurationFromMeta（実ファイルでの統合）', () => {
  let dir: string

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'koenote-files-'))
    fs.writeFileSync(path.join(dir, 'rec.mp3'), Buffer.alloc(2048))
    fs.writeFileSync(path.join(dir, 'rec.trans.txt'), 'transcript')
    fs.writeFileSync(path.join(dir, 'rec.mp3.meta.json'), JSON.stringify({ duration: 12.5 }))
    fs.writeFileSync(path.join(dir, 'solo.wav'), Buffer.alloc(100))
    fs.writeFileSync(path.join(dir, 'ignore.png'), Buffer.alloc(10))
  })

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('ペアリング済み一覧をフォルダ付きパスで返す', () => {
    const files = listFiles(dir)

    const paired = files.find((f) => f.filename === 'rec.mp3')
    expect(paired).toBeDefined()
    expect(paired?.isPairedFile).toBe(true)
    expect(paired?.filepath).toBe(path.join(dir, 'rec.mp3'))
    // 注意: transcriptionPath は filepath と違い join されずファイル名のまま返る
    // （renderer 側が workspaceRoot 基準で解決する前提の現行挙動）
    expect(paired?.transcriptionPath).toBe('rec.trans.txt')
    expect(paired?.duration).toBe(12.5)

    // 音声のみ / 非対象ファイル
    expect(files.find((f) => f.filename === 'solo.wav')?.isPairedFile).toBe(false)
    expect(files.find((f) => f.filename === 'ignore.png')).toBeUndefined()
    // .meta.json は一覧に出さない
    expect(files.find((f) => f.filename === 'rec.mp3.meta.json')).toBeUndefined()
  })

  it('存在しないフォルダは空配列', () => {
    expect(listFiles(path.join(dir, 'not-exists'))).toEqual([])
  })

  it('meta.json が無い/壊れている場合は duration=0', () => {
    expect(readDurationFromMeta(dir, 'solo.wav')).toBe(0)
    fs.writeFileSync(path.join(dir, 'bad.mp3.meta.json'), 'not json')
    expect(readDurationFromMeta(dir, 'bad.mp3')).toBe(0)
  })
})
