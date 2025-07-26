/**
 * useDeviceManager - デバイス管理ロジックを分離したカスタムフック
 * 
 * 責務:
 * - マイクロフォンデバイスの管理
 * - デスクトップキャプチャソースの管理
 * - システム音声デバイス（ステレオミックス等）の管理
 * - デバイス変更の検出と更新
 */

import { useState, useEffect, useCallback } from 'react'

export interface DeviceInfo {
  deviceId: string
  label: string
  kind: MediaDeviceKind
  groupId?: string
}

export interface DesktopSource {
  id: string
  name: string
  thumbnail?: string
}

export interface DeviceManagerState {
  // マイクロフォンデバイス
  availableDevices: DeviceInfo[]
  selectedDevice: string
  
  // デスクトップキャプチャソース
  desktopSources: DesktopSource[]
  selectedDesktopSource: string
  
  // システム音声デバイス（ステレオミックス等）
  systemAudioDevices: DeviceInfo[]
  selectedSystemDevice: string
  
  // 状態
  isLoading: boolean
  error: string | null
}

/**
 * デバイス管理カスタムフック
 */
export const useDeviceManager = () => {
  const [state, setState] = useState<DeviceManagerState>({
    availableDevices: [],
    selectedDevice: '',
    desktopSources: [],
    selectedDesktopSource: '',
    systemAudioDevices: [],
    selectedSystemDevice: '',
    isLoading: true,
    error: null
  })

  /**
   * マイクロフォンデバイス一覧を取得
   */
  const updateAudioDevices = useCallback(async () => {
    try {
      console.log('🎤 マイクロフォンデバイス一覧取得開始')
      
      const devices = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = devices.filter(device => device.kind === 'audioinput')
      
      const deviceList: DeviceInfo[] = audioInputs.map(device => ({
        deviceId: device.deviceId,
        label: device.label || `デバイス ${device.deviceId.slice(0, 8)}`,
        kind: device.kind,
        groupId: device.groupId
      }))
      
      console.log('🎤 検出されたマイクロフォンデバイス:', deviceList.length, '台')
      deviceList.forEach((device, index) => {
        console.log(`  ${index + 1}: ${device.label} (${device.deviceId.slice(0, 8)})`)
      })
      
      setState(prev => ({
        ...prev,
        availableDevices: deviceList,
        selectedDevice: prev.selectedDevice || (deviceList[0]?.deviceId || ''),
        error: null
      }))
      
    } catch (error) {
      console.error('🎤 マイクロフォンデバイス取得エラー:', error)
      setState(prev => ({
        ...prev,
        error: `マイクロフォンデバイスの取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`
      }))
    }
  }, [])

  /**
   * システム音声デバイス（ステレオミックス等）を取得
   */
  const updateSystemAudioDevices = useCallback(async () => {
    try {
      console.log('🔊 システム音声デバイス取得開始')
      
      const devices = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = devices.filter(device => device.kind === 'audioinput')
      
      // システム音声・仮想音声デバイスを分離
      const systemDevices = audioInputs.filter(device => {
        const label = device.label.toLowerCase()
        return label.includes('stereo mix') ||
               label.includes('what you hear') ||
               label.includes('system audio') ||
               label.includes('ステレオミックス') ||
               label.includes('voicemeeter') ||
               label.includes('virtual audio') ||
               label.includes('vac') ||
               label.includes('virtual cable')
      })
      
      const systemDeviceList: DeviceInfo[] = systemDevices.map(device => ({
        deviceId: device.deviceId,
        label: device.label,
        kind: device.kind,
        groupId: device.groupId
      }))
      
      console.log('🔊 検出されたシステム音声デバイス:', systemDeviceList.length, '台')
      systemDeviceList.forEach((device, index) => {
        console.log(`  ${index + 1}: ${device.label}`)
      })
      
      setState(prev => ({
        ...prev,
        systemAudioDevices: systemDeviceList,
        selectedSystemDevice: prev.selectedSystemDevice || (systemDeviceList[0]?.deviceId || ''),
        error: null
      }))
      
    } catch (error) {
      console.error('🔊 システム音声デバイス取得エラー:', error)
      setState(prev => ({
        ...prev,
        error: `システム音声デバイスの取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`
      }))
    }
  }, [])

  /**
   * デスクトップキャプチャソース一覧を取得
   */
  const updateDesktopSources = useCallback(async () => {
    try {
      console.log('🖥️ デスクトップキャプチャソース取得開始')
      
      const sources = await window.electronAPI.getDesktopSources()
      
      console.log('🔍 デスクトップソース詳細分析:', sources.length, '個')
      sources.forEach((source, index) => {
        console.log(`  ${index + 1}: ID="${source.id}", Name="${source.name}"`)
      })
      
      // スクリーンソース優先選択（screen: で始まるもの）
      const screenSources = sources.filter(source => source.id.startsWith('screen:'))
      console.log('🖥️ スクリーンソース候補:', screenSources.length, '個')
      
      // 最優先: メインスクリーンを特定（英語・日本語両対応）
      let selectedSource = screenSources.find(source => {
        const name = source.name.toLowerCase()
        return name.includes('entire screen') || name.includes('全画面')
      })
      
      // フォールバック: プライマリディスプレイを選択（通常はscreen:0:0）
      if (!selectedSource) {
        selectedSource = screenSources.find(source => source.id === 'screen:0:0')
      }
      
      // フォールバック: 任意のスクリーンソース
      if (!selectedSource && screenSources.length > 0) {
        selectedSource = screenSources[0]
      }
      
      // 最終フォールバック: Screen名や画面名を含むソース（日本語・英語両対応）
      if (!selectedSource) {
        selectedSource = sources.find(source => {
          const name = source.name.toLowerCase()
          return (name.includes('screen') || source.name.includes('画面')) && 
                 !source.id.startsWith('window:')
        })
      }
      
      setState(prev => ({
        ...prev,
        desktopSources: sources,
        selectedDesktopSource: selectedSource?.id || prev.selectedDesktopSource || sources[0]?.id || '',
        error: null
      }))
      
      if (selectedSource) {
        console.log('✅ 選択されたデスクトップソース:', selectedSource)
      } else {
        console.warn('⚠️ 適切なスクリーンソースが見つかりません')
      }
      
    } catch (error) {
      console.error('🖥️ デスクトップソース取得エラー:', error)
      setState(prev => ({
        ...prev,
        error: `デスクトップソースの取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`
      }))
    }
  }, [])

  /**
   * すべてのデバイス情報を更新
   */
  const refreshAllDevices = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }))
    
    try {
      await Promise.all([
        updateAudioDevices(),
        updateSystemAudioDevices(),
        updateDesktopSources()
      ])
    } catch (error) {
      console.error('🔄 デバイス一括更新エラー:', error)
    } finally {
      setState(prev => ({ ...prev, isLoading: false }))
    }
  }, [updateAudioDevices, updateSystemAudioDevices, updateDesktopSources])

  /**
   * デバイス選択を更新
   */
  const selectDevice = useCallback((deviceId: string) => {
    console.log('🎤 マイクロフォンデバイス選択:', deviceId)
    setState(prev => ({ ...prev, selectedDevice: deviceId }))
  }, [])

  const selectDesktopSource = useCallback((sourceId: string) => {
    console.log('🖥️ デスクトップソース選択:', sourceId)
    setState(prev => ({ ...prev, selectedDesktopSource: sourceId }))
  }, [])

  const selectSystemDevice = useCallback((deviceId: string) => {
    console.log('🔊 システム音声デバイス選択:', deviceId)
    setState(prev => ({ ...prev, selectedSystemDevice: deviceId }))
  }, [])

  /**
   * エラークリア
   */
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }))
  }, [])

  // 初期化時にデバイス一覧を取得
  useEffect(() => {
    refreshAllDevices()
    
    // デバイス変更の監視
    const handleDeviceChange = () => {
      console.log('🔄 デバイス変更検出 - デバイス一覧を更新')
      refreshAllDevices()
    }
    
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange)
    
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange)
    }
  }, [refreshAllDevices])

  return {
    // 状態
    ...state,
    
    // アクション
    refreshAllDevices,
    updateAudioDevices,
    updateSystemAudioDevices, 
    updateDesktopSources,
    selectDevice,
    selectDesktopSource,
    selectSystemDevice,
    clearError
  }
}