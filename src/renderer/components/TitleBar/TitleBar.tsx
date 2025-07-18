import React, { useState, useEffect, useCallback } from 'react'

/**
 * アプリケーションのタイトルバーコンポーネント
 * VSCodeスタイルのタイトルバーとウィンドウ操作ボタンを提供
 */
const TitleBar: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState<boolean>(false)

  // 最大化状態を取得
  useEffect(() => {
    const checkMaximized = async () => {
      try {
        const maximized = await window.electronAPI.windowIsMaximized()
        setIsMaximized(maximized)
      } catch (error) {
        console.error('最大化状態取得エラー:', error)
      }
    }
    checkMaximized()
  }, [])

  // ウィンドウ操作ハンドラー
  const handleMinimize = useCallback(async () => {
    try {
      await window.electronAPI.windowMinimize()
    } catch (error) {
      console.error('最小化エラー:', error)
    }
  }, [])

  const handleMaximize = useCallback(async () => {
    try {
      await window.electronAPI.windowMaximize()
      const maximized = await window.electronAPI.windowIsMaximized()
      setIsMaximized(maximized)
    } catch (error) {
      console.error('最大化エラー:', error)
    }
  }, [])

  const handleClose = useCallback(async () => {
    try {
      await window.electronAPI.windowClose()
    } catch (error) {
      console.error('ウィンドウ閉じるエラー:', error)
    }
  }, [])

  return (
    <div className="titlebar">
      <div className="titlebar__title">
        Voise Encoder - 音声録音・再生アプリ
      </div>
      <div className="titlebar__controls">
        <button 
          className="titlebar__button titlebar__button--minimize"
          onClick={handleMinimize}
          title="最小化"
        >
          ─
        </button>
        <button 
          className="titlebar__button titlebar__button--maximize"
          onClick={handleMaximize}
          title={isMaximized ? "元のサイズに戻す" : "最大化"}
        >
          {isMaximized ? '❐' : '□'}
        </button>
        <button 
          className="titlebar__button titlebar__button--close"
          onClick={handleClose}
          title="閉じる"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

export default TitleBar