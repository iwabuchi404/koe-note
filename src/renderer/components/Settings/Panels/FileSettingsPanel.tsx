import React, { useState } from 'react'
import { FileSettings, SettingsPanelProps } from '../types'

interface FileSettingsPanelProps extends SettingsPanelProps {
  settings: FileSettings
  onSettingsChange: (settings: FileSettings) => void
}

/**
 * ファイル設定パネルコンポーネント
 * 作業フォルダと自動保存間隔の設定を管理
 */
const FileSettingsPanel: React.FC<FileSettingsPanelProps> = ({
  settings,
  validationErrors,
  isDisabled = false,
  onSettingsChange
}) => {
  const [isFolderSelecting, setIsFolderSelecting] = useState(false)

  // フォルダ選択ハンドラー
  const handleSelectFolder = async () => {
    try {
      setIsFolderSelecting(true)
      const folderPath = await window.electronAPI.selectFolder()
      
      if (folderPath) {
        onSettingsChange({
          ...settings,
          workspaceFolder: folderPath
        })
      }
    } catch (error) {
      console.error('フォルダ選択エラー:', error)
    } finally {
      setIsFolderSelecting(false)
    }
  }


  // エラーメッセージを取得
  const getFieldError = (fieldName: string) => {
    return validationErrors.find(error => error.field === fieldName)?.message
  }


  // フォルダパスを短縮表示
  const getDisplayPath = (path: string) => {
    if (!path) return '選択されていません'
    if (path.length <= 50) return path
    return '...' + path.slice(-47)
  }

  return (
    <section className="settings-section">
      <h3>📁 ファイル設定</h3>
      
      {/* 作業フォルダ設定 */}
      <div className="settings-item">
        <label htmlFor="workspace-folder">作業フォルダ:</label>
        <div className="folder-input">
          <input
            type="text"
            id="workspace-folder"
            value={getDisplayPath(settings.workspaceFolder)}
            readOnly
            className={`folder-input__field ${getFieldError('workspaceFolder') ? 'settings-input--error' : ''}`}
            title={settings.workspaceFolder}
          />
          <button 
            type="button"
            onClick={handleSelectFolder}
            disabled={isDisabled || isFolderSelecting}
            className="folder-input__button"
          >
            {isFolderSelecting ? '選択中...' : '📂 参照'}
          </button>
        </div>
        <div className="settings-description">
          録音ファイルと文字起こし結果を保存するフォルダ
        </div>
        {getFieldError('workspaceFolder') && (
          <div className="settings-error-message">
            {getFieldError('workspaceFolder')}
          </div>
        )}
      </div>


      {/* フォルダ情報表示 */}
      {settings.workspaceFolder && (
        <div className="settings-folder-info">
          <div className="settings-folder-info__title">
            現在の作業フォルダ
          </div>
          <div className="settings-folder-info__path">
            {settings.workspaceFolder}
          </div>
          <div className="settings-folder-info__actions">
            <button
              type="button"
              onClick={() => {
                // フォルダを開く機能は将来的な実装予定
                console.log('フォルダを開く:', settings.workspaceFolder)
              }}
              disabled={isDisabled}
              className="settings-folder-info__open-button"
            >
              📂 フォルダを開く
            </button>
          </div>
        </div>
      )}

      {/* ストレージ使用量表示（将来的な拡張用） */}
      <div className="settings-storage-info">
        <div className="settings-storage-info__title">
          ストレージ情報
        </div>
        <div className="settings-storage-info__note">
          定期的にファイルを整理して容量を確保してください
        </div>
      </div>

      <div className="settings-note">
        ※ 作業フォルダの変更は次回起動時から有効になります
      </div>
    </section>
  )
}

export default FileSettingsPanel