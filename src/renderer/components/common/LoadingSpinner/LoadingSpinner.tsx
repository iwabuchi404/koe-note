import React from 'react'

export type SpinnerSize = 'small' | 'medium' | 'large'

export interface LoadingSpinnerProps {
  /** スピナーのサイズ */
  size?: SpinnerSize
  /** ロード中のメッセージ */
  message?: string
  /** カスタムアイコン */
  icon?: string
  /** インライン表示 */
  inline?: boolean
  /** フルスクリーンオーバーレイ */
  overlay?: boolean
}

/**
 * 共通ローディングスピナーコンポーネント
 * 各種ローディング状態を一貫したスタイルで表示
 */
const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'medium',
  message,
  icon = '🔄',
  inline = false,
  overlay = false
}) => {
  const baseClasses = [
    'common-loading-spinner',
    `common-loading-spinner--${size}`,
    inline ? 'common-loading-spinner--inline' : '',
    overlay ? 'common-loading-spinner--overlay' : ''
  ].filter(Boolean).join(' ')

  const content = (
    <div className="common-loading-spinner__content">
      <div className="common-loading-spinner__icon">
        {icon}
      </div>
      
      {message && (
        <div className="common-loading-spinner__message">
          {message}
        </div>
      )}
    </div>
  )

  if (overlay) {
    return (
      <div className={baseClasses}>
        <div className="common-loading-spinner__backdrop">
          {content}
        </div>
      </div>
    )
  }

  return (
    <div className={baseClasses}>
      {content}
    </div>
  )
}

export default LoadingSpinner