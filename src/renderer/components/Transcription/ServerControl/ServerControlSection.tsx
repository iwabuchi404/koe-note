/**
 * ServerControlSection - サーバー制御とモデル選択
 * 
 * 責務:
 * - 音声認識サーバーの起動/停止
 * - サーバー状態の監視と表示
 * - 音声認識モデルの選択/変更
 */

import React, { useState, useEffect } from 'react'

interface ServerStatus {
  isRunning: boolean
  pid?: number
}

interface ServerControlSectionProps {
  currentModel: string
  onModelChange: (model: string) => void
  isChangingModel: boolean
  onServerStart: () => Promise<void>
  onServerStop: () => Promise<void>
}

const ServerControlSection: React.FC<ServerControlSectionProps> = ({
  currentModel,
  onModelChange,
  isChangingModel,
  onServerStart,
  onServerStop
}) => {
  const [serverStatus, setServerStatus] = useState<ServerStatus>({ isRunning: false })
  const [selectedModel, setSelectedModel] = useState<string>(currentModel)

  // currentModelと同期
  useEffect(() => {
    setSelectedModel(currentModel)
  }, [currentModel])

  // サーバー状態を定期的にチェック
  useEffect(() => {
    const checkServerStatus = async () => {
      try {
        const status = await window.electronAPI.speechGetServerStatus()
        setServerStatus(status)
      } catch (error) {
        console.error('サーバー状態取得エラー:', error)
      }
    }

    checkServerStatus()
    const interval = setInterval(checkServerStatus, 5000)

    return () => clearInterval(interval)
  }, [])

  // モデル選択ハンドラー
  const handleModelChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newModel = event.target.value
    setSelectedModel(newModel)
    onModelChange(newModel)
  }

  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: 'var(--spacing-lg)',
      justifyContent: 'space-between',
      padding: 'var(--spacing-md)',
      backgroundColor: 'var(--color-bg-secondary)',
      borderRadius: '8px',
      border: '1px solid var(--color-border)'
    }}>
      {/* サーバー制御（左側） */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 'var(--spacing-md)' 
      }}>
        {/* サーバー状態表示 */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: 'var(--spacing-sm)' 
        }}>
          <span style={{ 
            fontSize: 'var(--font-size-sm)', 
            color: 'var(--color-text-secondary)' 
          }}>
            サーバー状態:
          </span>
          <span style={{ 
            fontSize: 'var(--font-size-sm)', 
            color: serverStatus.isRunning ? 'var(--color-success)' : 'var(--color-error)',
            fontWeight: 'var(--font-weight-medium)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            {serverStatus.isRunning ? '🟢 起動中' : '🔴 停止中'}
            {serverStatus.pid && (
              <span style={{ 
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-tertiary)'
              }}>
                (PID: {serverStatus.pid})
              </span>
            )}
          </span>
        </div>

        {/* サーバー制御ボタン */}
        <div style={{ 
          display: 'flex', 
          gap: 'var(--spacing-sm)' 
        }}>
          <button
            onClick={onServerStart}
            disabled={serverStatus.isRunning}
            style={{
              padding: '6px 12px',
              fontSize: 'var(--font-size-sm)',
              backgroundColor: serverStatus.isRunning ? 'var(--color-bg-tertiary)' : 'var(--color-success)',
              color: serverStatus.isRunning ? 'var(--color-text-secondary)' : 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: serverStatus.isRunning ? 'not-allowed' : 'pointer',
              opacity: serverStatus.isRunning ? 0.6 : 1,
              transition: 'all 0.2s ease'
            }}
          >
            🚀 起動
          </button>
          <button
            onClick={onServerStop}
            disabled={!serverStatus.isRunning}
            style={{
              padding: '6px 12px',
              fontSize: 'var(--font-size-sm)',
              backgroundColor: !serverStatus.isRunning ? 'var(--color-bg-tertiary)' : 'var(--color-error)',
              color: !serverStatus.isRunning ? 'var(--color-text-secondary)' : 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: !serverStatus.isRunning ? 'not-allowed' : 'pointer',
              opacity: !serverStatus.isRunning ? 0.6 : 1,
              transition: 'all 0.2s ease'
            }}
          >
            🛑 停止
          </button>
        </div>
      </div>

      {/* モデル選択（右側） */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: 'var(--spacing-sm)',
        minWidth: '200px'
      }}>
        <label 
          htmlFor="model-select"
          style={{ 
            fontSize: 'var(--font-size-sm)', 
            color: 'var(--color-text-secondary)',
            whiteSpace: 'nowrap'
          }}
        >
          音声認識モデル:
        </label>
        <div style={{ position: 'relative', flex: 1 }}>
          <select
            id="model-select"
            value={selectedModel}
            onChange={handleModelChange}
            disabled={isChangingModel}
            style={{
              width: '100%',
              padding: '6px 8px',
              fontSize: 'var(--font-size-sm)',
              border: '1px solid var(--color-border)',
              borderRadius: '4px',
              backgroundColor: 'var(--color-bg-primary)',
              color: 'var(--color-text-primary)',
              cursor: isChangingModel ? 'not-allowed' : 'pointer',
              opacity: isChangingModel ? 0.6 : 1
            }}
          >
            <option value="small">Small (高速)</option>
            <option value="medium">Medium (バランス)</option>
            <option value="large">Large (高精度)</option>
            <option value="large-v2">Large-v2 (最高精度)</option>
          </select>
          
          {/* モデル変更中のローディング表示 */}
          {isChangingModel && (
            <div style={{
              position: 'absolute',
              right: '8px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--color-accent)'
            }}>
              ⏳
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ServerControlSection