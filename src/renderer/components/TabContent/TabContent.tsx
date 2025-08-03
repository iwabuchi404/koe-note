/**
 * タブコンテンツ表示コンポーネント
 * アクティブなタブに応じて適切なコンテンツを表示
 */

import React from 'react'
import { useTabContext } from '../../contexts/TabContext'
import { TabType } from '../../types/TabTypes'
import MainControlPanel from '../MainControlPanel/MainControlPanel'
import RecordingCard from '../RecordingCard/RecordingCard'
import PlayerCard from '../PlayerCard/PlayerCard'
import AdvancedRecordingCard from '../AdvancedRecording/AdvancedRecordingCard'

const TabContent: React.FC = () => {
  const { getActiveTab } = useTabContext()
  const activeTab = getActiveTab()

  // アクティブなタブがない場合はメインコントロールパネルを表示
  if (!activeTab) {
    return (
      <div style={{ height: '100%', overflow: 'auto' }}>
        <MainControlPanel />
      </div>
    )
  }

  // タブタイプに応じてコンテンツを切り替え（カードベースUI）
  const containerStyle = { 
    height: '100%', 
    overflow: 'auto',
    background: 'var(--color-bg-primary)',
    padding: '0'
  }

  switch (activeTab.type) {
    case TabType.WELCOME:
      return (
        <div style={containerStyle}>
          <MainControlPanel />
        </div>
      )
    
    case TabType.RECORDING:
      return (
        <div style={containerStyle}>
          <RecordingCard tabId={activeTab.id} data={activeTab.data} />
        </div>
      )
    
    case TabType.PLAYER:
      return (
        <div style={{ ...containerStyle, padding: '0' }}>
          <PlayerCard tabId={activeTab.id} data={activeTab.data} />
        </div>
      )
    
    case TabType.ADVANCED_RECORDING:
      return (
        <div style={{ ...containerStyle, padding: '0' }}>
          <AdvancedRecordingCard tabId={activeTab.id} data={activeTab.data} />
        </div>
      )
    
    default:
      return (
        <div style={containerStyle}>
          <div style={{ 
            background: 'var(--color-bg-secondary)',
            borderRadius: '12px',
            border: '2px solid var(--color-danger)',
            padding: '40px',
            margin: '16px',
            textAlign: 'center'
          }}>
            <h2 style={{ color: 'var(--color-text-primary)', marginBottom: '16px' }}>未対応のタブタイプ</h2>
            <p style={{ color: 'var(--color-text-secondary)' }}>タブタイプ: {activeTab.type}</p>
          </div>
        </div>
      )
  }
}

export default TabContent