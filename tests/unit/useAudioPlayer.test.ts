import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAudioPlayer } from '@/hooks/useAudioPlayer'

// HTMLAudioElementのモック
const createMockAudioElement = () => {
  const mockAudio = {
    currentTime: 0,
    duration: 100,
    paused: true,
    volume: 1,
    playbackRate: 1,
    src: '',
    load: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onloadedmetadata: null,
    ontimeupdate: null,
    onended: null,
    onerror: null
  }
  
  // AudioElementの基本プロパティを設定
  Object.defineProperty(mockAudio, 'currentTime', {
    get: vi.fn(() => mockAudio.currentTime),
    set: vi.fn((value) => { mockAudio.currentTime = value })
  })
  
  return mockAudio
}

describe('useAudioPlayer', () => {
  let mockAudio: any
  
  beforeEach(() => {
    mockAudio = createMockAudioElement()
    
    // Audio コンストラクタのモック
    Object.defineProperty(global, 'Audio', {
      value: vi.fn(() => mockAudio),
      configurable: true
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('基本機能', () => {
    it('初期状態が正しく設定されること', () => {
      const { result } = renderHook(() => useAudioPlayer())
      
      expect(result.current.isPlaying).toBe(false)
      expect(result.current.currentTime).toBe(0)
      expect(result.current.duration).toBe(0)
      expect(result.current.volume).toBe(1)
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBeNull()
    })

    it('音声プレイヤーの機能が提供されること', () => {
      const { result } = renderHook(() => useAudioPlayer())
      
      expect(typeof result.current.loadAudio).toBe('function')
      expect(typeof result.current.play).toBe('function')
      expect(typeof result.current.pause).toBe('function')
      expect(typeof result.current.seek).toBe('function')
      expect(typeof result.current.setVolume).toBe('function')
      expect(typeof result.current.setPlaybackRate).toBe('function')
    })
  })

  describe('音声読み込み', () => {
    it('音声ファイルが正常に読み込まれること', async () => {
      const { result } = renderHook(() => useAudioPlayer())
      
      const testFilePath = '/test/audio.wav'
      
      await act(async () => {
        await result.current.loadAudio(testFilePath)
      })

      expect(mockAudio.src).toBe(testFilePath)
      expect(mockAudio.load).toHaveBeenCalledTimes(1)
    })

    it('読み込み中状態が適切に管理されること', async () => {
      const { result } = renderHook(() => useAudioPlayer())
      
      const loadPromise = act(async () => {
        result.current.loadAudio('/test/audio.wav')
      })

      // 読み込み中状態の確認
      expect(result.current.isLoading).toBe(true)
      
      await loadPromise
      
      // メタデータ読み込み完了をシミュレート
      act(() => {
        if (mockAudio.onloadedmetadata) {
          mockAudio.duration = 120 // 2分の音声
          mockAudio.onloadedmetadata()
        }
      })

      expect(result.current.isLoading).toBe(false)
      expect(result.current.duration).toBe(120)
    })

    it('読み込みエラーが適切にハンドリングされること', async () => {
      const { result } = renderHook(() => useAudioPlayer())
      
      // エラーを発生させるモック
      mockAudio.load = vi.fn(() => {
        if (mockAudio.onerror) {
          mockAudio.onerror(new Event('error'))
        }
      })

      await act(async () => {
        await result.current.loadAudio('/invalid/audio.wav')
      })

      expect(result.current.error).not.toBeNull()
      expect(result.current.isLoading).toBe(false)
    })
  })

  describe('再生制御', () => {
    beforeEach(async () => {
      const { result } = renderHook(() => useAudioPlayer())
      
      await act(async () => {
        await result.current.loadAudio('/test/audio.wav')
      })
      
      // メタデータ読み込み完了
      act(() => {
        if (mockAudio.onloadedmetadata) {
          mockAudio.duration = 100
          mockAudio.onloadedmetadata()
        }
      })
    })

    it('再生が開始されること', async () => {
      const { result } = renderHook(() => useAudioPlayer())
      
      await act(async () => {
        await result.current.play()
      })

      expect(mockAudio.play).toHaveBeenCalledTimes(1)
      
      // 再生状態の更新をシミュレート
      act(() => {
        mockAudio.paused = false
      })
      
      expect(result.current.isPlaying).toBe(true)
    })

    it('再生が一時停止されること', () => {
      const { result } = renderHook(() => useAudioPlayer())
      
      act(() => {
        result.current.pause()
      })

      expect(mockAudio.pause).toHaveBeenCalledTimes(1)
      
      // 一時停止状態の更新をシミュレート
      act(() => {
        mockAudio.paused = true
      })
      
      expect(result.current.isPlaying).toBe(false)
    })

    it('シークが正常に動作すること', () => {
      const { result } = renderHook(() => useAudioPlayer())
      
      const seekTime = 50
      
      act(() => {
        result.current.seek(seekTime)
      })

      expect(mockAudio.currentTime).toBe(seekTime)
    })

    it('シーク位置が範囲外の場合に適切に制限されること', () => {
      const { result } = renderHook(() => useAudioPlayer())
      
      // 負の値でシーク
      act(() => {
        result.current.seek(-10)
      })
      expect(mockAudio.currentTime).toBe(0)
      
      // 長さを超える値でシーク
      act(() => {
        result.current.seek(150)
      })
      expect(mockAudio.currentTime).toBe(100) // duration
    })
  })

  describe('音量・再生速度制御', () => {
    it('音量が設定されること', () => {
      const { result } = renderHook(() => useAudioPlayer())
      
      const newVolume = 0.5
      
      act(() => {
        result.current.setVolume(newVolume)
      })

      expect(mockAudio.volume).toBe(newVolume)
      expect(result.current.volume).toBe(newVolume)
    })

    it('音量が範囲外の場合に適切に制限されること', () => {
      const { result } = renderHook(() => useAudioPlayer())
      
      // 1.0を超える値
      act(() => {
        result.current.setVolume(1.5)
      })
      expect(result.current.volume).toBe(1.0)
      
      // 負の値
      act(() => {
        result.current.setVolume(-0.1)
      })
      expect(result.current.volume).toBe(0.0)
    })

    it('再生速度が設定されること', () => {
      const { result } = renderHook(() => useAudioPlayer())
      
      const newRate = 1.5
      
      act(() => {
        result.current.setPlaybackRate(newRate)
      })

      expect(mockAudio.playbackRate).toBe(newRate)
    })

    it('再生速度が範囲外の場合に適切に制限されること', () => {
      const { result } = renderHook(() => useAudioPlayer())
      
      // 0.25未満
      act(() => {
        result.current.setPlaybackRate(0.1)
      })
      expect(mockAudio.playbackRate).toBe(0.25)
      
      // 4.0を超える値
      act(() => {
        result.current.setPlaybackRate(5.0)
      })
      expect(mockAudio.playbackRate).toBe(4.0)
    })
  })

  describe('時間更新', () => {
    it('再生時間が更新されること', () => {
      const { result } = renderHook(() => useAudioPlayer())
      
      // 時間更新イベントをシミュレート
      act(() => {
        mockAudio.currentTime = 30
        if (mockAudio.ontimeupdate) {
          mockAudio.ontimeupdate()
        }
      })

      expect(result.current.currentTime).toBe(30)
    })

    it('再生完了時に適切にハンドリングされること', () => {
      const { result } = renderHook(() => useAudioPlayer())
      
      // 再生完了イベントをシミュレート
      act(() => {
        mockAudio.paused = true
        mockAudio.currentTime = mockAudio.duration
        if (mockAudio.onended) {
          mockAudio.onended()
        }
      })

      expect(result.current.isPlaying).toBe(false)
      expect(result.current.currentTime).toBe(mockAudio.duration)
    })
  })

  describe('プログレス情報', () => {
    it('進捗パーセンテージが正しく計算されること', () => {
      const { result } = renderHook(() => useAudioPlayer())
      
      // メタデータ設定
      act(() => {
        mockAudio.duration = 100
        if (mockAudio.onloadedmetadata) {
          mockAudio.onloadedmetadata()
        }
      })
      
      // 50%の位置まで再生
      act(() => {
        mockAudio.currentTime = 50
        if (mockAudio.ontimeupdate) {
          mockAudio.ontimeupdate()
        }
      })

      expect(result.current.progress).toBe(0.5) // 50%
    })

    it('時間フォーマットが正しく取得できること', () => {
      const { result } = renderHook(() => useAudioPlayer())
      
      act(() => {
        mockAudio.duration = 125 // 2分5秒
        mockAudio.currentTime = 65 // 1分5秒
        if (mockAudio.onloadedmetadata) {
          mockAudio.onloadedmetadata()
        }
        if (mockAudio.ontimeupdate) {
          mockAudio.ontimeupdate()
        }
      })

      expect(result.current.formattedCurrentTime).toBe('1:05')
      expect(result.current.formattedDuration).toBe('2:05')
    })
  })

  describe('エラーハンドリング', () => {
    it('再生エラーが適切にハンドリングされること', async () => {
      const { result } = renderHook(() => useAudioPlayer())
      
      // 再生エラーを発生させる
      mockAudio.play = vi.fn().mockRejectedValue(new Error('再生エラー'))

      await act(async () => {
        try {
          await result.current.play()
        } catch (error) {
          // エラーをキャッチ
        }
      })

      expect(result.current.error).not.toBeNull()
      expect(result.current.isPlaying).toBe(false)
    })

    it('エラーがクリアされること', () => {
      const { result } = renderHook(() => useAudioPlayer())
      
      // エラー状態にする
      act(() => {
        if (mockAudio.onerror) {
          mockAudio.onerror(new Event('error'))
        }
      })

      expect(result.current.error).not.toBeNull()
      
      // エラーをクリア
      act(() => {
        result.current.clearError()
      })

      expect(result.current.error).toBeNull()
    })
  })

  describe('リソース管理', () => {
    it('コンポーネントアンマウント時にリソースがクリーンアップされること', () => {
      const { unmount } = renderHook(() => useAudioPlayer())
      
      // アンマウント時にエラーが発生しないことを確認
      expect(() => {
        unmount()
      }).not.toThrow()
      
      // pause が呼ばれることを確認
      expect(mockAudio.pause).toHaveBeenCalled()
    })

    it('新しい音声読み込み時に前の音声が停止されること', async () => {
      const { result } = renderHook(() => useAudioPlayer())
      
      // 最初の音声を読み込み
      await act(async () => {
        await result.current.loadAudio('/test/audio1.wav')
      })
      
      // 再生開始
      await act(async () => {
        await result.current.play()
      })
      
      const pauseCallCount = mockAudio.pause.mock.calls.length
      
      // 新しい音声を読み込み
      await act(async () => {
        await result.current.loadAudio('/test/audio2.wav')
      })
      
      // pause が追加で呼ばれたことを確認
      expect(mockAudio.pause.mock.calls.length).toBeGreaterThan(pauseCallCount)
    })
  })
})