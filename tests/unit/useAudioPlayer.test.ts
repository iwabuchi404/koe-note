import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAudioPlayer } from '@/audio/hooks/useAudioPlayer'

// HTMLAudioElementのモック
const createMockAudioElement = () => {
  const listeners: Record<string, Function[]> = {}
  let _currentTime = 0
  
  const mockAudio = {
    duration: 100,
    paused: true,
    volume: 1,
    playbackRate: 1,
    src: '',
    load: vi.fn().mockImplementation(() => {
      // loadが呼ばれた時にdurationを100に設定してmetadataイベントを発火
      setTimeout(() => {
        mockAudio.duration = 100
        if (listeners['loadedmetadata']) {
          listeners['loadedmetadata'].forEach(callback => callback())
        }
      }, 10)
    }),
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    addEventListener: vi.fn((event: string, callback: Function) => {
      if (!listeners[event]) listeners[event] = []
      listeners[event].push(callback)
    }),
    removeEventListener: vi.fn((event: string, callback: Function) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter(cb => cb !== callback)
      }
    }),
    dispatchEvent: vi.fn(),
    onloadedmetadata: null,
    ontimeupdate: null,
    onended: null,
    onerror: null,
    // イベント発火用のヘルパーメソッド
    fireEvent: (event: string, data?: any) => {
      if (listeners[event]) {
        listeners[event].forEach(callback => callback(data))
      }
    },
    // bufferedプロパティを追加
    buffered: {
      length: 1,
      start: () => 0,
      end: () => 50
    }
  }
  
  // AudioElementの基本プロパティを設定（無限ループ回避）
  Object.defineProperty(mockAudio, 'currentTime', {
    get: () => _currentTime,
    set: (value) => { _currentTime = value }
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

    // ElectronAPIのモックを再設定（setup.tsのモックがrestoreAllMocksでクリアされるため）
    if (!window.electronAPI?.loadAudioFile?.getMockImplementation) {
      Object.defineProperty(window, 'electronAPI', {
        value: {
          ...window.electronAPI,
          loadAudioFile: vi.fn().mockImplementation((filePath) => {
            // ローディング状態をテストするために少し遅延を追加
            return new Promise((resolve) => {
              setTimeout(() => {
                if (filePath.includes('invalid')) {
                  resolve('') // 無効なファイルの場合は空文字列
                } else {
                  resolve('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj')
                }
              }, 10) // 10ms の遅延
            })
          })
        },
        writable: true
      })
    }
  })

  afterEach(() => {
    // 全モックのリストアではなく、特定のモックのみクリア
    if (mockAudio) {
      mockAudio.load.mockClear()
      mockAudio.play.mockClear()
      mockAudio.pause.mockClear()
      mockAudio.addEventListener.mockClear()
      mockAudio.removeEventListener.mockClear()
    }
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

      expect(mockAudio.src).toMatch(/^data:audio\/wav;base64,/)
      expect(mockAudio.load).toHaveBeenCalledTimes(1)
    })

    it('読み込み中状態が適切に管理されること', async () => {
      const { result } = renderHook(() => useAudioPlayer())
      
      // 読み込み開始（awaitせずに非同期処理を開始）
      act(() => {
        result.current.loadAudio('/test/audio.wav')
      })

      // 読み込み中状態の確認（非同期処理開始直後）
      expect(result.current.isLoading).toBe(true)
      
      // 読み込み完了まで待機
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 50)) // ElectronAPIの遅延より長く待つ
      })
      
      // メタデータ読み込み完了をシミュレート
      act(() => {
        mockAudio.duration = 100 // モックの初期設定と合わせる
        mockAudio.fireEvent('loadedmetadata')
      })

      expect(result.current.isLoading).toBe(false)
      expect(result.current.duration).toBe(100)
    })

    it('読み込みエラーが適切にハンドリングされること', async () => {
      const { result } = renderHook(() => useAudioPlayer())
      
      // エラーを発生させるモック
      mockAudio.load = vi.fn(() => {
        setTimeout(() => {
          mockAudio.fireEvent('error', new Event('error'))
        }, 10)
      })

      await act(async () => {
        await result.current.loadAudio('/invalid/audio.wav')
        // エラーイベントの発火を待つ
        await new Promise(resolve => setTimeout(resolve, 50))
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
      
      // 再生状態の更新をシミュレート（playイベントを発火）
      act(() => {
        mockAudio.paused = false
        mockAudio.fireEvent('play')
      })
      
      expect(result.current.isPlaying).toBe(true)
    })

    it('再生が一時停止されること', () => {
      const { result } = renderHook(() => useAudioPlayer())
      
      act(() => {
        result.current.pause()
      })

      // コンポーネントのクリーンアップでもpauseが呼ばれるため、1回以上であることを確認
      expect(mockAudio.pause).toHaveBeenCalled()
      
      // 一時停止状態の更新をシミュレート（pauseイベントを発火）
      act(() => {
        mockAudio.paused = true
        mockAudio.fireEvent('pause')
      })
      
      expect(result.current.isPlaying).toBe(false)
    })

    it('シークが正常に動作すること', async () => {
      const { result } = renderHook(() => useAudioPlayer())
      
      // まず音声ファイルを読み込んでdurationを設定
      await act(async () => {
        await result.current.loadAudio('/test/audio.wav')
      })
      
      // loadedmetadataイベントを発火してdurationを設定
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 20))
      })
      
      const seekTime = 50
      
      act(() => {
        result.current.seek(seekTime)
      })

      expect(mockAudio.currentTime).toBe(seekTime)
    })

    it('シーク位置が範囲外の場合に適切に制限されること', async () => {
      const { result } = renderHook(() => useAudioPlayer())
      
      // まず音声ファイルを読み込んでdurationを設定
      await act(async () => {
        await result.current.loadAudio('/test/audio.wav')
      })
      
      // loadedmetadataイベントを発火してdurationを設定
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 20))
      })
      
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
      // useAudioPlayerは音量を内部状態管理していないので、mockAudioの値だけチェック
    })

    it('音量が範囲外の場合に適切に制限されること', () => {
      const { result } = renderHook(() => useAudioPlayer())
      
      // 1.0を超える値
      act(() => {
        result.current.setVolume(1.5)
      })
      expect(mockAudio.volume).toBe(1.0)
      
      // 負の値
      act(() => {
        result.current.setVolume(-0.1)
      })
      expect(mockAudio.volume).toBe(0.0)
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
        mockAudio.fireEvent('timeupdate')
      })

      expect(result.current.currentTime).toBe(30)
    })

    it('再生完了時に適切にハンドリングされること', () => {
      const { result } = renderHook(() => useAudioPlayer())
      
      // 再生完了イベントをシミュレート
      act(() => {
        mockAudio.paused = true
        mockAudio.currentTime = mockAudio.duration
        mockAudio.fireEvent('ended')
      })

      expect(result.current.isPlaying).toBe(false)
      expect(result.current.currentTime).toBe(0) // endedイベントでcurrentTimeは0にリセットされる
    })
  })

  describe('プログレス情報', () => {
    it('進捗パーセンテージが正しく計算されること', async () => {
      const { result } = renderHook(() => useAudioPlayer())
      
      // 音声ファイルを読み込んでdurationを設定
      await act(async () => {
        await result.current.loadAudio('/test/audio.wav')
      })
      
      // loadedmetadataイベントを発火してdurationを設定
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 20))
        mockAudio.duration = 100
        mockAudio.fireEvent('loadedmetadata')
      })
      
      // 50%の位置まで再生
      act(() => {
        mockAudio.currentTime = 50
        mockAudio.fireEvent('timeupdate')
      })

      expect(result.current.progress).toBe(0.5) // 50%
    })

    it('時間フォーマットが正しく取得できること', () => {
      const { result } = renderHook(() => useAudioPlayer())
      
      act(() => {
        mockAudio.duration = 125 // 2分5秒
        mockAudio.currentTime = 65 // 1分5秒
        mockAudio.fireEvent('loadedmetadata')
        mockAudio.fireEvent('timeupdate')
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
        result.current.play()
        // エラー処理のため少し待つ
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      expect(result.current.error).not.toBeNull()
      expect(result.current.isPlaying).toBe(false)
    })

    it('エラーがクリアされること', () => {
      const { result } = renderHook(() => useAudioPlayer())
      
      // エラー状態にする
      act(() => {
        mockAudio.fireEvent('error', new Event('error'))
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
      
      // 初期状態ではpauseが呼ばれていないことを確認
      const initialPauseCalls = mockAudio.pause.mock.calls.length
      
      // アンマウント時にエラーが発生しないことを確認
      expect(() => {
        unmount()
      }).not.toThrow()
      
      // pause がアンマウント時に呼ばれることを確認
      expect(mockAudio.pause.mock.calls.length).toBeGreaterThan(initialPauseCalls)
    })

    it('新しい音声読み込み時に前の音声が停止されること', async () => {
      const { result } = renderHook(() => useAudioPlayer())
      
      // 最初の音声を読み込み
      await act(async () => {
        await result.current.loadAudio('/test/audio1.wav')
      })
      
      // 再生開始
      act(() => {
        result.current.play()
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