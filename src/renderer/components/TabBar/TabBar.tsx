/**
 * タブバーコンポーネント
 * 開いているタブの表示とタブ切り替え機能を提供
 */

import React, { useCallback, useState } from 'react'
import { useTabContext } from '../../contexts/TabContext'
import { TabType, TabStatus } from '../../types/TabTypes'
import './TabBar.css'

const TabBar: React.FC = () => {
  const { tabs, activeTabId, activateTab, closeTab } = useTabContext()
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null)

  // タブクリック処理
  const handleTabClick = useCallback((tabId: string) => {
    activateTab(tabId)
  }, [activateTab])

  // タブ閉じる処理
  const handleCloseTab = useCallback((e: React.MouseEvent, tabId: string) => {
    e.stopPropagation()
    closeTab(tabId)
  }, [closeTab])

  // ドラッグ開始
  const handleDragStart = useCallback((e: React.DragEvent, tabId: string) => {
    setDraggedTabId(tabId)
    e.dataTransfer.effectAllowed = 'move'
  }, [])

  // ドラッグ終了
  const handleDragEnd = useCallback(() => {
    setDraggedTabId(null)
  }, [])

  // タブアイコン取得
  const getTabIcon = (type: TabType, status: TabStatus): string => {
    if (status === TabStatus.LOADING) return '⏳'
    if (status === TabStatus.ERROR) return '❌'
    
    switch (type) {
      case TabType.WELCOME:
        return '🏠'
      case TabType.RECORDING:
        return status === TabStatus.RECORDING ? '⏺️' : '🎙️'
      case TabType.ADVANCED_RECORDING:
        return status === TabStatus.RECORDING ? '🔴' : '🚀'
      case TabType.PLAYER:
        return status === TabStatus.PLAYING ? '▶️' : status === TabStatus.EDITING ? '✏️' : '📄'
      default:
        return '📄'
    }
  }

  // タブステータス表示
  const getStatusIndicator = (status: TabStatus): React.ReactNode => {
    switch (status) {
      case TabStatus.RECORDING:
        return <span className="status-indicator recording">●</span>
      case TabStatus.TRANSCRIBING:
        return <span className="status-indicator transcribing">⚡</span>
      case TabStatus.LOADING:
        return <span className="status-indicator loading">⏳</span>
      case TabStatus.ERROR:
        return <span className="status-indicator error">!</span>
      default:
        return null
    }
  }

  if (tabs.length === 0) {
    return null
  }

  return (
    <div className="tab-bar">
      <div className="tab-list">
        {tabs.map((tab, index) => (
          <div
            key={tab.id}
            className={`tab ${tab.isActive ? 'active' : ''} ${tab.status} ${draggedTabId === tab.id ? 'dragging' : ''}`}
            onClick={() => handleTabClick(tab.id)}
            draggable
            onDragStart={(e) => handleDragStart(e, tab.id)}
            onDragEnd={handleDragEnd}
            title={`${tab.title} - ${tab.status}`}
          >
            <span className="tab-icon">{getTabIcon(tab.type, tab.status)}</span>
            <span className="tab-title">{tab.title}</span>
            {getStatusIndicator(tab.status)}
            
            {/* 閉じるボタン */}
            {tab.isClosable && (
              <button
                className="tab-close-button"
                onClick={(e) => handleCloseTab(e, tab.id)}
                title="タブを閉じる"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      
    </div>
  )
}

export default TabBar