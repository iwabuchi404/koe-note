/**
 * CopyButton - クリップボードコピー機能コンポーネント
 * 
 * 責務:
 * - 文字起こし結果のクリップボードコピー
 * - コピー状態の表示
 */

import React, { useState } from 'react'
import { TranscriptionResult } from '../../../../preload/preload'

interface CopyButtonProps {
  transcriptionResult: TranscriptionResult | null
  includeTimestamp?: boolean
}

const CopyButton: React.FC<CopyButtonProps> = ({
  transcriptionResult,
  includeTimestamp = false
}) => {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'success' | 'error'>('idle')

  const handleCopy = async () => {
    if (!transcriptionResult || !transcriptionResult.segments) return

    try {
      let textContent: string

      if (includeTimestamp) {
        // タイムスタンプ付きでコピー
        textContent = transcriptionResult.segments
          .map(segment => `[${segment.start.toFixed(1)}s] ${segment.text}`)
          .join('\n')
      } else {
        // テキストのみでコピー
        textContent = transcriptionResult.segments
          .map(segment => segment.text)
          .join('\n')
      }

      await navigator.clipboard.writeText(textContent)
      setCopyStatus('success')
      
      // 成功表示を一定時間後にクリア
      setTimeout(() => setCopyStatus('idle'), 2000)
      
    } catch (error) {
      console.error('クリップボードコピーエラー:', error)
      setCopyStatus('error')
      setTimeout(() => setCopyStatus('idle'), 3000)
    }
  }

  const canCopy = transcriptionResult && transcriptionResult.segments && transcriptionResult.segments.length > 0

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--spacing-sm)'
    }}>
      <button
        onClick={handleCopy}
        disabled={!canCopy}
        style={{
          padding: '6px 12px',
          fontSize: 'var(--font-size-sm)',
          backgroundColor: 'transparent',
          border: '1px solid var(--color-border)',
          borderRadius: '4px',
          color: canCopy ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
          cursor: canCopy ? 'pointer' : 'not-allowed',
          transition: 'all 0.2s ease',
          opacity: canCopy ? 1 : 0.5
        }}
        onMouseEnter={(e) => {
          if (canCopy) {
            e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)'
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent'
        }}
        title={includeTimestamp ? 'タイムスタンプ付きでコピー' : 'テキストのみコピー'}
      >
        {includeTimestamp ? 'タイムスタンプ付きコピー' : 'テキストコピー'}
      </button>

      {/* コピー状態表示 */}
      {copyStatus !== 'idle' && (
        <span style={{
          fontSize: 'var(--font-size-xs)',
          color: copyStatus === 'success' ? 'var(--color-success)' : 'var(--color-error)',
          fontWeight: 'bold'
        }}>
          {copyStatus === 'success' ? 'コピー完了' : 'コピー失敗'}
        </span>
      )}
    </div>
  )
}

export default CopyButton