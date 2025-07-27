import React from 'react'
import { Button, ButtonProps } from '../Button'

export interface EmptyStateProps {
  /** アイコン */
  icon?: string
  /** タイトル */
  title: string
  /** 説明文 */
  description?: string
  /** アクションボタンのプロパティ */
  action?: {
    label: string
    onClick: () => void
  } & Partial<ButtonProps>
  /** カスタムクラス名 */
  className?: string
}

/**
 * 共通空状態コンポーネント
 * データが存在しない場合の統一された表示
 */
const EmptyState: React.FC<EmptyStateProps> = ({
  icon = '📄',
  title,
  description,
  action,
  className = ''
}) => {
  const baseClasses = [
    'common-empty-state',
    className
  ].filter(Boolean).join(' ')

  return (
    <div className={baseClasses}>
      <div className="common-empty-state__content">
        <div className="common-empty-state__icon">
          {icon}
        </div>
        
        <div className="common-empty-state__title">
          {title}
        </div>
        
        {description && (
          <div className="common-empty-state__description">
            {description}
          </div>
        )}
        
        {action && (
          <div className="common-empty-state__action">
            <Button
              variant="primary"
              {...action}
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export default EmptyState