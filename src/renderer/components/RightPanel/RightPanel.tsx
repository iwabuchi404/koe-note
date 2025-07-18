import React, { useState } from 'react'
import BottomPanel from '../BottomPanel/BottomPanel'
import AudioPlayer from '../AudioPlayer/AudioPlayer'
import SpeechRecognition from '../SpeechRecognition/SpeechRecognition'
import SpeechRecognitionControl from '../SpeechRecognitionControl/SpeechRecognitionControl'
import { useAppContext } from '../../App'
import { TranscriptionResult } from '../../../preload/preload'

/**
 * 右パネル - アコーディオン方式レイアウト
 * 上部: 文字起こし結果（可変サイズ・メインエリア）
 * 中部: 音声プレイヤー（固定サイズ・折りたたみ可能）
 * 下部: 音声認識（固定サイズ・折りたたみ可能）
 * 最下部: 録音コントロール（固定サイズ・折りたたみ可能）
 */
const RightPanel: React.FC = () => {
  // グローバル状態から選択されたファイル情報を取得
  const { selectedFile, isRecording, isPlaying, isTranscribing } = useAppContext()
  
  // チャンク分割文字起こし状態
  const [isChunkTranscribing, setIsChunkTranscribing] = useState(false)
  const [chunkProgress, setChunkProgress] = useState({ processedChunks: 0, totalChunks: 0 })
  
  // アコーディオン状態管理
  const [accordionState, setAccordionState] = useState({
    transcription: true,   // 文字起こし結果（折りたたみ可能）
    recognition: false,    // 音声認識は必要時のみ展開
    player: false,         // 音声プレイヤーは必要時のみ展開
    recording: false       // 録音コントロールは必要時のみ展開
  })
  
  // アコーディオン開閉ハンドラー
  const toggleAccordion = (section: keyof typeof accordionState) => {
    setAccordionState(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }
  
  // 音声認識結果のハンドラー
  const handleTranscriptionComplete = (result: TranscriptionResult) => {
    console.log('音声認識完了:', result)
    // TODO: 結果をファイルのメタデータに保存する機能を実装
  }
  
  // チャンク分割文字起こしイベントリスナー
  React.useEffect(() => {
    const handleChunkTranscriptionStart = (event: any) => {
      const { totalChunks } = event.detail
      setIsChunkTranscribing(true)
      setChunkProgress({ processedChunks: 0, totalChunks })
    }
    
    const handleChunkProgress = (event: any) => {
      const { processedChunks, totalChunks } = event.detail
      setChunkProgress({ processedChunks, totalChunks })
    }
    
    const handleChunkTranscriptionComplete = () => {
      setIsChunkTranscribing(false)
      setChunkProgress({ processedChunks: 0, totalChunks: 0 })
    }
    
    window.addEventListener('chunkTranscriptionStart', handleChunkTranscriptionStart)
    window.addEventListener('chunkProgress', handleChunkProgress)
    window.addEventListener('chunkTranscriptionComplete', handleChunkTranscriptionComplete)
    
    return () => {
      window.removeEventListener('chunkTranscriptionStart', handleChunkTranscriptionStart)
      window.removeEventListener('chunkProgress', handleChunkProgress)
      window.removeEventListener('chunkTranscriptionComplete', handleChunkTranscriptionComplete)
    }
  }, [])
  
  return (
    <div className="right-panel">
      {/* 文字起こし結果セクション - メインエリア（可変サイズ、折りたたみ可能） */}
      <div className="accordion-section accordion-section--main">
        <div 
          className="accordion-header"
          onClick={() => toggleAccordion('transcription')}
        >
          <h3 className="accordion-title">📝 文字起こし結果</h3>
          <span className="accordion-icon">
            {accordionState.transcription ? '▼' : '▶'}
          </span>
        </div>
        <div 
          className={`accordion-content ${accordionState.transcription ? 'accordion-content--expanded' : ''}`}
          style={{ display: accordionState.transcription ? 'flex' : 'none' }}
        >
          <SpeechRecognition
            selectedFile={selectedFile}
            onTranscriptionComplete={handleTranscriptionComplete}
          />
        </div>
      </div>
      
      {/* 音声認識制御セクション */}
      <div className="accordion-section">
        <div 
          className="accordion-header"
          onClick={() => toggleAccordion('recognition')}
        >
          <h3 className="accordion-title">
            🎤 音声認識
            {isTranscribing && <span style={{ marginLeft: '8px', color: 'var(--color-warning)' }}>⏳ 処理中</span>}
            {isChunkTranscribing && (
              <span style={{ marginLeft: '8px', color: 'var(--color-accent)' }}>
                ⚡ チャンク処理中 ({chunkProgress.processedChunks}/{chunkProgress.totalChunks})
              </span>
            )}
          </h3>
          <span className="accordion-icon">
            {accordionState.recognition ? '▼' : '▶'}
          </span>
        </div>
        <div 
          className={`accordion-content ${accordionState.recognition ? 'accordion-content--expanded' : ''}`}
          style={{ display: accordionState.recognition ? 'block' : 'none' }}
        >
          <SpeechRecognitionControl selectedFile={selectedFile} />
        </div>
      </div>
      
      {/* 音声プレイヤーセクション */}
      <div className="accordion-section">
        <div 
          className="accordion-header"
          onClick={() => toggleAccordion('player')}
        >
          <h3 className="accordion-title">
            🎵 音声プレイヤー
            {isPlaying && <span style={{ marginLeft: '8px', color: 'var(--color-success)' }}>▶ 再生中</span>}
          </h3>
          <span className="accordion-icon">
            {accordionState.player ? '▼' : '▶'}
          </span>
        </div>
        <div 
          className={`accordion-content ${accordionState.player ? 'accordion-content--expanded' : ''}`}
          style={{ display: accordionState.player ? 'block' : 'none' }}
        >
          <AudioPlayer
            filePath={selectedFile?.filepath}
            fileName={selectedFile?.filename}
            className="accordion-audio-player"
          />
        </div>
      </div>
      
      {/* 録音コントロールセクション */}
      <div className="accordion-section">
        <div 
          className="accordion-header"
          onClick={() => toggleAccordion('recording')}
        >
          <h3 className="accordion-title">
            📹 録音コントロール
            {isRecording && <span style={{ marginLeft: '8px', color: 'var(--color-error)' }}>● 録音中</span>}
          </h3>
          <span className="accordion-icon">
            {accordionState.recording ? '▼' : '▶'}
          </span>
        </div>
        <div 
          className={`accordion-content ${accordionState.recording ? 'accordion-content--expanded' : ''}`}
          style={{ display: accordionState.recording ? 'block' : 'none' }}
        >
          <BottomPanel />
        </div>
      </div>
    </div>
  )
}

export default RightPanel