import React, { useState, useCallback } from 'react'
import LeftPanel from '../LeftPanel/LeftPanel'
import TabBar from '../TabBar/TabBar'
import TabContent from '../TabContent/TabContent'

/**
 * メインレイアウトコンポーネント
 * 左パネル（ファイルエクスプローラー）と右パネル（テキスト＋コントロール）を配置
 * リサイズ機能付き
 */
const MainLayout: React.FC = () => {
  const [leftPanelWidth, setLeftPanelWidth] = useState(300)
  const [isResizing, setIsResizing] = useState(false)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsResizing(true)
    e.preventDefault()
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return
    
    const newWidth = e.clientX
    if (newWidth >= 200 && newWidth <= 600) {
      setLeftPanelWidth(newWidth)
    }
  }, [isResizing])

  const handleMouseUp = useCallback(() => {
    setIsResizing(false)
  }, [])

  React.useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    } else {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing, handleMouseMove, handleMouseUp])

  return (
    <div className="main-layout" data-testid="main-layout">
      <div 
        className="left-panel"
        style={{ 
          width: `${leftPanelWidth}px`, 
          minWidth: `${leftPanelWidth}px`, 
          maxWidth: `${leftPanelWidth}px`,
          backgroundColor: 'var(--color-bg-secondary)',
          borderRight: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        <LeftPanel />
      </div>
      
      {/* リサイズハンドル */}
      <div 
        className="resize-handle"
        onMouseDown={handleMouseDown}
        style={{
          width: '4px',
          backgroundColor: isResizing ? 'var(--color-accent)' : 'var(--color-border)',
          cursor: 'col-resize',
          userSelect: 'none',
          transition: isResizing ? 'none' : 'background-color 0.2s ease'
        }}
      />
      
      <div className="right-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <TabBar />
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <TabContent />
        </div>
      </div>
    </div>
  )
}

export default MainLayout