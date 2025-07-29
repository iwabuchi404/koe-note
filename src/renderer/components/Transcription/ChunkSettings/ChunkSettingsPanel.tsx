/**
 * ChunkSettingsPanel - チャンク分割設定パネル
 * 
 * 責務:
 * - チャンクサイズとオーバーラップ設定
 * - 並行実行数と品質モード設定
 * - 自動スクロール等のオプション設定
 */

import React from 'react'
import { ChunkSettings } from '../../../../preload/preload'

interface ChunkSettingsPanelProps {
  settings: ChunkSettings
  onSettingsChange: (newSettings: Partial<ChunkSettings>) => void
  disabled?: boolean
}

const ChunkSettingsPanel: React.FC<ChunkSettingsPanelProps> = ({
  settings,
  onSettingsChange,
  disabled = false
}) => {
  return (
    <div style={{
      padding: 'var(--spacing-md)',
      backgroundColor: 'var(--color-bg-secondary)',
      borderRadius: '8px',
      border: '1px solid var(--color-border)'
    }}>
      {/* ヘッダー */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--spacing-xs)',
        marginBottom: 'var(--spacing-md)'
      }}>
        <span style={{ fontSize: '18px' }}>⚙️</span>
        <h4 style={{
          fontSize: 'var(--font-size-md)',
          fontWeight: 'bold',
          color: 'var(--color-text-primary)',
          margin: 0
        }}>
          チャンク分割設定
        </h4>
      </div>

      {/* 設定項目のグリッド */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 'var(--spacing-md)',
        marginBottom: 'var(--spacing-md)'
      }}>
        {/* チャンクサイズ */}
        <div>
          <label style={{
            display: 'block',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-secondary)',
            marginBottom: '4px',
            fontWeight: '500'
          }}>
            チャンクサイズ (秒)
          </label>
          <input
            type="number"
            min="5"
            max="300"
            step="5"
            value={settings.chunkSize}
            onChange={(e) => onSettingsChange({ chunkSize: parseInt(e.target.value) })}
            disabled={disabled}
            style={{
              width: '100%',
              padding: '6px 8px',
              fontSize: 'var(--font-size-sm)',
              border: '1px solid var(--color-border)',
              borderRadius: '4px',
              backgroundColor: disabled ? 'var(--color-bg-tertiary)' : 'var(--color-bg-primary)',
              color: 'var(--color-text-primary)',
              cursor: disabled ? 'not-allowed' : 'text'
            }}
          />
          <div style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-tertiary)',
            marginTop: '2px'
          }}>
            推奨: 30-60秒
          </div>
        </div>

        {/* オーバーラップサイズ */}
        <div>
          <label style={{
            display: 'block',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-secondary)',
            marginBottom: '4px',
            fontWeight: '500'
          }}>
            オーバーラップ (秒)
          </label>
          <input
            type="number"
            min="0"
            max="30"
            step="1"
            value={settings.overlapSize}
            onChange={(e) => onSettingsChange({ overlapSize: parseInt(e.target.value) })}
            disabled={disabled}
            style={{
              width: '100%',
              padding: '6px 8px',
              fontSize: 'var(--font-size-sm)',
              border: '1px solid var(--color-border)',
              borderRadius: '4px',
              backgroundColor: disabled ? 'var(--color-bg-tertiary)' : 'var(--color-bg-primary)',
              color: 'var(--color-text-primary)',
              cursor: disabled ? 'not-allowed' : 'text'
            }}
          />
          <div style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-tertiary)',
            marginTop: '2px'
          }}>
            推奨: 2-5秒
          </div>
        </div>

        {/* 並行実行数 */}
        <div>
          <label style={{
            display: 'block',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-secondary)',
            marginBottom: '4px',
            fontWeight: '500'
          }}>
            並行実行数
          </label>
          <select
            value={settings.maxConcurrency}
            onChange={(e) => onSettingsChange({ maxConcurrency: parseInt(e.target.value) })}
            disabled={disabled}
            style={{
              width: '100%',
              padding: '6px 8px',
              fontSize: 'var(--font-size-sm)',
              border: '1px solid var(--color-border)',
              borderRadius: '4px',
              backgroundColor: disabled ? 'var(--color-bg-tertiary)' : 'var(--color-bg-primary)',
              color: 'var(--color-text-primary)',
              cursor: disabled ? 'not-allowed' : 'pointer'
            }}
          >
            <option value={1}>1 (安全)</option>
            <option value={2}>2 (バランス)</option>
            <option value={3}>3 (高速)</option>
            <option value={4}>4 (最高速)</option>
          </select>
          <div style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-tertiary)',
            marginTop: '2px'
          }}>
            CPUとメモリに注意
          </div>
        </div>

        {/* 品質モード */}
        <div>
          <label style={{
            display: 'block',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-secondary)',
            marginBottom: '4px',
            fontWeight: '500'
          }}>
            品質モード
          </label>
          <select
            value={settings.qualityMode}
            onChange={(e) => onSettingsChange({ qualityMode: e.target.value as 'speed' | 'balance' | 'accuracy' })}
            disabled={disabled}
            style={{
              width: '100%',
              padding: '6px 8px',
              fontSize: 'var(--font-size-sm)',
              border: '1px solid var(--color-border)',
              borderRadius: '4px',
              backgroundColor: disabled ? 'var(--color-bg-tertiary)' : 'var(--color-bg-primary)',
              color: 'var(--color-text-primary)',
              cursor: disabled ? 'not-allowed' : 'pointer'
            }}
          >
            <option value="speed">速度優先</option>
            <option value="balance">バランス</option>
            <option value="accuracy">精度優先</option>
          </select>
          <div style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-tertiary)',
            marginTop: '2px'
          }}>
            処理時間と精度のバランス
          </div>
        </div>
      </div>

      {/* オプション設定 */}
      <div style={{
        borderTop: '1px solid var(--color-border)',
        paddingTop: 'var(--spacing-md)'
      }}>
        <h5 style={{
          fontSize: 'var(--font-size-sm)',
          fontWeight: 'bold',
          color: 'var(--color-text-secondary)',
          margin: '0 0 var(--spacing-sm) 0'
        }}>
          オプション
        </h5>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-sm)'
        }}>
          <input
            type="checkbox"
            id="autoScroll"
            checked={settings.enableAutoScroll}
            onChange={(e) => onSettingsChange({ enableAutoScroll: e.target.checked })}
            disabled={disabled}
            style={{ 
              margin: 0,
              cursor: disabled ? 'not-allowed' : 'pointer'
            }}
          />
          <label 
            htmlFor="autoScroll"
            style={{
              fontSize: 'var(--font-size-sm)',
              color: disabled ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
              cursor: disabled ? 'not-allowed' : 'pointer',
              userSelect: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacing-xs)'
            }}
          >
            <span>📜</span>
            文字起こし結果の自動スクロール
          </label>
        </div>
      </div>

      {/* 設定説明 */}
      <div style={{
        marginTop: 'var(--spacing-md)',
        padding: 'var(--spacing-sm)',
        backgroundColor: 'var(--color-bg-tertiary)',
        borderRadius: '4px',
        fontSize: 'var(--font-size-xs)',
        color: 'var(--color-text-tertiary)',
        lineHeight: '1.4'
      }}>
        💡 <strong>設定のヒント:</strong><br/>
        • 長い音声ファイルには大きなチャンクサイズを使用<br/>
        • オーバーラップにより文章の境界で切れるのを防止<br/>
        • 並行実行数を上げると速度向上、但しメモリ使用量増加
      </div>
    </div>
  )
}

export default ChunkSettingsPanel