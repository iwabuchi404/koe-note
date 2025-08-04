/**
 * タブシステムのコンテキストとプロバイダー
 */

import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react'
import { 
  TabData, 
  TabType, 
  TabStatus, 
  TabContextType, 
  TabManagerAction,
  AdvancedRecordingTabData,
  PlayerTabData
} from '../types/TabTypes'
import { LoggerFactory, LogCategories } from '../utils/LoggerFactory'

// ログ取得
const logger = LoggerFactory.getLogger(LogCategories.TAB_SYSTEM)

// タブリデューサー
const tabReducer = (state: TabData[], action: TabManagerAction): TabData[] => {
  switch (action.type) {
    case 'CREATE_TAB': {
      const { type, title, data, isClosable = true, tabId } = action.payload
      if (!type || !title) {
        throw new Error('CREATE_TAB requires type and title')
      }
      const newTab: TabData = {
        id: tabId || `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type,
        title,
        status: TabStatus.IDLE,
        isActive: false,
        isClosable,
        data,
        createdAt: new Date(),
        lastAccessedAt: new Date()
      }
      logger.debug('新しいタブを作成', { tabId: newTab.id, type, title })
      return [...state, newTab]
    }

    case 'CLOSE_TAB': {
      const { tabId } = action.payload
      const filteredTabs = state.filter(tab => tab.id !== tabId)
      logger.debug('タブを閉じました', { tabId, remainingTabs: filteredTabs.length })
      return filteredTabs
    }

    case 'ACTIVATE_TAB': {
      const { tabId } = action.payload
      return state.map(tab => ({
        ...tab,
        isActive: tab.id === tabId,
        lastAccessedAt: tab.id === tabId ? new Date() : tab.lastAccessedAt
      }))
    }

    case 'UPDATE_TAB': {
      const { tabId, updates } = action.payload
      return state.map(tab => 
        tab.id === tabId 
          ? { ...tab, ...updates, lastAccessedAt: new Date() }
          : tab
      )
    }

    case 'REORDER_TABS': {
      const { fromIndex, toIndex } = action.payload
      if (fromIndex === undefined || toIndex === undefined) {
        throw new Error('REORDER_TABS requires fromIndex and toIndex')
      }
      const newTabs = [...state]
      const [removed] = newTabs.splice(fromIndex, 1)
      newTabs.splice(toIndex, 0, removed)
      logger.debug('タブを並び替え', { fromIndex, toIndex })
      return newTabs
    }

    default:
      return state
  }
}

// コンテキスト作成
const TabContext = createContext<TabContextType | null>(null)

// プロバイダーコンポーネント
export const TabProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tabs, dispatch] = useReducer(tabReducer, [])

  // アクティブタブID計算
  const activeTabId = tabs.find(tab => tab.isActive)?.id || null

  // タブ作成（固定2タブ構成）
  const createTab = useCallback((type: TabType, data?: AdvancedRecordingTabData | PlayerTabData | Record<string, unknown>): string => {
    const title = generateTabTitle(type, data)
    const newTabId = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    if (type === TabType.ADVANCED_RECORDING) {
      // タブ1（録音・文字起こし）を更新または作成
      const existingTab1 = tabs.find(tab => tab.type === TabType.WELCOME || tab.type === TabType.ADVANCED_RECORDING)
      if (existingTab1) {
        // 既存のタブ1を録音タブに更新
        dispatch({
          type: 'UPDATE_TAB',
          payload: { 
            tabId: existingTab1.id, 
            updates: { type, title, data, status: TabStatus.IDLE }
          }
        })
        activateTab(existingTab1.id)
        return existingTab1.id
      } else {
        // タブ1を新規作成
        dispatch({
          type: 'CREATE_TAB',
          payload: { type, title, data, isClosable: false, tabId: newTabId }
        })
        activateTab(newTabId)
        return newTabId
      }
    } else if (type === TabType.PLAYER) {
      // タブ2（プレイヤー）を更新または作成
      const existingTab2 = tabs.find(tab => tab.type === TabType.PLAYER)
      if (existingTab2) {
        // 既存のタブ2を更新
        dispatch({
          type: 'UPDATE_TAB',
          payload: { 
            tabId: existingTab2.id, 
            updates: { title, data, status: TabStatus.IDLE }
          }
        })
        activateTab(existingTab2.id)
        return existingTab2.id
      } else {
        // タブ2を新規作成
        dispatch({
          type: 'CREATE_TAB',
          payload: { type, title, data, isClosable: true, tabId: newTabId }
        })
        activateTab(newTabId)
        return newTabId
      }
    } else {
      // ウェルカムタブ（タブ1のデフォルト状態）
      dispatch({
        type: 'CREATE_TAB',
        payload: { type, title, data, isClosable: false, tabId: newTabId }
      })
      activateTab(newTabId)
      return newTabId
    }
  }, [tabs])

  // タブ閉じる（プレイヤータブのみ閉じ可能）
  const closeTab = useCallback((tabId: string) => {
    const tabToClose = tabs.find(tab => tab.id === tabId)
    if (!tabToClose) return
    
    // プレイヤータブのみクローズ可能
    if (tabToClose.type !== TabType.PLAYER) {
      logger.warn('プレイヤータブ以外のクローズが試行されました', { tabId, type: tabToClose.type })
      return
    }

    dispatch({ type: 'CLOSE_TAB', payload: { tabId } })

    // プレイヤータブが閉じられた場合、タブ1をアクティブにする
    const tab1 = tabs.find(tab => tab.type === TabType.WELCOME || tab.type === TabType.ADVANCED_RECORDING)
    if (tab1) {
      activateTab(tab1.id)
    }
  }, [tabs])

  // タブアクティブ化
  const activateTab = useCallback((tabId: string) => {
    dispatch({ type: 'ACTIVATE_TAB', payload: { tabId } })
    logger.debug('タブをアクティブ化', { tabId })
  }, [])

  // タブ更新
  const updateTab = useCallback((tabId: string, updates: Partial<TabData>) => {
    dispatch({ type: 'UPDATE_TAB', payload: { tabId, updates } })
  }, [])

  // タブ並び替え
  const reorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    dispatch({ type: 'REORDER_TABS', payload: { fromIndex, toIndex } })
  }, [])

  // アクティブタブ取得
  const getActiveTab = useCallback((): TabData | null => {
    return tabs.find(tab => tab.isActive) || null
  }, [tabs])

  // ID指定タブ取得
  const getTabById = useCallback((tabId: string): TabData | null => {
    return tabs.find(tab => tab.id === tabId) || null
  }, [tabs])

  // 初期化時にウェルカムタブを作成
  useEffect(() => {
    if (tabs.length === 0) {
      logger.info('タブシステム初期化: ウェルカムタブを作成')
      createTab(TabType.WELCOME)
    }
  }, [tabs.length, createTab])

  const contextValue: TabContextType = {
    tabs,
    activeTabId,
    createTab,
    closeTab,
    activateTab,
    updateTab,
    reorderTabs,
    getActiveTab,
    getTabById
  }

  return (
    <TabContext.Provider value={contextValue}>
      {children}
    </TabContext.Provider>
  )
}

// タブコンテキスト使用フック
export const useTabContext = (): TabContextType => {
  const context = useContext(TabContext)
  if (!context) {
    throw new Error('useTabContext must be used within TabProvider')
  }
  return context
}

// タブタイトル生成ヘルパー
const generateTabTitle = (type: TabType, data?: AdvancedRecordingTabData | PlayerTabData | Record<string, unknown>): string => {
  switch (type) {
    case TabType.WELCOME:
      return 'Welcome'
    case TabType.ADVANCED_RECORDING:
      return '新録音システム'
    case TabType.PLAYER:
      return (data as PlayerTabData)?.fileName || 'プレイヤー'
    default:
      return 'タブ'
  }
}