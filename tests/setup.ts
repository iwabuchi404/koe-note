import '@testing-library/jest-dom'
import { installElectronAPI } from './mocks/electronAPI'

// モック: Electron APIs（ElectronAPI 型に追従するため mocks/electronAPI.ts に定義）
installElectronAPI()

// モック: MediaRecorder
Object.defineProperty(window, 'MediaRecorder', {
  value: class MockMediaRecorder {
    static isTypeSupported = vi.fn().mockReturnValue(true)

    state = 'inactive'
    ondataavailable: ((event: CustomEvent<{ data: Blob }>) => void) | null = null
    onstart: ((event: Event) => void) | null = null
    onstop: ((event: Event) => void) | null = null

    start() {
      this.state = 'recording'
      this.onstart?.(new Event('start'))
    }

    stop() {
      this.state = 'inactive'
      this.onstop?.(new Event('stop'))
    }

    requestData() {
      this.ondataavailable?.(new CustomEvent('dataavailable', {
        detail: { data: new Blob(['mock audio data'], { type: 'audio/webm' }) }
      }))
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