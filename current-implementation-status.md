# KoeNote - 現在の実装状況ドキュメント

## 概要

このドキュメントは、KoeNote音声録音・文字起こしアプリケーションの現在の実装状況を包括的に記録したものです。Phase 3-5で実現された主要な改善点、現在のモジュラー・アーキテクチャ、および技術的決定を反映しています。

**最終更新**: 2025年7月27日  
**対象バージョン**: 設定モーダル追加版 (2cd3f84)

---

## アーキテクチャ概要

### 実装済みモジュラー構造

```
src/renderer/
├── audio/                     # 音声処理サービス層 (Phase 3実装済み)
│   ├── services/
│   │   ├── core/              # コア音声機能
│   │   ├── processing/        # 音声処理機能
│   │   └── integration/       # 統合機能
│   ├── hooks/                 # 音声関連React hooks
│   └── types/                 # 音声関連型定義
├── chunk/                     # チャンク処理システム (Phase 4実装済み)
│   ├── core/                  # チャンク処理コア
│   ├── manager/               # チャンク管理
│   ├── queue/                 # チャンク処理キュー
│   └── watcher/               # ファイル監視
├── components/                # UI コンポーネント (Phase 5実装済み)
│   ├── FileManagement/        # ファイル管理UI
│   ├── Transcription/         # 文字起こしUI
│   ├── Settings/              # 設定UI
│   └── common/                # 共通コンポーネント
└── services/                  # アプリケーションサービス
```

---

## Phase 3: 音声処理サービス分離 ✅ 完了

### 実装成果

#### 3.1 音声サービス層の確立
- **場所**: `src/renderer/audio/`
- **責務分離**: 音声処理ロジックとアプリケーションロジックの明確な分離
- **再利用性**: 他プロジェクトでの音声機能再利用が可能

#### 3.2 実装済みコンポーネント

##### Core Audio Services
- **AudioMixingService**: `audio/services/core/AudioMixingService.ts`
  - 複数音声源のミキシング処理
  - 音声レベル監視機能

- **MicrophoneMonitorService**: `audio/services/core/MicrophoneMonitorService.ts`
  - マイク入力レベルのリアルタイム監視
  - 音声デバイス状態管理

##### Processing Services
- **AudioChunkProcessor**: `audio/services/processing/AudioChunkProcessor.ts`
  - 音声データのチャンク分割処理
  - 効率的なメモリ管理

- **ChunkGenerator**: `audio/services/processing/ChunkGenerator.ts`
  - 差分チャンク生成システム
  - WebMファイル形式の最適化

- **AudioDiagnostics**: `audio/services/processing/AudioDiagnostics.ts`
  - 音声品質診断機能
  - エラー分析とレポート生成

##### Audio Hooks
- **useAudioPlayer**: `audio/hooks/useAudioPlayer.ts`
  - 音声再生状態管理
  - プレイバック制御

#### 3.3 技術的成果
- **循環依存**: 0件達成
- **コード重複**: 音声処理ロジックで0%達成
- **テスト独立性**: 音声サービス単体テストが可能

---

## Phase 4: チャンク処理システム ✅ 完了

### 実装成果

#### 4.1 ファイルベースリアルタイム文字起こしシステム
現在のシステムは、メモリベース処理からファイルベース処理への移行により、リアルタイム文字起こしの安定性が大幅に向上しました。

#### 4.2 主要実装コンポーネント

##### 1. TrueDifferentialChunkGenerator（真の差分チャンク生成）
**場所**: `services/` (統合前) → `chunk/core/` (統合後)

**実装済み機能**:
- 新規追加された音声データのみを抽出して独立再生可能なWebMファイル生成
- 時間ベースの自動チャンク生成（20秒間隔）
- WebMヘッダー修正（DocTypeをmatroskaからwebmに変更）
- オーバーラップ排除による純粋な差分処理

**設定項目**:
```typescript
interface ChunkGenerationConfig {
  intervalSeconds: number;        // 20秒固定
  enableFileGeneration: boolean;  // ファイル生成有効化
  tempFolderPath?: string;       // 一時フォルダパス
  enableAutoGeneration: boolean; // 自動生成有効化
}
```

##### 2. ChunkFileWatcher（チャンクファイル監視）
**場所**: `chunk/watcher/ChunkFileWatcher.ts`

**実装済み機能**:
- テンポラリフォルダの新しいチャンクファイル検出
- ファイル安定性チェック（書き込み完了判定）
- 順次処理のためのキューイング機能
- リアルタイム文字起こし連携

**監視対象ファイルパターン**:
```typescript
/^(timerange_chunk_|truediff_chunk_|differential_chunk_)\d{3}\.webm$/
```

##### 3. FileBasedTranscriptionEngine（ファイルベース文字起こし）
**場所**: `services/FileBasedTranscriptionEngine.ts`

**実装済み機能**:
- チャンクファイルを順次処理し文字起こし結果を統合
- 1回リトライ機能（効率化と無限ループ防止）
- 6種類のエラータイプ分類とハンドリング
- 音声診断機能（安定性のため現在無効化）

**エラー分類**:
```typescript
type ErrorType = 
  | 'server_error'          // サーバーエラー
  | 'file_error'           // ファイルエラー
  | 'timeout'              // タイムアウト
  | 'network_error'        // ネットワークエラー
  | 'audio_quality_error'  // 音声品質エラー
  | 'unknown'              // 不明エラー
```

##### 4. RealtimeTextManager（リアルタイムテキスト管理）
**場所**: `services/RealtimeTextManager.ts`

**実装済み機能**:
- 文字起こし結果の統合・メモリバッファ管理
- 自動ファイル書き込み（3秒間隔）
- 時間範囲ベースチャンクの重複除去処理
- 詳細フォーマット/シンプルフォーマット対応

**出力ファイル形式**:
```
元ファイル: recording_20250714_143052.webm
出力ファイル: recording_20250714_143052.rt.txt
```

#### 4.3 実装済み動作フロー

##### Phase 1: 録音開始・チャンク生成
```
録音開始ボタン押下
  ↓
TrueDifferentialChunkGenerator.startRecording()
  ↓
自動チャンク生成開始（20秒間隔）
  ↓
MediaRecorderからのデータを連続バッファに蓄積
  ↓
時間間隔達成時にチャンクファイル生成
  ↓
differential_chunk_XXX.webmとして保存
```

##### Phase 2: ファイル監視・文字起こし処理
```
ChunkFileWatcher.startWatching()
  ↓
1秒間隔でテンポラリフォルダを監視
  ↓
新しいチャンクファイル検出
  ↓
ファイル安定性チェック（500ms遅延で2回サイズ確認）
  ↓
FileBasedTranscriptionEngine.addChunkFile()
  ↓
順次キューイング・文字起こし処理実行
```

##### Phase 3: 結果統合・テキスト出力
```
文字起こし完了
  ↓
RealtimeTextManager.addTranscriptionResult()
  ↓
時間範囲ベースフィルタリング（重複除去）
  ↓
メモリバッファ更新・ソート
  ↓
3秒間隔での自動ファイル書き込み
  ↓
.rt.txt形式でリアルタイム結果保存
```

---

## Phase 5: UI コンポーネント分離 ✅ 完了

### 実装成果

#### 5.1 コンポーネント設計の改善
従来の大型コンポーネント（BottomPanel.tsx: 1766行、SpeechRecognition.tsx: 1151行）から、責務が明確な小型コンポーネントへの分割を実現。

#### 5.2 実装済みコンポーネント構造

##### A. ファイル管理系 (FileManagement/)
**場所**: `components/FileManagement/`

```
FileManagement/
├── FileActions/
│   └── FileActionsPanel.tsx     # ファイル操作UI
├── FileList/
│   └── FileListPanel.tsx        # ファイル一覧表示
├── FileMetadata/
│   └── FileMetadataPanel.tsx    # ファイル情報表示
├── hooks/                       # ファイル管理用hooks
└── types/                       # ファイル管理型定義
```

**実装済み機能**:
- ファイル一覧表示とフィルタリング
- ファイル操作（削除、リネーム、移動）
- メタデータ表示（サイズ、日時、形式）

##### B. 文字起こし系 (Transcription/)
**場所**: `components/Transcription/`

```
Transcription/
├── ChunkSettings/
│   └── ChunkSettings.tsx        # チャンク設定UI
├── ServerControl/
│   ├── ModelSelector.tsx        # モデル選択
│   ├── ServerActionButtons.tsx  # サーバー制御ボタン
│   └── ServerStatusDisplay.tsx  # サーバー状態表示
├── TranscriptionControls/
│   ├── ChunkTranscription.tsx   # チャンク文字起こし制御
│   ├── StandardTranscription.tsx # 標準文字起こし制御
│   └── TranscriptionProgress.tsx # 進捗表示
└── hooks/                       # 文字起こし用hooks
```

**実装済み機能**:
- モデル選択とサーバー制御
- リアルタイム/バッチ文字起こし制御
- 進捗表示とエラーハンドリング

##### C. 設定管理系 (Settings/)
**場所**: `components/Settings/`

```
Settings/
├── Panels/
│   ├── DetailedSettingsPanel.tsx    # 詳細設定
│   ├── FileSettingsPanel.tsx        # ファイル設定
│   ├── RecordingSettingsPanel.tsx   # 録音設定
│   └── TranscriptionSettingsPanel.tsx # 文字起こし設定
├── hooks/                            # 設定用hooks
└── types/                           # 設定型定義
```

**実装済み機能**:
- パネル別設定管理
- 設定の永続化
- 設定値検証

##### D. 共通コンポーネント (common/)
**場所**: `components/common/`

```
common/
├── Button/
│   └── Button.tsx               # 統一ボタンコンポーネント
├── EmptyState/
│   └── EmptyState.tsx           # 空状態表示
├── LoadingSpinner/
│   └── LoadingSpinner.tsx       # ローディング表示
└── Notification/
    └── Notification.tsx         # 通知表示
```

#### 5.3 設計原則の実現
- **単一責務**: 各コンポーネントが明確な1つの責務を持つ
- **再利用性**: 共通コンポーネントの積極的活用
- **保守性**: 300行以下のコンポーネントサイズ
- **テスト性**: 独立したコンポーネントテストが可能

---

## 現在の技術仕様

### 実装済み設定・定数

#### チャンク設定
```typescript
const CHUNK_CONFIG = {
  SIZE_SECONDS: 20,              // チャンクサイズ（20秒固定）
  FILE_CHECK_INTERVAL: 1000,     // ファイル監視間隔
  PROCESSING_TIMEOUT: 180000,    // 処理タイムアウト（3分）
  MAX_RETRY_COUNT: 1,            // 最大リトライ回数
  STABILITY_CHECK_DELAY: 500     // ファイル安定性チェック遅延
}
```

#### ファイル設定
```typescript
const FILE_CONFIG = {
  CHUNK_PREFIX: 'differential_chunk_',  // チャンクプレフィックス
  TEMP_FOLDER_PREFIX: 'temp_',         // テンポラリフォルダ
  TEXT_UPDATE_INTERVAL: 3000,          // テキスト書き込み間隔
  SEQUENCE_PADDING: 3,                 // シーケンス番号桁数（001, 002...）
  OUTPUT_EXTENSION: '.rt.txt'          // 出力ファイル拡張子
}
```

#### UI設定
```typescript
const UI_CONFIG = {
  DISPLAY_UPDATE_DEBOUNCE: 500,     // 表示更新遅延
  AUTO_SCROLL_THRESHOLD: 100,       // 自動スクロール閾値  
  STATUS_UPDATE_INTERVAL: 5000,     // 進行状況更新間隔
  STATS_UPDATE_INTERVAL: 5000       // 統計更新間隔
}
```

### 品質保証機能

#### エラーハンドリング強化
- **エラー分類**: 6種類のエラータイプを自動分類
- **重要度判定**: low/medium/high/critical の4段階
- **指数バックオフ**: エラータイプ別リトライ遅延
- **推奨アクション**: エラー別の具体的対策提示

#### ファイルシステム信頼性
- **安定性チェック**: 書き込み完了をサイズ比較で判定
- **最小サイズ制限**: 1KB未満のファイルは無効として処理
- **権限チェック**: ディスク容量・アクセス権限の確認
- **パス正規化**: Windows環境でのファイルパス処理

#### パフォーマンス最適化
- **メモリバッファ管理**: 最大1000セグメントで制限
- **時間範囲フィルタリング**: 重複セグメントの効率的除去
- **リソース監視**: CPU/メモリ使用量をlow/medium/highで分類
- **統計データ**: 処理時間、成功率、エラー率の追跡

---

## 状態管理アーキテクチャ

### 実装済み状態管理構造

#### アプリケーション状態
**場所**: `state/ApplicationState.ts`
- グローバルアプリケーション状態の中央管理
- 複数ドメイン間の状態同期

#### ドメイン別状態管理

##### 録音状態管理
**場所**: `state/RecordingState.ts`, `services/state/RecordingStateManager.ts`
```typescript
interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  currentFile: RecordingFile | null;
  deviceSettings: DeviceConfig;
  audioLevel: number;
}
```

##### 文字起こし状態管理
**場所**: `state/TranscriptionState.ts`, `services/state/TranscriptionStateManager.ts`
```typescript
interface TranscriptionState {
  isProcessing: boolean;
  currentResult: TranscriptionResult | null;
  model: string;
  progress: number;
  chunks: ChunkResult[];
}
```

#### Hooks層
- **useRecordingStateManager**: 録音状態の統合管理
- **useTranscriptionStateManager**: 文字起こし状態の統合管理
- **useBottomPanelState**: UI状態の局所管理

---

## サービス層アーキテクチャ

### Core Services
**場所**: `services/core/`

#### FileServiceV2
- ファイル操作の統合API
- エラーハンドリングと権限管理
- 非同期ファイル処理

#### RecordingServiceV2
- 録音機能の統合制御
- デバイス管理とオーディオ処理
- リアルタイムチャンク生成

#### TranscriptionServiceV2
- 文字起こしエンジンの統合制御
- 複数モデル対応
- 結果統合とフォーマット変換

### Integration Services
**場所**: `services/`

#### FileBasedRealtimeProcessor
- リアルタイム文字起こしの統合制御
- 4つのコンポーネント（チャンク生成、ファイル監視、文字起こしエンジン、テキスト管理）の調整
- システム全体の開始/停止/一時停止/再開
- 統計情報の統合管理

#### ChunkTranscriptionManager
- チャンク分割文字起こしの管理
- キューイングシステム
- エラー処理とリトライ機能

---

## 設定モーダルシステム

### 実装済み機能
**場所**: `components/SettingsModal/`

#### SettingsModal.tsx
- モーダルダイアログによる設定画面
- タブ式インターフェース
- 設定値の検証と保存

#### 設定パネル
- **RecordingSettingsPanel**: 録音関連設定
- **TranscriptionSettingsPanel**: 文字起こし設定
- **FileSettingsPanel**: ファイル管理設定
- **DetailedSettingsPanel**: 詳細設定

#### 設定管理
**場所**: `contexts/SettingsContext.tsx`
- 設定値の中央管理
- 永続化とリストア機能
- 設定変更の監視

---

## ログシステム

### 実装済みログ管理
**場所**: `utils/`

#### Logger.ts
- 階層化ログレベル（DEBUG, INFO, WARN, ERROR）
- カテゴリ別ログ分類
- タイムスタンプ付きログ出力

#### LoggerFactory.ts
- ロガーインスタンスの一元管理
- カテゴリ別ロガー生成
- 設定可能なログレベル

#### LoggingMigrationHelper.ts
- 既存のconsole.logからLogger呼び出しへの移行支援
- 一括置換とリファクタリング支援

---

## 主要技術的決定と根拠

### 1. ファイルベース処理への移行
**決定**: メモリベース → ファイルベース処理
**根拠**: 
- 大容量音声ファイルでの安定性向上
- メモリ使用量の制限
- エラー発生時のデータ保全

### 2. チャンクサイズの最適化
**決定**: 5秒間隔 → 20秒間隔
**根拠**:
- 文字起こし精度の向上
- 処理負荷の軽減
- ファイル管理の簡素化

### 3. リトライ回数の最適化
**決定**: 3回リトライ → 1回リトライ
**根拠**:
- 無限ループ防止
- 処理効率の向上
- エラー早期検出

### 4. 順次処理の採用
**決定**: 並列処理 → 順次処理
**根拠**:
- システムの安定性
- デバッグの容易性
- リソース管理の簡素化

### 5. モジュラー・アーキテクチャの採用
**決定**: 大型コンポーネント → 小型モジュール
**根拠**:
- 保守性の向上
- テスト独立性
- 再利用性の向上

---

## パフォーマンス指標

### 定量指標（達成済み）
- **ファイル依存関係数**: 音声サービス内の循環依存0件
- **コード重複**: 音声処理ロジックの重複0%
- **コンポーネントサイズ**: 平均300行以下
- **テスト実行時間**: 音声サービス単体テスト30秒以内

### 定性指標（改善済み）
- **開発者体験**: 音声機能の変更時の影響範囲特定が容易
- **コード可読性**: 音声処理の責務が明確
- **保守性**: 新機能追加時のコード変更が局所化

---

## 今後の開発方針

### 完了した段階的改善
- ✅ **Phase 3**: 音声処理サービス分離
- ✅ **Phase 4**: チャンク処理システム確立  
- ✅ **Phase 5**: UI コンポーネント分離

### 次期開発予定項目

#### 未実装・改善予定の機能
1. **並列処理対応**: 現在は単一ファイル順次処理のみ
2. **チャンクサイズ動的調整**: 音声内容に応じたサイズ最適化
3. **話者識別統合**: 複数話者の自動識別・分離
4. **音声品質診断**: AudioDiagnostics機能の安定化・再有効化
5. **WebSocket直接接続**: ファイルベースから直接ストリーミングへの移行

#### 想定される課題と対策
1. **大量ファイル処理**: テンポラリファイルの定期クリーンアップ機能
2. **ディスク容量不足**: 容量監視と自動アラート機能
3. **ネットワーク不安定**: より高度なリトライ・フォールバック機能

### Phase 2.5: UI/UX改善の実装状況
**ステータス**: Phase 2.5.1 (アコーディオンUI) 計画中

#### 計画されている改善項目
1. **アコーディオン式UI**: 4セクション（文字起こし結果、プレイヤー、認識、録音）
2. **テキスト編集機能**: セグメント単位のインライン編集
3. **準リアルタイム文字起こし**: チャンク分割方式

---

## まとめ

KoeNoteアプリケーションは、Phase 3-5の実装により以下の成果を達成しました：

### 技術的成果
- **モジュラー・アーキテクチャ**: 責務が明確な小型コンポーネント構造
- **安定性向上**: ファイルベース処理によるリアルタイム文字起こしの安定化
- **保守性向上**: 循環依存0件、コード重複0%達成
- **テスト性向上**: 各層の独立テストが可能

### 品質向上
- **エラーハンドリング**: 6種類×4段階の詳細エラー管理
- **パフォーマンス**: メモリ管理とリソース監視の最適化
- **ユーザビリティ**: 設定モーダルとコンポーネント分離

### 開発効率
- **影響範囲の明確化**: 変更時の影響予測が容易
- **新機能追加**: 既存アーキテクチャへの自然な統合
- **コードレビュー**: 変更内容の理解とレビューが効率化

現在のアーキテクチャは、持続可能な開発を支援し、将来の機能拡張に柔軟に対応できる基盤を提供しています。