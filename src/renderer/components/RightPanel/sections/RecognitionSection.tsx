/**
 * RecognitionSection - 音声認識制御セクション
 * 
 * 責務:
 * - 音声認識制御の表示
 * - SpeechRecognitionControlの統合
 * - 文字起こし状態の表示
 */

import React from 'react'
import { AudioFile } from '../../../App'
import SpeechRecognitionControl from '../../SpeechRecognitionControl/SpeechRecognitionControl'
import AccordionSection from '../AccordionSection'

interface RecognitionSectionProps {
  selectedFile: AudioFile | null
  isExpanded: boolean
  onToggle: () => void
  isTranscribing: boolean
  chunkTranscriptionStatus?: string
}

const RecognitionSection: React.FC<RecognitionSectionProps> = ({
  selectedFile,
  isExpanded,
  onToggle,
  isTranscribing,
  chunkTranscriptionStatus
}) => {
  // ステータステキストの生成
  const getStatusText = () => {
    if (chunkTranscriptionStatus) {
      return chunkTranscriptionStatus
    }
    if (isTranscribing) {
      return '⏳ 処理中'
    }
    return undefined
  }

  // ステータス色の決定
  const getStatusColor = () => {
    if (chunkTranscriptionStatus) {
      return 'var(--color-accent)'
    }
    if (isTranscribing) {
      return 'var(--color-warning)'
    }
    return undefined
  }

  return (
    <AccordionSection
      title="音声認識"
      icon="🎤"
      statusText={getStatusText()}
      statusColor={getStatusColor()}
      isExpanded={isExpanded}
      onToggle={onToggle}
    >
      <SpeechRecognitionControl selectedFile={selectedFile} />
    </AccordionSection>
  )
}

export default RecognitionSection