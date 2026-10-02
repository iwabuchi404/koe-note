/**
 * main プロセス側の純粋ロジックのテスト
 *
 * 此前は main.ts 2,200行に対してテストが 0 件だった。
 * このテストは Electron に依存しない部分（パスガード・ファイル分類・
 * ペアリング・エラー変換）を対象とする。IPC ハンドラ自体は
 * Electron を mock する価値より先に、この層が本番Deadlineである。
 */
import { describe, it, expect } from 'vitest'
import path from 'path'
import {
  isWithinRoot,
  resolveWithinRoot,
  transcriptionPathFor,
  aiChatPathFor,
  transcriptionBaseName,
  TRANSCRIPT_SUFFIX,
  LEGACY_TRANSCRIPT_SUFFIX
} from '@main/core/paths'
import { AppError, toAppError, fromFsError } from '@main/core/errors'
import { classifyFileName, buildFileList, audioFormatOf } from '@main/services/fileLibrary'

const ROOT = path.resolve('C:/Users/test/VoiceRecordings')

describe('isWithinRoot', () => {
  it('ルート自身と配下を許可する', () => {
    expect(isWithinRoot(ROOT, ROOT)).toBe(true)
    expect(isWithinRoot(ROOT, path.join(ROOT, 'a.mp3'))).toBe(true)
    expect(isWithinRoot(ROOT, path.join(ROOT, 'sub', 'b.txt'))).toBe(true)
  })

  it('ルート外を拒否する', () => {
    expect(isWithinRoot(ROOT, 'C:/Users/test/Other/a.mp3')).toBe(false)
    expect(isWithinRoot(ROOT, 'C:/Windows/System32/config')).toBe(false)
  })

  it('前方一致だけで通さない（別ディレクトリへの traversal を防ぐ）', () => {
    // recordings の配下ではない recordings-backup
    expect(isWithinRoot(ROOT, path.join(ROOT + '-backup', 'a.mp3'))).toBe(false)
  })

  it('.. で外に出る traversal を拒否する', () => {
    expect(isWithinRoot(ROOT, path.join(ROOT, '..', 'Other', 'a.mp3'))).toBe(false)
  })
})

describe('resolveWithinRoot', () => {
  it('絶対パスをそのまま解決する', () => {
    const target = path.join(ROOT, 'a.mp3')
    expect(resolveWithinRoot(ROOT, target)).toBe(target)
  })

  it('相対パスをルート基準で解決する', () => {
    expect(resolveWithinRoot(ROOT, 'a.mp3')).toBe(path.join(ROOT, 'a.mp3'))
    expect(resolveWithinRoot(ROOT, './sub/a.mp3')).toBe(path.join(ROOT, 'sub', 'a.mp3'))
  })

  it('ルート外は FORBIDDEN_PATH を投げる', () => {
    try {
      resolveWithinRoot(ROOT, 'C:/Windows/System32/drivers/etc/hosts')
      throw new Error('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(AppError)
      expect((error as AppError).code).toBe('FORBIDDEN_PATH')
    }
  })
})

describe('transcriptionPathFor', () => {
  const audio = path.join(ROOT, 'recording_2026_10_01_0200.mp3')

  it('新形式（.trans.txt）があればそれを返す', () => {
    const current = path.join(ROOT, 'recording_2026_10_01_0200' + TRANSCRIPT_SUFFIX)
    const exists = (p: string) => p === current
    expect(transcriptionPathFor(audio, exists)).toBe(current)
  })

  it('新形式がなければ旧形式（_transcription.txt）を返す', () => {
    const legacy = path.join(ROOT, 'recording_2026_10_01_0200' + LEGACY_TRANSCRIPT_SUFFIX)
    const exists = (p: string) => p === legacy
    expect(transcriptionPathFor(audio, exists)).toBe(legacy)
  })

  it('どちらも無ければ新形式を返す（作成先として）', () => {
    expect(transcriptionPathFor(audio, () => false)).toBe(
      path.join(ROOT, 'recording_2026_10_01_0200' + TRANSCRIPT_SUFFIX)
    )
  })
})

describe('aiChatPathFor', () => {
  it('音声ファイル名から .ai-chat.txt を作る', () => {
    expect(aiChatPathFor(path.join(ROOT, 'a.mp3'))).toBe(path.join(ROOT, 'a.ai-chat.txt'))
  })
})

describe('transcriptionBaseName', () => {
  it('新形式・旧形式から音声のベース名を返す', () => {
    expect(transcriptionBaseName('a.trans.txt')).toBe('a')
    expect(transcriptionBaseName('a_transcription.txt')).toBe('a')
  })

  it('どちらでもなければ null', () => {
    expect(transcriptionBaseName('a.txt')).toBeNull()
    expect(transcriptionBaseName('a.mp3')).toBeNull()
  })
})

describe('classifyFileName', () => {
  it('音声ファイルを audio と判定', () => {
    expect(classifyFileName('a.mp3')).toBe('audio')
    expect(classifyFileName('a.wav')).toBe('audio')
    expect(classifyFileName('a.webm')).toBe('audio')
  })

  it('文字起こしファイルは .txt より長い拡張子を先に判定する', () => {
    expect(classifyFileName('a.trans.txt')).toBe('transcription')
    expect(classifyFileName('a_transcription.txt')).toBe('transcription')
  })

  it('リアルタイム文字起こしと一般テキストを区別する', () => {
    expect(classifyFileName('a.rt.txt')).toBe('realtime-transcription')
    expect(classifyFileName('a.txt')).toBe('text')
    expect(classifyFileName('a.md')).toBe('text')
  })

  it('その他は other', () => {
    expect(classifyFileName('a.json')).toBe('other')
    expect(classifyFileName('README')).toBe('other')
  })
})

describe('audioFormatOf', () => {
  it('拡張子をそのまま形式にする', () => {
    expect(audioFormatOf('a.mp3')).toBe('mp3')
    expect(audioFormatOf('a.WAV')).toBe('wav')
  })
})

describe('buildFileList', () => {
  const at = (day: number) => new Date(`2026-10-0${day}T00:00:00Z`)

  it('音声と文字起こしをペアリングする', () => {
    const files = buildFileList([
      { name: 'a.mp3', size: 100, createdAt: at(1), duration: 4.096 },
      { name: 'a.trans.txt', size: 50, createdAt: at(2), duration: 0 }
    ])

    expect(files).toHaveLength(1)
    expect(files[0].isPairedFile).toBe(true)
    expect(files[0].hasTranscriptionFile).toBe(true)
    expect(files[0].transcriptionSize).toBe(50)
  })

  it('旧形式の文字起こしともペアリングする', () => {
    const files = buildFileList([
      { name: 'b.mp3', size: 100, createdAt: at(1), duration: 0 },
      { name: 'b_transcription.txt', size: 50, createdAt: at(2), duration: 0 }
    ])
    expect(files[0].isPairedFile).toBe(true)
  })

  it('ペア无可しの音声は単独で残る', () => {
    const files = buildFileList([{ name: 'c.mp3', size: 100, createdAt: at(1), duration: 0 }])
    expect(files).toHaveLength(1)
    expect(files[0].hasTranscriptionFile).toBe(false)
    expect(files[0].isPairedFile).toBe(false)
  })

  it('孤れた文字起こしファイルも残す', () => {
    const files = buildFileList([
      { name: 'x.trans.txt', size: 10, createdAt: at(3), duration: 0 }
    ])
    expect(files).toHaveLength(1)
    expect(files[0].isTranscriptionFile).toBe(true)
    expect(files[0].isPairedFile).toBe(false)
  })

  it('作成日時の降順に並べる', () => {
    const files = buildFileList([
      { name: 'old.mp3', size: 1, createdAt: at(1), duration: 0 },
      { name: 'new.mp3', size: 1, createdAt: at(3), duration: 0 },
      { name: 'mid.mp3', size: 1, createdAt: at(2), duration: 0 }
    ])
    expect(files.map((f) => f.filename)).toEqual(['new.mp3', 'mid.mp3', 'old.mp3'])
  })

  it('other（json等）は一覧に出さない', () => {
    const files = buildFileList([
      { name: 'a.mp3', size: 1, createdAt: at(1), duration: 0 },
      { name: 'meta.json', size: 1, createdAt: at(2), duration: 0 }
    ])
    expect(files.map((f) => f.filename)).toEqual(['a.mp3'])
  })

  it('音声の再生時間を保持する', () => {
    const files = buildFileList([{ name: 'a.mp3', size: 1, createdAt: at(1), duration: 12.5 }])
    expect(files[0].duration).toBe(12.5)
  })
})

describe('AppError', () => {
  it('code と message を持つ', () => {
    const error = new AppError('NOT_FOUND', 'ありません')
    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe('NOT_FOUND')
    expect(error.message).toBe('ありません')
  })

  it('wire 形式で平坦化できる', () => {
    const error = new AppError('NO_SPACE', '容量不足', { path: '/x' })
    expect(error.toWire()).toEqual({ code: 'NO_SPACE', message: '容量不足', details: { path: '/x' } })
  })

  it('AppError はそのまま通す', () => {
    const original = new AppError('FORBIDDEN_PATH', 'ng')
    expect(toAppError(original)).toBe(original)
  })

  it('fs エラーコードから変換する', () => {
    expect(fromFsError({ code: 'ENOENT' })).toBe('NOT_FOUND')
    expect(fromFsError({ code: 'ENOSPC' })).toBe('NO_SPACE')
    expect(fromFsError({ code: 'EACCES' })).toBe('PERMISSION_DENIED')
    expect(fromFsError({ code: 'EBUSY' })).toBe('FILE_BUSY')
    expect(fromFsError({})).toBe('UNKNOWN')
  })

  it('文字列マッチで "ENOSPC" を誤判定しない', () => {
    // 此前はエラーメッセージ文字列をincludesで判定していたため、
    // パスやファイル名に "ENOSPC" や "容量不足" が含まれると誤分類していた
    const error = new Error('保存できません: パスに ENOSPC が含まれます')
    const appError = toAppError(error, '保存に失敗')
    expect(appError.code).toBe('UNKNOWN')
    expect(appError.message).toContain('ENOSPC')
  })
})

