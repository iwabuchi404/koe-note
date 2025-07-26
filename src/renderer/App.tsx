import React, { useState, createContext, useContext, useEffect } from 'react'
import './styles/global.css'
import TitleBar from './components/TitleBar/TitleBar'
import MainLayout from './components/MainLayout/MainLayout'
import { SettingsProvider } from './contexts/SettingsContext'
import { LoggerFactory, LogCategories } from './utils/LoggerFactory'
import { initializeLogger, enableLoggerDebugMode } from './utils/LoggerInitializer'

export interface AudioFile {
  id: string
  filename: string
  filepath: string
  format: 'webm' | 'wav' | 'mp3' | 'rt.txt'
  duration?: number // オプショナルに変更（preloadと一致）
  size: number
  createdAt: Date
  transcription?: string
  inputDevice?: string
  hasTranscriptionFile?: boolean // 文字起こしファイルの存在フラグ
  transcriptionPath?: string // 文字起こしファイルのパス
  isRecording?: boolean // 録音中フラグ
  isRealtimeTranscription?: boolean // リアルタイム文字起こしファイルフラグ
}

// 選択されたファイルの型定義
interface SelectedFile {
  id: string
  filename: string
  filepath: string
  format: 'wav' | 'mp3'
  duration?: number // オプショナルに変更
  size: number
  createdAt: Date
}

// アプリケーション状態のコンテキスト
interface AppContextType {
  fileList: AudioFile[]
  setFileList: React.Dispatch<React.SetStateAction<AudioFile[]>>
  selectedFile: AudioFile | null
  setSelectedFile: (file: AudioFile | null) => void
  transcriptionDisplayData: any
  setTranscriptionDisplayData: (data: any) => void
  isRecording: boolean
  setIsRecording: (isRecording: boolean) => void
  isPlaying: boolean
  setIsPlaying: (isPlaying: boolean) => void
  currentModel: string
  setCurrentModel: (model: string) => void
  isTranscribing: boolean
  setIsTranscribing: (isTranscribing: boolean) => void
  recordingFile: AudioFile | null  // 現在録音中のファイル情報
  setRecordingFile: (file: AudioFile | null) => void
}
const AppContext = createContext<AppContextType | null>(null)

// アプリケーション状態を使用するためのカスタムフック
export const useAppContext = () => {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider')
  }
  return context
}

/**
 * メインアプリケーションコンポーネント
 * VSCodeライクなレイアウトを提供
 */
const App: React.FC = () => {
  const [fileList, setFileList] = useState<AudioFile[]>([])
  const [selectedFile, setSelectedFile] = useState<AudioFile | null>(null)
  const [transcriptionDisplayData, setTranscriptionDisplayData] = useState<any>(null)
  const [isRecording, setIsRecording] = useState<boolean>(false)
  const [isPlaying, setIsPlaying] = useState<boolean>(false)
  const [currentModel, setCurrentModel] = useState<string>('small')
  const [isTranscribing, setIsTranscribing] = useState<boolean>(false)
  const [recordingFile, setRecordingFile] = useState<AudioFile | null>(null)

  // ログシステム初期化
  useEffect(() => {
    const initializeLogging = async () => {
      try {
        // ログシステム初期化
        await initializeLogger()

        // アプリケーション開始ログ
        const appLogger = LoggerFactory.getLogger(LogCategories.APP)
        appLogger.info('KoeNoteアプリケーション開始', {
          userAgent: navigator.userAgent,
          url: window.location.href,
          timestamp: new Date().toISOString()
        })

        // 開発環境でデバッグモードを有効化
        if (process.env.NODE_ENV === 'development') {
          enableLoggerDebugMode()
          appLogger.debug('開発者向けログデバッグ機能を有効化 (window.koeNoteLogDebug)')
        }

      } catch (error) {
        console.error('ログシステム初期化エラー:', error)
      }
    }

    initializeLogging()
  }, [])

  const contextValue: AppContextType = {
    fileList,
    setFileList,
    selectedFile,
    setSelectedFile,
    transcriptionDisplayData,
    setTranscriptionDisplayData,
    isRecording,
    setIsRecording,
    isPlaying,
    setIsPlaying,
    currentModel,
    setCurrentModel,
    isTranscribing,
    setIsTranscribing,
    recordingFile,
    setRecordingFile
  }

  return (
    <SettingsProvider>
      <AppContext.Provider value={contextValue}>
        <div className="app">
          <TitleBar />
          <MainLayout />
        </div>
      </AppContext.Provider>
    </SettingsProvider>
  )
}

export default App