/**
 * EditingToolbar - 編集ツールバーコンポーネント
 * 
 * 責務:
 * - 編集操作のボタン群
 * - 編集状態の表示
 * - 編集アクションの提供
 */

import React from 'react'

interface EditingToolbarProps {
  modifiedSegmentsCount: number
  onSave: () => void
  onReset: () => void
  hasChanges: boolean
}

const EditingToolbar: React.FC<EditingToolbarProps> = ({
  modifiedSegmentsCount,
  onSave,
  onReset,
  hasChanges
}) => {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--spacing-md)',
      padding: 'var(--spacing-sm) var(--spacing-md)',
      backgroundColor: 'var(--color-bg-secondary)',
      borderBottom: '1px solid var(--color-border)',
      fontSize: 'var(--font-size-sm)'
    }}>
      {/* 編集状態表示 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--spacing-sm)',
        color: 'var(--color-text-secondary)'
      }}>
        <span>編集モード</span>
        {hasChanges && (
          <span style={{
            color: 'var(--color-warning)',
            fontWeight: 'bold'
          }}>
            {modifiedSegmentsCount}個の変更
          </span>
        )}
      </div>

      {/* 編集ボタン群 */}
      <div style={{
        display: 'flex',
        gap: 'var(--spacing-sm)',
        marginLeft: 'auto'
      }}>
        {/* 変更をリセット */}
        <button
          onClick={onReset}
          disabled={!hasChanges}
          style={{
            padding: '4px 8px',
            fontSize: 'var(--font-size-sm)',
            backgroundColor: 'transparent',
            border: '1px solid var(--color-border)',
            borderRadius: '4px',
            color: 'var(--color-text-secondary)',
            cursor: hasChanges ? 'pointer' : 'not-allowed',
            opacity: hasChanges ? 1 : 0.5,
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            if (hasChanges) {
              e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
          title="変更をリセット"
        >
          リセット
        </button>

        {/* 保存 */}
        <button
          onClick={onSave}
          disabled={!hasChanges}
          style={{
            padding: '4px 12px',
            fontSize: 'var(--font-size-sm)',
            backgroundColor: hasChanges ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
            border: 'none',
            borderRadius: '4px',
            color: hasChanges ? 'white' : 'var(--color-text-secondary)',
            cursor: hasChanges ? 'pointer' : 'not-allowed',
            opacity: hasChanges ? 1 : 0.5,
            transition: 'all 0.2s ease',
            fontWeight: 'bold'
          }}
          onMouseEnter={(e) => {
            if (hasChanges) {
              e.currentTarget.style.backgroundColor = 'var(--color-accent-hover)'
            }
          }}
          onMouseLeave={(e) => {
            if (hasChanges) {
              e.currentTarget.style.backgroundColor = 'var(--color-accent)'
            }
          }}
          title="変更を保存 (Ctrl+S)"
        >
          保存
        </button>
      </div>

      {/* キーボードショートカットヘルプ */}
      <div style={{
        fontSize: 'var(--font-size-xs)',
        color: 'var(--color-text-tertiary)',
        fontFamily: 'var(--font-family-mono)'
      }}>
        Ctrl+S: 保存 | Esc: キャンセル | ダブルクリック: 編集
      </div>
    </div>
  )
}

export default EditingToolbar