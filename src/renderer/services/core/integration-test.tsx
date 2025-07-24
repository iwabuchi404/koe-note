/**
 * CoreServicesV2 統合テスト
 * 
 * 実際のReactコンポーネント内で新しいサービスが使用できるかテスト
 */

import React, { useState, useEffect } from 'react'
import { 
  createCoreServices, 
  CoreServiceManager,
  RecordingConfig,
  TranscriptionConfig,
  AudioFileInfo 
} from './index'

/**
 * テスト用コンポーネント
 * 実際に新しいサービスを使ってReactコンポーネントを構築
 */
const CoreServicesTestComponent: React.FC = () => {
  const [services, setServices] = useState<CoreServiceManager | null>(null)
  const [fileList, setFileList] = useState<AudioFileInfo[]>([])
  const [recordingStatus, setRecordingStatus] = useState<string>('idle')
  const [testLog, setTestLog] = useState<string[]>([])

  // サービス初期化
  useEffect(() => {
    try {
      const coreServices = createCoreServices()
      setServices(coreServices)
      addLog('✅ CoreServices初期化成功')
      
      // イベントハンドラー設定
      coreServices.recording.setEventHandlers(
        (session: any) => {
          setRecordingStatus(session.status)
          addLog(`🎤 録音状態変更: ${session.status}`)
        },
        (error: any) => {
          addLog(`❌ 録音エラー: ${error.message}`)
        }
      )

      coreServices.file.setEventHandlers(
        (file: any, changeType: any) => {
          addLog(`📁 ファイル${changeType}: ${file.fileName}`)
          loadFileList() // ファイル一覧再読み込み
        },
        (error: any) => {
          addLog(`❌ ファイルエラー: ${error.message}`)
        }
      )

    } catch (error) {
      addLog(`❌ CoreServices初期化失敗: ${error instanceof Error ? error.message : String(error)}`)
    }
  }, [])

  // ファイル一覧読み込み
  const loadFileList = async () => {
    if (!services) return

    try {
      const result = await services.file.getAudioFileList()
      if (result.success) {
        setFileList(result.data)
        addLog(`📊 ファイル一覧取得: ${result.data.length}件`)
      } else {
        addLog(`❌ ファイル一覧取得失敗: ${result.error.message}`)
      }
    } catch (error) {
      addLog(`❌ ファイル一覧取得エラー: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // 録音設定テスト
  const testRecordingConfig = () => {
    if (!services) return

    const testConfig: RecordingConfig = {
      deviceId: 'default',
      deviceName: 'Test Device',
      inputType: 'microphone',
      mimeType: 'audio/webm;codecs=opus',
      quality: 'medium',
      enableRealtimeTranscription: false
    }

    addLog(`🎤 録音設定テスト: ${JSON.stringify(testConfig, null, 2)}`)
    addLog('✅ 録音設定の型チェック完了')
  }

  // 文字起こし設定テスト
  const testTranscriptionConfig = () => {
    const testConfig: TranscriptionConfig = {
      model: 'kotoba-whisper-v1.0',
      quality: 'high',
      language: 'ja',
      enableTimestamp: true,
      enableSpeakerIdentification: false,
      chunkDurationSeconds: 20
    }

    addLog(`📝 文字起こし設定テスト: ${JSON.stringify(testConfig, null, 2)}`)
    addLog('✅ 文字起こし設定の型チェック完了')
  }

  // ログ追加ヘルパー
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setTestLog(prev => [...prev, `[${timestamp}] ${message}`])
  }

  // ログクリア
  const clearLog = () => {
    setTestLog([])
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h2>🧪 CoreServicesV2 統合テスト</h2>
      
      {/* サービス状態表示 */}
      <div style={{ marginBottom: '20px' }}>
        <h3>📊 サービス状態</h3>
        <p>初期化状態: {services ? '✅ 完了' : '⏳ 待機中'}</p>
        <p>録音状態: {recordingStatus}</p>
        <p>ファイル数: {fileList.length}</p>
      </div>

      {/* テストボタン */}
      <div style={{ marginBottom: '20px' }}>
        <h3>🎮 テスト実行</h3>
        <button onClick={loadFileList} disabled={!services}>
          📁 ファイル一覧読み込み
        </button>
        <button onClick={testRecordingConfig} style={{ marginLeft: '10px' }}>
          🎤 録音設定テスト
        </button>
        <button onClick={testTranscriptionConfig} style={{ marginLeft: '10px' }}>
          📝 文字起こし設定テスト
        </button>
        <button onClick={clearLog} style={{ marginLeft: '10px' }}>
          🗑️ ログクリア
        </button>
      </div>

      {/* ファイル一覧表示 */}
      <div style={{ marginBottom: '20px' }}>
        <h3>📁 ファイル一覧 ({fileList.length}件)</h3>
        <div style={{ maxHeight: '200px', overflow: 'auto', border: '1px solid #ccc', padding: '10px' }}>
          {fileList.length === 0 ? (
            <p>ファイルがありません</p>
          ) : (
            fileList.map(file => (
              <div key={file.id} style={{ marginBottom: '5px', fontSize: '12px' }}>
                📄 {file.fileName} ({Math.round(file.size / 1024)}KB) 
                {file.hasTranscriptionFile && ' 📝'}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ログ表示 */}
      <div>
        <h3>📋 テストログ</h3>
        <div style={{ 
          maxHeight: '300px', 
          overflow: 'auto', 
          border: '1px solid #ccc', 
          padding: '10px',
          backgroundColor: '#f5f5f5',
          fontSize: '12px'
        }}>
          {testLog.length === 0 ? (
            <p>ログがありません</p>
          ) : (
            testLog.map((log, index) => (
              <div key={index} style={{ marginBottom: '2px' }}>
                {log}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default CoreServicesTestComponent