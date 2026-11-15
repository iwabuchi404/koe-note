import React, { useEffect } from 'react'
import './styles/global.css'
import TitleBar from './components/TitleBar/TitleBar'
import MainLayout from './components/MainLayout/MainLayout'
import { SettingsProvider } from './contexts/SettingsContext'
import { TabProvider } from './contexts/TabContext'
import { RecordingProvider } from './contexts/RecordingContext'
import { LibraryProvider } from './contexts/LibraryContext'
import { LoggerFactory, LogCategories } from './utils/LoggerFactory'
import { initializeLogger, enableLoggerDebugMode } from './utils/LoggerInitializer'

/**
 * メインアプリケーションコンポーネント
 * VSCodeライクなレイアウトを提供
 *
 * 状態管理はドメイン別 Context に分離:
 *   SettingsContext … ユーザー設定（localStorage 永続化）
 *   LibraryContext  … ファイル一覧
 *   RecordingContext … 録音状態（録音中ファイル情報を含む）
 *   TabContext      … タブ
 */
const App: React.FC = () => {
  // ログシステム初期化
  useEffect(() => {
    const initializeLogging = async () => {
      const appLogger = LoggerFactory.getLogger(LogCategories.APP)
      try {
        // ログシステム初期化
        await initializeLogger()

        // アプリケーション開始ログ
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
        appLogger.error('ログシステム初期化エラー:', error)
      }
    }

    initializeLogging()
  }, [])

  return (
    <SettingsProvider>
      <LibraryProvider>
        <RecordingProvider>
          <TabProvider>
            <div className="app">
              <TitleBar />
              <MainLayout />
            </div>
          </TabProvider>
        </RecordingProvider>
      </LibraryProvider>
    </SettingsProvider>
  )
}

export default App
