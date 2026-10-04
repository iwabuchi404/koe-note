/**
 * AudioChunkCalculator の契約テスト（Phase E で修正後）
 *
 * このファイルは从前「いま何が起きているか」を固定する現状契約テストで、
 * 最後に次の 3 点を修正前の(diff)として記録していた:
 *   1. 圧縮率 0.12 の想定（10,584 B/s）
 *   2. 実際の 16,000 B/s に対する過小計算（約 1.51 倍）
 *   3. 64KB 下限クランプによる実効チャンク長の乖離
 *
 * Phase E でバイト⇔時間の換算を src/shared/audioFormat.ts（SSOT）に
 * 集約し、1 と 2 は解消した。実測のエンコーダ設定
 * （lamejs: Mp3Encoder(1, 44100, 128) = 16,000 B/s）に一致するようになった。
 * 3 の 64KB 下限は AudioWorkletRecordingService.setChunkSizeThreshold に
 * 残る仕様なので、引き続き固定する。
 *
 * 関連: src/shared/audioFormat.ts / src/shared/recordingManifest.ts
 */
import { describe, it, expect } from 'vitest'
import { AudioChunkCalculator } from '@renderer/utils/AudioChunkCalculator'
import { bytesPerSecond, chunkBytesForDuration } from '@shared/audioFormat'

/** 実バイト数（lamejs 128kbps） */
const ACTUAL_MP3_BYTES_PER_SECOND = bytesPerSecond('mp3') // 16,000 B/s

/**
 * 現在のクランプ後の実効チャンク長（秒）
 *
 * AudioWorkletRecordingService.setChunkSizeThreshold が
 * Math.max(64 * 1024, sizeInBytes) で下限を固定しているため、
 * 64KB（= 4.096 秒）未満の指定はすべて 4.096 秒に潰れる。
 */
const effectiveDurationAfterClamp = (requestedSeconds: number): number => {
  const sizeKB = AudioChunkCalculator.durationToBytes(requestedSeconds)
  const clampedBytes = Math.max(64 * 1024, sizeKB * 1024)
  return clampedBytes / ACTUAL_MP3_BYTES_PER_SECOND
}

describe('AudioChunkCalculator - 修正後の契約', () => {
  describe('durationToBytes', () => {
    it('実バイト数 16,000 B/s で換算する', () => {
      expect(AudioChunkCalculator.durationToBytes(1)).toBe(16) // 15.625 → 16
      expect(AudioChunkCalculator.durationToBytes(3)).toBe(47) // 46.875 → 47
      expect(AudioChunkCalculator.durationToBytes(15)).toBe(234) // 234.375 → 234
    })

    it('実際の MP3 バイト数と一致する（過小計算が解消した）', () => {
      for (const seconds of [1, 3, 5, 10, 15]) {
        const estimatedKB = AudioChunkCalculator.durationToBytes(seconds)
        const actualKB = (ACTUAL_MP3_BYTES_PER_SECOND * seconds) / 1024
        // KB 丸めによる 1KB 未満の差だけが残る
        expect(Math.abs(estimatedKB - actualKB)).toBeLessThan(1)
      }
    })

    it('修正前の圧縮率 0.12 の値（1秒=10KB）を返さない', () => {
      expect(AudioChunkCalculator.durationToBytes(1)).not.toBe(10)
    })
  })

  describe('bytesToDuration', () => {
    it('KB から 16,000 B/s で秒数へ戻す', () => {
      expect(AudioChunkCalculator.bytesToDuration(16)).toBe(1.0)
      expect(AudioChunkCalculator.bytesToDuration(47)).toBe(3.0)
    })

    it('プリセット値では往復の丸め誤差が 0.2 秒以内に収まる', () => {
      for (const preset of AudioChunkCalculator.getPresets()) {
        const kb = AudioChunkCalculator.durationToBytes(preset.durationSeconds)
        const roundTrip = AudioChunkCalculator.bytesToDuration(kb)
        expect(Math.abs(roundTrip - preset.durationSeconds)).toBeLessThanOrEqual(0.2)
      }
    })
  })

  describe('UIプリセットと実効チャンク長の乖離（64KB 下限は仕様）', () => {
    it.each([1, 2, 3])('%d秒指定は 64KB クランプにより約4.1秒に潰れる', (seconds) => {
      expect(effectiveDurationAfterClamp(seconds)).toBeCloseTo(4.096, 2)
    })

    it('5秒以上は下限クランプに掛からず指定どおりになる（KB 丸めぶんだけ短くなる）', () => {
      // UI は KB 単位の整数でチャンク境界を渡すため、
      // 指定より最大 1KB 短い実動になる（128kbps で最大 62ms）。
      // 5秒 → 78KB → 4.992秒 / 10秒 → 156KB → 9.984秒 / 15秒 → 234KB → 14.976秒
      expect(effectiveDurationAfterClamp(5)).toBeCloseTo(4.992, 3)
      expect(effectiveDurationAfterClamp(10)).toBeCloseTo(9.984, 3)
      expect(effectiveDurationAfterClamp(15)).toBeCloseTo(14.976, 3)
    })

    it('実際のチャンク境界も SSOT の chunkBytesForDuration と一致する', () => {
      // manifest が使う算出と UI が使う算出がずれないことの確認
      for (const seconds of [1, 3, 5, 15]) {
        const fromCalculator = AudioChunkCalculator.durationToBytes(seconds) * 1024
        const fromSsot = chunkBytesForDuration(seconds, 'mp3')
        expect(Math.abs(fromCalculator - fromSsot)).toBeLessThan(1024)
      }
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