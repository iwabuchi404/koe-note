# 音声録音・再生アプリ 設計仕様書 - 実装更新版

## 更新概要

このドキュメントは、実際の実装に基づいてオリジナルのdesign-doc.mdを更新した内容です。
主にリアルタイム文字起こしのチャンクファイル生成部分と文字起こし結果ファイル生成部分について、現在の実装状況を反映しています。

---

## 10. リアルタイム文字起こし詳細設計 【更新済み】

### 10.1 実装済みファイルベースリアルタイム文字起こしシステム

#### 概要
**実装状況**: ✅ 完了
現在のシステムはメモリベース処理からファイルベース処理に移行し、リアルタイム文字起こしの安定性が大幅に向上しました。

#### 実装アーキテクチャ

```
【録音制御】
RecordingControl → TrueDifferentialChunkGenerator
                ↓
        チャンクファイル自動生成
                ↓
        テンポラリフォルダ保存

【文字起こし制御】                  
ChunkFileWatcher → FileBasedTranscriptionEngine → RealtimeTextManager
     ↓                        ↓                        ↓
ファイル監視              順次文字起こし処理           結果統合・保存
```

#### 主要実装コンポーネント

##### 1. TrueDifferentialChunkGenerator（真の差分チャンク生成システム）
**ファイルパス**: `src/renderer/services/TrueDifferentialChunkGenerator.ts`

**主要機能**:
- 新しく追加された音声データのみを抽出して独立再生可能なWebMファイルを生成
- 時間ベースの自動チャンク生成（デフォルト20秒間隔）
- チャンクファイル保存機能
- WebMヘッダー修正（DocTypeをmatroskaからwebmに変更）
- オーバーラップ排除による純粋な差分処理

**設定可能項目**:
```typescript
interface ChunkGenerationConfig {
  intervalSeconds: number;        // チャンク間隔（20秒）
  enableFileGeneration: boolean;  // ファイル生成有効化
  tempFolderPath?: string;       // 一時フォルダパス
  enableAutoGeneration: boolean; // 自動生成有効化
}
```

**ファイル命名規則**:
```
differential_chunk_001.webm
differential_chunk_002.webm
...
truediff_chunk_001.webm (別方式)
timerange_chunk_001.webm (時間範囲ベース)
```

##### 2. ChunkFileWatcher（チャンクファイル監視システム）
**ファイルパス**: `src/renderer/services/ChunkFileWatcher.ts`

**主要機能**:
- テンポラリフォルダの新しいチャンクファイル検出
- ファイル安定性チェック（書き込み完了判定）
- 順次処理のためのキューイング機能
- リアルタイム文字起こし連携

**監視対象ファイルパターン**:
```typescript
// 対応するファイルパターン
/^(timerange_chunk_|truediff_chunk_|differential_chunk_)\d{3}\.webm$/
```

**設定項目**:
```typescript
interface ChunkWatcherConfig {
  watchIntervalMs: number;           // ファイル監視間隔（1000ms）
  fileStabilityCheckDelay: number;   // ファイル安定性チェック遅延（500ms）
  minFileSize: number;               // 最小ファイルサイズ（1000 bytes）
  enableRealtimeTranscription: boolean; // リアルタイム文字起こし有効
}
```

##### 3. FileBasedTranscriptionEngine（ファイルベース文字起こしエンジン）
**ファイルパス**: `src/renderer/services/FileBasedTranscriptionEngine.ts`

**主要機能**:
- チャンクファイルを順次処理し文字起こし結果を統合
- 1回リトライ機能（最大リトライ回数: 1）
- エラー分類とハンドリング（6種類のエラータイプ）
- ChunkTranscriptionQueueとの連携
- 音声診断機能（現在は安定性のため無効化）

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

**設定項目**:
```typescript
interface TranscriptionEngineConfig {
  maxRetryCount: number;       // 最大リトライ回数（1）
  processingTimeout: number;   // 処理タイムアウト（180秒）
  queueCheckInterval: number;  // キューチェック間隔（1000ms）
  enableAutoRetry: boolean;    // 自動リトライ有効
}
```

##### 4. RealtimeTextManager（リアルタイムテキスト管理システム）
**ファイルパス**: `src/renderer/services/RealtimeTextManager.ts`

**主要機能**:
- 文字起こし結果の統合・メモリバッファ管理
- 自動ファイル書き込み（3秒間隔）
- 時間範囲ベースチャンクの重複除去処理
- メタデータ管理（進捗、エラー統計）
- 詳細フォーマット/シンプルフォーマット対応

**出力ファイル形式**:
```
元ファイル: recording_20250714_143052.webm
出力ファイル: recording_20250714_143052.rt.txt
```

**設定項目**:
```typescript
interface TextFileConfig {
  writeInterval: number;        // ファイル書き込み間隔（3000ms）
  bufferSize: number;          // メモリバッファサイズ（1000セグメント）
  enableAutoSave: boolean;     // 自動保存有効
  fileFormat: 'detailed' | 'simple'; // ファイル形式
}
```

##### 5. FileBasedRealtimeProcessor（統合制御システム）
**ファイルパス**: `src/renderer/services/FileBasedRealtimeProcessor.ts`

**主要機能**:
- 上記4つのコンポーネントを統合制御
- システム全体の開始/停止/一時停止/再開
- 統計情報の統合管理
- UI通知システム
- エラーハンドリングとリソース監視

### 10.2 実装済み動作フロー

#### Phase 1: 録音開始・チャンク生成
```
1. 録音開始ボタン押下
   ↓
2. TrueDifferentialChunkGenerator.startRecording()
   ↓
3. 自動チャンク生成開始（20秒間隔）
   ↓
4. MediaRecorderからのデータを連続バッファに蓄積
   ↓
5. 時間間隔達成時にチャンクファイル生成
   ↓
6. differential_chunk_XXX.webmとして保存
```

#### Phase 2: ファイル監視・文字起こし処理
```
1. ChunkFileWatcher.startWatching()
   ↓
2. 1秒間隔でテンポラリフォルダを監視
   ↓
3. 新しいチャンクファイル検出
   ↓
4. ファイル安定性チェック（500ms遅延で2回サイズ確認）
   ↓
5. FileBasedTranscriptionEngine.addChunkFile()
   ↓
6. 順次キューイング・文字起こし処理実行
```

#### Phase 3: 結果統合・テキスト出力
```
1. 文字起こし完了
   ↓
2. RealtimeTextManager.addTranscriptionResult()
   ↓
3. 時間範囲ベースフィルタリング（重複除去）
   ↓
4. メモリバッファ更新・ソート
   ↓
5. 3秒間隔での自動ファイル書き込み
   ↓
6. .rt.txt形式でリアルタイム結果保存
```

### 10.3 実装済み設定・定数

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

### 10.4 実装済み機能と品質保証

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

### 10.5 今後の改善予定項目

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

---

## 主要変更点まとめ

### ドキュメントからの主要変更
1. **メモリベース → ファイルベース**: 安定性とスケーラビリティの向上
2. **5秒間隔 → 20秒間隔**: チャンクサイズの最適化
3. **並列処理 → 順次処理**: シンプル・確実な処理方式採用
4. **3回リトライ → 1回リトライ**: 効率化と無限ループ防止
5. **WebMヘッダー修正**: 独立再生可能なチャンクファイル生成

### 新規追加された実装
1. **TrueDifferentialChunkGenerator**: 高品質チャンク生成システム
2. **FileBasedRealtimeProcessor**: 統合制御・監視システム  
3. **RealtimeTextManager**: 高度なテキスト管理・出力システム
4. **エラー分類・重要度判定**: 6種類×4段階の詳細エラー管理
5. **UI通知システム**: CustomEventベースのリアルタイム状態更新

### 実装品質の向上
- **型安全性**: TypeScriptインターフェース完全定義
- **ログ充実**: 詳細デバッグ情報とプロセス追跡
- **設定分離**: コンフィグファイルでの一元管理
- **テスト容易性**: モジュラー設計と依存性注入

この実装により、元のdesign-docで想定していた「ファイルベースリアルタイム文字起こし」が実現され、更に品質・性能・保守性の面で大幅な改善が図られています。