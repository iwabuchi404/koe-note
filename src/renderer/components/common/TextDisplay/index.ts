/**
 * TextDisplay コンポーネントシステムのエントリーポイント
 * 外部から使用する際のメインエクスポート
 */

// メインコンポーネント
export { default as TextDisplayViewer } from './TextDisplayViewer'

// 個別コンポーネント（必要に応じて直接使用可能）
export { default as TranscriptionViewer } from './components/ViewMode/TranscriptionViewer'
export { default as PlainTextViewer } from './components/ViewMode/PlainTextViewer'
export { default as TextEditor } from './components/EditMode/TextEditor'
export { default as MetadataPanel } from './components/ViewMode/MetadataPanel'

// 共通コンポーネント
export { default as ModeToggle } from './components/common/ModeToggle'
export { default as CopyButton } from './components/common/CopyButton'
export { default as SelectionHelper } from './components/common/SelectionHelper'

// ユーティリティクラス
export { TextTypeDetector } from './utils/TextTypeDetector'
export { MetadataParser } from './utils/MetadataParser'

// アダプター
export { TranscriptionAdapter } from './adapters/TranscriptionAdapter'

// カスタムHooks
export { useTextDisplayMode } from './hooks/useTextDisplayMode'
export { useTextSelection } from './hooks/useTextSelection'
export { useTextCopy } from './hooks/useTextCopy'

// 型定義
export type {
  DisplayMode,
  TextFileType,
  DisplayMetadata,
  TranscriptionMetadata,
  TranscriptionSegment,
  TextSelection,
  ParsedTranscriptionContent,
  ContentStats
} from './types/TextDisplayTypes'