import React, { useState, useCallback, useEffect } from 'react'
import { useAppContext, AudioFile } from '../../App'

// 時間フォーマット関数
const formatDuration = (seconds: number): string => {
  if (seconds === 0) return '--:--'
  
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.floor(seconds % 60)
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
}

/**
 * 左パネル - ファイルエクスプローラー
 * 録音ファイルの一覧表示と管理機能を提供
 */
const LeftPanel: React.FC = () => {
  const { selectedFile, setSelectedFile, setTranscriptionDisplayData, fileList, setFileList, recordingFile } = useAppContext()
  const [selectedFolder, setSelectedFolder] = useState<string>('')
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
  const [loadedTranscriptions, setLoadedTranscriptions] = useState<Map<string, any>>(new Map())

  // ファイル一覧を読み込む
  const loadFileList = useCallback(async (folderPath: string) => {
    try {
      const files = await window.electronAPI.getFileList(folderPath)
      
      // 各音声ファイルに対して文字起こしファイルの存在をチェック
      const extendedFiles: AudioFile[] = await Promise.all(
        files.map(async (file) => {
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
            
            const result = {
              ...file,
              hasTranscriptionFile,
              transcriptionPath,
              isRecording: isCurrentlyRecording || false
            }
            console.log(`📁 ファイル処理結果 (${file.filename}):`, {
              hasTranscriptionFile,
              transcriptionPath,
              duration: file.duration,
              format: file.format,
              isRecording: result.isRecording,
              recordingFileId: recordingFile?.id,
              recordingFilename: recordingFile?.filename,
              fileId: file.id,
              filepath: file.filepath
            })
            return result
          } catch (error) {
            console.error(`文字起こしファイル確認エラー (${file.filename}):`, error)
            return {
              ...file,
              hasTranscriptionFile: false,
              transcriptionPath: undefined,
              isRecording: false // エラー時は録音中ではない
            }
          }
        })
      )
      
      setFileList(extendedFiles)
      console.log('ファイル一覧取得完了:', extendedFiles.length, '件')
      console.log('文字起こしファイル付き:', extendedFiles.filter(f => f.hasTranscriptionFile).length, '件')
      console.log('ファイル一覧の詳細:', extendedFiles.map(f => ({
        filename: f.filename,
        hasTranscriptionFile: f.hasTranscriptionFile,
        duration: f.duration,
        format: f.format
      })))
    } catch (error) {
      console.error('ファイル一覧取得エラー:', error)
      setFileList([])
    }
  }, [setFileList, recordingFile])

  // デフォルトフォルダパスを取得
  const getDefaultFolder = useCallback(async () => {
    try {
      // メインプロセスからデスクトップパスを取得
      const settings = await window.electronAPI.loadSettings()
      return settings.saveFolder || 'デフォルトフォルダ'
    } catch (error) {
      console.error('デフォルトフォルダ取得エラー:', error)
      return ''
    }
  }, [])

  // 初期化時にデフォルトフォルダをチェック
  useEffect(() => {
    const initializeFileList = async () => {
      // 既にフォルダが選択されている場合は初期化をスキップ
      if (selectedFolder) {
        console.log('LeftPanel初期化：既にフォルダが選択されているためスキップ:', selectedFolder)
        return
      }
      
      console.log('LeftPanel初期化：デフォルトフォルダをチェック中...')
      
      try {
        const defaultFolder = await getDefaultFolder()
        if (defaultFolder) {
          console.log('デフォルトフォルダ:', defaultFolder)
          setSelectedFolder(defaultFolder)
          await loadFileList(defaultFolder)
        }
      } catch (error) {
        console.error('初期化エラー:', error)
      }
    }
    
    initializeFileList()
  }, [getDefaultFolder, loadFileList, selectedFolder])

  // ファイル保存イベントを監視して自動更新
  useEffect(() => {
    const handleFileSaved = (data: { filePath: string; filename: string; folder: string }) => {
      console.log('📂 ファイル保存通知受信:', data)
      console.log('📂 現在の録音中ファイル:', recordingFile ? {
        id: recordingFile.id,
        filename: recordingFile.filename,
        isRecording: recordingFile.isRecording
      } : 'なし')
      
      // 録音中の場合は、すべてのファイル保存イベントを無視
      if (recordingFile && recordingFile.isRecording) {
        console.log('📂 録音中のため、すべてのファイル保存イベントを無視:', data.filename)
        return
      }
      
      // 録音完了直後の最終保存ファイルかをチェック
      const isRecordingCompletionFile = data.filename.startsWith('recording_') && 
        data.filename.endsWith('.webm') && 
        !recordingFile  // recordingFileがnullの場合（録音完了後）
      
      if (isRecordingCompletionFile) {
        console.log('📂 録音完了後の最終ファイル保存を検出、ファイル一覧を更新:', data.filename)
      } else {
        console.log('📂 通常のファイル保存、ファイル一覧を更新:', data.filename)
      }
      
      // 現在のフォルダと保存フォルダが同じ場合、ファイル一覧を更新
      if (selectedFolder === data.folder) {
        // 録音完了時は遅延を入れてファイルシステムの更新を待つ
        setTimeout(() => {
          loadFileList(data.folder)
        }, 500)
      } else if (!selectedFolder) {
        // フォルダが未選択の場合、自動的に保存フォルダを選択
        setSelectedFolder(data.folder)
        setTimeout(() => {
          loadFileList(data.folder)
        }, 500)
      }
    }

    // イベントリスナー登録
    window.electronAPI.onFileSaved(handleFileSaved)

    // クリーンアップ
    return () => {
      window.electronAPI.removeAllListeners('file:saved')
    }
  }, [selectedFolder, loadFileList, recordingFile])

  // 再文字起こし時のキャッシュクリアイベントリスナー
  useEffect(() => {
    const handleTranscriptionRefresh = (event: any) => {
      const { audioFilePath } = event.detail;
      console.log('LeftPanel: 文字起こしリフレッシュイベント受信:', audioFilePath);
      
      // 該当するファイルのキャッシュをクリア
      const targetFile = fileList.find(file => file.filepath === audioFilePath);
      if (targetFile) {
        setLoadedTranscriptions(prev => {
          const newMap = new Map(prev);
          newMap.delete(targetFile.id);
          console.log(`文字起こしキャッシュをクリア: ${targetFile.filename}`);
          return newMap;
        });
        
        // 展開状態もリセット（必要に応じて）
        setExpandedFiles(prev => {
          const newSet = new Set(prev);
          newSet.delete(targetFile.id);
          return newSet;
        });
      }
    };

    window.addEventListener('transcriptionRefresh', handleTranscriptionRefresh);
    
    return () => {
      window.removeEventListener('transcriptionRefresh', handleTranscriptionRefresh);
    };
  }, [fileList]);

  // フォルダ選択ハンドラー
  const handleSelectFolder = useCallback(async () => {
    try {
      const folderPath = await window.electronAPI.selectFolder()
      if (folderPath) {
        setSelectedFolder(folderPath)
        loadFileList(folderPath)
      }
    } catch (error) {
      console.error('フォルダ選択エラー:', error)
    }
  }, [loadFileList])

  // ファイル選択ハンドラー
  const handleFileSelect = useCallback(async (fileId: string) => {
    setSelectedFileId(fileId)
    
    // グローバル状態を更新（AudioPlayerで使用）
    const selectedFileData = fileList.find(file => file.id === fileId)
    if (selectedFileData) {
      setSelectedFile(selectedFileData)
      console.log('ファイル選択:', selectedFileData.filename)
      
      // .rt.txt ファイルの場合、右パネルに内容を表示
      if (selectedFileData.format === 'rt.txt') {
        try {
          console.log('リアルタイム文字起こしファイル読み込み:', selectedFileData.filepath)
          const fileContent = await window.electronAPI.readFile(selectedFileData.filepath)
          const contentText = new TextDecoder().decode(fileContent)
          
          // rt.txtファイルの内容を解析してセグメントに分割
          const parseRealtimeTranscriptionFile = (content: string) => {
            const segments = [];
            const lines = content.split('\n');
            let currentSegment = '';
            let segmentIndex = 0;
            
            for (const line of lines) {
              // タイムスタンプ付きの行を検出 [時間s-時間s]
              const timeMatch = line.match(/\[(\d+)s-(\d+)s\]\s*(.+)/);
              if (timeMatch) {
                const start = parseInt(timeMatch[1]);
                const end = parseInt(timeMatch[2]);
                const text = timeMatch[3];
                
                if (text.trim()) {
                  segments.push({
                    start,
                    end,
                    text: text.trim(),
                    speaker: undefined
                  });
                }
              } else if (line.includes('## 本文')) {
                // 本文セクションの開始
                continue;
              } else if (line.trim() && !line.startsWith('#') && !line.includes('status:') && !line.includes('processed_chunks:')) {
                // 通常のテキスト行
                currentSegment += line + ' ';
              }
            }
            
            // 構造化されたセグメントがない場合は、本文部分を1つのセグメントとして追加
            if (segments.length === 0 && currentSegment.trim()) {
              segments.push({
                start: 0,
                end: 0,
                text: currentSegment.trim(),
                speaker: undefined
              });
            }
            
            return segments;
          };
          
          const parsedSegments = parseRealtimeTranscriptionFile(contentText);
          
          const realtimeTranscriptionData = {
            metadata: {
              audioFile: selectedFileData.filename,
              model: 'リアルタイム文字起こし',
              transcribedAt: selectedFileData.createdAt.toISOString(),
              duration: 0,
              segmentCount: parsedSegments.length,
              language: 'ja',
              speakers: [],
              coverage: 100
            },
            segments: parsedSegments,
            filePath: selectedFileData.filepath,
            isModified: false
          }
          
          setTranscriptionDisplayData(realtimeTranscriptionData)
          console.log('リアルタイム文字起こし表示完了')
        } catch (error) {
          console.error('リアルタイム文字起こしファイル読み込みエラー:', error)
        }
      } else {
        // 通常の音声ファイルの場合、対応する文字起こしファイルをロード
        if (selectedFileData.hasTranscriptionFile && selectedFileData.transcriptionPath) {
          try {
            console.log('文字起こしファイルをロード:', selectedFileData.transcriptionPath)
            const transcriptionData = await window.electronAPI.loadTranscriptionFile(selectedFileData.transcriptionPath)
            setTranscriptionDisplayData(transcriptionData)
            console.log('文字起こしファイルロード完了')
          } catch (error) {
            console.error('文字起こしファイルロードエラー:', error)
            setTranscriptionDisplayData(null)
          }
        } else {
          // 文字起こしファイルがない場合はクリア
          setTranscriptionDisplayData(null)
          console.log('文字起こしファイルなし、transcriptionDisplayDataをクリア')
        }
      }
    }
  }, [fileList, setSelectedFile, setTranscriptionDisplayData])

  // ファイル削除ハンドラー
  const handleFileDelete = useCallback(async (filepath: string) => {
    try {
      const success = await window.electronAPI.deleteFile(filepath)
      if (success && selectedFolder) {
        // ファイル一覧を再取得
        loadFileList(selectedFolder)
        // 削除したファイルが選択されていた場合、選択解除
        if (selectedFile?.filepath === filepath) {
          setSelectedFile(null)
          setSelectedFileId(null)
        }
      }
    } catch (error) {
      console.error('ファイル削除エラー:', error)
    }
  }, [selectedFolder, selectedFile, loadFileList])

  // 文字起こしファイルの展開/折りたたみ
  const toggleTranscriptionExpand = useCallback(async (fileId: string, transcriptionPath: string) => {
    const newExpandedFiles = new Set(expandedFiles)
    
    if (expandedFiles.has(fileId)) {
      // 折りたたみ
      newExpandedFiles.delete(fileId)
      setExpandedFiles(newExpandedFiles)
    } else {
      // 展開 - 文字起こしファイルを読み込み
      try {
        // 常に最新のデータを読み込む（キャッシュを使わない）
        console.log(`文字起こしファイル読み込み中: ${transcriptionPath}`)
        const transcriptionFile = await window.electronAPI.loadTranscriptionFile(transcriptionPath)
        setLoadedTranscriptions(prev => new Map(prev).set(fileId, transcriptionFile))
        console.log(`文字起こしファイル読み込み完了: ${fileId}`)
        
        newExpandedFiles.add(fileId)
        setExpandedFiles(newExpandedFiles)
      } catch (error) {
        console.error('文字起こしファイル読み込みエラー:', error)
        alert('文字起こしファイルの読み込みに失敗しました')
      }
    }
  }, [expandedFiles])

  // 文字起こしファイルのクリック処理
  const handleTranscriptionClick = useCallback(async (fileId: string) => {
    try {
      const file = fileList.find(f => f.id === fileId);
      if (!file || !file.transcriptionPath) {
        console.error('文字起こしファイルパスが見つかりません');
        return;
      }

      // 常に最新のデータを読み込む（再文字起こし対応のため）
      console.log(`文字起こしファイル読み込み中: ${file.transcriptionPath}`);
      const transcription = await window.electronAPI.loadTranscriptionFile(file.transcriptionPath);
      setLoadedTranscriptions(prev => new Map(prev).set(fileId, transcription));
      console.log(`文字起こしファイル読み込み完了: ${fileId}`);

      // 文字起こし結果を右パネルに表示する処理
      console.log('文字起こし結果表示:', transcription);
      
      // selectedFileも対応する音声ファイルに設定
      setSelectedFile(file);
      setSelectedFileId(fileId);
      
      // グローバル状態に文字起こし結果を設定
      setTranscriptionDisplayData(transcription);
    } catch (error) {
      console.error('文字起こしファイル読み込みエラー:', error);
      alert('文字起こしファイルの読み込みに失敗しました');
    }
  }, [fileList, loadedTranscriptions, setTranscriptionDisplayData, setSelectedFile])

  return (
    <div className="left-panel">
      <div className="left-panel__header">
        <div className="left-panel__title">ファイルエクスプローラー</div>
      </div>
      
      <div className="left-panel__content">
        {/* フォルダ選択ボタン */}
        <div className="p-sm">
          <button 
            className="btn btn--primary w-full"
            onClick={handleSelectFolder}
          >
            📁 保存フォルダを選択
          </button>
        </div>

        {/* 選択フォルダ表示 */}
        {selectedFolder && (
          <div className="p-sm">
            <div className="text-secondary" style={{ fontSize: '11px' }}>
              選択フォルダ:
            </div>
            <div className="text-primary" style={{ fontSize: '12px', wordBreak: 'break-all' }}>
              {selectedFolder}
            </div>
          </div>
        )}

        {/* ファイル一覧 */}
        <div className="file-tree">
          {fileList.length === 0 ? (
            <div className="p-sm text-secondary" style={{ fontSize: '12px' }}>
              {selectedFolder ? '音声ファイルがありません' : 'フォルダを選択してください'}
            </div>
          ) : (
            fileList.map((file) => (
              <div key={file.id}>
                {/* 音声ファイル */}
                <div
                  className={`file-tree__item ${selectedFileId === file.id ? 'file-tree__item--active' : ''}`}
                  onClick={() => handleFileSelect(file.id)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    // 録音中のファイルは削除できない
                    if (recordingFile && file.id === recordingFile.id) {
                      alert('録音中のファイルは削除できません。')
                      return
                    }
                    if (window.confirm(`"${file.filename}" を削除しますか？`)) {
                      handleFileDelete(file.filepath)
                    }
                  }}
                  style={{
                    opacity: (recordingFile && file.id === recordingFile.id) ? 0.7 : 1,
                    border: (recordingFile && file.id === recordingFile.id) ? '1px dashed var(--color-warning)' : 'none'
                  }}
                >
                  <span className="file-tree__icon">
                    {(recordingFile && file.id === recordingFile.id) ? '🔴' : 
                     file.format === 'rt.txt' ? '📝' : 
                     file.format === 'webm' ? '🎬' : 
                     file.format === 'wav' ? '🎵' : '🎶'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap',
                        flex: 1,
                        minWidth: 0
                      }}>
                        {file.filename}
                        {(recordingFile && file.id === recordingFile.id) && <span style={{ color: 'var(--color-warning)', marginLeft: '4px' }}>録音中</span>}
                      </span>
                      <span style={{ 
                        fontSize: '9px', 
                        padding: '1px 4px', 
                        backgroundColor: file.format === 'rt.txt' ? '#9C27B0' : 
                                       file.format === 'webm' ? '#4CAF50' : 
                                       file.format === 'wav' ? '#2196F3' : '#FF9800',
                        color: 'white',
                        borderRadius: '2px',
                        textTransform: 'uppercase',
                        flexShrink: 0
                      }}>
                        {file.format === 'rt.txt' ? 'RT' : file.format}
                      </span>
                    </div>
                    {/* 文字起こし済みバッジを下の行に移動 */}
                    <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span>{new Date(file.createdAt).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                        {file.hasTranscriptionFile === true && (
                          <span style={{ 
                            fontSize: '8px', 
                            padding: '1px 3px', 
                            backgroundColor: '#FF5722',
                            color: 'white',
                            borderRadius: '2px'
                          }}>
                            📝済
                          </span>
                        )}
                      </div>
                      <span style={{ fontWeight: 'bold', color: 'var(--color-text)' }}>
                        {file.format === 'rt.txt' ? 'リアルタイム' : (file.duration ? formatDuration(file.duration) : '--:--')}
                      </span>
                    </div>
                  </div>
                  
                  {/* 展開/折りたたみボタン（.rt.txtファイルは除外） */}
                  {file.hasTranscriptionFile === true && file.format !== 'rt.txt' && (
                    <span 
                      style={{ 
                        cursor: 'pointer', 
                        padding: '4px 8px',
                        fontSize: '12px',
                        color: 'var(--color-accent)',
                        flexShrink: 0,
                        marginLeft: '4px'
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleTranscriptionExpand(file.id, file.transcriptionPath!)
                      }}
                    >
                      {expandedFiles.has(file.id) ? '▼' : '▶'}
                    </span>
                  )}
                </div>

                {/* 文字起こしファイル（展開時） */}
                {file.hasTranscriptionFile === true && expandedFiles.has(file.id) && (
                  <div 
                    style={{ 
                      marginLeft: '20px',
                      borderLeft: '2px solid var(--color-border)',
                      paddingLeft: '8px'
                    }}
                  >
                    <div
                      className="file-tree__item"
                      style={{ 
                        fontSize: '11px',
                        backgroundColor: 'var(--color-bg-tertiary)',
                        borderRadius: '3px',
                        margin: '2px 0'
                      }}
                      onClick={() => handleTranscriptionClick(file.id)}
                    >
                      <span className="file-tree__icon">📝</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: 'var(--color-text-primary)' }}>
                          {file.filename.replace(/\.(webm|wav|mp3)$/, '.trans.txt')}
                        </div>
                        {loadedTranscriptions.has(file.id) && (
                          <div style={{ fontSize: '9px', color: 'var(--color-text-secondary)' }}>
                            モデル: {loadedTranscriptions.get(file.id).metadata.model} | 
                            カバレッジ: {loadedTranscriptions.get(file.id).metadata.coverage.toFixed(1)}%
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default LeftPanel