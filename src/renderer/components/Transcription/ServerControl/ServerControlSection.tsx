/**
 * ServerControlSection - サーバー制御とモデル選択
 * 
 * 責務:
 * - 音声認識サーバーの起動/停止
 * - サーバー状態の監視と表示
 * - 音声認識モデルの選択/変更
 */

import { LoggerFactory, LogCategories } from '../../../utils/LoggerFactory'
import React, { useState, useEffect } from 'react'
import { modelDownloadService } from '../../../services/ModelDownloadService'
import type { ModelInfo } from '../../../types/ModelTypes'

const logger = LoggerFactory.getLogger(LogCategories.NETWORK_API)

interface ServerStatus {
  isRunning: boolean
  pid?: number
}

type ServerStatusLabel = 'stopped' | 'starting' | 'running' | 'failed' | 'external'

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
  const [statusLabel, setStatusLabel] = useState<ServerStatusLabel>('stopped')
  const [selectedModel, setSelectedModel] = useState<string>(currentModel)
  const [installedModels, setInstalledModels] = useState<ModelInfo[]>([])

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
        logger.error('サーバー状態取得エラー:', error)
      }
    }

    checkServerStatus()
    const interval = setInterval(checkServerStatus, 5000)

    return () => clearInterval(interval)
  }, [])

  // リアルタイムのサーバー状態通知を受信
  useEffect(() => {
    window.electronAPI.onSpeechServerStatus((data) => {
      logger.debug(`サーバー状態通知: ${data.status}`)
      setStatusLabel(data.status as ServerStatusLabel)
      if (data.status === 'running') {
        setServerStatus({ isRunning: true, pid: data.pid })
      } else if (data.status === 'stopped' || data.status === 'failed') {
        setServerStatus({ isRunning: false })
      }
    })
  }, [])

  // インストール済みモデルの取得（初回＋定期）
  useEffect(() => {
    const loadInstalled = async () => {
      try {
        const models = await modelDownloadService.getInstalledModels()
        setInstalledModels(models)
      } catch (error) {
        logger.error('インストール済みモデル取得エラー:', error)
      }
    }

    loadInstalled()
    const interval = setInterval(loadInstalled, 5000)
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
            color: statusLabel === 'running' || statusLabel === 'external' ? 'var(--color-success)' 
                 : statusLabel === 'starting' ? 'var(--color-warning, #f0ad4e)'
                 : statusLabel === 'failed' ? 'var(--color-error)'
                 : 'var(--color-error)',
            fontWeight: 'var(--font-weight-medium)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            {statusLabel === 'running' && '🟢 起動中'}
            {statusLabel === 'starting' && '🟡 起動中...'}
            {statusLabel === 'stopped' && '🔴 停止中'}
            {statusLabel === 'failed' && '⚠️ 起動失敗'}
            {statusLabel === 'external' && '🟢 外部サーバー'}
            {serverStatus.pid && serverStatus.pid > 0 && (
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
            disabled={statusLabel === 'running' || statusLabel === 'starting' || statusLabel === 'external'}
            style={{
              padding: '6px 12px',
              fontSize: 'var(--font-size-sm)',
              backgroundColor: (statusLabel === 'running' || statusLabel === 'starting' || statusLabel === 'external') ? 'var(--color-bg-tertiary)' : 'var(--color-success)',
              color: (statusLabel === 'running' || statusLabel === 'starting' || statusLabel === 'external') ? 'var(--color-text-secondary)' : 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: (statusLabel === 'running' || statusLabel === 'starting' || statusLabel === 'external') ? 'not-allowed' : 'pointer',
              opacity: (statusLabel === 'running' || statusLabel === 'starting' || statusLabel === 'external') ? 0.6 : 1,
              transition: 'all 0.2s ease'
            }}
          >
            🚀 起動
          </button>
          <button
            onClick={onServerStop}
            disabled={statusLabel === 'stopped' || statusLabel === 'starting' || statusLabel === 'failed'}
            style={{
              padding: '6px 12px',
              fontSize: 'var(--font-size-sm)',
              backgroundColor: (statusLabel === 'stopped' || statusLabel === 'starting' || statusLabel === 'failed') ? 'var(--color-bg-tertiary)' : 'var(--color-error)',
              color: (statusLabel === 'stopped' || statusLabel === 'starting' || statusLabel === 'failed') ? 'var(--color-text-secondary)' : 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: (statusLabel === 'stopped' || statusLabel === 'starting' || statusLabel === 'failed') ? 'not-allowed' : 'pointer',
              opacity: (statusLabel === 'stopped' || statusLabel === 'starting' || statusLabel === 'failed') ? 0.6 : 1,
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
            disabled={isChangingModel || installedModels.length === 0}
            style={{
              width: '100%',
              padding: '6px 8px',
              fontSize: 'var(--font-size-sm)',
              border: '1px solid var(--color-border)',
              borderRadius: '4px',
              backgroundColor: 'var(--color-bg-primary)',
              color: 'var(--color-text-primary)',
              cursor: (isChangingModel || installedModels.length === 0) ? 'not-allowed' : 'pointer',
              opacity: (isChangingModel || installedModels.length === 0) ? 0.6 : 1
            }}
          >
            {installedModels.length > 0 ? (
              installedModels.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name || m.id}
                </option>
              ))
            ) : (
              <option value="" disabled>モデルをダウンロードしてください</option>
            )}
          </select>
          
          {/* モデルがインストールされていない場合のメッセージ */}
          {installedModels.length === 0 && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              marginTop: '4px',
              padding: '4px 8px',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-secondary)',
              backgroundColor: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
              borderRadius: '4px',
              zIndex: 10
            }}>
              📥 モデル管理タブからモデルをダウンロードしてください
            </div>
          )}
          
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