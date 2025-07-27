import React from 'react'
import { Button } from '../../common'

interface ServerActionButtonsProps {
  isRunning: boolean
  onStartServer: () => void
  onStopServer: () => void
  disabled?: boolean
}

/**
 * サーバー操作ボタンコンポーネント
 * Whisperサーバーの起動・停止ボタンを提供
 */
const ServerActionButtons: React.FC<ServerActionButtonsProps> = ({
  isRunning,
  onStartServer,
  onStopServer,
  disabled = false
}) => {
  return (
    <div className="server-actions">
      {isRunning ? (
        <Button
          variant="danger"
          icon="🛑"
          onClick={onStopServer}
          disabled={disabled}
          className="server-actions__button"
        >
          サーバー停止
        </Button>
      ) : (
        <Button
          variant="success"
          icon="▶️"
          onClick={onStartServer}
          disabled={disabled}
          className="server-actions__button"
        >
          サーバー起動
        </Button>
      )}
    </div>
  )
}

export default ServerActionButtons