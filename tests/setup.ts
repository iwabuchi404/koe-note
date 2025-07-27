import '@testing-library/jest-dom'

// モック: Electron APIs
Object.defineProperty(window, 'electronAPI', {
  value: {
    // ファイル操作
    loadAudioFile: vi.fn().mockResolvedValue('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj'),
    saveFile: vi.fn().mockResolvedValue('/mock/path/file.wav'),
    deleteFile: vi.fn().mockResolvedValue(true),
    getFileSize: vi.fn().mockResolvedValue(1024),
    
    // 設定
    loadSettings: vi.fn().mockResolvedValue({
      saveFolder: '/mock/save/folder',
      whisperServerUrl: 'http://localhost:5000',
      chunkSize: 10,
      overlapSize: 2
    }),
    saveSettings: vi.fn().mockResolvedValue(true),
    
    // 音声認識
    speechTranscribe: vi.fn().mockResolvedValue({
      segments: [
        { start: 0, end: 5, text: 'モックテキスト' }
      ],
      duration: 5,
      language: 'ja'
    }),
    
    // システム
    showOpenDialog: vi.fn().mockResolvedValue({
      canceled: false,
      filePaths: ['/mock/file.wav']
    }),
    showSaveDialog: vi.fn().mockResolvedValue({
      canceled: false,
      filePath: '/mock/save/file.wav'
    })
  },
  writable: true
})

// モック: MediaRecorder
Object.defineProperty(window, 'MediaRecorder', {
  value: class MockMediaRecorder {
    static isTypeSupported = vi.fn().mockReturnValue(true)
    
    state = 'inactive'
    ondataavailable = null
    onstart = null
    onstop = null
    
    start() {
      this.state = 'recording'
      if (this.onstart) this.onstart(new Event('start'))
    }
    
    stop() {
      this.state = 'inactive'
      if (this.onstop) this.onstop(new Event('stop'))
    }
    
    requestData() {
      if (this.ondataavailable) {
        this.ondataavailable(new CustomEvent('dataavailable', {
          detail: { data: new Blob(['mock audio data'], { type: 'audio/webm' }) }
        }))
      }
    }
  },
  writable: true
})

// モック: AudioContext
Object.defineProperty(window, 'AudioContext', {
  value: class MockAudioContext {
    state = 'running'
    sampleRate = 44100
    
    decodeAudioData = vi.fn().mockResolvedValue({
      duration: 10,
      sampleRate: 44100,
      numberOfChannels: 2,
      length: 441000,
      getChannelData: vi.fn().mockReturnValue(new Float32Array(441000))
    })
    
    close = vi.fn().mockResolvedValue(undefined)
  },
  writable: true
})

// モック: MediaStream
Object.defineProperty(window, 'MediaStream', {
  value: class MockMediaStream {
    id = 'mock-stream-id'
    active = true
    getTracks = vi.fn().mockReturnValue([])
    getAudioTracks = vi.fn().mockReturnValue([])
    getVideoTracks = vi.fn().mockReturnValue([])
    addTrack = vi.fn()
    removeTrack = vi.fn()
    clone() {
      return {
        id: 'cloned-stream-id',
        active: true,
        getTracks: vi.fn().mockReturnValue([]),
        getAudioTracks: vi.fn().mockReturnValue([]),
        getVideoTracks: vi.fn().mockReturnValue([]),
        addTrack: vi.fn(),
        removeTrack: vi.fn(),
        clone: vi.fn()
      }
    }
  },
  writable: true
})

// モック: navigator.mediaDevices
Object.defineProperty(navigator, 'mediaDevices', {
  value: {
    getUserMedia: vi.fn().mockResolvedValue(new window.MediaStream()),
    enumerateDevices: vi.fn().mockResolvedValue([
      {
        deviceId: 'default',
        kind: 'audioinput',
        label: 'Default Microphone',
        groupId: 'default'
      }
    ])
  },
  writable: true
})

// モック: process.env (Node.js環境用)
if (typeof process !== 'undefined') {
  process.env.NODE_ENV = 'test'
}