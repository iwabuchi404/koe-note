/**
 * BottomPanel - リファクタリング版
 * 
 * 変更点:
 * - 録音制御ロジックをuseRecordingControlに分離
 * - デバイス管理をuseDeviceManagerに分離
 * - UI状態管理をuseBottomPanelStateに分離
 * - コード量を大幅削減（2122行 → 約200行）
 * - 責務を明確に分離してテスト可能性を向上
 */

import React, { useCallback, useEffect } from 'react'
import { useAppContext } from '../../App'
import { useRecordingStateManager } from '../../hooks/useRecordingStateManager'
import { useTranscriptionStateManager } from '../../hooks/useTranscriptionStateManager'
import { useRecordingControl } from '../../hooks/useRecordingControl'
import { useDeviceManager } from '../../hooks/useDeviceManager'
import { useBottomPanelState, InputType } from '../../hooks/useBottomPanelState'
import { AudioMixingService } from '../../services/AudioMixingService'
import { LoggerFactory, LogCategories } from '../../utils/LoggerFactory'

const BottomPanel: React.FC = () => {
  // アプリケーション全体の状態管理
  const { setFileList, setIsRecording: setGlobalIsRecording, setRecordingFile, setSelectedFile } = useAppContext()
  
  // ログシステム
  const logger = LoggerFactory.getLogger(LogCategories.UI_BOTTOM_PANEL)
  
  // 各責務に特化したフック
  const recordingManager = useRecordingStateManager()
  const transcriptionManager = useTranscriptionStateManager()
  const deviceManager = useDeviceManager()
  const uiState = useBottomPanelState()
  
  // 録音制御フック（コールバック付き）
  const recordingControl = useRecordingControl({
    onRecordingStart: () => {
      setGlobalIsRecording(true)
      logger.info('録音開始通知')
    },
    onRecordingStopped: () => {
      setGlobalIsRecording(false)
      logger.info('録音停止通知')
    },
    onError: (error) => {
      logger.error('録音エラー', error)
      uiState.clearError() // エラー表示をクリア
    }
  })

  // 入力タイプに応じたデバイス選択の自動更新
  useEffect(() => {
    if (uiState.inputType === 'microphone' && deviceManager.selectedDevice) {
      uiState.startMicrophoneMonitoring(deviceManager.selectedDevice)
    } else {
      uiState.stopMicrophoneMonitoring()
    }
  }, [uiState.inputType, deviceManager.selectedDevice])

  // デスクトップキャプチャが必要な場合のソース更新
  useEffect(() => {
    if (uiState.inputType === 'desktop' || uiState.inputType === 'mixing') {
      deviceManager.updateDesktopSources()
    }
  }, [uiState.inputType])

  /**
   * 録音開始ハンドラー（リアルタイム文字起こしあり）
   */
  const handleStartRecordingWithTranscription = useCallback(async () => {
    try {
      console.log('🎵 録音+文字起こしボタン押下')
      await recordingControl.startRecording({
        inputType: uiState.inputType,
        selectedDevice: deviceManager.selectedDevice,
        selectedDesktopSource: deviceManager.selectedDesktopSource,
        selectedSystemDevice: deviceManager.selectedSystemDevice,
        enableRealtimeTranscription: true
      })
    } catch (error) {
      console.error('リアルタイム文字起こし付き録音開始エラー:', error)
    }
  }, [recordingControl, uiState.inputType, deviceManager.selectedDevice, deviceManager.selectedDesktopSource, deviceManager.selectedSystemDevice])

  /**
   * 録音開始ハンドラー（録音のみ）
   */
  const handleStartRecordingOnly = useCallback(async () => {
    try {
      console.log('🎵 録音のみボタン押下')
      await recordingControl.startRecording({
        inputType: uiState.inputType,
        selectedDevice: deviceManager.selectedDevice,
        selectedDesktopSource: deviceManager.selectedDesktopSource,
        selectedSystemDevice: deviceManager.selectedSystemDevice,
        enableRealtimeTranscription: false
      })
    } catch (error) {
      console.error('録音のみ開始エラー:', error)
    }
  }, [recordingControl, uiState.inputType, deviceManager.selectedDevice, deviceManager.selectedDesktopSource, deviceManager.selectedSystemDevice])

  /**
   * ミキシング録音用のストリーム作成
   */
  const handleMixingRecording = useCallback(async (enableTranscription: boolean) => {
    try {
      console.log('🎛️ ミキシング録音開始')
      
      // AudioMixingServiceを初期化
      const audioMixingService = uiState.getAudioMixingService()
      
      // ミキシング設定を適用
      const mixingConfig = {
        ...uiState.mixingConfig,
        microphoneDeviceId: deviceManager.selectedDevice || undefined,
        desktopSourceId: deviceManager.selectedDesktopSource || undefined
      }
      
      // ミキシングストリーム作成
      const stream = await audioMixingService.createMixedStream(mixingConfig)
      console.log('✅ ミキシングストリーム作成完了')
      
      // 録音開始
      await recordingControl.startRecording({
        inputType: 'mixing',
        selectedDevice: deviceManager.selectedDevice,
        selectedDesktopSource: deviceManager.selectedDesktopSource,
        selectedSystemDevice: deviceManager.selectedSystemDevice,
        enableRealtimeTranscription: enableTranscription
      })
      
    } catch (error) {
      console.error('ミキシング録音エラー:', error)
      throw error
    }
  }, [uiState, deviceManager, recordingControl])

  // コンポーネントアンマウント時のクリーンアップのみ
  useEffect(() => {
    return () => {
      console.log('🔄 BottomPanel: コンポーネントアンマウント - クリーンアップ実行')
      recordingControl.cleanup()
      uiState.cleanup()
    }
  }, []) // 空の依存配列でアンマウント時のみ実行

  return (
    <div className="bottom-panel bg-surface border-t border-outline/20 p-lg">
      {/* 録音状態表示 */}
      <div className="recording-status mb-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-md">
            <div className={`status-indicator ${recordingControl.isRecording ? 'recording' : 'idle'}`}>
              {recordingControl.isRecording ? '🔴' : '⚪'}
            </div>
            <span className="text-lg font-medium">
              {recordingControl.isRecording ? '録音中' : 
               recordingControl.isPaused ? '一時停止中' : '待機中'}
            </span>
            {recordingControl.isRecording && (
              <span className="text-sm text-secondary">
                {uiState.formatTime(recordingControl.currentRecordingTime)}
              </span>
            )}
          </div>
          
          {/* 音声レベル表示 */}
          {recordingControl.isRecording && (
            <div className="audio-levels flex gap-sm">
              <div className="level-meter">
                <span className="text-xs">マイク</span>
                <div className="meter-bar">
                  <div 
                    className="meter-fill bg-primary" 
                    style={{ width: `${uiState.audioLevels.microphoneLevel * 100}%` }}
                  />
                </div>
              </div>
              {(uiState.inputType === 'mixing' || uiState.inputType === 'desktop') && (
                <div className="level-meter">
                  <span className="text-xs">デスクトップ</span>
                  <div className="meter-bar">
                    <div 
                      className="meter-fill bg-secondary" 
                      style={{ width: `${uiState.audioLevels.desktopLevel * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 入力タイプ選択 */}
      <div className="input-type-selection mb-md">
        <div className="flex gap-sm">
          {(['microphone', 'desktop', 'stereo-mix', 'mixing'] as InputType[]).map((type) => (
            <button
              key={type}
              className={`btn ${uiState.inputType === type ? 'btn--primary' : 'btn--secondary'}`}
              onClick={() => uiState.setInputType(type)}
              disabled={recordingControl.isRecording}
            >
              {type === 'microphone' && '🎤 マイク'}
              {type === 'desktop' && '🖥️ デスクトップ'}
              {type === 'stereo-mix' && '🔊 ステレオミックス'}
              {type === 'mixing' && '🎛️ ミキシング'}
            </button>
          ))}
        </div>
      </div>

      {/* デバイス選択 */}
      <div className="device-selection mb-md">
        {/* マイクロフォンデバイス選択 */}
        {(uiState.inputType === 'microphone' || uiState.inputType === 'mixing') && (
          <div className="device-select mb-sm">
            <label className="text-sm text-secondary mb-xs block">マイクロフォン</label>
            <select
              className="select w-full"
              value={deviceManager.selectedDevice}
              onChange={(e) => deviceManager.selectDevice(e.target.value)}
              disabled={recordingControl.isRecording}
            >
              {deviceManager.availableDevices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* デスクトップソース選択 */}
        {(uiState.inputType === 'desktop' || uiState.inputType === 'mixing') && (
          <div className="device-select mb-sm">
            <label className="text-sm text-secondary mb-xs block">デスクトップソース</label>
            <select
              className="select w-full"
              value={deviceManager.selectedDesktopSource}
              onChange={(e) => deviceManager.selectDesktopSource(e.target.value)}
              disabled={recordingControl.isRecording}
            >
              {deviceManager.desktopSources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* システム音声デバイス選択 */}
        {uiState.inputType === 'stereo-mix' && (
          <div className="device-select mb-sm">
            <label className="text-sm text-secondary mb-xs block">システム音声デバイス</label>
            <select
              className="select w-full"
              value={deviceManager.selectedSystemDevice}
              onChange={(e) => deviceManager.selectSystemDevice(e.target.value)}
              disabled={recordingControl.isRecording}
            >
              {deviceManager.systemAudioDevices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ミキシング設定 */}
      {uiState.inputType === 'mixing' && (
        <div className="mixing-controls mb-md p-md bg-surface-variant rounded">
          <h4 className="text-sm font-medium mb-sm">ミキシング設定</h4>
          <div className="grid grid-cols-2 gap-md">
            <div>
              <label className="text-xs text-secondary mb-xs block">
                マイク音量: {Math.round(uiState.mixingConfig.microphoneGain * 100)}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={uiState.mixingConfig.microphoneGain * 100}
                onChange={(e) => uiState.updateMixingConfig({ 
                  microphoneGain: parseInt(e.target.value) / 100 
                })}
                className="range w-full"
                disabled={recordingControl.isRecording}
              />
            </div>
            <div>
              <label className="text-xs text-secondary mb-xs block">
                デスクトップ音量: {Math.round(uiState.mixingConfig.desktopGain * 100)}%
              </label>
              <input
                type="range"
                min="0"
                max="100"
                value={uiState.mixingConfig.desktopGain * 100}
                onChange={(e) => uiState.updateMixingConfig({ 
                  desktopGain: parseInt(e.target.value) / 100 
                })}
                className="range w-full"
                disabled={recordingControl.isRecording}
              />
            </div>
          </div>
        </div>
      )}

      {/* 録音制御ボタン */}
      <div className="recording-controls">
        <div className="flex gap-md justify-center">
          {!recordingControl.isRecording ? (
            <>
              <button
                className="btn btn--primary btn--large"
                onClick={handleStartRecordingWithTranscription}
                disabled={deviceManager.isLoading || recordingControl.isStopping}
                title={`isLoading: ${deviceManager.isLoading}, isStopping: ${recordingControl.isStopping}`}
              >
                🎤📝 録音 + 文字起こし
              </button>
              <button
                className="btn btn--secondary btn--large"
                onClick={handleStartRecordingOnly}
                disabled={deviceManager.isLoading || recordingControl.isStopping}
                title={`isLoading: ${deviceManager.isLoading}, isStopping: ${recordingControl.isStopping}`}
              >
                🎤 録音のみ
              </button>
            </>
          ) : (
            <>
              {!recordingControl.isPaused ? (
                <button
                  className="btn btn--warning btn--large"
                  onClick={recordingControl.pauseRecording}
                >
                  ⏸️ 一時停止
                </button>
              ) : (
                <button
                  className="btn btn--success btn--large"
                  onClick={recordingControl.resumeRecording}
                >
                  ▶️ 再開
                </button>
              )}
              <button
                className="btn btn--error btn--large"
                onClick={recordingControl.stopRecording}
                disabled={recordingControl.isStopping}
              >
                ⏹️ 停止
              </button>
            </>
          )}
        </div>
      </div>

      {/* マイクロフォン監視状態表示 */}
      {uiState.inputType === 'microphone' && uiState.micStatus && (
        <div className="mic-status mt-md p-sm bg-info/10 rounded">
          <div className="flex items-center gap-sm">
            <span className="text-xs text-secondary">マイク状態:</span>
            <span className={`text-xs ${uiState.micStatus.isActive ? 'text-success' : 'text-warning'}`}>
              {uiState.micStatus.isActive ? '正常' : '無効'}
            </span>
            {uiState.micStatus.averageLevel > 0 && (
              <span className="text-xs text-secondary">
                音量: {Math.round(uiState.micStatus.averageLevel * 100)}%
              </span>
            )}
          </div>
        </div>
      )}

      {/* 開発用デバッグ情報 */}
      {process.env.NODE_ENV === 'development' && (
        <div className="debug-info mt-md p-md bg-warning/10 rounded border-dashed">
          <h4 className="text-sm font-medium mb-sm">🔧 デバッグ情報</h4>
          <div className="text-xs text-secondary space-y-1">
            <div>録音状態: {recordingManager.isInitialized ? '初期化済み' : '初期化中'}</div>
            <div>デバイス数: {deviceManager.availableDevices.length}台</div>
            <div>入力タイプ: {uiState.inputType}</div>
            <div>選択デバイス: {deviceManager.selectedDevice || '未選択'}</div>
            <div>デバイス読み込み中: {deviceManager.isLoading ? 'はい' : 'いいえ'}</div>
            <div>録音中: {recordingControl.isRecording ? 'はい' : 'いいえ'}</div>
            <div>停止中: {recordingControl.isStopping ? 'はい' : 'いいえ'}</div>
            <div>ボタン無効化: {(deviceManager.isLoading || recordingControl.isStopping) ? 'はい' : 'いいえ'}</div>
          </div>
        </div>
      )}

      {/* エラー表示 */}
      {(deviceManager.error || uiState.error || recordingManager.hasError) && (
        <div className="error-display mt-md p-md bg-error/10 border border-error/20 rounded">
          <div className="flex items-center justify-between">
            <span className="text-error text-sm">
              {deviceManager.error || uiState.error || recordingManager.recordingState?.error?.message}
            </span>
            <button
              className="btn btn--small btn--error"
              onClick={() => {
                deviceManager.clearError()
                uiState.clearError()
                recordingManager.clearError()
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default BottomPanel