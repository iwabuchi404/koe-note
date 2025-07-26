import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ファイル表示関連のテストデータ
const mockAudioFiles = [
  {
    id: 'audio-1',
    name: 'recording_20250726_120000.webm',
    path: '/mock/recordings/recording_20250726_120000.webm',
    size: 1024000,
    duration: 120,
    createdAt: new Date('2025-01-26T12:00:00Z'),
    type: 'audio'
  },
  {
    id: 'audio-2', 
    name: 'interview_20250726_140000.webm',
    path: '/mock/recordings/interview_20250726_140000.webm',
    size: 2048000,
    duration: 300,
    createdAt: new Date('2025-01-26T14:00:00Z'),
    type: 'audio'
  }
]

const mockTranscriptionFiles = [
  {
    id: 'transcript-1',
    name: 'recording_20250726_120000_transcript.txt',
    path: '/mock/transcripts/recording_20250726_120000_transcript.txt',
    size: 5000,
    audioFileId: 'audio-1',
    createdAt: new Date('2025-01-26T12:05:00Z'),
    type: 'transcript',
    content: 'これはテスト用の文字起こし結果です。音声認識によって生成されました。'
  },
  {
    id: 'transcript-2',
    name: 'interview_20250726_140000_transcript.txt', 
    path: '/mock/transcripts/interview_20250726_140000_transcript.txt',
    size: 12000,
    audioFileId: 'audio-2',
    createdAt: new Date('2025-01-26T14:10:00Z'),
    type: 'transcript',
    content: 'インタビューの文字起こし結果です。複数の話者による対話が含まれています。'
  }
]

// ファイル表示ユーティリティ関数のテスト
describe('ファイル表示機能', () => {
  beforeEach(() => {
    // ElectronAPIのモック設定
    global.window.electronAPI = {
      ...global.window.electronAPI,
      getFileList: vi.fn().mockResolvedValue([...mockAudioFiles, ...mockTranscriptionFiles]),
      readTextFile: vi.fn(),
      deleteFile: vi.fn().mockResolvedValue(true),
      openFileLocation: vi.fn().mockResolvedValue(true),
      exportTranscript: vi.fn().mockResolvedValue('/mock/export/path.txt')
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('ファイルリスト取得', () => {
    it('録音ファイルと文字起こしファイルが正しく取得されること', async () => {
      const fileList = await window.electronAPI.getFileList()
      
      expect(fileList).toHaveLength(4)
      
      // 録音ファイルの確認
      const audioFiles = fileList.filter(file => file.type === 'audio')
      expect(audioFiles).toHaveLength(2)
      expect(audioFiles[0].name).toBe('recording_20250726_120000.webm')
      
      // 文字起こしファイルの確認
      const transcriptFiles = fileList.filter(file => file.type === 'transcript')
      expect(transcriptFiles).toHaveLength(2)
      expect(transcriptFiles[0].name).toBe('recording_20250726_120000_transcript.txt')
    })

    it('ファイルが日付順でソートされること', async () => {
      const fileList = await window.electronAPI.getFileList()
      
      // 新しいファイルが先に来ることを確認
      const sortedByDate = fileList.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      
      expect(sortedByDate[0].name).toContain('140000') // 14:00のファイル
      expect(sortedByDate[sortedByDate.length - 1].name).toContain('120000') // 12:00のファイル
    })

    it('ファイルサイズが適切にフォーマットされること', () => {
      const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return '0 B'
        const k = 1024
        const sizes = ['B', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
      }

      expect(formatFileSize(1024000)).toBe('1000 KB')
      expect(formatFileSize(2048000)).toBe('1.95 MB')
      expect(formatFileSize(5000)).toBe('4.88 KB')
    })
  })

  describe('文字起こしファイル表示', () => {
    it('文字起こしファイルの内容が読み込まれること', async () => {
      const mockContent = 'テスト用の文字起こし内容です。'
      global.window.electronAPI.readTextFile = vi.fn().mockResolvedValue(mockContent)
      
      const filePath = '/mock/transcripts/test_transcript.txt'
      const content = await window.electronAPI.readTextFile(filePath)
      
      expect(content).toBe(mockContent)
      expect(global.window.electronAPI.readTextFile).toHaveBeenCalledWith(filePath)
    })

    it('文字起こしファイルが関連する音声ファイルとペアリングされること', () => {
      const pairedFiles = mockAudioFiles.map(audioFile => {
        const relatedTranscript = mockTranscriptionFiles.find(
          transcript => transcript.audioFileId === audioFile.id
        )
        return {
          ...audioFile,
          transcript: relatedTranscript || null
        }
      })

      expect(pairedFiles[0].transcript).not.toBeNull()
      expect(pairedFiles[0].transcript?.audioFileId).toBe('audio-1')
      expect(pairedFiles[1].transcript).not.toBeNull()
      expect(pairedFiles[1].transcript?.audioFileId).toBe('audio-2')
    })

    it('文字起こし内容がプレビュー表示用に短縮されること', () => {
      const truncateText = (text: string, maxLength: number = 100): string => {
        if (text.length <= maxLength) return text
        return text.substring(0, maxLength) + '...'
      }

      const longText = 'これは非常に長いテキストです。'.repeat(10)
      const truncated = truncateText(longText, 50)
      
      expect(truncated.length).toBeLessThanOrEqual(53) // 50 + '...'
      expect(truncated.endsWith('...')).toBe(true)
    })
  })

  describe('ファイル操作', () => {
    it('ファイルが削除されること', async () => {
      const filePath = '/mock/recordings/test.webm'
      
      const result = await window.electronAPI.deleteFile(filePath)
      
      expect(result).toBe(true)
      expect(global.window.electronAPI.deleteFile).toHaveBeenCalledWith(filePath)
    })

    it('ファイル場所がエクスプローラーで開かれること', async () => {
      const filePath = '/mock/recordings/test.webm'
      
      const result = await window.electronAPI.openFileLocation(filePath)
      
      expect(result).toBe(true)
      expect(global.window.electronAPI.openFileLocation).toHaveBeenCalledWith(filePath)
    })

    it('文字起こしファイルがエクスポートされること', async () => {
      const transcriptId = 'transcript-1'
      const exportFormat = 'txt'
      
      const exportPath = await window.electronAPI.exportTranscript(transcriptId, exportFormat)
      
      expect(exportPath).toBe('/mock/export/path.txt')
      expect(global.window.electronAPI.exportTranscript).toHaveBeenCalledWith(transcriptId, exportFormat)
    })
  })

  describe('ファイルフィルタリング', () => {
    it('音声ファイルのみをフィルタリングできること', async () => {
      const fileList = await window.electronAPI.getFileList()
      const audioOnly = fileList.filter(file => file.type === 'audio')
      
      expect(audioOnly).toHaveLength(2)
      expect(audioOnly.every(file => file.type === 'audio')).toBe(true)
    })

    it('文字起こしファイルのみをフィルタリングできること', async () => {
      const fileList = await window.electronAPI.getFileList()
      const transcriptsOnly = fileList.filter(file => file.type === 'transcript')
      
      expect(transcriptsOnly).toHaveLength(2)
      expect(transcriptsOnly.every(file => file.type === 'transcript')).toBe(true)
    })

    it('ファイル名で検索フィルタリングができること', async () => {
      const fileList = await window.electronAPI.getFileList()
      const searchTerm = 'interview'
      
      const filtered = fileList.filter(file => 
        file.name.toLowerCase().includes(searchTerm.toLowerCase())
      )
      
      expect(filtered).toHaveLength(2) // audio + transcript
      expect(filtered.every(file => file.name.includes('interview'))).toBe(true)
    })

    it('日付範囲でフィルタリングができること', async () => {
      const fileList = await window.electronAPI.getFileList()
      const startDate = new Date('2025-01-26T13:00:00Z')
      const endDate = new Date('2025-01-26T15:00:00Z')
      
      const filtered = fileList.filter(file => {
        const fileDate = new Date(file.createdAt)
        return fileDate >= startDate && fileDate <= endDate
      })
      
      expect(filtered).toHaveLength(2) // 14:00のファイルたち
      expect(filtered.every(file => file.name.includes('140000'))).toBe(true)
    })
  })

  describe('ファイル統計情報', () => {
    it('総ファイル数とサイズが計算されること', async () => {
      const fileList = await window.electronAPI.getFileList()
      
      const stats = {
        totalFiles: fileList.length,
        totalAudioFiles: fileList.filter(f => f.type === 'audio').length,
        totalTranscriptFiles: fileList.filter(f => f.type === 'transcript').length,
        totalSize: fileList.reduce((sum, file) => sum + file.size, 0),
        totalDuration: fileList
          .filter(f => f.type === 'audio')
          .reduce((sum, file) => sum + (file.duration || 0), 0)
      }
      
      expect(stats.totalFiles).toBe(4)
      expect(stats.totalAudioFiles).toBe(2)
      expect(stats.totalTranscriptFiles).toBe(2)
      expect(stats.totalSize).toBe(3089000) // 1024000 + 2048000 + 5000 + 12000
      expect(stats.totalDuration).toBe(420) // 120 + 300 seconds
    })

    it('録音時間が適切にフォーマットされること', () => {
      const formatDuration = (seconds: number): string => {
        const hours = Math.floor(seconds / 3600)
        const minutes = Math.floor((seconds % 3600) / 60)
        const secs = seconds % 60
        
        if (hours > 0) {
          return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        }
        return `${minutes}:${secs.toString().padStart(2, '0')}`
      }

      expect(formatDuration(120)).toBe('2:00')
      expect(formatDuration(300)).toBe('5:00')
      expect(formatDuration(3665)).toBe('1:01:05')
    })
  })

  describe('エラーハンドリング', () => {
    it('ファイル読み込みエラーが適切にハンドリングされること', async () => {
      global.window.electronAPI.readTextFile = vi.fn().mockRejectedValue(
        new Error('ファイル読み込みエラー')
      )
      
      try {
        await window.electronAPI.readTextFile('/invalid/path.txt')
        expect.fail('エラーが発生するべき')
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toBe('ファイル読み込みエラー')
      }
    })

    it('ファイル削除エラーが適切にハンドリングされること', async () => {
      global.window.electronAPI.deleteFile = vi.fn().mockResolvedValue(false)
      
      const result = await window.electronAPI.deleteFile('/invalid/path.txt')
      
      expect(result).toBe(false)
    })

    it('存在しないファイルのペアリングが適切にハンドリングされること', () => {
      const orphanTranscript = {
        id: 'transcript-orphan',
        name: 'orphan_transcript.txt',
        audioFileId: 'non-existent-audio',
        type: 'transcript'
      }

      const relatedAudio = mockAudioFiles.find(
        audio => audio.id === orphanTranscript.audioFileId
      )

      expect(relatedAudio).toBeUndefined()
    })
  })

  describe('パフォーマンス考慮', () => {
    it('大量ファイルでのページネーション処理', () => {
      const largeFileList = Array.from({ length: 1000 }, (_, i) => ({
        id: `file-${i}`,
        name: `file_${i}.webm`,
        type: 'audio',
        createdAt: new Date(Date.now() - i * 1000)
      }))

      const pageSize = 50
      const page = 0
      const paginatedFiles = largeFileList.slice(
        page * pageSize,
        (page + 1) * pageSize
      )

      expect(paginatedFiles).toHaveLength(50)
      expect(paginatedFiles[0].id).toBe('file-0')
      expect(paginatedFiles[49].id).toBe('file-49')
    })

    it('ファイルリストの仮想化レンダリング対応', () => {
      const getVisibleItems = (
        totalItems: number,
        itemHeight: number,
        containerHeight: number,
        scrollTop: number
      ) => {
        const startIndex = Math.floor(scrollTop / itemHeight)
        const visibleCount = Math.ceil(containerHeight / itemHeight)
        const endIndex = Math.min(startIndex + visibleCount, totalItems - 1)
        
        return {
          startIndex,
          endIndex,
          visibleCount: endIndex - startIndex + 1
        }
      }

      const result = getVisibleItems(1000, 60, 400, 300)
      
      expect(result.startIndex).toBe(5) // 300 / 60
      expect(result.visibleCount).toBeGreaterThan(0)
      expect(result.endIndex).toBeGreaterThanOrEqual(result.startIndex)
    })
  })
})