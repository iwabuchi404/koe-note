/**
 * TextDisplay コンポーネント用型定義
 * VSCode風テキスト表示・編集システム
 */

// 表示モード
export type DisplayMode = 'view' | 'edit'

// テキストファイルの種類
export type TextFileType = 'transcription' | 'plain-text'

// VSCodeテーマ
export type VSCodeTheme = 'vscode-dark' | 'vscode-light'

// 文字起こし固有メタデータ
export interface TranscriptionMetadata {
  audioFile: string            // 元音声ファイル
  model: string               // 使用モデル (small/medium/large)
  transcribedAt: string       // 文字起こし実行日時  
  duration: number            // 音声長（秒）
  segmentCount: number        // セグメント数
  language: string            // 言語コード (ja/en/auto)
  speakers: string[]          // 話者一覧
  coverage: number            // カバレッジ率（%）
  chunkCount?: number         // チャンク数
  qualityScore?: number       // 品質スコア (0-100)
}

// ファイル統計
export interface FileStats {
  totalCharacters: number     // 総文字数
  totalWords: number          // 総単語数  
  totalLines: number          // 総行数
  encoding: string           // エンコーディング
}

// 表示用拡張メタデータ
export interface DisplayMetadata {
  // 基本情報
  sourceFile: string              // 元ファイル名
  fileType: TextFileType
  createdAt: string              // 作成日時
  modifiedAt?: string            // 更新日時
  
  // 文字起こし固有メタデータ（該当する場合のみ）
  transcription?: TranscriptionMetadata
  
  // ファイル統計
  stats: FileStats
}

// 文字起こしセグメント（表示用）
export interface TranscriptionSegment {
  id: number                  // セグメントID（行番号）
  start: number               // 開始時刻（秒）
  end: number                 // 終了時刻（秒）
  text: string                // テキスト内容
  speaker?: string            // 話者名（オプション）
  isEdited?: boolean          // 編集済みフラグ
}

// テキスト選択情報
export interface TextSelection {
  start: number               // 開始位置
  end: number                 // 終了位置
  selectedText: string        // 選択されたテキスト
  segmentIds?: number[]       // 関連セグメントID（文字起こしの場合）
  lineNumbers?: number[]      // 関連行番号（プレーンテキストの場合）
}

// メインコンポーネントのプロップス
export interface TextDisplayViewerProps {
  // ファイル情報
  filePath: string
  fileName: string
  content: string
  
  // 表示設定
  initialMode?: DisplayMode
  allowModeSwitch?: boolean
  showMetadata?: boolean
  enableSelection?: boolean
  enableCopy?: boolean
  
  // UI設定
  fullWidth?: boolean
  theme?: VSCodeTheme
  
  // コールバック
  onContentChange?: (content: string) => void
  onTextSelect?: (selection: TextSelection) => void
  onCopy?: (text: string) => void
  
  // 将来のAI機能用
  onAIQuery?: (selectedText: string) => void
}

// モード管理Hook用の状態
export interface TextDisplayModeState {
  currentMode: DisplayMode
  canSwitchMode: boolean
  hasUnsavedChanges: boolean
}

// テキスト選択Hook用の状態
export interface TextSelectionState {
  selection: TextSelection | null
  isSelecting: boolean
  canCopy: boolean
}

// コピー機能Hook用の状態
export interface TextCopyState {
  lastCopiedText: string | null
  copyStatus: 'idle' | 'copying' | 'success' | 'error'
}

// ユーティリティ関数の戻り値型
export interface TextTypeDetectionResult {
  fileType: TextFileType
  confidence: number          // 判定の確信度 (0-1)
  metadata?: DisplayMetadata
}

export interface ParsedTranscriptionContent {
  metadata: DisplayMetadata
  segments: TranscriptionSegment[]
  rawText: string
}

// コンテンツ統計（FileStatsのエイリアス）
export type ContentStats = FileStats

// Hook戻り値の型定義
export interface UseTextDisplayModeReturn {
  currentMode: DisplayMode
  canSwitchMode: boolean
  hasUnsavedChanges: boolean
  switchMode: (mode: DisplayMode, content: string) => Promise<void>
  saveChanges: (content: string) => Promise<boolean>
  discardChanges: () => void
}

export interface UseTextDisplayModeOptions {
  initialMode: DisplayMode
  readOnly?: boolean
  onSave?: (content: string) => Promise<boolean>
}

export interface UseTextSelectionReturn {
  textSelection: TextSelection | null
  clearSelection: () => void
  selectAll: (fullText: string) => void
  updateSelection: (selection: TextSelection) => void
}

export interface UseTextCopyReturn {
  copySelection: (selection: TextSelection) => Promise<boolean>
  copyFullText: (text: string) => Promise<boolean>
  copySegments: (segments: TranscriptionSegment[], format?: 'plain' | 'formatted') => Promise<boolean>
  copyStatus: 'idle' | 'copying' | 'success' | 'error'
}