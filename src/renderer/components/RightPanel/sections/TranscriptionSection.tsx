/**
 * TranscriptionSection - 文字起こし結果セクション
 * 
 * 責務:
 * - 文字起こし結果の表示
 * - SpeechRecognitionコンポーネントの統合
 * - 文字起こし完了ハンドリング
 */

import React from 'react'
import { TranscriptionResult } from '../../../../preload/preload'
import { AudioFile } from '../../../App'
import SpeechRecognition from '../../SpeechRecognition/SpeechRecognition'
import AccordionSection from '../AccordionSection'

interface TranscriptionSectionProps {
  selectedFile: AudioFile | null
  isExpanded: boolean
  onToggle: () => void
  onTranscriptionComplete?: (result: TranscriptionResult) => void
}

const TranscriptionSection: React.FC<TranscriptionSectionProps> = ({
  selectedFile,
  isExpanded,
  onToggle,
  onTranscriptionComplete
}) => {
  // 文字起こし完了ハンドラー
  const handleTranscriptionComplete = (result: TranscriptionResult) => {
    console.log('音声認識完了:', result)
    onTranscriptionComplete?.(result)
  }

  return (
    <AccordionSection
      title="文字起こし結果"
      icon="📝"
      isExpanded={isExpanded}
      onToggle={onToggle}
      isMain={true} // メインエリア（可変サイズ）
    >
      <SpeechRecognition
        selectedFile={selectedFile}
        onTranscriptionComplete={handleTranscriptionComplete}
      />
    </AccordionSection>
  )
}

export default TranscriptionSection