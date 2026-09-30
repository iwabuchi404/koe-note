/**
 * AudioChunkCalculator の現状契約テスト
 *
 * このテストは「いま何が起きているか」を固定するものである。
 * 録音パイプラインを時間ベースに再設計する段階（Phase 4）で、
 * 圧縮率の想定・最小64KBクランプ・UI表示との乖離がどう変わるかを
 * 差分としてレビューできるようにしておく。
 *
 * 関連: AudioWorkletRecordingService は lamejs に
 *   new Mp3Encoder(1, 44100, 128) を渡しており、実バイト数は 16,000 B/s。
 *   一方 AudioChunkCalculator は compression: 0.12（10,584 B/s）で計算するため
 *   実際の 1.51 倍小さく見積もる。加えて setChunkSizeThreshold が
 *   Math.max(64 * 1024, ...) で下限を固定するため、1〜5秒の指定は
 *   すべて約4.1秒に潰れる（= 64KB / 16,000 B/s）。
 */
import { describe, it, expect } from 'vitest'
import { AudioChunkCalculator } from '@renderer/utils/AudioChunkCalculator'

const ACTUAL_MP3_BYTES_PER_SECOND = 128_000 / 8 // 16,000 B/s（lamejs 128kbps）

/** 現在のクランプ後の実効チャンク長（秒） */
const effectiveDurationAfterClamp = (requestedSeconds: number): number => {
  const sizeKB = AudioChunkCalculator.durationToBytes(requestedSeconds)
  const clampedBytes = Math.max(64 * 1024, sizeKB * 1024)
  return clampedBytes / ACTUAL_MP3_BYTES_PER_SECOND
}

describe('AudioChunkCalculator - 現状の挙動', () => {
  describe('durationToBytes', () => {
    it('既定フォーマットは 44100Hz/16bit/モノラル/圧縮率0.12', () => {
      // 44100 * 1ch * (16/8) * 0.12 = 10,584 B/s → 小数点以下を丸めてKB単位
      expect(AudioChunkCalculator.durationToBytes(1)).toBe(10)
      expect(AudioChunkCalculator.durationToBytes(3)).toBe(31)
      expect(AudioChunkCalculator.durationToBytes(15)).toBe(155)
    })

    it('実際のMP3バイト数より小さく見積もる（過小計算）', () => {
      const estimatedKB = AudioChunkCalculator.durationToBytes(10)
      const actualKB = (ACTUAL_MP3_BYTES_PER_SECOND * 10) / 1024

      expect(estimatedKB).toBeLessThan(actualKB)
      // 約1.51倍のズレ
      expect(actualKB / estimatedKB).toBeGreaterThan(1.4)
    })
  })

  describe('bytesToDuration', () => {
    it('KBから Compression を補正して秒数へ戻す', () => {
      expect(AudioChunkCalculator.bytesToDuration(10)).toBe(1.0)
      expect(AudioChunkCalculator.bytesToDuration(31)).toBe(3.0)
    })

    it('プリセット値では往復の丸め誤差が 0.2 秒以内に収まる', () => {
      for (const preset of AudioChunkCalculator.getPresets()) {
        const kb = AudioChunkCalculator.durationToBytes(preset.durationSeconds)
        const roundTrip = AudioChunkCalculator.bytesToDuration(kb)
        expect(Math.abs(roundTrip - preset.durationSeconds)).toBeLessThanOrEqual(0.2)
      }
    })
  })

  describe('UIプリセットと実効チャンク長の乖離', () => {
    it.each([1, 2, 3, 5])('%d秒指定は 64KB クランプにより約4.1秒に潰れる', (seconds) => {
      expect(effectiveDurationAfterClamp(seconds)).toBeCloseTo(4.096, 2)
    })

    it('10秒/15秒指定のみクランプされず指定どおりの長さになる', () => {
      expect(effectiveDurationAfterClamp(10)).toBeCloseTo(6.592, 2)
      expect(effectiveDurationAfterClamp(15)).toBeCloseTo(9.92, 2)
    })
  })

  describe('calculateOptimalSize', () => {
    it('durationモードは指定値をそのまま返す', () => {
      expect(AudioChunkCalculator.calculateOptimalSize('duration', 5)).toEqual({
        sizeKB: 52,
        durationSeconds: 5
      })
    })

    it('bytesモードはKBからdurationを逆算する', () => {
      const result = AudioChunkCalculator.calculateOptimalSize('bytes', 64)
      expect(result.sizeKB).toBe(64)
      expect(result.durationSeconds).toBe(6.2)
    })
  })

  describe('getPresets', () => {
    it('6Presetを1秒から15秒まで昇順で返す', () => {
      const presets = AudioChunkCalculator.getPresets()
      expect(presets).toHaveLength(6)
      expect(presets.map((p) => p.durationSeconds)).toEqual([1, 2, 3, 5, 10, 15])
    })

    it('各PresetのsizeKBがdurationToBytesと一致する', () => {
      for (const preset of AudioChunkCalculator.getPresets()) {
        expect(preset.sizeKB).toBe(AudioChunkCalculator.durationToBytes(preset.durationSeconds))
      }
    })
  })
})
