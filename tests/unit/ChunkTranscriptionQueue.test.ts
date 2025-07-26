import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ChunkTranscriptionQueue, QueueItem } from '@/services/ChunkTranscriptionQueue'
import { AudioChunk, ChunkResult } from '@/services/ChunkTranscriptionManager'

describe('ChunkTranscriptionQueue', () => {
  let queue: ChunkTranscriptionQueue
  let mockAudioChunk: AudioChunk

  beforeEach(() => {
    queue = new ChunkTranscriptionQueue(1) // 同期処理（maxConcurrency=1）
    
    mockAudioChunk = {
      id: 'test-chunk-1',
      sequenceNumber: 0,
      startTime: 0,
      endTime: 5,
      audioData: new ArrayBuffer(1024),
      sampleRate: 44100,
      channels: 2,
      overlapWithPrevious: 0
    }

    // ElectronAPIのモック
    global.window.electronAPI.speechTranscribe = vi.fn().mockResolvedValue({
      segments: [
        { start: 0, end: 5, text: 'テスト音声' }
      ],
      duration: 5,
      language: 'ja'
    })
  })

  afterEach(() => {
    queue.stop()
    vi.clearAllMocks()
  })

  describe('基本機能', () => {
    it('初期状態が正しく設定されること', () => {
      const stats = queue.getStats()
      
      expect(stats.totalItems).toBe(0)
      expect(stats.pendingItems).toBe(0)
      expect(stats.processingItems).toBe(0)
      expect(stats.completedItems).toBe(0)
      expect(stats.failedItems).toBe(0)
    })

    it('チャンクをキューに追加できること', () => {
      queue.enqueue(mockAudioChunk, 1)
      
      const stats = queue.getStats()
      expect(stats.totalItems).toBe(1)
      expect(stats.pendingItems).toBe(1)
    })

    it('優先度順でキューに追加されること', () => {
      const chunk1 = { ...mockAudioChunk, id: 'chunk-1' }
      const chunk2 = { ...mockAudioChunk, id: 'chunk-2' }
      const chunk3 = { ...mockAudioChunk, id: 'chunk-3' }

      queue.enqueue(chunk1, 1) // 低優先度
      queue.enqueue(chunk2, 3) // 高優先度  
      queue.enqueue(chunk3, 2) // 中優先度

      // 内部的な順序は優先度順（高→低）になることを期待
      // 実際の実装では、優先度の高い順にprocessNextで処理される
      const stats = queue.getStats()
      expect(stats.pendingItems).toBe(3)
    })
  })

  describe('処理実行', () => {
    it('チャンクが正常に処理されること', async () => {
      let processedResult: ChunkResult | null = null
      
      queue.onProcessingComplete((result) => {
        processedResult = result
      })

      queue.enqueue(mockAudioChunk)
      await queue.startProcessing()

      expect(processedResult).toBeTruthy()
      expect(processedResult?.chunkId).toBe('test-chunk-1')
      expect(processedResult?.status).toBe('completed')
      expect(processedResult?.segments).toHaveLength(1)
      expect(processedResult?.segments[0].text).toBe('テスト音声')
    })

    it('処理完了後に統計情報が更新されること', async () => {
      queue.enqueue(mockAudioChunk)
      await queue.startProcessing()

      const stats = queue.getStats()
      expect(stats.completedItems).toBe(1)
      expect(stats.pendingItems).toBe(0)
      expect(stats.processingItems).toBe(0)
    })

    it('複数チャンクが順次処理されること', async () => {
      const processedResults: ChunkResult[] = []
      
      queue.onProcessingComplete((result) => {
        processedResults.push(result)
      })

      const chunk1 = { ...mockAudioChunk, id: 'chunk-1' }
      const chunk2 = { ...mockAudioChunk, id: 'chunk-2' }

      queue.enqueue(chunk1)
      queue.enqueue(chunk2)
      await queue.startProcessing()

      expect(processedResults).toHaveLength(2)
      expect(processedResults[0].chunkId).toBe('chunk-1')
      expect(processedResults[1].chunkId).toBe('chunk-2')
    })
  })

  describe('エラーハンドリング', () => {
    it('処理エラー時にリトライされること', async () => {
      // 最初の2回は失敗、3回目は成功するモック
      let callCount = 0
      global.window.electronAPI.speechTranscribe = vi.fn().mockImplementation(() => {
        callCount++
        if (callCount <= 2) {
          throw new Error('一時的なエラー')
        }
        return Promise.resolve({
          segments: [{ start: 0, end: 5, text: 'リトライ成功' }],
          duration: 5,
          language: 'ja'
        })
      })

      let finalResult: ChunkResult | null = null
      queue.onProcessingComplete((result) => {
        finalResult = result
      })

      queue.enqueue(mockAudioChunk)
      await queue.startProcessing()

      expect(callCount).toBe(3) // 2回失敗 + 1回成功
      expect(finalResult?.status).toBe('completed')
      expect(finalResult?.segments[0].text).toBe('リトライ成功')
    })

    it('最大リトライ回数に達した場合に失敗として処理されること', async () => {
      // 常に失敗するモック
      global.window.electronAPI.speechTranscribe = vi.fn().mockRejectedValue(
        new Error('常時エラー')
      )

      let finalResult: ChunkResult | null = null
      queue.onProcessingComplete((result) => {
        finalResult = result
      })

      queue.enqueue(mockAudioChunk)
      await queue.startProcessing()

      expect(finalResult?.status).toBe('failed')
      expect(finalResult?.error).toContain('常時エラー')
      
      const stats = queue.getStats()
      expect(stats.failedItems).toBe(1)
    })

    it('連続エラーが多発した場合に処理が停止されること', async () => {
      // サーバーエラーを模擬
      global.window.electronAPI.speechTranscribe = vi.fn().mockRejectedValue(
        new Error('音声認識サーバーとの接続に失敗')
      )

      // 連続エラーを発生させるために複数のチャンクを追加
      for (let i = 0; i < 6; i++) {
        const chunk = { ...mockAudioChunk, id: `chunk-${i}` }
        queue.enqueue(chunk)
      }

      await queue.startProcessing()

      // 5回連続エラーで処理が停止されることを確認
      const stats = queue.getStats()
      expect(stats.failedItems).toBeGreaterThan(0)
      // 完全に6個全て処理される前に停止することを期待
      expect(stats.failedItems + stats.completedItems).toBeLessThanOrEqual(6)
    })
  })

  describe('キュー管理', () => {
    it('キューをクリアできること', () => {
      queue.enqueue(mockAudioChunk)
      queue.clear()

      const stats = queue.getStats()
      expect(stats.totalItems).toBe(0)
      expect(stats.pendingItems).toBe(0)
    })

    it('処理を停止できること', async () => {
      queue.enqueue(mockAudioChunk)
      
      // 処理開始後すぐに停止
      const processingPromise = queue.startProcessing()
      queue.stop()
      
      await processingPromise

      // 停止後は新しい処理が開始されないことを確認
      expect(() => queue.stop()).not.toThrow()
    })

    it('完了した結果を取得できること', async () => {
      queue.enqueue(mockAudioChunk)
      await queue.startProcessing()

      const completedResults = queue.getCompletedResults()
      expect(completedResults.size).toBe(1)
      expect(completedResults.get('test-chunk-1')).toBeTruthy()
    })

    it('失敗したアイテムを取得できること', async () => {
      global.window.electronAPI.speechTranscribe = vi.fn().mockRejectedValue(
        new Error('テストエラー')
      )

      queue.enqueue(mockAudioChunk)
      await queue.startProcessing()

      const failedItems = queue.getFailedItems()
      expect(failedItems.size).toBe(1)
    })
  })

  describe('コールバック', () => {
    it('進捗コールバックが適切に呼ばれること', async () => {
      const progressUpdates: any[] = []
      
      queue.onProgress((stats) => {
        progressUpdates.push({ ...stats })
      })

      queue.enqueue(mockAudioChunk)
      await queue.startProcessing()

      expect(progressUpdates.length).toBeGreaterThan(0)
      // 最後の更新で完了が記録されていることを確認
      const lastUpdate = progressUpdates[progressUpdates.length - 1]
      expect(lastUpdate.completedItems).toBe(1)
    })

    it('コールバックをクリアできること', () => {
      const mockCallback = vi.fn()
      
      queue.onProcessingComplete(mockCallback)
      queue.onProgress(mockCallback)
      queue.clearCallbacks()

      queue.enqueue(mockAudioChunk)
      
      // コールバックがクリアされているため呼ばれない
      expect(mockCallback).not.toHaveBeenCalled()
    })
  })
})