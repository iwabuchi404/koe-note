/**
 * IPC エラーコードの受け渡し
 *
 * Electron の制約: ipcRenderer.invoke の reject には Error の
 * message / stack しか来ない（独自プロパティは落ちる）。そのため
 * AppError の code をメッセージ先頭の [CODE] に載せて往復させる。
 *
 * 此前は「Error invoking remote method 'x:y': <message>」という
 * ラッパーしか renderer 側から見えず、原因の分類ができなかった。
 */
import { describe, it, expect } from 'vitest'
import { formatIpcError, parseIpcError, describeIpcError } from '@shared/ipcError'

describe('formatIpcError', () => {
  it('code をメッセージの先頭に付ける', () => {
    expect(formatIpcError('NOT_FOUND', 'ファイルが見つかりません')).toBe(
      '[NOT_FOUND] ファイルが見つかりません'
    )
  })
})

describe('parseIpcError', () => {
  it('code 付きメッセージを解析する', () => {
    expect(parseIpcError(new Error('[NO_SPACE] 容量不足です'))).toEqual({
      code: 'NO_SPACE',
      message: '容量不足です'
    })
  })

  it('Electron の remote exception ラッパーを剥がす', () => {
    const raw =
      "Error invoking remote method 'file:read': [FORBIDDEN_PATH] 許可されていないパスです: /etc/passwd"
    expect(parseIpcError(new Error(raw))).toEqual({
      code: 'FORBIDDEN_PATH',
      message: '許可されていないパスです: /etc/passwd'
    })
  })

  it('code が無ければ UNKNOWN と元のメッセージ', () => {
    expect(parseIpcError(new Error('なんか失敗した'))).toEqual({
      code: 'UNKNOWN',
      message: 'なんか失敗した'
    })
  })

  it('文字列でも解析できる', () => {
    expect(parseIpcError('[NOT_FOUND] x')).toEqual({ code: 'NOT_FOUND', message: 'x' })
  })
})

describe('describeIpcError', () => {
  it('コード付きなら日本語メッセージを返す', () => {
    expect(describeIpcError(new Error('[INVALID_ARGUMENT] 入力が不正です'))).toBe('入力が不正です')
  })

  it('メッセージが空なら既定文言にフォールバック', () => {
    expect(describeIpcError(new Error('[UNKNOWN]'), '操作に失敗しました')).toBe('操作に失敗しました')
  })
})
