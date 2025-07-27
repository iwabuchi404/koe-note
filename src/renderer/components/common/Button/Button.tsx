import React from 'react'

export type ButtonVariant = 
  | 'primary'
  | 'secondary' 
  | 'success'
  | 'warning'
  | 'danger'
  | 'ghost'

export type ButtonSize = 'small' | 'medium' | 'large'

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** ボタンのバリエーション */
  variant?: ButtonVariant
  /** ボタンのサイズ */
  size?: ButtonSize
  /** アイコン（絵文字など） */
  icon?: string
  /** ローディング状態 */
  loading?: boolean
  /** フルWidth */
  fullWidth?: boolean
  /** 子要素 */
  children: React.ReactNode
}

/**
 * 共通ボタンコンポーネント
 * アプリケーション全体で一貫したボタンスタイルを提供
 */
const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'medium',
  icon,
  loading = false,
  fullWidth = false,
  className = '',
  disabled,
  children,
  ...props
}) => {
  const baseClasses = [
    'common-button',
    `common-button--${variant}`,
    `common-button--${size}`,
    fullWidth ? 'common-button--full-width' : '',
    loading ? 'common-button--loading' : '',
    className
  ].filter(Boolean).join(' ')

  return (
    <button
      className={baseClasses}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className="common-button__spinner">🔄</span>
      )}
      
      {icon && !loading && (
        <span className="common-button__icon">{icon}</span>
      )}
      
      <span className="common-button__text">
        {children}
      </span>
    </button>
  )
}

export default Button