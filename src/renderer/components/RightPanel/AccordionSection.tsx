/**
 * AccordionSection - 再利用可能なアコーディオンセクション
 * 
 * 責務:
 * - アコーディオンの開閉制御
 * - ヘッダーとコンテンツの表示
 * - アニメーション効果
 */

import React from 'react'

interface AccordionSectionProps {
  title: string
  icon?: string
  statusText?: string
  statusColor?: string
  isExpanded: boolean
  onToggle: () => void
  children: React.ReactNode
  isMain?: boolean // メインエリア（可変サイズ）かどうか
  disabled?: boolean // 開閉無効化
}

const AccordionSection: React.FC<AccordionSectionProps> = ({
  title,
  icon = '📄',
  statusText,
  statusColor,
  isExpanded,
  onToggle,
  children,
  isMain = false,
  disabled = false
}) => {
  return (
    <div className={`accordion-section ${isMain ? 'accordion-section--main' : ''}`}>
      {/* ヘッダー */}
      <div 
        className={`accordion-header ${disabled ? 'accordion-header--disabled' : ''}`}
        onClick={disabled ? undefined : onToggle}
        style={{
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.7 : 1
        }}
      >
        <h3 className="accordion-title">
          {icon} {title}
          {statusText && (
            <span 
              style={{ 
                marginLeft: '8px', 
                color: statusColor || 'var(--color-text-secondary)' 
              }}
            >
              {statusText}
            </span>
          )}
        </h3>
        {!disabled && (
          <span className="accordion-icon">
            {isExpanded ? '▼' : '▶'}
          </span>
        )}
      </div>

      {/* コンテンツ */}
      <div 
        className={`accordion-content ${isExpanded ? 'accordion-content--expanded' : ''}`}
        style={{ 
          display: isExpanded ? (isMain ? 'flex' : 'block') : 'none' 
        }}
      >
        {children}
      </div>
    </div>
  )
}

export default AccordionSection