import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useAppContext } from '../../App'
import { FileBasedRealtimeProcessor } from '../../services/FileBasedRealtimeProcessor'
import { MicrophoneMonitor, MicrophoneStatus, MicrophoneAlert } from '../../services/MicrophoneMonitor' 
/**
 * 下部パネル - コントロールパネル
 * 録音・再生・文字起こし等の主要操作を提供
 */
const BottomPanel: React.FC = () => {
  // ファイルリストを更新するための関数を取得
  const { setFileList, setIsRecording: setGlobalIsRecording, setRecordingFile, setSelectedFile } = useAppContext()
  // 録音関連状態
  const [isRecording, setIsRecording] = useState<boolean>(false)
  const [isPaused, setIsPaused] = useState<boolean>(false)
  const [recordingTime, setRecordingTime] = useState<number>(0)
  
  // デバイス関連状態
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDevice, setSelectedDevice] = useState<string>('')
  const [inputType, setInputType] = useState<'microphone' | 'desktop' | 'stereo-mix'>('microphone')
  
  // デスクトップキャプチャ関連状態
  const [desktopSources, setDesktopSources] = useState<any[]>([])
  const [selectedDesktopSource, setSelectedDesktopSource] = useState<string>('')
  
  // ステレオミックス関連状態
  const [systemAudioDevices, setSystemAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedSystemDevice, setSelectedSystemDevice] = useState<string>('')
  
  // ファイルベースリアルタイム文字起こし状態
  const [isRealtimeTranscribing, setIsRealtimeTranscribing] = useState<boolean>(false)
  
  // マイク監視状態
  const [micStatus, setMicStatus] = useState<MicrophoneStatus | null>(null)
  const [micAlerts, setMicAlerts] = useState<MicrophoneAlert[]>([])
  
  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null)
  const recordingStartTimeRef = useRef<number>(0)
  const pausedTimeRef = useRef<number>(0) // 一時停止時間の累計
  const realtimeProcessorRef = useRef<FileBasedRealtimeProcessor | null>(null)
  const micMonitorRef = useRef<MicrophoneMonitor | null>(null)
  
  // WebMヘッダー作成関数
  const createWebMHeader = useCallback((clusterData: ArrayBuffer): ArrayBuffer => {
    try {
      // 固定のWebMヘッダー（EBML + Segment + Info + Tracks構造）
      const webmHeader = new Uint8Array([
        0x1A, 0x45, 0xDF, 0xA3, 0x9F, 0x42, 0x86, 0x81, 0x01, 0x42, 0xF7, 0x81, 0x01,
        0x42, 0xF2, 0x81, 0x04, 0x42, 0xF3, 0x81, 0x08, 0x42, 0x82, 0x84, 0x77, 0x65,
        0x62, 0x6D, 0x42, 0x87, 0x81, 0x04, 0x42, 0x85, 0x81, 0x02, 0x18, 0x53, 0x80,
        0x67, 0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x15, 0x49, 0xA9, 0x66,
        0x8E, 0x2A, 0xD7, 0xB1, 0x83, 0x0F, 0x42, 0x40, 0x4D, 0x80, 0x84, 0x77, 0x65,
        0x62, 0x6D, 0x57, 0x41, 0x84, 0x77, 0x65, 0x62, 0x6D, 0x16, 0x54, 0xAE, 0x6B,
        0xA7, 0xAE, 0xA0, 0xD7, 0x81, 0x01, 0x73, 0xC5, 0x88, 0x01, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x01, 0x83, 0x81, 0x02, 0x86, 0x86, 0x41, 0x5F, 0x4F, 0x50,
        0x55, 0x53, 0xE1, 0x87, 0xB5, 0x84, 0x47, 0x70, 0x00, 0x00, 0x9F, 0x81, 0x02
      ])
      
      // Cluster header with data
      const clusterHeaderSize = clusterData.byteLength + 8 // +8 for timecode
      let clusterSizeBytes: Uint8Array
      
      // VINT encoding for cluster size
      if (clusterHeaderSize < 0x7F) {
        clusterSizeBytes = new Uint8Array([0x80 | clusterHeaderSize])
      } else if (clusterHeaderSize < 0x3FFF) {
        clusterSizeBytes = new Uint8Array([
          0x40 | (clusterHeaderSize >> 8),
          clusterHeaderSize & 0xFF
        ])
      } else if (clusterHeaderSize < 0x1FFFFF) {
        clusterSizeBytes = new Uint8Array([
          0x20 | (clusterHeaderSize >> 16),
          (clusterHeaderSize >> 8) & 0xFF,
          clusterHeaderSize & 0xFF
        ])
      } else {
        // Use unknown length for large clusters
        clusterSizeBytes = new Uint8Array([0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF])
      }
      
      const clusterHeader = new Uint8Array([
        0x1F, 0x43, 0xB6, 0x75, // Cluster
        ...clusterSizeBytes,
        0xE7, 0x81, 0x00 // Timecode = 0
      ])
      
      // Combine all parts
      const totalSize = webmHeader.length + clusterHeader.length + clusterData.byteLength
      const result = new ArrayBuffer(totalSize)
      const resultView = new Uint8Array(result)
      
      let offset = 0
      resultView.set(webmHeader, offset)
      offset += webmHeader.length
      
      resultView.set(clusterHeader, offset)
      offset += clusterHeader.length
      
      resultView.set(new Uint8Array(clusterData), offset)
      
      console.log(`WebMヘッダー作成完了: ${totalSize} bytes (ヘッダー: ${webmHeader.length + clusterHeader.length}, データ: ${clusterData.byteLength})`)
      
      return result
    } catch (error) {
      console.error('WebMヘッダー作成エラー:', error)
      throw error
    }
  }, [])
  
  // HTMLAudioElementを使って正確なdurationを取得する関数
  const getAccurateDuration = (blob: Blob): Promise<number> => {
    return new Promise((resolve, reject) => {
      const audio = new Audio()
      const url = URL.createObjectURL(blob)
      
      const cleanup = () => {
        URL.revokeObjectURL(url)
        audio.remove()
      }

      audio.src = url
      audio.addEventListener('loadedmetadata', () => {
        const duration = audio.duration
        if (isFinite(duration)) {
          cleanup()
          resolve(duration)
        } else {
          // durationがInfinityの場合のフォールバック処理
          audio.currentTime = 1e101 // 末尾にシークして強制的に読み込ませる
          const onTimeUpdate = () => {
            audio.removeEventListener('timeupdate', onTimeUpdate)
            cleanup()
            resolve(audio.duration)
          }
          audio.addEventListener('timeupdate', onTimeUpdate)
        }
      })
      audio.onerror = (e) => {
        cleanup()
        reject(new Error('音声メタデータの読み込みに失敗しました'))
      }
    })
  }
  
  // デバイス一覧を取得
  useEffect(() => {
    const getDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const audioInputs = devices.filter(device => device.kind === 'audioinput')
        setAvailableDevices(audioInputs)
        
        // システム音声デバイスを分離して取得
        const systemDevices = audioInputs.filter(device => 
          device.label.toLowerCase().includes('stereo mix') ||
          device.label.toLowerCase().includes('what you hear') ||
          device.label.toLowerCase().includes('system audio') ||
          device.label.toLowerCase().includes('ステレオミックス')
        )
        setSystemAudioDevices(systemDevices)
        
        if (audioInputs.length > 0 && !selectedDevice) {
          setSelectedDevice(audioInputs[0].deviceId)
        }
        
        if (systemDevices.length > 0 && !selectedSystemDevice) {
          setSelectedSystemDevice(systemDevices[0].deviceId)
        }
      } catch (error) {
        console.error('デバイス取得エラー:', error)
      }
    }
    getDevices()
  }, [selectedDevice, selectedSystemDevice])
  
  // デスクトップキャプチャソース一覧を取得
  useEffect(() => {
    if (inputType === 'desktop') {
      const getDesktopSources = async () => {
        try {
          const sources = await window.electronAPI.getDesktopSources()
          setDesktopSources(sources)
          
          // デフォルトで最初のスクリーンを選択
          const screenSource = sources.find(source => source.name.includes('Screen') || source.name.includes('screen'))
          if (screenSource && !selectedDesktopSource) {
            setSelectedDesktopSource(screenSource.id)
          }
        } catch (error) {
          console.error('デスクトップソース取得エラー:', error)
        }
      }
      getDesktopSources()
    }
  }, [inputType, selectedDesktopSource])
  
  // ファイルベースリアルタイム文字起こしシステム初期化
  useEffect(() => {
    // プロセッサーを初期化
    realtimeProcessorRef.current = new FileBasedRealtimeProcessor({
      fileCheckInterval: 1000,
      maxRetryCount: 1,
      processingTimeout: 180000,
      enableAutoRetry: true,
      textWriteInterval: 3000,
      enableAutoSave: true,
      textFormat: 'detailed'
    })
    
    // エラーコールバック
    realtimeProcessorRef.current.onError((error) => {
      console.error('リアルタイム文字起こしエラー:', error)
    })
    
    return () => {
      // クリーンアップ
      if (realtimeProcessorRef.current) {
        realtimeProcessorRef.current.cleanup()
      }
    }
  }, [])
  
  // 録音時間を更新（display:noneでも動作するように修正）
  useEffect(() => {
    if (isRecording && !isPaused) {
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
    } else {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
        recordingTimerRef.current = null
      }
    }
    
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
        recordingTimerRef.current = null
      }
    }
  }, [isRecording, isPaused])
  
  // 時間をフォーマット
  const formatTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }, [])

  // コンポーネントアンマウント時のクリーンアップ
  // 入力タイプが変更された際のクリーンアップ
  useEffect(() => {
    // 入力タイプが変更された場合、既存のマイクモニタリングを停止
    if (inputType !== 'microphone' && micMonitorRef.current) {
      console.log('🎤 入力タイプ変更によりマイクモニタリングを停止:', inputType)
      try {
        micMonitorRef.current.stopMonitoring()
        micMonitorRef.current = null
        setMicStatus(null)
        setMicAlerts([])
      } catch (error) {
        console.error('マイクモニタリング停止エラー:', error)
      }
    }
  }, [inputType])

  // コンポーネントアンマウント時のクリーンアップ
  useEffect(() => {
    return () => {
      // マイク監視のクリーンアップ
      if (micMonitorRef.current) {
        micMonitorRef.current.cleanup()
        micMonitorRef.current = null
      }
      
      // ファイルベースリアルタイム処理のクリーンアップ
      if (realtimeProcessorRef.current) {
        realtimeProcessorRef.current.cleanup()
        realtimeProcessorRef.current = null
      }
    }
  }, [])

  
  // 録音開始ハンドラー
  const handleStartRecordingWithTranscription = useCallback(async () => {
    await startRecording(true);
  }, [inputType, selectedDevice, selectedDesktopSource, selectedSystemDevice]);

  const handleStartRecordingOnly = useCallback(async () => {
    await startRecording(false);
  }, [inputType, selectedDevice, selectedDesktopSource, selectedSystemDevice]);

  // 録音状態リセット共通関数
  const resetRecordingState = useCallback(() => {
    setIsRecording(false)
    setGlobalIsRecording(false)
    setIsPaused(false)
    setRecordingTime(0)
  }, [setGlobalIsRecording]);

  // 録音処理の共通関数
  const startRecording = useCallback(async (enableTranscription: boolean) => {
    try {
      let stream: MediaStream
      
      if (inputType === 'desktop') {
        if (!selectedDesktopSource) {
          throw new Error('デスクトップソースが選択されていません');
        }
        
        try {
          // まず音声のみでキャプチャを試行
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: selectedDesktopSource,
                // マイク音声を除外するための設定
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                suppressLocalAudioPlayback: true,  // ローカル音声再生を抑制
                googAudioMirroring: false,  // 音声ミラーリングを無効
                googAutoGainControl: false,
                googAutoGainControl2: false,
                googEchoCancellation: false,
                googNoiseSuppression: false,
                googTypingNoiseDetection: false,
                // 追加の音声分離設定
                systemAudioSource: 'system',  // システム音声のみ
                microphoneCapture: false,  // マイク音声を明示的に無効化
                systemAudioPreferredSampleRate: 48000,
                isolateSystemAudio: true  // システム音声を分離
              } as any,
              video: false // 音声のみ
            });
          } catch (audioOnlyError) {
            
            // 音声のみでキャプチャできない場合、映像も含めて取得
            stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: selectedDesktopSource,
                // マイク音声を除外するための設定
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
                suppressLocalAudioPlayback: true,  // ローカル音声再生を抑制
                googAudioMirroring: false,  // 音声ミラーリングを無効
                googAutoGainControl: false,
                googAutoGainControl2: false,
                googEchoCancellation: false,
                googNoiseSuppression: false,
                googTypingNoiseDetection: false,
                // 追加の音声分離設定
                systemAudioSource: 'system',  // システム音声のみ
                microphoneCapture: false,  // マイク音声を明示的に無効化
                systemAudioPreferredSampleRate: 48000,
                isolateSystemAudio: true  // システム音声を分離
              } as any,
              video: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: selectedDesktopSource,
                minWidth: 640,   // 最小限のサイズに縮小
                maxWidth: 1280,
                minHeight: 360,
                maxHeight: 720
              } as any
            });
          }
          
          // 音声トラックをチェック
          const audioTracks = stream.getAudioTracks();
          if (audioTracks.length === 0) {
            throw new Error('デスクトップからの音声トラックが取得できませんでした');
          }
          
          // 映像トラックを停止（音声のみ必要）
          const videoTracks = stream.getVideoTracks();
          if (videoTracks.length > 0) {
            videoTracks.forEach(track => {
              track.stop();
              stream.removeTrack(track);
            });
          }
          
        } catch (desktopError) {
          console.error('Desktop capturer failed:', desktopError);
          throw new Error('デスクトップ音声キャプチャに失敗しました');
        }
        
      } else if (inputType === 'stereo-mix') {
        if (!selectedSystemDevice) {
          throw new Error('システム音声デバイスが選択されていません');
        }
        
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { 
            deviceId: selectedSystemDevice,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          }
        });
        
      } else {
        // マイク音声
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: selectedDevice }
        })
      }
      
      // MediaRecorder設定
      let mediaRecorder: MediaRecorder
      let selectedMimeType: string
      const chunkSizeMs = 20 * 1000;
      
      const recorderOptions: MediaRecorderOptions = {
        audioBitsPerSecond: 128000
      };
      
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        selectedMimeType = 'audio/webm;codecs=opus'
        recorderOptions.mimeType = selectedMimeType
        mediaRecorder = new MediaRecorder(stream, recorderOptions)
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        selectedMimeType = 'audio/webm'
        recorderOptions.mimeType = selectedMimeType
        mediaRecorder = new MediaRecorder(stream, recorderOptions)
      } else {
        mediaRecorder = new MediaRecorder(stream, recorderOptions)
        selectedMimeType = mediaRecorder.mimeType
      }
      
      mediaRecorderRef.current = mediaRecorder

      // MediaRecorderイベントリスナー
      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorderエラー:', event.error)
        try {
          if (mediaRecorder.state === 'recording') {
            mediaRecorder.stop()
          }
          stream.getTracks().forEach(track => track.stop())
        } catch (cleanupError) {
          console.error('エラー時のクリーンアップ失敗:', cleanupError)
        }
      }
      
      const chunks: Blob[] = []
      let recordingFilePath: string | null = null
      let recordingFilename: string | null = null
      let chunkSequence = 0
      let tempFolderPath: string | null = null
      const chunkFiles: string[] = []
      const periodChunks: Blob[] = []
      let lastChunkSaveTime = Date.now()
      
      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data)
          periodChunks.push(event.data)
          
          const currentTime = Date.now()
          const timeSinceLastSave = currentTime - lastChunkSaveTime
          
          if (timeSinceLastSave >= chunkSizeMs - 1000) {
            try {
              chunkSequence++
              const timestamp = Date.now()
              const paddedSequence = String(chunkSequence).padStart(5, '0')
              const chunkFilename = `chunk_${paddedSequence}_${timestamp}.webm`
              
              if (!tempFolderPath && recordingFilename) {
                const baseFilename = recordingFilename.replace('.webm', '')
                tempFolderPath = `temp_${baseFilename}`
              }
              
              if (tempFolderPath && periodChunks.length > 0) {
                try {
                  const chunkBlob = new Blob(chunks, { type: selectedMimeType })
                  const chunkBuffer = await chunkBlob.arrayBuffer()
                  
                  await window.electronAPI.saveFile(chunkBuffer, chunkFilename, tempFolderPath)
                  chunkFiles.push(`${tempFolderPath}/${chunkFilename}`)
                } catch (error) {
                  console.error('チャンクファイル保存エラー:', error)
                }
                
                periodChunks.length = 0
                lastChunkSaveTime = currentTime
              }
            } catch (error) {
              console.error('チャンクファイル保存エラー:', error)
            }
          }
          
          if (chunks.length > 0) {
            try {
              const combinedBlob = new Blob(chunks, { type: selectedMimeType })
              const arrayBuffer = await combinedBlob.arrayBuffer()
              
              if (!recordingFilePath && recordingFilename) {
                recordingFilePath = await window.electronAPI.saveFile(arrayBuffer, recordingFilename)
              } else if (recordingFilename) {
                await window.electronAPI.saveFile(arrayBuffer, recordingFilename)
              }
            } catch (error) {
              console.error('録音中ファイル書き込みエラー:', error)
            }
          }
        }
      }
      
      mediaRecorder.onstop = async () => {
        // 正確な録音時間を計算（ミリ秒単位、一時停止時間を除外）
        const recordingEndTime = Date.now()
        const actualDurationMs = recordingEndTime - recordingStartTimeRef.current - pausedTimeRef.current
        const actualDurationSeconds = Math.round(actualDurationMs / 1000)
        
        // WebM形式でBlobを作成
        const originalBlob = new Blob(chunks, { type: selectedMimeType })
        
        try {
          // HTMLAudioElementで正確なdurationを取得
          let accurateDuration: number
          
          try {
            accurateDuration = await getAccurateDuration(originalBlob)
          } catch (durationError) {
            // フォールバック：録音時間から推定durationを計算
            accurateDuration = actualDurationSeconds
          }
          
          // 元のWebMファイルをそのまま使用
          const finalBuffer = await originalBlob.arrayBuffer()
          
          // 録音停止時は必ず新しい完全なファイルを作成
          // 録音開始時に決定されたファイル名を使用（一貫性を保つ）
          const filename = recordingFilename || 'recording.webm'
          console.log('録音開始時に決定されたファイル名で最終保存:', filename)
          
          console.log('Saving WebM file with duration metadata:', filename)
          
          try {
            // 最終的なファイルを保存（録音中に書き込んだファイルを完全版で上書き）
            console.log('録音停止時の最終ファイル保存:', {
              filename: filename,
              bufferSize: finalBuffer.byteLength,
              duration: accurateDuration,
              recordingPath: recordingFilePath
            })
            
            await window.electronAPI.saveFile(finalBuffer, filename)
            
            // メタデータファイルに正確なdurationを保存
            const metadata = {
              duration: accurateDuration, // HTMLAudioElementで取得した正確な値
              format: 'webm',
              size: finalBuffer.byteLength,
              recordedAt: new Date().toISOString(),
              mimeType: selectedMimeType
            }
            await window.electronAPI.saveMetadata(filename, metadata)
            
            console.log('📁 録音ファイルを保存しました:', filename)
            console.log('⏱️ Accurate Duration:', accurateDuration, 'seconds')
            console.log('📋 メタデータファイルも保存しました')
            console.log('✅ WebMファイルと正確なdurationメタデータ保存完了')
          } catch (error) {
            console.error('ファイル保存エラー:', error)
          }
          
        } catch (durationError) {
          console.error('Duration取得エラー:', durationError)
          console.log('フォールバック: 元のWebMファイルを保存します（Duration情報なし）')
          
          // フォールバック: 元のファイルを保存
          const fallbackBuffer = await originalBlob.arrayBuffer()
          
          const now = new Date()
          const timestamp = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`
          const filename = `recording_${timestamp}.webm`
          
          try {
            await window.electronAPI.saveFile(fallbackBuffer, filename)
            console.log('⚠️ 録音ファイルを保存しました（Duration無し）:', filename)
          } catch (error) {
            console.error('フォールバックファイル保存エラー:', error)
          }
        }
        
        // 録音状態をリセット
        resetRecordingState()
        
        // 録音完了後にrecordingFileをクリア（ファイルリスト更新は LeftPanel に任せる）
        const cleanupRecordingState = () => {
          setRecordingFile(null)
          console.log('🎯 録音中ファイルのグローバル状態をクリア')
        }
        
        // 少し遅延を入れてグローバル状態をクリア
        setTimeout(cleanupRecordingState, 500)
      }
      
      // 録音開始時にファイルエントリを即座に作成（左ペインに表示するため）
      const createInitialFileEntry = async () => {
        try {
          const now = new Date()
          const timestamp = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`
          const filename = `recording_${timestamp}.webm`
          
          // 録音中のファイルパスとファイル名を初期化（ondataavailableで使用）
          recordingFilePath = null
          recordingFilename = filename  // ファイル名を共有変数に設定
          
          // デフォルトフォルダを取得
          const settings = await window.electronAPI.loadSettings()
          const defaultFolder = settings.saveFolder
          
          // 一時的なファイルエントリを作成
          const tempFileEntry = {
            id: filename,
            filename: filename,
            filepath: `${defaultFolder}\\${filename}`,
            format: 'webm' as const,
            size: 0,
            createdAt: now,
            duration: 0,
            hasTranscriptionFile: false,
            transcriptionPath: undefined,
            isRecording: true // 録音中フラグを追加
          }
          
          // 既存のファイルリストに録音中ファイルを追加
          // ファイル一覧の再取得を避けて、現在のリストに追加のみ行う
          setFileList(prevList => {
            // 同じファイル名がすでに存在する場合は置き換え、そうでなければ先頭に追加
            const existingIndex = prevList.findIndex(file => file.filename === filename)
            if (existingIndex >= 0) {
              const newList = [...prevList]
              newList[existingIndex] = tempFileEntry
              return newList
            } else {
              return [tempFileEntry, ...prevList]
            }
          })
          
          // グローバル状態に録音中ファイルを設定
          setRecordingFile(tempFileEntry)
          
          // 録音中ファイルを自動的に選択
          setSelectedFile(tempFileEntry)
          
          console.log('📁 録音中ファイルを左ペインに追加:', filename)
          console.log('🎯 グローバル状態に録音中ファイルを設定:', tempFileEntry.filename)
          console.log('🎯 録音中ファイルを自動選択:', tempFileEntry.filename)
          console.log('🎯 録音中ファイルの詳細:', {
            id: tempFileEntry.id,
            filename: tempFileEntry.filename,
            isRecording: tempFileEntry.isRecording,
            filepath: tempFileEntry.filepath
          })
          
        } catch (error) {
          console.error('録音中ファイルエントリ作成エラー:', error)
        }
      }
      
      // createInitialFileEntry を実行してからMediaRecorderを開始
      await createInitialFileEntry()
      
      // マイク監視を開始（マイク録音の場合のみ） - 完全に無効化してクラッシュ問題を切り分け
      const ENABLE_MIC_MONITORING = false // 完全に無効化
      
      if (inputType === 'microphone' && ENABLE_MIC_MONITORING) {
        try {
          console.log('🎤 マイク監視を開始します...')
          micMonitorRef.current = new MicrophoneMonitor()
          
          // マイクステータスコールバック
          micMonitorRef.current.onStatusUpdate((status: MicrophoneStatus) => {
            setMicStatus(status)
          })
          
          // マイクアラートコールバック
          micMonitorRef.current.onAlert((alert: MicrophoneAlert) => {
            setMicAlerts(prev => [...prev.slice(-4), alert]) // 最新5件まで保持
            
            // 重要なアラートをコンソールに出力
            if (alert.severity === 'error' || alert.severity === 'warning') {
              console.warn(`🎤 マイクアラート: ${alert.message}`)
              if (alert.recommendation) {
                console.warn(`   推奨対策: ${alert.recommendation}`)
              }
            }
          })
          
          // 録音ストリームを使用してマイク監視開始（競合を回避）
          const micMonitoringStarted = await micMonitorRef.current.startMonitoring(stream, selectedDevice)
          if (micMonitoringStarted) {
            console.log('✅ マイク監視開始成功（録音ストリーム使用）')
          } else {
            console.warn('⚠️ マイク監視開始に失敗しましたが、録音は続行します')
          }
        } catch (micError) {
          console.error('❌ マイク監視開始エラー:', micError)
          console.warn('⚠️ マイク監視なしで録音を続行します')
        }
      } else if (inputType === 'microphone') {
        console.log('🎤 マイク監視は一時的に無効化されています（録音のトラブルシューティング中）')
      }
      
      // チャンクファイル保存用のタイムスライス設定（20秒間隔）
      console.log('🎬 MediaRecorder開始中...', { chunkSizeMs, state: mediaRecorder.state })
      mediaRecorder.start(chunkSizeMs)
      console.log('✅ MediaRecorder.start()呼び出し完了, 新しいstate:', mediaRecorder.state)
      setIsRecording(true)
      setGlobalIsRecording(true)
      setRecordingTime(0)
      console.log('📱 UI状態更新完了: isRecording = true')
      
      // 録音開始時刻を記録（正確なDuration計算のため）
      recordingStartTimeRef.current = Date.now()
      pausedTimeRef.current = 0 // 一時停止時間をリセット
      console.log('Recording started at:', new Date(recordingStartTimeRef.current).toISOString())
      
      // テンポラリフォルダパスを事前に設定
      if (recordingFilename && typeof recordingFilename === 'string') {
        const baseFilename = (recordingFilename as string).replace('.webm', '')
        tempFolderPath = `temp_${baseFilename}`
        console.log(`ファイルベースシステム用テンポラリフォルダ: ${tempFolderPath}`)
      }
      
      // ファイルベースリアルタイム文字起こし開始（有効化されている場合のみ）
      if (enableTranscription && realtimeProcessorRef.current && tempFolderPath && recordingFilename) {
        try {
          console.log('ファイルベースリアルタイム文字起こし開始...')
          
          // 保存フォルダから録音ファイルの絶対パスを構築
          const settings = await window.electronAPI.loadSettings()
          const saveFolder = settings.saveFolder
          const fullRecordingPath = `${saveFolder}\\${recordingFilename}`
          const absoluteTempPath = `${saveFolder}\\${tempFolderPath}`
          
          console.log(`監視フォルダ: ${absoluteTempPath}`)
          console.log(`出力ファイル: ${fullRecordingPath}`)
          
          await realtimeProcessorRef.current.start(absoluteTempPath, fullRecordingPath)
          setIsRealtimeTranscribing(true)
          console.log('✓ ファイルベースリアルタイム文字起こし開始完了')
        } catch (realtimeError) {
          console.error('ファイルベースリアルタイム文字起こし開始エラー:', realtimeError)
        }
      } else {
        if (enableTranscription) {
          console.warn('ファイルベースリアルタイム文字起こし開始条件が満たされていません:', {
            realtimeProcessor: !!realtimeProcessorRef.current,
            tempFolderPath,
            recordingFilename: recordingFilename || 'undefined'
          })
        } else {
          console.log('録音のみモード: リアルタイム文字起こしをスキップ')
        }
      }
      
    } catch (error) {
      console.error('❌ 録音開始エラー:', error)
      console.error('❌ エラー詳細:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace',
        inputType,
        selectedDevice,
        enableTranscription
      })
      
      const detailMessage = error instanceof Error ? error.message : String(error);
      
      const errorMessage = inputType === 'desktop' 
        ? `デスクトップ音声へのアクセスが拒否されました。\n${detailMessage}`
        : `マイクへのアクセスが拒否されました。\n${detailMessage}`
      
      alert(errorMessage)
      console.error('録音開始エラー (full):', error)
      
      // エラー時も録音状態をリセット
      resetRecordingState()
      
      // エラー時にも録音中のファイルエントリを削除
      const removeRecordingFileEntry = async () => {
        try {
          const settings = await window.electronAPI.loadSettings()
          const defaultFolder = settings.saveFolder
          
          // 最新のファイルリストを取得して録音フラグをfalseに更新
          const currentFiles = await window.electronAPI.getFileList(defaultFolder)
          const extendedFiles = await Promise.all(
            currentFiles.map(async (file) => {
              try {
                const hasTranscriptionFile = await window.electronAPI.checkTranscriptionExists(file.filepath)
                const transcriptionPath = hasTranscriptionFile 
                  ? await window.electronAPI.getTranscriptionPath(file.filepath)
                  : undefined
                
                return {
                  ...file,
                  hasTranscriptionFile,
                  transcriptionPath,
                  isRecording: false // エラー時もすべてのファイルの録音フラグをfalseに設定
                }
              } catch (error) {
                console.error(`文字起こしファイル確認エラー (${file.filename}):`, error)
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
          console.log('📁 録音エラー時のファイルリスト更新完了')
          
        } catch (error) {
          console.error('録音エラー時のファイルリスト更新エラー:', error)
        }
      }
      
      removeRecordingFileEntry()
    }
  }, [inputType, selectedDevice, selectedDesktopSource, selectedSystemDevice, resetRecordingState])
  
  // 録音停止
  const handleStopRecording = useCallback(async () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop())
      
      // マイク監視停止
      if (micMonitorRef.current) {
        try {
          console.log('🎤 マイク監視を停止します...')
          micMonitorRef.current.stopMonitoring()
          micMonitorRef.current = null
          setMicStatus(null)
          setMicAlerts([])  // マイクアラートもクリア
          console.log('✅ マイク監視停止完了')
        } catch (micError) {
          console.error('❌ マイク監視停止エラー:', micError)
        }
      }
      
      // ファイルベースリアルタイム文字起こし停止
      if (realtimeProcessorRef.current && isRealtimeTranscribing) {
        try {
          console.log('ファイルベースリアルタイム文字起こし停止...')
          await realtimeProcessorRef.current.stop()
          setIsRealtimeTranscribing(false)
          console.log('✓ ファイルベースリアルタイム文字起こし停止完了')
        } catch (realtimeError) {
          console.error('ファイルベースリアルタイム文字起こし停止エラー:', realtimeError)
        }
      }
    }
  }, [isRecording, isRealtimeTranscribing])
  
  // 録音一時停止・再開
  const handlePauseRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      if (isPaused) {
        // 再開時：現在の時刻を記録
        const resumeTime = Date.now()
        mediaRecorderRef.current.resume()
        setIsPaused(false)
        console.log('Recording resumed at:', new Date(resumeTime).toISOString())
      } else {
        // 一時停止時：一時停止時間を計算して累計に追加
        const pauseStartTime = Date.now()
        mediaRecorderRef.current.pause()
        setIsPaused(true)
        console.log('Recording paused at:', new Date(pauseStartTime).toISOString())
        
        // 一時停止時間を記録（再開時に計算される）
        setTimeout(() => {
          if (isPaused) {
            const pauseEndTime = Date.now()
            pausedTimeRef.current += pauseEndTime - pauseStartTime
            console.log('Paused duration so far:', pausedTimeRef.current, 'ms')
          }
        }, 100)
      }
    }
  }, [isPaused])
  
  // 削除: handleTranscribe, handleConvertToMP3 は不要

  

  return (
    <div className="bottom-panel">
      <div className="bottom-panel__content">
        {/* 入力タイプ選択 */}
        <div className="flex items-center gap-md">
          <label className="text-secondary" style={{ minWidth: '100px' }}>入力タイプ:</label>
          <select 
            className="select"
            value={inputType}
            onChange={(e) => setInputType(e.target.value as 'microphone' | 'desktop' | 'stereo-mix')}
            disabled={isRecording}
            style={{ 
              width: '200px',
              opacity: isRecording ? 0.5 : 1
            }}
          >
            <option value="microphone">🎤 マイク音声</option>
            <option value="desktop">🖥️ デスクトップ音声</option>
            <option value="stereo-mix">🔊 ステレオミックス</option>
          </select>
          {inputType === 'desktop' && (
            <div className="text-secondary" style={{ fontSize: '11px' }}>
              ※画面共有で「システム音声を共有」を有効にしてください
              <br />
              ⚠️ マイク音声も混入する場合は、Windows音声設定でマイクの「聞く」を無効にしてください
            </div>
          )}
          {inputType === 'stereo-mix' && (
            <div className="text-secondary" style={{ fontSize: '11px' }}>
              ※システム音声のみを録音します。マイク音声も含む場合があります。
            </div>
          )}
        </div>

        {/* 入力デバイス選択（マイクの場合のみ） */}
        {inputType === 'microphone' && (
          <div className="flex items-center gap-md">
            <label className="text-secondary" style={{ minWidth: '100px' }}>入力デバイス:</label>
            <select 
              className="select flex-1"
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
              disabled={isRecording}
              style={{ opacity: isRecording ? 0.5 : 1 }}
            >
              {availableDevices.map(device => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `マイク ${device.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* マイクレベル表示（録音中のマイクの場合のみ） */}
        {inputType === 'microphone' && isRecording && micStatus && (
          <div className="flex items-center gap-md">
            <label className="text-secondary" style={{ minWidth: '100px' }}>音声レベル:</label>
            <div className="flex items-center gap-sm flex-1">
              {/* 音声レベルバー */}
              <div 
                style={{
                  width: '200px',
                  height: '20px',
                  backgroundColor: '#333',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  border: '1px solid #555',
                  position: 'relative'
                }}
              >
                {/* 音声レベル（緑～黄～赤のグラデーション） */}
                <div
                  style={{
                    width: `${micStatus.inputLevel}%`,
                    height: '100%',
                    backgroundColor: micStatus.inputLevel < 30 ? '#4CAF50' : 
                                     micStatus.inputLevel < 70 ? '#FF9800' : '#F44336',
                    transition: 'width 0.1s ease-out'
                  }}
                />
                {/* ピークレベルライン */}
                <div
                  style={{
                    position: 'absolute',
                    left: `${micStatus.peakLevel}%`,
                    top: 0,
                    width: '2px',
                    height: '100%',
                    backgroundColor: '#fff',
                    transition: 'left 0.1s ease-out'
                  }}
                />
              </div>
              
              {/* 数値表示 */}
              <div style={{ 
                fontSize: '12px', 
                minWidth: '60px',
                color: micStatus.inputLevel < 5 ? '#F44336' : 
                       micStatus.inputLevel < 15 ? '#FF9800' : '#4CAF50'
              }}>
                {micStatus.inputLevel}%
              </div>
              
              {/* ステータスアイコン */}
              <div style={{ fontSize: '14px' }}>
                {micStatus.isSilent ? '🔇' : 
                 micStatus.inputLevel < 15 ? '🔉' : 
                 micStatus.inputLevel < 50 ? '🔊' : '📢'}
              </div>
            </div>
          </div>
        )}

        {/* マイクアラート表示 */}
        {micAlerts.length > 0 && micAlerts.slice(-1).map((alert, index) => (
          <div key={index} className="flex items-center gap-md">
            <label className="text-secondary" style={{ minWidth: '100px' }}>⚠️ 音声診断:</label>
            <div style={{ 
              fontSize: '12px',
              color: alert.severity === 'error' ? '#F44336' : 
                     alert.severity === 'warning' ? '#FF9800' : '#2196F3',
              flex: 1
            }}>
              {alert.message}
              {alert.recommendation && (
                <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                  💡 {alert.recommendation}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* デスクトップソース選択（デスクトップの場合のみ） */}
        {inputType === 'desktop' && (
          <>
            <div className="flex items-center gap-md">
              <label className="text-secondary" style={{ minWidth: '100px' }}>キャプチャ対象:</label>
              <select 
                className="select flex-1"
                value={selectedDesktopSource}
                onChange={(e) => setSelectedDesktopSource(e.target.value)}
                disabled={isRecording}
              style={{ opacity: isRecording ? 0.5 : 1 }}
            >
              <option value="">選択してください</option>
              {desktopSources.map(source => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
            {desktopSources.length === 0 && (
              <div className="text-secondary" style={{ fontSize: '11px' }}>
                デスクトップソースを読み込み中...
              </div>
            )}
          </div>
        </>
        )}
        
        {/* システム音声デバイス選択（ステレオミックスの場合のみ） */}
        {inputType === 'stereo-mix' && (
          <div className="flex items-center gap-md">
            <label className="text-secondary" style={{ minWidth: '100px' }}>システム音声デバイス:</label>
            <select 
              className="select flex-1"
              value={selectedSystemDevice}
              onChange={(e) => setSelectedSystemDevice(e.target.value)}
              disabled={isRecording}
              style={{ opacity: isRecording ? 0.5 : 1 }}
            >
              <option value="">選択してください</option>
              {systemAudioDevices.map(device => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `システムデバイス ${device.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
            {systemAudioDevices.length === 0 && (
              <div className="text-secondary" style={{ fontSize: '11px' }}>
                システム音声デバイスが見つかりません。Windows設定でステレオミックスを有効化してください。
              </div>
            )}
          </div>
        )}
        
        {/* 録音コントロール */}
        <div className="flex items-center gap-md">
          <div className="flex gap-sm">
            {!isRecording ? (
              <>
                <button 
                  className="btn btn--success"
                  onClick={handleStartRecordingWithTranscription}
                  disabled={
                    (inputType === 'microphone' && !selectedDevice) ||
                    (inputType === 'desktop' && !selectedDesktopSource) ||
                    (inputType === 'stereo-mix' && !selectedSystemDevice)
                  }
                >
                  ● 録音・文字起こし
                </button>
                <button 
                  className="btn btn--secondary"
                  onClick={handleStartRecordingOnly}
                  disabled={
                    (inputType === 'microphone' && !selectedDevice) ||
                    (inputType === 'desktop' && !selectedDesktopSource) ||
                    (inputType === 'stereo-mix' && !selectedSystemDevice)
                  }
                >
                  ● 録音のみ
                </button>
              </>
            ) : (
              <>
                <button 
                  className="btn btn--error"
                  onClick={handleStopRecording}
                >
                  ■ 停止
                </button>
                <button 
                  className="btn"
                  onClick={handlePauseRecording}
                >
                  {isPaused ? '▶ 再開' : '⏸ 一時停止'}
                </button>
              </>
            )}
          </div>
          
          <div className="text-secondary">
            録音時間: <span className="text-primary">{formatTime(recordingTime)}</span>
          </div>
          
          {isRecording && (
            <div className="text-success">
              {isPaused ? '⏸ 一時停止中' : '● 録音中'}
            </div>
          )}
        </div>
        
      </div>
    </div>
  )
}

export default BottomPanel