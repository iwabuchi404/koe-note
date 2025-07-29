/**
 * FileFormatSelector - ファイル形式選択コンポーネント
 * 
 * 責務:
 * - エクスポート形式の選択UI
 * - 形式別の説明表示
 */

import React from 'react'
import { ExportFormat } from './TranscriptionExporter'

interface FileFormatSelectorProps {
  selectedFormat: ExportFormat
  onFormatChange: (format: ExportFormat) => void
}

const FileFormatSelector: React.FC<FileFormatSelectorProps> = ({
  selectedFormat,
  onFormatChange
}) => {
  const formats: Array<{ value: ExportFormat; label: string; description: string }> = [
    { value: 'json', label: 'JSON', description: '完全なメタデータ付き' },
    { value: 'txt', label: 'テキスト', description: 'テキストのみ' },
    { value: 'csv', label: 'CSV', description: '時間付きスプレッドシート' },
    { value: 'srt', label: 'SRT', description: '字幕ファイル' }
  ]

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--spacing-sm)'
    }}>
      <label style={{
        fontSize: 'var(--font-size-sm)',
        color: 'var(--color-text-secondary)'
      }}>
        形式:
      </label>
      
      <select
        value={selectedFormat}
        onChange={(e) => onFormatChange(e.target.value as ExportFormat)}
        style={{
          padding: '4px 8px',
          fontSize: 'var(--font-size-sm)',
          backgroundColor: 'var(--color-bg-primary)',
          border: '1px solid var(--color-border)',
          borderRadius: '4px',
          color: 'var(--color-text-primary)',
          cursor: 'pointer'
        }}
      >
        {formats.map(format => (
          <option key={format.value} value={format.value}>
            {format.label} - {format.description}
          </option>
        ))}
      </select>
    </div>
  )
}

export default FileFormatSelector