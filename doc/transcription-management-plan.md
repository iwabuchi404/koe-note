# 文字起こし結果管理機能 実装計画書

## 1. 概要

音声認識結果の保存・編集・AI連携機能を段階的に実装する。
AI連携は初期段階ではクリップボードコピー機能から開始し、将来的にAPI連携に拡張する。

## 2. 実装対象機能

### 2.1 Phase 1: 基本保存・表示機能
- [x] 音声認識結果の表示（既存）
- [x] .trans.txtファイルの自動保存
- [x] メタデータ付きファイル形式の実装
- [x] 保存済み文字起こしファイルの読み込み・表示

### 2.2 Phase 2: 編集・操作機能  
- [ ] 文字起こし結果の編集機能
- [ ] タイムスタンプ付きテキストの編集
- [ ] セグメント単位での編集・削除
- [ ] 話者情報の編集（手動追加）

### 2.3 Phase 3: AI連携準備機能
- [ ] テキスト選択機能
- [ ] 選択テキストのクリップボードコピー
- [ ] コピー履歴の記録
- [ ] .ai-chat.txtファイルの準備（将来のAPI連携用）

## 3. ファイル仕様詳細

### 3.1 文字起こしファイル (.trans.txt)

#### 3.1.1 ファイル命名規則
```
音声ファイル: recording_20250714_143052.webm
文字起こし: recording_20250714_143052.trans.txt
AI対話記録: recording_20250714_143052.ai-chat.txt
```

#### 3.1.2 ファイル内容構造
```yaml
---
# メタデータセクション（YAML形式）
audio_file: recording_20250714_143052.webm
model: kotoba-whisper-medium
transcribed_at: 2025-07-14T14:31:25Z
duration: 1800.5
segment_count: 42
language: ja
speakers: []  # 初期は空配列、手動で追加
coverage: 98.5  # 処理カバレッジ率（%）
---

# 文字起こし内容セクション
[00:00:15.2] こんにちは、今日の会議を始めます
[00:00:32.8] プロジェクトの進捗について話しましょう
[00:01:05.1] 課題が3つあります。まず最初に...
[00:02:15.6] スケジュールについて確認したいことがあります
```

#### 3.1.3 タイムスタンプ形式
- `[HH:MM:SS.s]` 形式（秒は小数点1桁）
- セグメント開始時刻を表示
- 話者情報は将来拡張用（`[00:01:05.1] 田中: テキスト`）

### 3.2 AI対話記録ファイル (.ai-chat.txt)

#### 3.2.1 ファイル内容構造（将来用）
```yaml
---
source_file: recording_20250714_143052.trans.txt
created_at: 2025-07-14T14:45:30Z
total_interactions: 3
---

# クリップボードコピー履歴
[14:45:30] コピー: "課題が3つあります。まず最初に..."
[14:47:15] コピー: "スケジュールについて確認したいことがあります"
[14:50:22] コピー: "来月までに完成させる必要があります"

# 将来のAPI連携用（現時点では実装しない）
# [14:45:30] 選択: "課題が3つあります..."
# 質問: この課題について詳しく分析してください  
# AI応答: 分析結果...
```

## 4. データ構造設計

### 4.1 TypeScript型定義

#### 4.1.1 文字起こし結果（拡張）
```typescript
interface TranscriptionMetadata {
  audioFile: string;           // 元音声ファイル名
  model: string;               // 使用モデル名
  transcribedAt: string;       // ISO8601形式の日時
  duration: number;            // 音声長（秒）
  segmentCount: number;        // セグメント数
  language: string;            // 言語コード
  speakers: string[];          // 話者一覧（手動追加）
  coverage: number;            // カバレッジ率（%）
}

interface TranscriptionSegment {
  start: number;               // 開始時刻（秒）
  end: number;                 // 終了時刻（秒）
  text: string;                // テキスト内容
  speaker?: string;            // 話者名（オプション）
  isEdited?: boolean;          // 編集済みフラグ
}

interface TranscriptionFile {
  metadata: TranscriptionMetadata;
  segments: TranscriptionSegment[];
  filePath: string;            // .trans.txtのパス
  isModified: boolean;         // 未保存変更フラグ
}
```

#### 4.1.2 AI対話記録（将来用）
```typescript
interface ClipboardCopyRecord {
  timestamp: string;           // ISO8601形式
  selectedText: string;        // コピーしたテキスト
  segmentIndex?: number;       // 元セグメントインデックス
}

interface AIChatFile {
  sourceFile: string;          // 元.trans.txtファイル
  createdAt: string;           // 作成日時
  clipboardHistory: ClipboardCopyRecord[];
  // 将来のAPI連携用フィールドは後で追加
}
```

### 4.2 ファイル操作API設計

#### 4.2.1 新規IPC API
```typescript
interface ElectronAPI {
  // 既存API...
  
  // 文字起こしファイル操作
  saveTranscriptionFile: (audioFilePath: string, transcription: TranscriptionFile) => Promise<string>;
  loadTranscriptionFile: (transFilePath: string) => Promise<TranscriptionFile>;
  deleteTranscriptionFile: (transFilePath: string) => Promise<boolean>;
  
  // AI対話記録操作
  saveClipboardCopy: (audioFilePath: string, copyRecord: ClipboardCopyRecord) => Promise<void>;
  loadAIChatFile: (chatFilePath: string) => Promise<AIChatFile>;
  
  // ファイル関連操作
  checkTranscriptionExists: (audioFilePath: string) => Promise<boolean>;
  getTranscriptionPath: (audioFilePath: string) => Promise<string>;
  getAIChatPath: (audioFilePath: string) => Promise<string>;
}
```

## 5. UI/UX設計

### 5.1 文字起こし表示エリアの拡張

#### 5.1.1 レイアウト構成
```
┌─────────────────────────────────────────────────────────┐
│ 🎤 音声認識結果                                           │
├─────────────────────────────────────────────────────────┤
│ [保存] [編集] [クリップボード] [元に戻す]                    │
├─────────────────────────────────────────────────────────┤
│ メタデータ: kotoba-whisper-medium | 98.5%カバレッジ      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ [00:00:15.2] こんにちは、今日の会議を始めます               │
│ [00:00:32.8] プロジェクトの進捗について話しましょう         │ 
│ [00:01:05.1] 課題が3つあります。まず最初に...             │
│ [00:02:15.6] スケジュールについて確認したいことがあります   │
│                                                         │
│ ... (スクロール可能) ...                                 │
│                                                         │
├─────────────────────────────────────────────────────────┤
│ クリップボード履歴 (3件)                                   │
│ • [14:45] "課題が3つあります..."                          │ 
│ • [14:47] "スケジュールについて..."                       │
└─────────────────────────────────────────────────────────┘
```

#### 5.1.2 操作方法
1. **テキスト選択**: マウスドラッグで範囲選択
2. **コピー**: 
   - 選択状態で右クリック → "クリップボードにコピー"
   - 選択状態でCtrl+C
   - 「クリップボード」ボタンクリック
3. **編集モード**: 「編集」ボタンでテキスト編集可能に
4. **保存**: 「保存」ボタンで.trans.txtファイルに保存

### 5.2 ファイルエクスプローラーの拡張

#### 5.2.1 ファイル表示
```
📁 recordings/
  📄 recording_20250714_143052.webm      (12.5MB)
  📝 recording_20250714_143052.trans.txt  (8.2KB) ← 新規追加
  💬 recording_20250714_143052.ai-chat.txt (1.1KB) ← 将来追加
  📄 recording_20250714_144523.webm      (8.7MB)
  📝 recording_20250714_144523.trans.txt  (5.8KB)
```

#### 5.2.2 コンテキストメニュー
- **音声ファイル右クリック**:
  - 再生
  - 文字起こし実行
  - 文字起こしファイルを開く（存在する場合）
  - ファイル削除
  
- **.trans.txtファイル右クリック**:
  - 開く
  - 編集
  - エクスポート（将来実装）
  - ファイル削除

## 6. 実装手順

### 6.1 Phase 1: 基本保存機能（Week 1-2）

#### Step 1: データ構造とAPI実装
- [x] TypeScript型定義追加
- [x] IPC API実装（saveTranscriptionFile, loadTranscriptionFile）
- [x] ファイル読み書き処理実装

#### Step 2: 音声認識結果の自動保存
- [x] SpeechRecognitionコンポーネント修正
- [x] 認識完了時の自動保存処理
- [x] メタデータ生成処理

#### Step 3: 保存済みファイルの表示
- [x] ファイルエクスプローラーでの.trans.txt表示
- [x] .trans.txtファイルクリック時の読み込み・表示

### 6.2 Phase 2: 編集機能（Week 3-4）

#### Step 1: 編集UI実装
- [ ] 編集モード切り替え機能
- [ ] セグメント単位の編集機能
- [ ] タイムスタンプの表示・編集

#### Step 2: 話者情報機能
- [ ] 話者名の手動追加・編集
- [ ] 話者別カラー表示（将来実装）

#### Step 3: 保存・復元機能
- [ ] 編集内容の保存
- [ ] 未保存変更の検知・警告
- [ ] 元に戻す機能

### 6.3 Phase 3: クリップボード連携（Week 5）

#### Step 1: テキスト選択機能
- [ ] 文字起こし結果のテキスト選択
- [ ] 選択範囲の視覚的表示

#### Step 2: クリップボードコピー
- [ ] 選択テキストのクリップボードコピー
- [ ] コピー履歴の記録
- [ ] .ai-chat.txtファイルへの履歴保存

#### Step 3: 履歴表示機能
- [ ] クリップボード履歴の表示UI
- [ ] 履歴からの再コピー機能

## 7. テスト計画

### 7.1 単体テスト
- [ ] ファイル読み書き処理
- [ ] メタデータ生成・解析
- [ ] テキスト選択・コピー機能

### 7.2 統合テスト
- [ ] 音声認識 → 保存 → 読み込みの一連の流れ
- [ ] 編集 → 保存 → 再読み込みの流れ
- [ ] クリップボードコピー → 履歴記録の流れ

### 7.3 ユーザビリティテスト
- [ ] ファイル操作の直感性
- [ ] 編集操作の使いやすさ
- [ ] クリップボード機能の便利さ

## 8. 将来拡張予定

### 8.1 エクスポート機能
- [ ] SRT字幕ファイル出力
- [ ] VTT字幕ファイル出力
- [ ] プレーンテキスト出力

### 8.2 AI API連携（Phase 4以降）
- [ ] OpenAI API統合
- [ ] Claude API統合
- [ ] 質問・回答の記録機能
- [ ] AI対話履歴の管理

### 8.3 高度な編集機能
- [ ] 音声波形と連動した編集
- [ ] 自動話者分離
- [ ] テキスト検索・置換機能

## 9. 技術的検討事項

### 9.1 ファイル同期
- 音声ファイル削除時の関連ファイル削除
- ファイル移動時の整合性保持

### 9.2 パフォーマンス
- 大きな文字起こしファイルの効率的な読み書き
- UI応答性の維持

### 9.3 データ整合性
- 編集中のデータ損失防止
- ファイル破損時の復旧方法

---

*この実装計画は段階的に実行し、各フェーズ完了後にユーザーフィードバックを基に調整を行う。*