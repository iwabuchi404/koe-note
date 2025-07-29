/**
 * PlayerSection - 音声プレイヤーセクション
 * 
 * 責務:
 * - 音声プレイヤーの表示
 * - 録音中ファイルの特別表示
 * - 再生状態の表示
 */

import React from 'react'
import { AudioFile } from '../../../App'
import AudioPlayer from '../../AudioPlayer/AudioPlayer'
import AccordionSection from '../AccordionSection'

interface PlayerSectionProps {
  selectedFile: AudioFile | null
  isExpanded: boolean
  onToggle: () => void
  isPlaying: boolean
}

const PlayerSection: React.FC<PlayerSectionProps> = ({
  selectedFile,
  isExpanded,
  onToggle,
  isPlaying
}) => {
  // 録音中ファイルの場合
  if (selectedFile?.isRecording) {
    return (
      <AccordionSection
        title="録音中ファイル"
        icon="🔴"
        statusText="● 録音進行中"
        statusColor="var(--color-error)"
        isExpanded={true}
        onToggle={() => {}} // 録画中は操作無効
        disabled={true}
      >
        <div style={{ 
          padding: '12px', 
          textAlign: 'center', 
          color: 'var(--color-text-secondary)' 
        }}>
          <p>🎵 {selectedFile.filename}</p>
          <p>録音完了後に再生が可能になります</p>
        </div>
      </AccordionSection>
    )
  }

  // 一般ファイルの場合
  return (
    <AccordionSection
      title="音声プレイヤー"
      icon="🎵"
      statusText={isPlaying ? '▶ 再生中' : undefined}
      statusColor={isPlaying ? 'var(--color-success)' : undefined}
      isExpanded={isExpanded}
      onToggle={onToggle}
    >
      <AudioPlayer
        filePath={selectedFile?.filepath}
        fileName={selectedFile?.filename}
        className="accordion-audio-player"
      />
    </AccordionSection>
  )
}

export default PlayerSection