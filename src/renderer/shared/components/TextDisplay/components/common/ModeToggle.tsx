/**
 * モード切り替えボタンコンポーネント
 * 表示モード ↔ 編集モードの切り替え
 */

import React from 'react'
import { DisplayMode } from '../../types/TextDisplayTypes'

interface ModeToggleProps {
  currentMode: DisplayMode
  canSwitchMode: boolean
  hasUnsavedChanges: boolean
  onModeChange: (mode: DisplayMode) => void
  className?: string
  disabled?: boolean
}

/**
 * モード切り替えボタン
 */
const ModeToggle: React.FC<ModeToggleProps> = ({
  currentMode,
  canSwitchMode,
  hasUnsavedChanges,
  onModeChange,
  className = '',
  disabled = false
}) => {
  
  const handleModeClick = (mode: DisplayMode) => {
    if (!canSwitchMode || disabled || mode === currentMode) return
    onModeChange(mode)
  }
  
  return (
    <div className={`mode-toggle-group ${className}`}>
      <button
        type="button"
        className={`mode-toggle-button ${currentMode === 'view' ? 'active' : ''}`}
        onClick={() => handleModeClick('view')}
        disabled={disabled || !canSwitchMode}
        title="表示モード"
        aria-pressed={currentMode === 'view'}
      >
        <span className="icon">👁️</span>
        <span className="label">表示</span>
      </button>
      
      <button
        type="button"
        className={`mode-toggle-button ${currentMode === 'edit' ? 'active' : ''}`}
        onClick={() => handleModeClick('edit')}
        disabled={disabled || !canSwitchMode}
        title={hasUnsavedChanges ? "編集モード（未保存の変更あり）" : "編集モード"}
        aria-pressed={currentMode === 'edit'}
      >
        <span className="icon">✏️</span>
        <span className="label">編集</span>
        {hasUnsavedChanges && (
          <span className="unsaved-indicator" title="未保存の変更があります">●</span>
        )}
      </button>
    </div>
  )
}

export default ModeToggle