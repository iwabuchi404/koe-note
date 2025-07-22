# KoeNote UI改善実装計画書

## 概要

KoeNoteアプリケーションのUI改善として、以下の2つの機能を実装する：
1. **2タブ表示システム** - 録音・文字起こしタブと選択ファイルタブの切り替え
2. **統合設定モーダル** - 全設定項目の集約化

---

## 実装案1: 2タブ表示システム

### UIレイアウト

#### 通常時（選択ファイルタブがアクティブ）
```
+----------------------+------------------------------------------+
| LeftPanel            | TabBar                                   |
| ファイル一覧         | [録音・文字起こし] [📁選択ファイル ✓]    |
| ├🎵 meeting.webm     +------------------------------------------+
| ├📄 meeting.trans.txt| 選択ファイルタブ コンテンツ              |
| └🎵 recording_001    |                                          |
|                      | 音声ファイル選択時:                      |
|                      | ┌─ 音声プレイヤー ──────────────────┐    |
|                      | │ 🎵 meeting.webm                    │    |
|                      | │ [▶] [⏸] ━━━━○━━━ 🔊 2:30/10:45   │    |
|                      | └────────────────────────────────────┘    |
|                      | ┌─ 操作パネル ──────────────────────┐    |
|                      | │ [文字起こし開始] ← 未実施時のみ表示 │    |
|                      | └────────────────────────────────────┘    |
|                      | ┌─ 文字起こし結果 ──────────────────┐    |
|                      | │ セグメント表示・編集可能...          │    |
|                      | └────────────────────────────────────┘    |
+----------------------+------------------------------------------+
| BottomPanel: [⚙設定] 状態表示                                |
+---------------------------------------------------------------+
```

#### 録音中（録音・文字起こしタブがアクティブ）
```
+----------------------+------------------------------------------+
| LeftPanel            | TabBar                                   |
| ファイル一覧         | [🔴録音中・文字起こし ✓] [選択ファイル]  |
| ├🎵 meeting.webm     +------------------------------------------+
| └🎵 recording_001    | 録音・文字起こしタブ コンテンツ          |
|                      |                                          |
|                      | ┌─ 録音・文字起こし制御 ────────────┐    |
|                      | │ デバイス: [マイク ▼] [デスクトップ] │    |
|                      | │ モデル: [Kotoba-Whisper ▼]          │    |
|                      | │ 品質: [高精度 ▼]                   │    |
|                      | │                                     │    |
|                      | │ [🔴録音停止] [⏸一時停止]           │    |
|                      | │ または                               │    |
|                      | │ [■文字起こし停止] (文字起こし中)    │    |
|                      | └─────────────────────────────────────┘    |
|                      | ┌─ リアルタイム文字起こし結果 ──────┐    |
|                      | │ 進行中の文字起こし内容...            │    |
|                      | │ または                               │    |
|                      | │ 「録音を開始してください」説明表示   │    |
|                      | └─────────────────────────────────────┘    |
+----------------------+------------------------------------------+
```

### タブの詳細仕様

#### 1. 録音・文字起こしタブ
**表示条件**: 常に存在（アプリ起動時から）
**タブ表示**: 
- 通常時: `[録音・文字起こし]`
- 録音中: `[🔴録音中・文字起こし]` 
- 文字起こし中: `[⚙文字起こし中]`

**コンテンツ**:
```typescript
interface RecordingTabContent {
  // 制御パネル
  deviceSelection: {
    microphoneDevice: string
    desktopAudio: boolean
  }
  transcriptionSettings: {
    model: string
    quality: string
    language: string
  }
  
  // 状態表示
  currentStatus: 'idle' | 'recording' | 'transcribing'
  
  // 結果表示エリア
  realtimeResults: TranscriptionSegment[]
  explanationText: string // 何も実行していない時の説明
}
```

**機能**:
- ✅ 録音開始/停止
- ✅ リアルタイム文字起こし表示
- ✅ 既存ファイルの文字起こし実行
- ⚠️ **制限**: 録音・文字起こしは同時実行不可（排他制御）

#### 2. 選択ファイルタブ
**表示条件**: LeftPanelでファイル選択時に作成
**タブ表示**: `[📁選択ファイル名]` または `[📄選択ファイル名]`

**コンテンツ**:
```typescript
interface SelectedFileTabContent {
  selectedFile: AudioFile | TranscriptionFile
  
  // 音声ファイルの場合
  audioPlayer?: {
    isPlaying: boolean
    currentTime: number
    duration: number
  }
  
  // 文字起こしボタン（条件付き表示）
  showTranscriptionButton: boolean // 文字起こし未実施の音声ファイルのみ
  
  // 表示内容
  transcriptionData?: TranscriptionData
}
```

**機能**:
- ✅ 音声ファイル再生
- ✅ 文字起こし結果表示・編集
- ✅ 文字起こしボタン（未実施時のみ）
  - クリック時 → 録音・文字起こしタブに切り替え + 文字起こし開始

### タブ管理の状態設計

```typescript
interface TabState {
  tabs: {
    recording: {
      id: 'recording'
      type: 'recording'
      title: string // 状態に応じて変化
      isActive: boolean
      status: 'idle' | 'recording' | 'transcribing'
    }
    selectedFile?: {
      id: string
      type: 'file'
      title: string
      isActive: boolean
      file: AudioFile | TranscriptionFile
    }
  }
  activeTabId: 'recording' | string
}
```

### 排他制御の仕様

**制限事項**:
1. 録音中は新たな文字起こしを開始できない
2. 文字起こし中は録音を開始できない
3. 選択ファイルタブで「文字起こし開始」をクリックした場合、録音・文字起こしタブがアクティブになる

**UI状態**:
```typescript
// 録音中の制限
if (isRecording) {
  transcriptionButton.disabled = true
  transcriptionButton.tooltip = "録音中は文字起こしを実行できません"
}

// 文字起こし中の制限  
if (isTranscribing) {
  recordButton.disabled = true
  recordButton.tooltip = "文字起こし中は録音を開始できません"
}
```

---

## 実装案3: 統合設定モーダル

### トリガー
BottomPanelの歯車アイコン `[⚙設定]` クリック

### モーダル設計

```
┌─────────────────── KoeNote 設定 ─────────────────────┐
│                                                      │
│ 📺 録音設定                                          │
│   録音デバイス                                        │
│   ├ 入力デバイス: [Microphone (Default) ▼]          │
│   └ デスクトップ音声: [✓有効] [システム音声 ▼]      │
│   ※ 録音・文字起こしタブの設定と同期されます          │
│                                                      │
│ 🤖 文字起こし設定                                    │
│   ├ モデル: [Kotoba-Whisper-v1.0 ▼]                │
│   ├ 品質: [高精度 ▼] ※処理時間が長くなります        │
│   ├ 言語: [日本語 ▼]                                │
│   └ チャンク分割時間: [20秒 ▼] ※リアルタイム処理用 │
│                                                      │
│ 📁 ファイル設定                                      │
│   ├ 作業フォルダ: [D:\work\recordings] [参照...]    │
│   │   ※ 録音・文字起こし結果の保存・読み込み先      │
│   └ 自動保存間隔: [3秒 ▼]                          │
│                                                      │
│ 🔧 詳細設定                                          │
│   ├ UIテーマ: [ライト ▼]                            │
│   ├ ログレベル: [INFO ▼]                            │
│   └ 文字起こし結果の自動改行: [✓有効]               │
│                                                      │
│                     [OK] [キャンセル] [デフォルトに戻す] │
└──────────────────────────────────────────────────────┘
```

### 設定項目の詳細

#### 録音設定
```typescript
interface RecordingSettings {
  microphone: {
    deviceId: string
    deviceName: string
  }
  desktopAudio: {
    enabled: boolean
    deviceId: string
    deviceName: string
  }
  // 録音・文字起こしタブと同期
  syncWithRecordingTab: boolean
}
```

#### 文字起こし設定
```typescript
interface TranscriptionSettings {
  model: 'kotoba-whisper-v1.0' | 'whisper-large' | 'whisper-base'
  quality: 'high' | 'medium' | 'fast'
  language: 'ja' | 'en' | 'auto'
  chunkDurationSeconds: 10 | 20 | 30
}
```

#### ファイル設定
```typescript
interface FileSettings {
  workspaceFolder: string
  autoSaveInterval: number // 秒
  fileNamingPattern: string
}
```

### 同期仕様

**双方向同期**:
- 設定モーダルで変更 → 録音・文字起こしタブに即座に反映
- 録音・文字起こしタブで変更 → 設定モーダルに反映

**実装方法**:
```typescript
// 設定コンテキスト
const SettingsContext = createContext({
  recordingSettings: RecordingSettings
  transcriptionSettings: TranscriptionSettings
  fileSettings: FileSettings
  updateRecordingSettings: (settings: RecordingSettings) => void
  updateTranscriptionSettings: (settings: TranscriptionSettings) => void
})

// タブコンポーネントでの使用
const { recordingSettings, updateRecordingSettings } = useContext(SettingsContext)
```

---

## 実装順序の提案

### **推奨: 設定モーダル → 2タブ表示**

#### Phase 1: 設定モーダル実装（優先度: 高）

**理由**:
1. **独立性**: 既存UIに影響を与えない
2. **基盤整備**: 設定管理システムは2タブ表示でも必要
3. **リスク低**: 失敗しても既存機能に影響なし
4. **即座な効果**: UI整理による使いやすさ向上

**実装工数**: 2-3日
**実装内容**:
- 設定モーダルコンポーネント作成
- SettingsContextの実装
- 既存設定項目の集約
- 同期ロジックの実装

#### Phase 2: 2タブ表示実装（優先度: 中）

**理由**:
1. **設定基盤が完成**: Phase 1で設定管理が整備済み
2. **段階的実装可能**: 既存機能を段階的に移行
3. **リスク管理**: 設定が安定してから大きなUI変更

**実装工数**: 4-5日
**実装内容**:
- TabContextの実装
- 2つのタブコンポーネント作成
- 排他制御ロジック
- 既存コンポーネントの統合

### 実装順序の根拠

**技術的観点**:
- 設定管理は2タブ表示の前提条件
- モーダルは独立性が高く、バグの影響範囲が限定的
- タブ表示は既存のRightPanelを大きく変更するため、リスクが高い

**UX観点**:
- 設定モーダルはすぐに使える改善
- 2タブ表示は慣れるまで時間がかかる可能性

**プロジェクト管理観点**:
- 段階的リリースで早期フィードバック
- 問題発生時の切り戻しが容易

---

## 実装時の注意点

### 技術的考慮事項

1. **既存コンポーネントの再利用**
   - SpeechRecognition → 両タブで使用
   - AudioPlayer → 選択ファイルタブで使用
   - 録音制御 → 録音・文字起こしタブで使用

2. **状態管理の分離**
   ```typescript
   // グローバル状態（AppContext）
   - 設定情報
   - ファイル一覧
   - 現在の実行状態（録音中/文字起こし中）
   
   // タブローカル状態
   - タブ固有の表示状態
   - 一時的なUI状態
   ```

3. **パフォーマンス**
   - 非アクティブタブでのリソース最小化
   - メモリ使用量の監視

### UX考慮事項

1. **視覚的フィードバック**
   - タブの状態表示（録音中、文字起こし中）
   - 排他制御時の明確な理由表示

2. **操作の一貫性**
   - 同じ機能は同じ場所に配置
   - ショートカットキーの維持

3. **エラーハンドリング**
   - 処理失敗時のタブ状態復旧
   - ユーザーへの明確なエラー表示

この実装計画により、**低リスクで確実な改善**を段階的に実現できます。