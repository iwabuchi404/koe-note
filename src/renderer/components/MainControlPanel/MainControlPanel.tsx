/**
 * メインコントロールパネル
 * ワークフロー開始ボタンとクイックアクションを提供
 */

import React, { useCallback } from 'react'
import { useTabContext } from '../../contexts/TabContext'
import { TabType, WorkflowAction } from '../../types/TabTypes'
import { LoggerFactory, LogCategories } from '../../utils/LoggerFactory'
import './MainControlPanel.css'

// ログ取得
const logger = LoggerFactory.getLogger(LogCategories.UI_BOTTOM_PANEL)

interface WorkflowOption {
  action: WorkflowAction
  title: string
  description: string
  icon: string
  shortcut?: string
  color: 'primary' | 'success' | 'warning' | 'info'
}

const MainControlPanel: React.FC = () => {
  const { createTab } = useTabContext()

  // ワークフローオプション定義
  const workflowOptions: WorkflowOption[] = [
    {
      action: WorkflowAction.RECORD_WITH_TRANSCRIPTION,
      title: '🎙️ 録音開始',
      description: '音声録音を開始（文字起こし設定可能）',
      icon: '🎙️',
      shortcut: 'Ctrl+R',
      color: 'primary'
    },
    {
      action: WorkflowAction.TRANSCRIBE_FILE,
      title: '📄 ファイル文字起こし',
      description: '既存の音声ファイルを文字起こし',
      icon: '📄',
      color: 'warning'
    },
    {
      action: WorkflowAction.OPEN_AUDIO_FILE,
      title: '🎵 音声ファイルを開く',
      description: '音声ファイルを再生・分析',
      icon: '🎵',
      color: 'info'
    }
  ]

  // ワークフロー開始処理
  const handleWorkflowStart = useCallback((action: WorkflowAction) => {
    logger.info('ワークフロー開始', { action })

    switch (action) {
      case WorkflowAction.RECORD_WITH_TRANSCRIPTION:
        // 録音タブを作成（デフォルトは文字起こしON）
        createTab(TabType.RECORDING, { 
          isRealTimeTranscription: true,
          recordingSettings: {
            source: 'microphone',
            quality: 'high',
            model: 'medium'
          }
        })
        break

      case WorkflowAction.TRANSCRIBE_FILE:
        // ファイル選択ダイアログを開く（プレイヤータブで開く）
        handleFileSelection('audio')
        break

      case WorkflowAction.OPEN_AUDIO_FILE:
        // 音声ファイル選択ダイアログを開く（プレイヤータブで開く）
        handleFileSelection('audio')
        break

      default:
        logger.warn('未対応のワークフローアクション', { action })
    }
  }, [createTab])

  // ファイル選択処理
  const handleFileSelection = useCallback(async (type: 'audio' | 'text') => {
    try {
      // TODO: 実際のファイル選択API実装まで一時的にモック処理
      // if (window.electronAPI?.selectFile) {
      //   const fileTypes = type === 'audio' 
      //     ? ['wav', 'mp3', 'webm', 'm4a', 'flac']
      //     : ['txt', 'md', 'rtf']
      //   
      //   const selectedFile = await window.electronAPI.selectFile(fileTypes)
      
      // モック: ファイル選択ダイアログ
      const selectedFile = {
        path: type === 'audio' ? '/mock/sample.wav' : '/mock/sample.txt',
        name: type === 'audio' ? 'sample.wav' : 'sample.txt'
      }
        
      if (selectedFile) {
        if (type === 'audio') {
          createTab(TabType.PLAYER, {
            filePath: selectedFile.path,
            fileName: selectedFile.name,
            fileType: 'audio'
          })
        } else {
          createTab(TabType.PLAYER, {
            filePath: selectedFile.path,
            fileName: selectedFile.name,
            fileType: 'text'
          })
        }
        logger.info('ファイル選択完了', { 
          type, 
          fileName: selectedFile.name,
          filePath: selectedFile.path 
        })
      }
    } catch (error) {
      logger.error('ファイル選択エラー', error instanceof Error ? error : new Error(String(error)))
    }
  }, [createTab])


  return (
    <div className="main-control-panel">
      <div className="control-header">
        <h2 className="control-title">KoeNote</h2>
        <p className="control-subtitle">音声録音・文字起こしアプリ</p>
      </div>

      {/* メインアクションカード */}
      <div className="action-cards">
        {workflowOptions.map((option) => (
          <div
            key={option.action}
            className={`action-card ${option.color}`}
            onClick={() => handleWorkflowStart(option.action)}
          >
            <div className="card-icon">{option.icon}</div>
            <div className="card-content">
              <div className="card-title">{option.title}</div>
              <div className="card-description">{option.description}</div>
              {option.shortcut && (
                <div className="card-shortcut">{option.shortcut}</div>
              )}
            </div>
          </div>
        ))}
        
        {/* 追加アクション */}
        <div className="action-card secondary" onClick={() => handleFileSelection('text')}>
          <div className="card-icon">📝</div>
          <div className="card-content">
            <div className="card-title">テキストを開く</div>
            <div className="card-description">既存のテキストファイルを開いて編集</div>
          </div>
        </div>
        
        {/* AudioWorklet WAV テストカード */}
        <div className="action-card info" onClick={() => createTab(TabType.RECORDING, { isToneTest: true })}>
          <div className="card-icon">🎶</div>
          <div className="card-content">
            <div className="card-title">🎵 AudioWorklet WAV テスト</div>
            <div className="card-description">AudioWorkletNode対応、WAV録音テスト</div>
          </div>
        </div>
        
        {/* AudioWorklet + lamejs テストカード */}
        <div className="action-card success" onClick={() => createTab(TabType.RECORDING, { isAudioWorkletTest: true })}>
          <div className="card-icon">🔬</div>
          <div className="card-content">
            <div className="card-title">🎵 AudioWorklet + MP3 テスト</div>
            <div className="card-description">AudioWorklet + lamejsリアルタイムMP3録音テスト</div>
          </div>
        </div>
      </div>

      {/* 情報カード */}
      <div className="info-card">
        <div className="info-header">
          <span className="info-icon">💡</span>
          <span className="info-title">クイックスタート</span>
        </div>
        <div className="info-content">
          <div className="info-item">
            <span className="item-icon">🎙️</span>
            <span>録音開始で音声収録とリアルタイム文字起こし</span>
          </div>
          <div className="info-item">
            <span className="item-icon">📁</span>
            <span>音声ファイルを開いて後から文字起こし</span>
          </div>
          <div className="info-item">
            <span className="item-icon">✍️</span>
            <span>テキストファイルで結果の編集と保存</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MainControlPanel