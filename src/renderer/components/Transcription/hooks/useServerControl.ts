import { LoggerFactory, LogCategories } from '../../../utils/LoggerFactory'
import { useState, useEffect } from 'react'

const logger = LoggerFactory.getLogger(LogCategories.NETWORK_API)

interface ServerStatus {
  isRunning: boolean
  pid?: number
}

export type ServerStatusLabel = 'stopped' | 'starting' | 'running' | 'failed' | 'external'

/**
 * サーバー制御ロジックを管理するフック
 * Whisperサーバーの起動・停止・状態管理を担当
 */
export const useServerControl = () => {
  const [serverStatus, setServerStatus] = useState<ServerStatus>({ isRunning: false })
  const [statusLabel, setStatusLabel] = useState<ServerStatusLabel>('stopped')
  const [error, setError] = useState<string>('')

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

  // サーバー起動
  const startServer = async () => {
    logger.debug('🔴 startServer called')
    try {
      setError('')
      setStatusLabel('starting')
      logger.debug('🔴 Calling speechStartServer()')
      const success = await window.electronAPI.speechStartServer()
      
      if (!success) {
        setError('サーバーの起動に失敗しました')
        setStatusLabel('failed')
      }
    } catch (error) {
      setError('サーバー起動エラー: ' + String(error))
      setStatusLabel('failed')
    }
  }

  // サーバー停止
  const stopServer = async () => {
    logger.debug('🔴 stopServer called')
    try {
      setError('')
      logger.debug('🔴 Calling speechStopServer()')
      await window.electronAPI.speechStopServer()
    } catch (error) {
      setError('サーバー停止エラー: ' + String(error))
    }
  }

  // エラークリア
  const clearError = () => {
    setError('')
  }

  return {
    serverStatus,
    statusLabel,
    error,
    startServer,
    stopServer,
    clearError
  }
}