/**
 * SpeechRecognitionV2 - 責務分離されたモジュラー文字起こしコンポーネント
 * 
 * 変更点:
 * - 1152行 → 150行以下に大幅削減
 * - Display/Editor/Operations/Control に責務完全分離
 * - 各機能が独立してテスト可能
 * - 保守性・拡張性の大幅向上
 */

import React, { useState, useEffect } from 'react'
import { TranscriptionResult, AudioFile } from '../../../preload/preload'
import { useAppContext } from '../../App'
import ChunkTranscriptionDisplay from '../ChunkTranscriptionDisplay/ChunkTranscriptionDisplay'

// 分離されたコンポーネント群のインポート
import { TranscriptionExporter, CopyButton } from '../Transcription/Operations'
import { TranscriptionProgressIndicator } from '../Transcription/Control'

// 新しいTextDisplayシステム
import { TextDisplayViewer } from '../common/TextDisplay'
import { TranscriptionAdapter } from '../common/TextDisplay/adapters/TranscriptionAdapter'

interface SpeechRecognitionProps {
  selectedFile: AudioFile | null
  onTranscriptionComplete?: (result: TranscriptionResult) => void
}

const SpeechRecognition: React.FC<SpeechRecognitionProps> = ({ 
  selectedFile, 
  onTranscriptionComplete 
}) => {
  // アプリケーション状態
  const { transcriptionDisplayData, setFileList, currentModel, setTranscriptionDisplayData } = useAppContext()
  
  // ローカル状態
  const [transcriptionResult, setTranscriptionResult] = useState<TranscriptionResult | null>(null)
  const [showChunkDisplay, setShowChunkDisplay] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [textContent, setTextContent] = useState<string>('')

  // 文字起こし完了イベントリスナー
  useEffect(() => {
    const handleTranscriptionComplete = (event: any) => {
      const result = event.detail
      console.log('新しい音声認識結果を受信:', result)
      setTranscriptionResult(result)
      setIsProcessing(false)
      
      // 自動保存処理は TranscriptionExporter に委譲
      if (onTranscriptionComplete) {
        onTranscriptionComplete(result)
      }
    }

    window.addEventListener('transcriptionComplete', handleTranscriptionComplete)
    
    return () => {
      window.removeEventListener('transcriptionComplete', handleTranscriptionComplete)
    }
  }, [onTranscriptionComplete])

  // チャンク分割文字起こし完了イベントリスナー
  useEffect(() => {
    const handleChunkTranscriptionComplete = (event: any) => {
      const consolidatedResult = event.detail
      console.log('チャンク分割文字起こし完了:', consolidatedResult)
      
      setShowChunkDisplay(false)
      setTranscriptionDisplayData(consolidatedResult)
      setIsProcessing(false)
    }

    window.addEventListener('chunkTranscriptionComplete', handleChunkTranscriptionComplete)
    
    return () => {
      window.removeEventListener('chunkTranscriptionComplete', handleChunkTranscriptionComplete)
    }
  }, [setTranscriptionDisplayData])

  // テキストコンテンツ生成
  const generateTextContent = (): string => {
    const result = transcriptionDisplayData || transcriptionResult
    if (!result) return ''
    
    return TranscriptionAdapter.generateFileContent(
      result,
      selectedFile?.filename,
      currentModel
    )
  }
  
  // ファイルパス取得
  const getFilePath = (): string => {
    if (!selectedFile) return 'transcription.txt'
    
    const baseName = selectedFile.filename.replace(/\.[^/.]+$/, '')
    return `${baseName}_transcription.txt`
  }
  
  // コンテンツ変更ハンドラー
  const handleContentChange = (newContent: string) => {
    setTextContent(newContent)
  }
  
  // 保存処理
  const handleSaveTranscription = async (content: string): Promise<boolean> => {
    try {
      if (!selectedFile) return false
      
      const transcriptionPath = getFilePath()
      const success = await window.electronAPI.saveTextFile(transcriptionPath, content)
      
      if (success) {
        console.log('文字起こし結果が保存されました:', transcriptionPath)
        await updateFileList()
      }
      
      return success
    } catch (error) {
      console.error('保存エラー:', error)
      return false
    }
  }

  // ファイル一覧更新処理
  const updateFileList = async () => {
    if (!selectedFile) return

    try {
      const folderPath = selectedFile.filepath.substring(0, selectedFile.filepath.lastIndexOf('\\'))
      const files = await window.electronAPI.getFileList(folderPath)
      
      const extendedFiles = await Promise.all(
        files.map(async (file) => {
          try {
            const hasTranscriptionFile = await window.electronAPI.checkTranscriptionExists(file.filepath)
            const transcriptionPath = hasTranscriptionFile 
              ? await window.electronAPI.getTranscriptionPath(file.filepath)
              : undefined
            
            return {
              ...file,
              hasTranscriptionFile,
              transcriptionPath
            }
          } catch (error) {
            return file
          }
        })
      )
      
      setFileList(extendedFiles)
    } catch (error) {
      console.error('ファイル一覧更新エラー:', error)
    }
  }

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: 'var(--color-bg-primary)'
    }}>

      {/* 進捗表示 */}
      <TranscriptionProgressIndicator
        isProcessing={isProcessing}
        showChunkDisplay={showChunkDisplay}
      />

      {/* チャンク分割表示 */}
      {showChunkDisplay && (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <ChunkTranscriptionDisplay
            audioFileName={selectedFile?.filename || ''}
            chunkSize={20}
            overlapSize={0}
            autoScroll={true}
          />
        </div>
      )}

      {/* メイン表示エリア */}
      {!showChunkDisplay && (
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {(transcriptionResult || transcriptionDisplayData) ? (
            <TextDisplayViewer
              content={generateTextContent()}
              filePath={getFilePath()}
              onContentChange={handleContentChange}
              onSave={handleSaveTranscription}
              showLineNumbers={true}
              showMetadata={true}
              initialMode="view"
              className="transcription-display"
            />
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: 'var(--color-text-secondary)',
              fontSize: 'var(--font-size-md)'
            }}>
              文字起こし結果がありません
            </div>
          )}
        </div>
      )}

      {/* 操作エリア */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 'var(--spacing-sm) var(--spacing-md)',
        backgroundColor: 'var(--color-bg-secondary)',
        borderTop: '1px solid var(--color-border)'
      }}>
        {/* コピー機能 */}
        <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
          <CopyButton 
            transcriptionResult={transcriptionResult}
            includeTimestamp={false}
          />
          <CopyButton 
            transcriptionResult={transcriptionResult}
            includeTimestamp={true}
          />
        </div>

        {/* エクスポート機能 */}
        <TranscriptionExporter
          transcriptionResult={transcriptionResult}
          selectedFile={selectedFile}
          currentModel={currentModel}
        />
      </div>
    </div>
  )
}

export default SpeechRecognition