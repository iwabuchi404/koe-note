/**
 * MixingControls - ミキシング制御コンポーネント
 * 
 * 責務:
 * - マイクとデスクトップ音声の音量調整
 * - ミキシング設定の管理
 * - リアルタイムプレビュー
 */

import React from 'react'

interface MixingConfig {
  microphoneGain: number    // 0.0-1.0
  desktopGain: number       // 0.0-1.0
  enableNoiseSuppression: boolean
  enableEchoCancellation: boolean
}

interface MixingControlsProps {
  mixingConfig: MixingConfig
  onConfigChange: (config: Partial<MixingConfig>) => void
  disabled?: boolean
}

const MixingControls: React.FC<MixingControlsProps> = ({
  mixingConfig,
  onConfigChange,
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
        <span style={{ fontSize: '18px' }}>🎛️</span>
        <h4 style={{
          fontSize: 'var(--font-size-sm)',
          fontWeight: 'bold',
          color: 'var(--color-text-primary)',
          margin: 0
        }}>
          ミキシング設定
        </h4>
      </div>

      {/* 音量調整 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 'var(--spacing-md)',
        marginBottom: 'var(--spacing-md)'
      }}>
        {/* マイク音量 */}
        <div>
          <label style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-secondary)',
            marginBottom: 'var(--spacing-xs)',
            display: 'block'
          }}>
            🎤 マイク音量: {Math.round(mixingConfig.microphoneGain * 100)}%
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={mixingConfig.microphoneGain * 100}
            onChange={(e) => onConfigChange({ 
              microphoneGain: parseInt(e.target.value) / 100 
            })}
            disabled={disabled}
            style={{
              width: '100%',
              height: '4px',
              borderRadius: '2px',
              backgroundColor: 'var(--color-bg-tertiary)',
              outline: 'none',
              opacity: disabled ? 0.5 : 1,
              cursor: disabled ? 'not-allowed' : 'pointer'
            }}
          />
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-tertiary)',
            marginTop: '2px'
          }}>
            <span>0%</span>
            <span>100%</span>
          </div>
        </div>

        {/* デスクトップ音量 */}
        <div>
          <label style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-secondary)',
            marginBottom: 'var(--spacing-xs)',
            display: 'block'
          }}>
            🖥️ デスクトップ音量: {Math.round(mixingConfig.desktopGain * 100)}%
          </label>
          <input
            type="range"
            min="0"
            max="100"
            value={mixingConfig.desktopGain * 100}
            onChange={(e) => onConfigChange({ 
              desktopGain: parseInt(e.target.value) / 100 
            })}
            disabled={disabled}
            style={{
              width: '100%',
              height: '4px',
              borderRadius: '2px',
              backgroundColor: 'var(--color-bg-tertiary)',
              outline: 'none',
              opacity: disabled ? 0.5 : 1,
              cursor: disabled ? 'not-allowed' : 'pointer'
            }}
          />
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-tertiary)',
            marginTop: '2px'
          }}>
            <span>0%</span>
            <span>100%</span>
          </div>
        </div>
      </div>

      {/* 音声処理オプション */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-sm)',
        marginBottom: 'var(--spacing-md)'
      }}>
        <h5 style={{
          fontSize: 'var(--font-size-xs)',
          fontWeight: 'bold',
          color: 'var(--color-text-secondary)',
          margin: 0,
          marginBottom: 'var(--spacing-xs)'
        }}>
          音声処理オプション
        </h5>

        {/* ノイズ抑制 */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-sm)'
        }}>
          <input
            type="checkbox"
            id="noise-suppression"
            checked={mixingConfig.enableNoiseSuppression}
            onChange={(e) => onConfigChange({ 
              enableNoiseSuppression: e.target.checked 
            })}
            disabled={disabled}
            style={{
              width: '16px',
              height: '16px',
              cursor: disabled ? 'not-allowed' : 'pointer'
            }}
          />
          <label
            htmlFor="noise-suppression"
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
            <span>🔇</span>
            ノイズ抑制を有効にする
          </label>
        </div>

        {/* エコーキャンセレーション */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-sm)'
        }}>
          <input
            type="checkbox"
            id="echo-cancellation"
            checked={mixingConfig.enableEchoCancellation}
            onChange={(e) => onConfigChange({ 
              enableEchoCancellation: e.target.checked 
            })}
            disabled={disabled}
            style={{
              width: '16px',
              height: '16px',
              cursor: disabled ? 'not-allowed' : 'pointer'
            }}
          />
          <label
            htmlFor="echo-cancellation"
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
            <span>🔄</span>
            エコーキャンセレーションを有効にする
          </label>
        </div>
      </div>

      {/* プリセットボタン */}
      <div style={{
        display: 'flex',
        gap: 'var(--spacing-sm)',
        marginBottom: 'var(--spacing-md)'
      }}>
        <button
          onClick={() => onConfigChange({
            microphoneGain: 0.8,
            desktopGain: 0.3
          })}
          disabled={disabled}
          style={{
            flex: 1,
            padding: 'var(--spacing-xs)',
            fontSize: 'var(--font-size-xs)',
            backgroundColor: 'transparent',
            border: '1px solid var(--color-border)',
            borderRadius: '4px',
            color: 'var(--color-text-secondary)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1,
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            if (!disabled) {
              e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
          title="マイク重視プリセット"
        >
          🎤 マイク重視
        </button>
        
        <button
          onClick={() => onConfigChange({
            microphoneGain: 0.5,
            desktopGain: 0.5
          })}
          disabled={disabled}
          style={{
            flex: 1,
            padding: 'var(--spacing-xs)',
            fontSize: 'var(--font-size-xs)',
            backgroundColor: 'transparent',
            border: '1px solid var(--color-border)',
            borderRadius: '4px',
            color: 'var(--color-text-secondary)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1,
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            if (!disabled) {
              e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
          title="バランス重視プリセット"
        >
          ⚖️ バランス
        </button>
        
        <button
          onClick={() => onConfigChange({
            microphoneGain: 0.3,
            desktopGain: 0.8
          })}
          disabled={disabled}
          style={{
            flex: 1,
            padding: 'var(--spacing-xs)',
            fontSize: 'var(--font-size-xs)',
            backgroundColor: 'transparent',
            border: '1px solid var(--color-border)',
            borderRadius: '4px',
            color: 'var(--color-text-secondary)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1,
            transition: 'all 0.2s ease'
          }}
          onMouseEnter={(e) => {
            if (!disabled) {
              e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent'
          }}
          title="デスクトップ重視プリセット"
        >
          🖥️ デスクトップ重視
        </button>
      </div>

      {/* ヘルプテキスト */}
      <div style={{
        padding: 'var(--spacing-sm)',
        backgroundColor: 'var(--color-bg-tertiary)',
        borderRadius: '4px',
        fontSize: 'var(--font-size-xs)',
        color: 'var(--color-text-tertiary)',
        lineHeight: '1.4'
      }}>
        💡 マイクとデスクトップ音声を同時に録音します。
        音量バランスを調整して最適な音質に設定してください。
      </div>
    </div>
  )
}

export default MixingControls