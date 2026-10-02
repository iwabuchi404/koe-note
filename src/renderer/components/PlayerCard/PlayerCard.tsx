/**
 * プレイヤーカード - 統合オブジェクトUI
 * 音声ファイルとテキストファイルの両方を扱うカードコンポーネント
 */

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useTabContext } from '../../contexts/TabContext'
import { TabStatus, PlayerTabData } from '../../types/TabTypes'
import { LoggerFactory, LogCategories } from '../../utils/LoggerFactory'
import { TextDisplayViewer, TranscriptionAdapter } from '../common/TextDisplay'
import './PlayerCard.css'

const logger = LoggerFactory.getLogger(LogCategories.UI_BOTTOM_PANEL)

interface PlayerCardProps {
  tabId: string
  data?: PlayerTabData
}

const PlayerCard: React.FC<PlayerCardProps> = ({ tabId, data }) => {
  const { updateTab } = useTabContext()
  
  // ファイル情報
  const [fileName, setFileName] = useState(data?.fileName || '未選択ファイル')
  const [filePath, setFilePath] = useState(data?.filePath || '')
  const [fileType, setFileType] = useState(data?.fileType || 'text')
  
  // 音声プレイヤー状態
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(data?.duration || 0)
  const [volume, setVolume] = useState(1.0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  
  // テキスト状態
  const [content, setContent] = useState(data?.content || '')
  const [isEditing, setIsEditing] = useState(false)
  const [isEdited, setIsEdited] = useState(false)
  
  // 文字起こし状態
  const [hasTranscriptionFile, setHasTranscriptionFile] = useState(data?.hasTranscriptionFile || false)
  const [transcriptionPath, setTranscriptionPath] = useState(data?.transcriptionPath || '')
  const [transcriptionText, setTranscriptionText] = useState('')
  const [transcriptionResult, setTranscriptionResult] = useState<any>(null)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const [transcriptionProgress, setTranscriptionProgress] = useState(0)
  
  // UI状態
  const [error, setError] = useState<string | null>(null)
  
  // 音声再生制御
  const handlePlayPause = useCallback(async () => {
    if (!audioRef.current || fileType !== 'audio') return
    
    try {
      if (isPlaying) {
        audioRef.current.pause()
        setIsPlaying(false)
        logger.info('音声一時停止', { fileName })
      } else {
        await audioRef.current.play()
        setIsPlaying(true)
        logger.info('音声再生開始', { fileName })
      }
    } catch (error) {
      logger.error('音声再生エラー', error instanceof Error ? error : new Error(String(error)), { fileName })
      setError('音声の再生に失敗しました')
    }
  }, [isPlaying, fileName, fileType])

  // シーク操作
  const handleSeek = useCallback((time: number) => {
    if (audioRef.current && fileType === 'audio') {
      audioRef.current.currentTime = time
      setCurrentTime(time)
    }
  }, [fileType])

  // 音量調整
  const handleVolumeChange = useCallback((newVolume: number) => {
    if (audioRef.current && fileType === 'audio') {
      audioRef.current.volume = newVolume
      setVolume(newVolume)
    }
  }, [fileType])

  // テキスト編集
  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value)
    setIsEdited(true)
  }, [])

  const handleEditToggle = useCallback(() => {
    setIsEditing(!isEditing)
  }, [isEditing])

  // ファイル保存
  const handleSaveFile = useCallback(async () => {
    if (!isEdited || !filePath) return
    
    try {
      setError(null)
      logger.info('ファイル保存開始', { fileName, filePath })
      
      if (window.electronAPI?.saveFile) {
        const contentBuffer = new TextEncoder().encode(content)
        await window.electronAPI.saveFile(contentBuffer.buffer, fileName)
        setIsEdited(false)
        logger.info('ファイル保存完了', { fileName, filePath })
      } else {
        logger.warn('ElectronAPI.saveFileが利用できません。保存をスキップします。')
        throw new Error('保存機能が利用できません')
      }
    } catch (error) {
      logger.error('ファイル保存エラー', error instanceof Error ? error : new Error(String(error)), { fileName, filePath })
      setError('ファイルの保存に失敗しました')
    }
  }, [content, isEdited, fileName, filePath])

  // 文字起こし開始  
  const handleStartTranscription = useCallback(async () => {
    if (fileType !== 'audio') return
    
    try {
      setIsTranscribing(true)
      setTranscriptionProgress(0)
      setTranscriptionText('')
      setError(null)
      
      logger.info('文字起こし開始', { fileName, filePath })

      if (window.electronAPI?.speechTranscribe) {
        try {
          // 音声認識サーバーの状態確認
          const serverStatus = await window.electronAPI.speechGetServerStatus()
if (!serverStatus.isRunning) {
            logger.info('サーバーが未起動、起動しています...')
            // 起動できなかった場合は main が SERVER_UNAVAILABLE を投げる
            await window.electronAPI.speechStartServer()
          }

          // 実際の文字起こし実行
          const result = await window.electronAPI.speechTranscribe(filePath)
          
          // 結果を保存（新しいTextDisplayViewer用）
          setTranscriptionResult(result)
          
          // 結果を整形（従来の表示用）
          const transcribedText = result.segments
            .map(segment => `[${Math.floor(segment.start)}s] ${segment.text}`)
            .join('\n')
          
          setTranscriptionText(transcribedText)
          setTranscriptionProgress(100)
          setIsTranscribing(false)
          
          logger.info('文字起こし完了', { 
            fileName, 
            segmentCount: result.segments.length,
            duration: result.duration 
          })
          
        } catch (transcriptionError) {
          logger.error('文字起こしAPI呼び出しエラー', 
            transcriptionError instanceof Error ? transcriptionError : new Error(String(transcriptionError)), 
            { fileName, filePath }
          )
          throw transcriptionError
        }
      } else {
        // フォールバック: モック処理
        logger.warn('ElectronAPI.speechTranscribeが利用できません。モック処理を実行します。')
        
        const progressInterval = setInterval(() => {
          setTranscriptionProgress(prev => {
            const next = prev + 10
            if (next >= 100) {
              clearInterval(progressInterval)
              setIsTranscribing(false)
              setTranscriptionText('サンプル文字起こし結果です。\n\nこのテキストは実際の音声から生成された文字起こし結果の例です。')
              logger.info('文字起こし完了（モック）', { fileName })
              return 100
            }
            return next
          })
        }, 500)
      }
      
    } catch (error) {
      logger.error('文字起こしエラー', error instanceof Error ? error : new Error(String(error)), { fileName })
      setError('文字起こしに失敗しました: ' + (error instanceof Error ? error.message : String(error)))
      setIsTranscribing(false)
      setTranscriptionProgress(0)
    }
  }, [fileName, filePath, fileType])

  // dataプロパティ変更時の状態更新（初期化時のみ）
  useEffect(() => {
    if (!data) return

    // 初期状態設定時のみ更新（無限ループ防止）
    let hasChanges = false
    
    if (data.fileName && data.fileName !== fileName) {
      setFileName(data.fileName)
      hasChanges = true
    }
    if (data.filePath && data.filePath !== filePath) {
      setFilePath(data.filePath)
      hasChanges = true
    }
    if (data.fileType && data.fileType !== fileType) {
      setFileType(data.fileType)
      hasChanges = true
    }
    
    // 音声関連の更新
    if (typeof data.duration === 'number' && data.duration !== duration) {
      setDuration(data.duration)
      hasChanges = true
    }
    
    // テキスト内容の更新（初期ロード時のみ）
    if (data.content !== undefined && data.content !== content && !isEdited) {
      setContent(data.content)
      hasChanges = true
    }
    
    // 文字起こし関連の更新
    if (typeof data.hasTranscriptionFile === 'boolean' && data.hasTranscriptionFile !== hasTranscriptionFile) {
      setHasTranscriptionFile(data.hasTranscriptionFile)
      hasChanges = true
    }
    if (data.transcriptionPath && data.transcriptionPath !== transcriptionPath) {
      setTranscriptionPath(data.transcriptionPath)
      hasChanges = true
    }
    
    if (hasChanges) {
      logger.info('PlayerCardデータ更新', { 
        fileName: data.fileName, 
        filePath: data.filePath, 
        fileType: data.fileType 
      })
    }
  }, [data?.fileName, data?.filePath, data?.fileType, data?.duration, data?.hasTranscriptionFile, data?.transcriptionPath])

  // ファイル読み込み（ファイルパス変更時のみ実行）
  useEffect(() => {
    const loadFile = async () => {
      if (!filePath) {
        setContent('')
        return
      }
      
      try {
        setError(null) // エラーリセット
        
        if (fileType === 'audio') {
          // 音声ファイルの設定
          if (audioRef.current && window.electronAPI?.loadAudioFile) {
            try {
              const audioDataUrl = await window.electronAPI.loadAudioFile(filePath)
              if (audioDataUrl) {
                audioRef.current.src = audioDataUrl
                audioRef.current.load()
                logger.info('音声ファイル読み込み完了', { fileName, filePath })
              } else {
                throw new Error('音声ファイル読み込み失敗')
              }
            } catch (audioError) {
              logger.error('音声ファイル読み込みエラー', audioError instanceof Error ? audioError : new Error(String(audioError)), { fileName, filePath })
              setError('音声ファイルの読み込みに失敗しました')
            }
          } else if (audioRef.current) {
            // フォールバック: ローカルファイルパス
            audioRef.current.src = `file://${filePath}`
            audioRef.current.load()
          }
          
          // 既存の文字起こしファイル読み込み
          if (hasTranscriptionFile && transcriptionPath) {
            logger.info('既存の文字起こしファイル読み込み開始', { fileName, transcriptionPath })
            
            if (window.electronAPI?.readFile) {
              const fileContent = await window.electronAPI.readFile(transcriptionPath)
              const contentText = new TextDecoder().decode(fileContent)
              setTranscriptionText(contentText)
              
              // 新しいシステム用: ファイル内容を解析してTranscriptionResultを生成
              try {
                const parsedContent = import('../common/TextDisplay').then(module => {
                  return module.MetadataParser.parseTranscriptionFile(contentText, transcriptionPath)
                })
                parsedContent.then(content => {
                  if (content.segments.length > 0) {
                    // 新しいシステム用のTranscriptionResultを生成
                    const legacyResult = import('../common/TextDisplay').then(module => {
                      return module.TranscriptionAdapter.convertToLegacyResult(content)
                    })
                    legacyResult.then(result => {
                      setTranscriptionResult(result)
                    })
                  }
                })
              } catch (parseError) {
                logger.warn('文字起こしファイル解析エラー（従来表示を継続）', parseError)
              }
              
              logger.info('既存の文字起こしファイル読み込み完了', { fileName, transcriptionPath })
            }
          }
        } else if (fileType === 'text' || fileType === 'transcription') {
          // テキストファイルの読み込み
          logger.info('テキストファイル読み込み開始', { fileName, filePath })
          
          if (window.electronAPI?.readFile) {
            const fileContent = await window.electronAPI.readFile(filePath)
            const contentText = new TextDecoder().decode(fileContent)
            setContent(contentText)
            logger.info('テキストファイル読み込み完了', { fileName, filePath })
          } else {
            // フォールバック: モックデータ
            const mockContent = `# ${fileName}\n\nファイルパス: ${filePath}\n\nここにファイルの内容が表示されます。`
            setContent(mockContent)
            logger.info('テキストファイル読み込み完了（モック）', { fileName, filePath })
          }
        }
      } catch (error) {
        logger.error('ファイル読み込みエラー', error instanceof Error ? error : new Error(String(error)), { fileName, filePath })
        setError('ファイルの読み込みに失敗しました')
      }
    }
    
    loadFile()
  }, [filePath, fileType]) // 依存配列を最小限に

  // 文字起こしテキストコンテンツ生成
  const generateTranscriptionContent = useCallback((): string => {
    if (!transcriptionResult) return transcriptionText
    
    return TranscriptionAdapter.generateFileContent(
      transcriptionResult,
      fileName,
      'kotoba-whisper'
    )
  }, [transcriptionResult, transcriptionText, fileName])
  
  // 文字起こし結果保存
  const handleSaveTranscription = useCallback(async (content: string): Promise<boolean> => {
    try {
      if (!fileName) return false
      
      const baseName = fileName.replace(/\.[^/.]+$/, '')
      const transcriptionFileName = `${baseName}_transcription.txt`
      
      const success = await window.electronAPI.saveTextFile(transcriptionFileName, content)
      
      if (success) {
        logger.info('文字起こし結果保存完了', { fileName, transcriptionFileName })
        setTranscriptionPath(transcriptionFileName)
        setHasTranscriptionFile(true)
      }
      
      return success
    } catch (error) {
      logger.error('文字起こし保存エラー', error instanceof Error ? error : new Error(String(error)))
      return false
    }
  }, [fileName])
  
  // 文字起こしコンテンツ変更
  const handleTranscriptionContentChange = useCallback((newContent: string) => {
    setTranscriptionText(newContent)
  }, [])

  // 音声イベントハンドラー
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || fileType !== 'audio') return

    const handleLoadedMetadata = () => {
      setDuration(audio.duration)
      logger.info('音声メタデータ読み込み完了', { fileName, duration: audio.duration })
    }

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime)
    }

    const handleEnded = () => {
      setIsPlaying(false)
      logger.info('音声再生完了', { fileName })
    }

    const handleError = () => {
      setError('音声ファイルの読み込みに失敗しました')
      logger.error('音声ファイル読み込みエラー', undefined, { fileName, filePath })
    }

    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('error', handleError)

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('error', handleError)
    }
  }, [fileName, filePath, fileType])

  // タブ状態更新（データ更新を制限して無限ループを防止）
  useEffect(() => {
    const status = isTranscribing 
      ? TabStatus.TRANSCRIBING
      : isPlaying 
        ? TabStatus.PLAYING
        : isEditing
          ? TabStatus.EDITING
          : error
            ? TabStatus.ERROR
            : TabStatus.IDLE

    updateTab(tabId, { 
      status,
      data: { 
        fileName,
        filePath,
        fileType,
        duration,
        isPlaying, 
        currentTime, 
        volume, 
        content, 
        isEdited,
        transcriptionText,
        hasTranscriptionFile,
        transcriptionPath
      }
    })
  }, [isPlaying, isTranscribing, isEditing, error, tabId, updateTab, fileName, filePath, fileType, duration, currentTime, volume, content, isEdited, transcriptionText, hasTranscriptionFile, transcriptionPath])

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="player-card" data-testid="player-card">
      {/* ファイル情報ヘッダー */}
      <div className="file-header">
        <div className="file-info">
          <div className="file-name" data-testid="selected-file-name">
            {fileType === 'audio' ? '🎵' : '📝'} {fileName}
          </div>
          <div className="file-type" data-testid="selected-file-info">{fileType === 'audio' ? '音声ファイル' : 'テキストファイル'}</div>
        </div>
        
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="message error">
          <span className="message-icon">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* 音声プレイヤー */}
      {fileType === 'audio' && (
        <div className="audio-player" data-testid="audio-player">
          <audio ref={audioRef} style={{ display: 'none' }} />
          
          <div className="playback-controls">
            <button className="play-button" onClick={handlePlayPause} data-testid="play-button">
              {isPlaying ? '⏸️' : '▶️'}
            </button>
            
            <div className="time-display">
              <span data-testid="audio-current-time">{formatTime(currentTime)}</span> / <span data-testid="audio-duration">{formatTime(duration)}</span>
            </div>
            
            <input
              type="range"
              className="seek-bar"
              min={0}
              max={duration}
              value={currentTime}
              onChange={(e) => handleSeek(Number(e.target.value))}
              data-testid="audio-seek-bar"
            />
            
            <div className="volume-control" data-testid="volume-control">
              <span>🔊</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={volume}
                onChange={(e) => handleVolumeChange(Number(e.target.value))}
                data-testid="volume-slider"
              />
              <span className="volume-value">{Math.round(volume * 100)}%</span>
            </div>
          </div>

          {/* 文字起こし機能 */}
          <div className="transcription-section">
            <div className="transcription-header">
              <h3>文字起こし</h3>
              {!isTranscribing && !transcriptionText && (
                <button className="transcribe-button" onClick={handleStartTranscription} data-testid="transcribe-button">
                  文字起こし開始
                </button>
              )}
            </div>

            {isTranscribing && (
              <div className="transcription-progress" data-testid="transcription-progress">
                <div className="progress-bar" data-testid="transcription-progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${transcriptionProgress}%` }}
                  ></div>
                </div>
                <span data-testid="progress-percentage">{transcriptionProgress}%</span>
              </div>
            )}

            {(transcriptionText || transcriptionResult) && (
              <div className="transcription-result" data-testid="transcription-result">
                <TextDisplayViewer
                  content={generateTranscriptionContent()}
                  filePath={`${fileName.replace(/\.[^/.]+$/, '')}_transcription.txt`}
                  onContentChange={handleTranscriptionContentChange}
                  onSave={handleSaveTranscription}
                  forceFileType="transcription"
                  showLineNumbers={true}
                  showMetadata={true}
                  initialMode="view"
                  className="transcription-display"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* テキストエディター */}
      {(fileType === 'text' || fileType === 'transcription') && content && (
        <div className="text-editor-section">
          <div className="text-content">
            <TextDisplayViewer
              content={content}
              filePath={filePath}
              onContentChange={setContent}
              onSave={async (newContent) => {
                try {
                  if (window.electronAPI?.saveTextFile) {
                    const success = await window.electronAPI.saveTextFile(filePath, newContent)
                    if (success) {
                      setIsEdited(false)
                      logger.info('テキストファイル保存完了', { fileName, filePath })
                    }
                    return success
                  }
                  return false
                } catch (error) {
                  logger.error('テキストファイル保存エラー', error instanceof Error ? error : new Error(String(error)))
                  return false
                }
              }}
              showLineNumbers={true}
              showMetadata={true}
              initialMode="view"
              className="text-display"
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default PlayerCard