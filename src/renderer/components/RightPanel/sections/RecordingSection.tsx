/**
 * RecordingSection - 録音コントロールセクション
 * 
 * 責務:
 * - 録音コントロールの表示
 * - BottomPanelの統合
 * - 録音状態の表示
 */

import React from 'react'
import BottomPanel from '../../BottomPanel/BottomPanel'
import AccordionSection from '../AccordionSection'

interface RecordingSectionProps {
  isExpanded: boolean
  onToggle: () => void
  isRecording: boolean
}

const RecordingSection: React.FC<RecordingSectionProps> = ({
  isExpanded,
  onToggle,
  isRecording
}) => {
  return (
    <AccordionSection
      title="録音コントロール"
      icon="📹"
      statusText={isRecording ? '● 録音中' : undefined}
      statusColor={isRecording ? 'var(--color-error)' : undefined}
      isExpanded={isExpanded}
      onToggle={onToggle}
    >
      <BottomPanel />
    </AccordionSection>
  )
}

export default RecordingSection