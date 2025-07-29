# KoeNote リファクタリング・アーキテクチャ設計書

## 概要
現在のKoeNoteアプリケーションは機能的には動作していますが、コードベースの複雑化により保守性・拡張性に課題があります。本ドキュメントでは、段階的なリファクタリングによる設計改善を提案します。

---

## 現在の問題点サマリー

### 🚨 緊急度: 高
1. **BottomPanel.tsx (1766行)**: 録音・再生・デバイス管理・エラーハンドリングなど5つの責務が混在
2. **SpeechRecognition.tsx (1151行)**: 表示・編集・保存処理が混在、重複するイベントハンドラー
3. **エラーハンドリング不統一**: 詳細分析からconsole.errorまでバラバラ

### ⚠️ 緊急度: 中
- グローバル状態の複雑な依存関係
- 15個のローカル状態 + 10個のuseRefが複雑に絡み合う
- 重複するクリーンアップ処理

---

## 新しいアーキテクチャ設計

### 1. レイヤード・アーキテクチャの採用

```
┌─────────────────────────────────────────────────────┐
│                 Presentation Layer                  │
│  UI Components (Simple, Single Responsibility)     │
├─────────────────────────────────────────────────────┤
│                Application Layer                    │
│  Business Logic Services (Clean, Testable)         │
├─────────────────────────────────────────────────────┤
│                Infrastructure Layer                 │
│  External APIs, File System, Device Access         │
└─────────────────────────────────────────────────────┘
```

### 2. コンポーネント再設計

#### **A. レイアウト系コンポーネント (Layout Components)**
```typescript
// 案1（2タブ表示システム）対応のレイアウト構造

layout/
├── TitleBar/
│   └── TitleBar.tsx              // ウィンドウタイトルバー
├── MainLayout/
│   ├── MainLayout.tsx            // 全体レイアウトコンテナ
│   ├── LeftPanel/
│   │   └── LeftPanel.tsx         // ファイルエクスプローラー
│   └── RightPanel/
│       ├── RightPanel.tsx        // タブシステム統合
│       ├── TabBar/
│       │   ├── TabBar.tsx        // タブバー表示
│       │   ├── TabItem.tsx       // 個別タブアイテム
│       │   └── useTabManager.tsx // タブ状態管理
│       ├── RecordingTab/
│       │   └── RecordingTabContent.tsx  // 録音・文字起こしタブ内容
│       └── FileTab/
│           └── FileTabContent.tsx       // 選択ファイルタブ内容
└── BottomPanel/
    └── BottomPanel.tsx           // 設定・状態表示（簡素化）
```

#### **B. ファイル管理系 (File Management Domain)**
```typescript
// 現在: LeftPanel.tsx + 各コンポーネントに散在
// 改善: ファイル操作を統合

FileManagement/
├── FileExplorer/
│   ├── FileExplorer.tsx          // ファイル一覧表示
│   ├── FileTree.tsx              // ツリー表示
│   ├── FileItem.tsx              // 個別ファイルアイテム
│   └── FolderSelector.tsx        // フォルダ選択
├── FileOperations/
│   ├── FileContextMenu.tsx       // 右クリックメニュー
│   ├── FilePreview.tsx           // ファイルプレビュー
│   └── FileDragDrop.tsx          // ドラッグ&ドロップ
├── FileManager.ts                // ファイル操作ビジネスロジック
└── useFileState.tsx              // ファイル状態管理
```

#### **C. 録音制御系 (Recording Domain)**
```typescript
// 現在: BottomPanel.tsx (1766行、5つの責務)
// 改善: 専門化されたコンポーネントに分割

Recording/
├── UI/
│   ├── RecordingControls.tsx     // 録音ボタン・制御UI
│   ├── DeviceSelector.tsx        // デバイス選択UI
│   ├── AudioLevelMeter.tsx       // 音声レベル表示
│   └── RecordingStatus.tsx       // 録音状態表示
├── Services/
│   ├── RecordingService.ts       // 録音ビジネスロジック
│   ├── DeviceManager.ts          // デバイス管理
│   ├── AudioChunkGenerator.ts    // 簡素化されたチャンク生成（既存）
│   ├── WebMHeaderProcessor.ts    // WebMヘッダー専門処理（既存）
│   └── FileBasedRealtimeProcessor.ts // リアルタイム文字起こし統合（既存）
├── Hooks/
│   ├── useRecordingState.tsx     // 録音状態管理
│   ├── useDeviceManager.tsx      // デバイス状態管理
│   └── useAudioLevels.tsx        // 音声レベル管理
└── Types/
    └── RecordingTypes.ts         // 録音関連型定義
```

#### **D. 文字起こし系 (Transcription Domain)**
```typescript
// 現在: SpeechRecognition.tsx (1151行、4つの責務)  
// 改善: 表示・編集・操作を完全分離

Transcription/
├── Display/
│   ├── TranscriptionViewer.tsx   // 読み取り専用表示
│   ├── SegmentList.tsx           // セグメント一覧表示
│   ├── TimestampDisplay.tsx      // タイムスタンプ表示
│   └── SearchHighlight.tsx       // 検索ハイライト
├── Editor/
│   ├── TranscriptionEditor.tsx   // 編集モード
│   ├── SegmentEditor.tsx         // 個別セグメント編集
│   ├── TextSelection.tsx         // テキスト選択機能
│   └── EditingToolbar.tsx        // 編集ツールバー
├── Operations/
│   ├── TranscriptionExporter.tsx // 保存・エクスポート
│   ├── FileFormatSelector.tsx    // 出力形式選択
│   ├── CopyButton.tsx            // コピー機能
│   └── PrintButton.tsx           // 印刷機能
├── Control/
│   ├── TranscriptionControl.tsx  // 文字起こし開始・停止
│   ├── ModelSelector.tsx         // モデル選択
│   ├── QualitySelector.tsx       // 品質設定
│   └── ProgressIndicator.tsx     // 進捗表示
├── Services/
│   ├── TranscriptionService.ts   // 文字起こしビジネスロジック
│   ├── FileBasedTranscriptionEngine.ts // ファイル処理（既存）
│   ├── RealtimeTextManager.ts    // リアルタイムテキスト管理（既存）
│   └── ChunkFileWatcher.ts       // チャンクファイル監視（既存）
├── Hooks/
│   ├── useTranscriptionState.tsx // 文字起こし状態管理
│   ├── useTranscriptionEdit.tsx  // 編集状態管理
│   └── useTranscriptionExport.tsx// エクスポート状態管理
└── Types/
    └── TranscriptionTypes.ts     // 文字起こし関連型定義
```

#### **E. 音声再生系 (Audio Playback Domain)**
```typescript
// 現在: AudioPlayer/ に分散
// 改善: 再生機能を統合・強化

AudioPlayer/
├── UI/
│   ├── AudioPlayer.tsx           // メイン音声プレイヤー
│   ├── PlaybackControls.tsx      // 再生制御
│   ├── SeekBar.tsx               // シークバー
│   ├── VolumeControl.tsx         // 音量制御
│   └── SpeedControl.tsx          // 再生速度制御
├── Services/
│   ├── AudioService.ts           // 音声再生ビジネスロジック
│   └── PlaybackManager.ts       // 再生管理
├── Hooks/
│   ├── useAudioPlayer.tsx        // 音声再生状態管理
│   └── usePlaybackSync.tsx       // 文字起こしとの同期
└── Types/
    └── AudioTypes.ts             // 音声関連型定義
```

#### **F. 共通インフラ (Shared Infrastructure)**
```typescript
shared/
├── Services/
│   ├── ErrorHandler.ts           // 統一エラーハンドリング
│   ├── NotificationService.ts    // ユーザー通知統合
│   ├── ValidationService.ts      // 入力検証統合
│   └── ConfigManager.ts          // 設定管理統合
├── Components/
│   ├── LoadingSpinner.tsx        // 共通ローディング
│   ├── ErrorBoundary.tsx         // エラー境界
│   ├── ConfirmDialog.tsx         // 確認ダイアログ
│   └── Tooltip.tsx               // ツールチップ
├── Hooks/
│   ├── useErrorHandler.tsx       // エラーハンドリング
│   ├── useNotification.tsx       // 通知管理
│   └── useLocalStorage.tsx       // ローカルストレージ
└── Utils/
    ├── FileUtils.ts              // ファイル操作ユーティリティ
    ├── TimeUtils.ts              // 時間関連ユーティリティ
    └── ValidationUtils.ts        // バリデーションユーティリティ
```

### 3. 状態管理の単純化

#### **現在の問題**
```typescript
// App.tsx - 8つのグローバル状態が複雑に依存
interface AppContextType {
  fileList: AudioFile[]           // ファイル管理
  selectedFile: AudioFile | null  // 選択状態
  isRecording: boolean            // 録音状態
  isPlaying: boolean             // 再生状態
  isTranscribing: boolean        // 文字起こし状態
  currentModel: string           // 設定状態
  // ... 他3つ
}
```

#### **改善案: ドメイン別状態分離**
```typescript
// 録音ドメイン状態
interface RecordingState {
  isRecording: boolean
  isPaused: boolean
  currentFile: RecordingFile | null
  deviceSettings: DeviceConfig
}

// 文字起こしドメイン状態  
interface TranscriptionState {
  isProcessing: boolean
  currentResult: TranscriptionResult | null
  model: string
  progress: number
}

// ファイル管理ドメイン状態
interface FileManagementState {
  fileList: AudioFile[]
  selectedFile: AudioFile | null
  currentFolder: string
}

// UI状態（各コンポーネントローカル）
```

### 4. サービス層の設計

#### **録音サービス**
```typescript
interface RecordingService {
  startRecording(config: RecordingConfig): Promise<RecordingSession>
  stopRecording(): Promise<AudioFile>
  pauseRecording(): Promise<void>
  resumeRecording(): Promise<void>
}

interface RecordingConfig {
  deviceId: string
  format: AudioFormat
  quality: AudioQuality
  realtimeTranscription: boolean
}
```

#### **文字起こしサービス**
```typescript
interface TranscriptionService {
  transcribeFile(file: AudioFile): Promise<TranscriptionResult>
  transcribeRealtime(audioStream: MediaStream): Observable<TranscriptionChunk>
  saveTranscription(result: TranscriptionResult): Promise<void>
}
```

#### **エラーハンドリングサービス**
```typescript
interface ErrorHandler {
  handleRecordingError(error: RecordingError): void
  handleTranscriptionError(error: TranscriptionError): void
  handleFileError(error: FileError): void
  showUserNotification(message: string, type: NotificationType): void
}
```

---

## 段階的リファクタリング計画

### Phase 1: 共通基盤整備 (1-2日)
1. **共通サービス・インフラ作成**
   ```typescript
   shared/Services/
   ├── ErrorHandler.ts              // 統一エラーハンドリング
   ├── NotificationService.ts       // ユーザー通知統合
   ├── ValidationService.ts         // 入力検証統合
   └── ConfigManager.ts             // 設定管理統合

   shared/Components/
   ├── LoadingSpinner.tsx           // 共通ローディング
   ├── ErrorBoundary.tsx            // エラー境界
   └── ConfirmDialog.tsx            // 確認ダイアログ
   ```

2. **不要・重複コード削除**
   - BottomPanel.tsxの重複クリーンアップ処理統合
   - デバッグログ・未使用コードの削除
   - 重複するデバイス取得処理の統合

### Phase 2: ファイル管理系統合 (1日)
1. **ファイル管理コンポーネント分離**
   ```typescript
   FileManagement/
   ├── FileExplorer/
   │   ├── FileExplorer.tsx         // LeftPanel.tsxから分離
   │   ├── FileTree.tsx             // ファイル一覧表示
   │   └── FileItem.tsx             // 個別ファイルアイテム
   ├── FileOperations/
   │   └── FileContextMenu.tsx      // 右クリックメニュー
   └── FileManager.ts               // ファイル操作統合
   ```

2. **ファイル状態管理分離**
   - useFileState.tsx作成
   - AppContextからファイル関連状態を分離

### Phase 3: 録音系コンポーネント分割 (2-3日) 
1. **BottomPanel.tsx大幅分割**
   ```typescript
   Recording/
   ├── UI/
   │   ├── RecordingControls.tsx    // BottomPanelのUI部分
   │   ├── DeviceSelector.tsx       // デバイス選択UI
   │   └── AudioLevelMeter.tsx      // 音声レベル表示
   ├── Services/
   │   ├── RecordingService.ts      // 1766行の startRecording 分割
   │   ├── DeviceManager.ts         // デバイス管理分離
   │   ├── AudioChunkGenerator.ts    // 簡素化されたチャンク生成システム（移行済み）
   │   └── WebMHeaderProcessor.ts    // WebMヘッダー専門処理（移行済み）
   └── Hooks/
       └── useRecordingState.tsx    // 15個のuseState統合管理
   ```

2. **段階的移行** (既存機能を壊さない)
   - 新しいRecordingService作成
   - BottomPanelから徐々に責務移行
   - 動作確認しながら進行

### Phase 4: 文字起こし系分割 (2日)
1. **SpeechRecognition.tsx完全分割**
   ```typescript
   Transcription/
   ├── Display/
   │   ├── TranscriptionViewer.tsx  // 読み取り専用表示
   │   └── SegmentList.tsx          // セグメント一覧
   ├── Editor/
   │   ├── TranscriptionEditor.tsx  // 編集モード
   │   └── EditingToolbar.tsx       // 編集ツールバー
   ├── Operations/
   │   └── TranscriptionExporter.tsx// 保存・エクスポート
   ├── Control/
   │   └── TranscriptionControl.tsx // 文字起こし開始・停止
   └── Services/
       └── TranscriptionService.ts  // ビジネスロジック
   ```

2. **責務完全分離**
   - 表示専用コンポーネント
   - 編集専用コンポーネント  
   - 操作専用コンポーネント
   - 制御専用コンポーネント

### Phase 5: レイアウト・タブシステム実装 (2日)
1. **2タブ表示システム対応**
   ```typescript
   layout/RightPanel/
   ├── RightPanel.tsx              // タブシステム統合
   ├── TabBar/
   │   ├── TabBar.tsx              // タブバー表示
   │   ├── TabItem.tsx             // 個別タブアイテム
   │   └── useTabManager.tsx       // タブ状態管理
   ├── RecordingTab/
   │   └── RecordingTabContent.tsx // 録音・文字起こしタブ
   └── FileTab/
       └── FileTabContent.tsx      // 選択ファイルタブ
   ```

2. **既存コンポーネント統合**
   - 分割したRecording系コンポーネントをRecordingTabに統合
   - 分割したTranscription系コンポーネントをFileTabに統合
   - AudioPlayerをFileTabに統合

### Phase 6: 統合・検証・最適化 (1日)
1. **全機能動作確認**
   - 録音機能テスト
   - 文字起こし機能テスト
   - ファイル管理テスト
   - タブ切り替えテスト

2. **パフォーマンス検証**
   - メモリ使用量確認
   - レンダリング最適化
   - 状態更新最適化

3. **エラーケーステスト**
   - 録音失敗時の動作
   - ファイル読み込み失敗時の動作
   - デバイス接続エラー時の動作

---

## 期待される効果

### 🎯 保守性向上
- **コンポーネントサイズ**: 1500行+ → 300行以下（AudioChunkGeneratorは506行で実現済み）
- **責務の明確化**: 1コンポーネント1責務（AudioChunkGeneratorとWebMHeaderProcessorの分離で実現済み）
- **テスト容易性**: 各層を独立してテスト可能（モジュラー設計で実現済み）

### 🚀 開発効率向上
- **バグ修正時間**: 影響範囲が明確で修正が局所化（AudioChunkGeneratorとWebMHeaderProcessorの責務分離で実現済み）
- **新機能追加**: 既存コードへの影響を最小化（ファイルベースリアルタイム処理で実現済み）
- **コードレビュー**: 変更影響が予測しやすい（モジュラー・アーキテクチャで実現済み）

### 🔧 拡張性向上
- **2タブ表示システム**: コンポーネント再利用が容易
- **新機能追加**: 既存アーキテクチャに自然に統合
- **パフォーマンス最適化**: 各層で最適化ポイントが明確

---

## リスク管理

### 🛡️ リスク緩和策
1. **段階的実装**: 一度に1つのコンポーネントのみ変更
2. **既存機能保持**: リファクタリング中も既存機能を維持
3. **ロールバック準備**: 各段階でコミット、問題時は即座に戻す
4. **テスト重視**: 各段階で動作確認を徹底

### ⚠️ 注意点
- **大きなファイル変更**: BottomPanel.tsx、SpeechRecognition.tsxは慎重に
- **状態管理移行**: グローバル状態の移行は段階的に
- **外部依存**: ElectronのAPI呼び出し部分は最後まで保持

---

このアーキテクチャ改善により、KoeNoteは保守性・拡張性・テスト性に優れた持続可能なコードベースに生まれ変わります。