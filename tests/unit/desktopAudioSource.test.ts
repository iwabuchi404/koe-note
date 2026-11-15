/**
 * デスクトップ音声トラックの検証ロジック
 *
 * 背景: Chromiumはシステム音声を供給できないソースに対して
 * マイクへフォールバックしたMediaStreamを返す。この挙動を
 * 検出しないと「デスクトップ音声」を選んだのにマイクを
 * 録音してしまう事故になる。
 */
import { describe, it, expect } from 'vitest'
import {
  classifyDesktopAudioTrack,
  assertSystemAudioTrack,
  toUserFacingDesktopAudioError,
  DesktopAudioUnavailableError
} from '@renderer/features/recording/services/desktopAudioSource'

const makeTrack = (label: string): MediaStreamTrack =>
  ({ label, kind: 'audio' }) as MediaStreamTrack

describe('classifyDesktopAudioTrack', () => {
  it('出力デバイス名はシステム音声と判定する', () => {
    expect(classifyDesktopAudioTrack(makeTrack('Speakers (Realtek High Definition Audio)'))).toBe('system')
    expect(classifyDesktopAudioTrack(makeTrack('Speakers (HyperX QuadCast)'))).toBe('system')
  })

  it('マイクを含むデバイス名はマイクと判定する', () => {
    expect(classifyDesktopAudioTrack(makeTrack('Default - Microphone (HyperX QuadCast)'))).toBe('microphone')
    expect(classifyDesktopAudioTrack(makeTrack('マイク (Realtek Audio)'))).toBe('microphone')
  })

  it('labelが空ならunknown', () => {
    expect(classifyDesktopAudioTrack(makeTrack(''))).toBe('unknown')
  })
})

describe('assertSystemAudioTrack', () => {
  it('音声トラックが無ければ具体的な案内付きで失敗する', () => {
    expect(() => assertSystemAudioTrack([])).toThrow(DesktopAudioUnavailableError)
    expect(() => assertSystemAudioTrack([])).toThrow(/システム音声が取得できませんでした/)
  })

  it('全てマイクなら「マイクが返された」と明示して失敗する', () => {
    const tracks = [makeTrack('Default - Microphone (HyperX QuadCast)')]
    expect(() => assertSystemAudioTrack(tracks)).toThrow(/代わりにマイクが返されました/)
    expect(() => assertSystemAudioTrack(tracks)).toThrow(/HyperX QuadCast/)
  })

  it('システム音声のトラックがあればそれを返す', () => {
    const systemTrack = makeTrack('Speakers (Realtek High Definition Audio)')
    expect(assertSystemAudioTrack([systemTrack])).toBe(systemTrack)
  })

  it('システム音声とマイクが混在していればシステム音声を優先する', () => {
    const mic = makeTrack('Default - Microphone (HyperX QuadCast)')
    const system = makeTrack('Speakers (Realtek High Definition Audio)')
    expect(assertSystemAudioTrack([mic, system])).toBe(system)
  })

  it('labelが空のトラックしかない場合は微波にフォールバックしない', () => {
    const unknown = makeTrack('')
    expect(assertSystemAudioTrack([unknown])).toBe(unknown)
  })
})

describe('toUserFacingDesktopAudioError', () => {
  it('DesktopAudioUnavailableErrorはそのまま通す', () => {
    const original = new DesktopAudioUnavailableError('元の案内')
    expect(toUserFacingDesktopAudioError(original)).toBe(original)
  })

  it('AbortErrorはキャンセル案内に変換する', () => {
    const error = new Error('aborted')
    error.name = 'AbortError'
    expect(toUserFacingDesktopAudioError(error).message).toMatch(/キャンセル/)
  })

  it('NotAllowedErrorは拒否案内に変換する', () => {
    const error = new Error('denied')
    error.name = 'NotAllowedError'
    expect(toUserFacingDesktopAudioError(error).message).toMatch(/拒否/)
  })

  it('未知のエラーも DesktopAudioUnavailableError に変換する', () => {
    const result = toUserFacingDesktopAudioError('unknown failure')
    expect(result).toBeInstanceOf(DesktopAudioUnavailableError)
    expect(result.message).toMatch(/unknown failure/)
  })
})
