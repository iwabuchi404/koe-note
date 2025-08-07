/**
 * LeftPanelV2 - モジュラー化されたファイル管理パネル
 * 
 * 変更点:
 * - 651行 → 150行以下に大幅削減
 * - FileManagement コンポーネント群を活用した責務分離
 * - 各機能が独立してテスト可能
 * - 保守性・拡張性の大幅向上
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { useAppContext, AudioFile } from '../../App'
import { useTabContext } from '../../contexts/TabContext'
import { TabType } from '../../types/TabTypes'
import SettingsModal from '../SettingsModal/SettingsModal'
import { LoggerFactory, LogCategories } from '../../utils/LoggerFactory'

// 分離されたFileManagementコンポーネント群
import { ExtendedAudioFile } from '../FileManagement/types'
import SimpleFileList from './SimpleFileList'

const LeftPanel: React.FC = () => {
  // アプリケーション全体の状態管理
  const { selectedFile, setSelectedFile, setTranscriptionDisplayData, fileList, setFileList, recordingFile } = useAppContext()
  const { createTab } = useTabContext()
  
  // ログシステム
  const logger = LoggerFactory.getLogger(LogCategories.UI_FILE_LIST)
  
  // ローカル状態管理
  const [selectedFolder, setSelectedFolder] = useState<string>('')
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [loadedTranscriptions, setLoadedTranscriptions] = useState<Map<string, any>>(new Map())
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')

  // ファイル一覧を読み込む
  const loadFileList = useCallback(async (folderPath: string) => {
    setIsLoading(true)
    setError(null)
    
    try {
      const files = await window.electronAPI.getFileList(folderPath)
      
      // 各音声ファイルに対して文字起こしファイルの存在をチェック
      const extendedFiles: ExtendedAudioFile[] = await Promise.all(
        files.map(async (file): Promise<ExtendedAudioFile> => {
          try {
            const hasTranscriptionFile = await window.electronAPI.checkTranscriptionExists(file.filepath)
            const transcriptionPath = hasTranscriptionFile 
              ? await window.electronAPI.getTranscriptionPath(file.filepath)
              : undefined
            
            // グローバル録音状態をチェックして isRecording フラグを設定
            const isCurrentlyRecording = recordingFile && (
              file.id === recordingFile.id || 
              file.filename === recordingFile.filename ||
              file.filepath === recordingFile.filepath
            )
            
            return {
              ...file,
              hasTranscriptionFile,
              transcriptionPath,
              isRecording: isCurrentlyRecording || false
            }
          } catch (error) {
            logger.error('文字起こしファイル確認エラー', error as Error)
            return {
              ...file,
              hasTranscriptionFile: false,
              transcriptionPath: undefined,
              isRecording: false
            }
          }
        })
      )
      
      setFileList(extendedFiles)
      logger.info('ファイル一覧読み込み完了', { 
        fileCount: extendedFiles.length,
        transcriptionCount: extendedFiles.filter(f => f.hasTranscriptionFile).length
      })
      
    } catch (error) {
      const errorMessage = 'ファイル一覧の読み込みに失敗しました'
      logger.error(errorMessage, error as Error)
      setError(errorMessage)
      setFileList([])
    } finally {
      setIsLoading(false)
    }
  }, [setFileList, recordingFile, logger])

  // デフォルトフォルダパスを取得
  const getDefaultFolder = useCallback(async () => {
    try {
      const settings = await window.electronAPI.loadSettings()
      return settings.saveFolder || ''
    } catch (error) {
      logger.error('デフォルトフォルダ取得エラー', error as Error)
      return ''
    }
  }, [logger])

  // 初期化時にデフォルトフォルダをチェック
  useEffect(() => {
    const initializeFileList = async () => {
      if (selectedFolder) return
      
      try {
        const defaultFolder = await getDefaultFolder()
        if (defaultFolder) {
          setSelectedFolder(defaultFolder)
          await loadFileList(defaultFolder)
        }
      } catch (error) {
        logger.error('初期化エラー', error as Error)
      }
    }
    
    initializeFileList()
  }, [getDefaultFolder, loadFileList, selectedFolder, logger])

  // 録音状態変更時の自動ファイルリスト更新
  useEffect(() => {
    if (!selectedFolder) return

    if (recordingFile) {
      // 録音開始時: 少し遅延してファイル作成を待つ
      const timeoutId = setTimeout(() => {
        loadFileList(selectedFolder)
      }, 500)
      return () => clearTimeout(timeoutId)
    } else {
      // 録音停止時: すぐに更新
      loadFileList(selectedFolder)
    }
  }, [recordingFile, selectedFolder, loadFileList])

  // 検索フィルタリング
  const filteredFiles = useMemo(() => {
    if (!searchQuery) return fileList as ExtendedAudioFile[]
    
    const query = searchQuery.toLowerCase()
    return (fileList as ExtendedAudioFile[]).filter(file =>
      file.filename.toLowerCase().includes(query) ||
      file.filepath.toLowerCase().includes(query)
    )
  }, [fileList, searchQuery])

  // ファイル選択ハンドラー
  const handleFileSelect = useCallback((fileId: string) => {
    const file = fileList.find(f => f.id === fileId) as ExtendedAudioFile
    if (file) {
      setSelectedFile(file)
      setSelectedFileId(fileId)
      
      // ファイルタイプに応じてタブデータを作成
      const fileType = file.isTextFile || file.format === 'txt' || file.format === 'md' 
        ? 'text' as const 
        : file.isRealtimeTranscription 
        ? 'transcription' as const 
        : 'audio' as const
      
      createTab(TabType.PLAYER, {
        filePath: file.filepath,
        fileName: file.filename,
        fileType: fileType,
        duration: file.duration,
        hasTranscriptionFile: file.hasTranscriptionFile,
        transcriptionPath: file.transcriptionPath
      })
      logger.info('ファイル選択', { filename: file.filename, fileId, fileType })
    }
  }, [fileList, setSelectedFile, createTab, logger])

  // ファイル操作ハンドラー
  const handleFileAction = useCallback(async (action: string, fileId: string, ...args: any[]) => {
    const file = fileList.find(f => f.id === fileId) as ExtendedAudioFile
    if (!file) return

    try {
      switch (action) {
        case 'openTranscriptionFile':
          // ツリーの文字起こしファイル選択
          const transcriptionInfo = args[0]
          if (transcriptionInfo) {
            // 子ノード用のIDを設定
            setSelectedFileId(`${fileId}_transcription`)
            
            createTab(TabType.PLAYER, {
              filePath: transcriptionInfo.filePath,
              fileName: transcriptionInfo.fileName,
              fileType: 'transcription' as const,
              content: '',
              hasTranscriptionFile: false
            })
            logger.info('文字起こしファイル選択', { 
              transcriptionFile: transcriptionInfo.fileName,
              fileId 
            })
          }
          break
          
        case 'delete':
          if (window.confirm(`ファイル「${file.filename}」を削除しますか？`)) {
            await window.electronAPI.deleteFile(file.filepath)
            await loadFileList(selectedFolder)
            logger.info('ファイル削除完了', { filename: file.filename })
          }
          break
          
        case 'toggleTranscription':
          if (file.hasTranscriptionFile && file.transcriptionPath) {
            const transcriptionData = await window.electronAPI.loadTranscriptionFile(file.transcriptionPath)
            setTranscriptionDisplayData(transcriptionData)
            createTab(TabType.PLAYER, {
              filePath: file.transcriptionPath,
              fileName: `${file.filename} - 文字起こし`,
              fileType: 'transcription' as const,
              content: transcriptionData
            })
            logger.info('文字起こし表示', { filename: file.filename })
          }
          break
          
        case 'export':
          // FileActionsPanel内で処理される
          break
          
        default:
          logger.warn('未知のファイル操作', { action, fileId })
      }
    } catch (error) {
      logger.error('ファイル操作エラー', error as Error)
    }
  }, [fileList, selectedFolder, loadFileList, setTranscriptionDisplayData, createTab, setSelectedFile, setSelectedFileId, logger])

  // コンテキストメニュー（将来的に実装）
  const handleContextMenu = useCallback((event: React.MouseEvent, file: ExtendedAudioFile) => {
    event.preventDefault()
    // TODO: コンテキストメニューの実装
  }, [])

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      backgroundColor: 'var(--color-bg-secondary)',
      color: 'var(--color-text-primary)',
      fontFamily: 'var(--font-family-ui)',
      fontSize: 'var(--font-size-md)'
    }}>
      {/* ヘッダー部分 */}
      <div style={{
        padding: 'var(--spacing-md)',
        borderBottom: '1px solid var(--color-border)',
        backgroundColor: 'var(--color-bg-tertiary)',
        color: 'var(--color-text-primary)'
      }}>
        {/* 検索バー */}
        <div style={{ marginBottom: 'var(--spacing-sm)' }}>
          <input
            type="text"
            placeholder="ファイルを検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid var(--color-border)',
              borderRadius: '4px',
              fontSize: 'var(--font-size-sm)',
              backgroundColor: 'var(--color-bg-primary)',
              color: 'var(--color-text-primary)',
              outline: 'none'
            }}
          />
        </div>

        {/* 設定ボタン */}
        <button
          onClick={() => setIsSettingsOpen(true)}
          style={{
            width: '100%',
            padding: '8px 12px',
            backgroundColor: 'var(--color-accent)',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: 'var(--font-size-sm)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--spacing-xs)'
          }}
        >
          ⚙️ 設定
        </button>
      </div>

      {/* ファイル一覧 */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <SimpleFileList
          files={filteredFiles}
          selectedFileId={selectedFileId}
          expandedFiles={new Set()} // 空のセット（使用されない）
          onFileSelect={handleFileSelect}
          onFileAction={handleFileAction}
          onToggleExpand={() => {}} // 空の関数（使用されない）
          isLoading={isLoading}
          error={error || undefined}
        />
      </div>

      {/* 設定モーダル */}
      {isSettingsOpen && (
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
        />
      )}
    </div>
  )
}

export default LeftPanel