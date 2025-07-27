import React from 'react'

interface ServerStatusDisplayProps {
  isRunning: boolean
  pid?: number
}

/**
 * サーバー状態表示コンポーネント
 * Whisperサーバーの起動状態を視覚的に表示
 */
const ServerStatusDisplay: React.FC<ServerStatusDisplayProps> = ({
  isRunning,
  pid
}) => {
  return (
    <div className="server-status">
      <div className="server-status__indicator">
        <span className={`server-status__icon ${isRunning ? 'server-status__icon--running' : 'server-status__icon--stopped'}`}>
          {isRunning ? '🟢' : '🔴'}
        </span>
        <span className="server-status__text">
          {isRunning ? 'サーバー稼働中' : 'サーバー停止中'}
        </span>
      </div>
      
      {isRunning && pid && (
        <div className="server-status__details">
          <span className="server-status__pid">PID: {pid}</span>
        </div>
      )}
    </div>
  )
}

export default ServerStatusDisplay