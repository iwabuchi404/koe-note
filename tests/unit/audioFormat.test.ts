/**
 * audioFormat - バイト⇔時間 換算の SSOT
 *
 * 実測のエンコーダ設定（lamejs Mp3Encoder(1, 44100, 128)）に合わせて
 * 計算されていることを検証する。旧実装は圧縮率 0.12 を仮定しており
 * 約 35% ずれていたため、その回帰も塞いでおく。
 */
import { describe, it, expect } from 'vitest'
import {
  DEFAULT_ENCODING,
  bytesFromDuration,
  bytesPerSecond,
  chunkBytesForDuration,
  durationFromBytes,
  roundSeconds
} from '../../src/shared/audioFormat'

describe('bytesPerSecond', () => {
  it('MP3 128kbps は 16,000 B/s', () => {
    expect(bytesPerSecond('mp3')).toBe(16_000)
  })

  it('WAV 44.1kHz/16bit/モノラル は 88,200 B/s', () => {
    expect(bytesPerSecond('wav')).toBe(88_200)
  })

  it('ビットレートを変えると随之変わる', () => {
    const encoding = { ...DEFAULT_ENCODING, mp3BitrateKbps: 64 }
    expect(bytesPerSecond('mp3', encoding)).toBe(8_000)
  })

  it('ステレオ化すると WAV は 2 倍になる', () => {
    const encoding = { ...DEFAULT_ENCODING, channels: 2 }
    expect(bytesPerSecond('wav', encoding)).toBe(176_400)
  })
})

describe('durationFromBytes / bytesFromDuration', () => {
  it('128kbps で 1 秒 = 16,000 バイト', () => {
    expect(durationFromBytes(16_000, 'mp3')).toBe(1)
    expect(bytesFromDuration(1, 'mp3')).toBe(16_000)
  })

  it('15 秒 = 240,000 バイト', () => {
    expect(bytesFromDuration(15, 'mp3')).toBe(240_000)
    expect(durationFromBytes(240_000, 'mp3')).toBe(15)
  })

  it('丸めにより往復しても 1 バイト未満の誤差に収まる', () => {
    for (const seconds of [0.5, 1, 2.5, 3, 7.3, 12.304, 60]) {
      const bytes = bytesFromDuration(seconds, 'mp3')
      const back = durationFromBytes(bytes, 'mp3')
      expect(Math.abs(back - seconds)).toBeLessThan(0.001)
    }
  })

  it('旧実装（圧縮率 0.12 仮定）ではないことを確認する', () => {
    // 圧縮率 0.12 だと 1 秒 = 10,584 バイトとなる
    const legacyBytes = 44_100 * 2 * 0.12
    expect(bytesFromDuration(1, 'mp3')).not.toBe(Math.round(legacyBytes))
    // 実際の 128kbps に対して約 51% 大きくなる
    expect(bytesFromDuration(1, 'mp3')).toBeGreaterThan(Math.round(legacyBytes))
  })

  it('0 バイトは 0 秒（無限大や NaN にしない）', () => {
    expect(durationFromBytes(0, 'mp3')).toBe(0)
    expect(bytesFromDuration(0, 'mp3')).toBe(0)
  })

  it('負数は 0 に丸める', () => {
    expect(durationFromBytes(-100, 'mp3')).toBe(0)
    expect(bytesFromDuration(-1, 'mp3')).toBe(0)
  })

  it('WAV でも整合する', () => {
    const bytes = bytesFromDuration(2, 'wav')
    expect(bytes).toBe(176_400)
    expect(durationFromBytes(bytes, 'wav')).toBe(2)
  })
})

describe('chunkBytesForDuration', () => {
  it('1 秒のチャンクは 16,000 バイト', () => {
    expect(chunkBytesForDuration(1, 'mp3')).toBe(16_000)
  })

  it('0 秒を指定しても 0 バイトにしない（1 フレーム分は出す）', () => {
    expect(chunkBytesForDuration(0, 'mp3')).toBeGreaterThan(0)
  })

  it('要求が MP3 の 1 フレーム未満でも 1 フレーム以上を返す', () => {
    // 0.001 秒 -> 16 バイト要求だが MP3 1 フレーム(417) 未満なので 417
    expect(chunkBytesForDuration(0.001, 'mp3')).toBeGreaterThanOrEqual(417)
  })

  it('長さは単調増加する', () => {
    const values = [1, 2, 3, 5, 10, 15].map((s) => chunkBytesForDuration(s, 'mp3'))
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1])
    }
  })
})

describe('roundSeconds', () => {
  it('小数第 3 位に丸める', () => {
    expect(roundSeconds(1.23456)).toBe(1.235)
    expect(roundSeconds(1.2)).toBe(1.2)
    expect(roundSeconds(0)).toBe(0)
  })
})