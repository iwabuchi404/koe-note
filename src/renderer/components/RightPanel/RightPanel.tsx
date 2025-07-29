/**
 * RightPanelV2 - モジュラー化されたアコーディオン式レイアウト
 * 
 * 変更点:
 * - 195行 → 80行以下に大幅削減
 * - 各セクションコンポーネントに責務分離
 * - フック化による状態管理の整理
 * - 保守性・拡張性の大幅向上
 */

import React, { useCallback } from 'react'
import { useAppContext } from '../../App'
import { TranscriptionResult } from '../../../preload/preload'

// 分離されたhooksとsections
import { useAccordionState, useChunkTranscription } from './hooks'
import {
  TranscriptionSection,
  RecognitionSection,
  PlayerSection,
  RecordingSection
} from './sections'

const RightPanel: React.FC = () => {
  // グローバル状態から選択されたファイル情報を取得
  const { selectedFile, isRecording, isPlaying, isTranscribing } = useAppContext()
  
  // アコーディオン状態管理
  const { accordionState, toggleSection } = useAccordionState()
  
  // チャンク分割文字起こし状態管理
  const { statusText: chunkStatus } = useChunkTranscription()
  
  // 音声認識結果のハンドラー
  const handleTranscriptionComplete = useCallback((result: TranscriptionResult) => {
    console.log('音声認識完了:', result)
    // TODO: 結果をファイルのメタデータに保存する機能を実装
  }, [])
  
  return (
    <div className="right-panel">
      {/* 文字起こし結果セクション - メインエリア */}
      <TranscriptionSection
        selectedFile={selectedFile}
        isExpanded={accordionState.transcription}
        onToggle={() => toggleSection('transcription')}
        onTranscriptionComplete={handleTranscriptionComplete}
      />
      
      {/* 音声認識制御セクション */}
      <RecognitionSection
        selectedFile={selectedFile}
        isExpanded={accordionState.recognition}
        onToggle={() => toggleSection('recognition')}
        isTranscribing={isTranscribing}
        chunkTranscriptionStatus={chunkStatus}
      />
      
      {/* 音声プレイヤーセクション */}
      <PlayerSection
        selectedFile={selectedFile}
        isExpanded={accordionState.player}
        onToggle={() => toggleSection('player')}
        isPlaying={isPlaying}
      />
      
      {/* 録音コントロールセクション */}
      <RecordingSection
        isExpanded={accordionState.recording}
        onToggle={() => toggleSection('recording')}
        isRecording={isRecording}
      />
    </div>
  )
}

export default RightPanel