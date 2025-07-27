import React, { useEffect, useState } from 'react'

export type NotificationType = 'info' | 'success' | 'warning' | 'error'

export interface NotificationProps {
  /** 通知の種類 */
  type?: NotificationType
  /** タイトル */
  title?: string
  /** メッセージ */
  message: string
  /** アイコン（自動設定されない場合） */
  icon?: string
  /** 表示時間（ms）、0で自動消去しない */
  duration?: number
  /** 表示状態 */
  visible?: boolean
  /** 閉じる時のコールバック */
  onClose?: () => void
  /** クリック時のコールバック */
  onClick?: () => void
}

/**
 * 共通通知コンポーネント
 * 各種通知メッセージを一貫したスタイルで表示
 */
const Notification: React.FC<NotificationProps> = ({
  type = 'info',
  title,
  message,
  icon,
  duration = 5000,
  visible = true,
  onClose,
  onClick
}) => {
  const [isVisible, setIsVisible] = useState(visible)

  // アイコンの自動設定
  const getIcon = (): string => {
    if (icon) return icon
    
    switch (type) {
      case 'success': return '✅'
      case 'warning': return '⚠️'
      case 'error': return '❌'
      case 'info':
      default: return 'ℹ️'
    }
  }

  // 自動消去タイマー
  useEffect(() => {
    setIsVisible(visible)
  }, [visible])

  useEffect(() => {
    if (isVisible && duration > 0) {
      const timer = setTimeout(() => {
        handleClose()
      }, duration)

      return () => clearTimeout(timer)
    }
  }, [isVisible, duration])

  const handleClose = () => {
    setIsVisible(false)
    onClose?.()
  }

  const handleClick = () => {
    onClick?.()
  }

  if (!isVisible) {
    return null
  }

  const baseClasses = [
    'common-notification',
    `common-notification--${type}`,
    onClick ? 'common-notification--clickable' : ''
  ].filter(Boolean).join(' ')

  return (
    <div 
      className={baseClasses}
      onClick={handleClick}
    >
      <div className="common-notification__icon">
        {getIcon()}
      </div>
      
      <div className="common-notification__content">
        {title && (
          <div className="common-notification__title">
            {title}
          </div>
        )}
        
        <div className="common-notification__message">
          {message}
        </div>
      </div>

      {onClose && (
        <button
          className="common-notification__close"
          onClick={(e) => {
            e.stopPropagation()
            handleClose()
          }}
          aria-label="通知を閉じる"
        >
          ✕
        </button>
      )}
    </div>
  )
}

export default Notification