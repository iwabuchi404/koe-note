import { useState, useEffect } from 'react'

interface ServerStatus {
  isRunning: boolean
  pid?: number
}

/**
 * サーバー制御ロジックを管理するフック
 * Whisperサーバーの起動・停止・状態管理を担当
 */
export const useServerControl = () => {
  const [serverStatus, setServerStatus] = useState<ServerStatus>({ isRunning: false })
  const [error, setError] = useState<string>('')

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

  // サーバー起動
  const startServer = async () => {
    console.log('🔴 startServer called')
    try {
      setError('')
      console.log('🔴 Calling speechStartServer()')
      const success = await window.electronAPI.speechStartServer()
      
      if (success) {
        // 起動後少し待ってから状態を確認
        setTimeout(async () => {
          const status = await window.electronAPI.speechGetServerStatus()
          setServerStatus(status)
        }, 2000)
      } else {
        setError('サーバーの起動に失敗しました')
      }
    } catch (error) {
      setError('サーバー起動エラー: ' + String(error))
    }
  }

  // サーバー停止
  const stopServer = async () => {
    console.log('🔴 stopServer called')
    try {
      setError('')
      console.log('🔴 Calling speechStopServer()')
      await window.electronAPI.speechStopServer()
      
      // 停止後少し待ってから状態を確認
      setTimeout(async () => {
        const status = await window.electronAPI.speechGetServerStatus()
        setServerStatus(status)
      }, 1000)
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
    error,
    startServer,
    stopServer,
    clearError
  }
}