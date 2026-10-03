/**
 * 録音チャンク一覧の表示件数ロジック
 *
 * 長時間録音でレンダラが固まった不具合の回帰テスト。
 * 全チャンクを描画すると O(N^2) になるため、必ず上限で切ることを保証する。
 */
import { describe, it, expect } from 'vitest'
import {
  MAX_VISIBLE_CHUNKS,
  selectVisibleChunks,
  countHiddenChunks
} from '../../src/renderer/components/AdvancedRecording/ChunkViews'

describe('selectVisibleChunks', () => {
  it('上限以下ならそのまま全件を返す', () => {
    const chunks = Array.from({ length: MAX_VISIBLE_CHUNKS }, (_, i) => i)
    const visible = selectVisibleChunks(chunks)
    expect(visible).toHaveLength(MAX_VISIBLE_CHUNKS)
    expect(visible).toBe(chunks)
  })

  it('空配列でも|空を返す', () => {
    expect(selectVisibleChunks([])).toEqual([])
  })

  it('上限を超えたら最新 MAX 件だけを残す（古い側を落とす）', () => {
    const chunks = Array.from({ length: MAX_VISIBLE_CHUNKS + 50 }, (_, i) => i)
    const visible = selectVisibleChunks(chunks)
    expect(visible).toHaveLength(MAX_VISIBLE_CHUNKS)
    // 最新 = 末尾
    expect(visible[visible.length - 1]).toBe(MAX_VISIBLE_CHUNKS + 49)
    expect(visible[0]).toBe(50)
  })

  it('任意の並びでも末尾を最新として扱う', () => {
    const chunks = [10, 20, 30]
    expect(selectVisibleChunks(chunks)).toEqual([10, 20, 30])
  })

  it('元の配列を変更しない（イミュータブル）', () => {
    const chunks = Array.from({ length: MAX_VISIBLE_CHUNKS + 10 }, (_, i) => i)
    const copy = [...chunks]
    selectVisibleChunks(chunks)
    expect(chunks).toEqual(copy)
  })

  it('1万件のクロップでも定数時間で縮む', () => {
    const chunks = Array.from({ length: 10000 }, (_, i) => i)
    const start = performance.now()
    const visible = selectVisibleChunks(chunks)
    const elapsed = performance.now() - start
    expect(visible).toHaveLength(MAX_VISIBLE_CHUNKS)
    expect(elapsed).toBeLessThan(50)
  })
})

describe('countHiddenChunks', () => {
  it('上限以下なら 0', () => {
    expect(countHiddenChunks([1, 2, 3])).toBe(0)
    expect(countHiddenChunks(Array.from({ length: MAX_VISIBLE_CHUNKS }, (_, i) => i))).toBe(0)
  })

  it('超過した分だけを返す', () => {
    expect(countHiddenChunks(Array.from({ length: MAX_VISIBLE_CHUNKS + 7 }, (_, i) => i))).toBe(7)
  })

  it('表示件数と省略件数の合計が元配列と一致する', () => {
    const chunks = Array.from({ length: MAX_VISIBLE_CHUNKS + 33 }, (_, i) => i)
    expect(selectVisibleChunks(chunks).length + countHiddenChunks(chunks)).toBe(chunks.length)
  })
})
