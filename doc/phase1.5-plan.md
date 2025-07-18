# Phase 1.5 実装プラン - 基本機能完成版

## 概要
Phase 1で基本録音機能が完成したため、Phase 1.5では **実用性向上** と **ユーザビリティ改善** に焦点を当てます。Phase 2の本格的な音声処理機能の前に、現在の基盤を強化し、より完成度の高いアプリケーションにします。

## 実装スケジュール
**期間**: 1-2日  
**優先度**: 中〜高（実用性向上のため）

---

## 🎯 Phase 1.5 実装目標

### 1. **音声再生機能** (高優先度)
**目的**: 録音したファイルをアプリ内で即座に確認可能にする

**実装内容**:
- HTMLAudioElement統合
- 再生コントロール（再生/停止/一時停止）
- シークバー（進捗表示・位置変更）
- 音量調整スライダー
- 再生速度調整（0.5x, 1x, 1.25x, 1.5x, 2x）

**実装ファイル**:
```
src/renderer/components/
├── BottomPanel/BottomPanel.tsx (録音コントロール拡張)
├── AudioPlayer/
│   ├── AudioPlayer.tsx (新規作成)
│   ├── PlaybackControls.tsx (新規作成)
│   └── SeekBar.tsx (新規作成)
└── RightPanel/RightPanel.tsx (プレイヤー統合)
```

---

### 2. **ファイル管理機能強化** (高優先度)
**目的**: より直感的なファイル操作とメタデータ表示

**実装内容**:
- ファイル一覧の自動更新（録音後、削除後）
- ファイル詳細情報表示（サイズ、長さ、作成日時）
- ファイル名変更機能
- ファイルダブルクリックで再生
- ファイル選択状態のビジュアル改善

**UI改善**:
```
LeftPanel ファイル一覧:
📁 VoiceRecordings
  🎵 recording_20250712_180530.webm  [2:34] 2.1MB
  🎵 meeting_notes_edited.webm       [5:12] 4.8MB
  🎵 interview_part1.webm            [12:05] 11.2MB
     └── 右クリックメニュー: 再生/名前変更/削除/エクスプローラーで開く
```

---

### 3. **リアルタイム音声レベルメーター** (中優先度)
**目的**: 録音品質をリアルタイムで確認可能にする

**実装内容**:
- Web Audio API統合（AnalyserNode）
- リアルタイム音声レベル検出
- ビジュアル音声レベルメーター
- 音声入力なし警告表示
- 音声レベル閾値設定

**ビジュアル設計**:
```
Bottom Panel 音声レベル:
🎤 入力レベル: ████████░░░░ 65%  [適正]
             ▓▓▓▓▓▓▓▓░░░░  (緑:適正/黄:大きい/赤:クリッピング)
```

---

### 4. **キーボードショートカット** (中優先度)
**目的**: 効率的な操作とアクセシビリティ向上

**実装ショートカット**:
```
録音操作:
- Ctrl + R: 録音開始/停止
- Ctrl + P: 録音一時停止/再開
- Space: 再生/一時停止（ファイル選択時）

ファイル操作:
- Delete: 選択ファイル削除
- F2: ファイル名変更
- Ctrl + O: フォルダ選択
- Ctrl + E: エクスプローラーで開く

アプリ操作:
- F12: DevTools表示/非表示
- Ctrl + Q: アプリ終了
```

---

### 5. **設定機能基盤** (中優先度)
**目的**: ユーザー環境に合わせたカスタマイズ

**実装内容**:
- 設定画面モーダル作成
- 音声品質設定（サンプルレート、ビットレート）
- デフォルト保存フォルダ設定
- ショートカットキー設定
- テーマ設定（将来拡張用）

**設定画面構成**:
```
⚙️ 設定
├── 📁 一般
│   ├── デフォルト保存フォルダ
│   ├── 起動時の動作
│   └── 言語設定
├── 🎤 録音
│   ├── 音声品質 (44.1kHz/48kHz)
│   ├── 音声形式 (WebM/MP3)
│   └── 自動ゲイン制御
├── ⌨️ ショートカット
│   └── キー割り当て変更
└── 🎨 外観
    └── テーマ選択 (将来実装)
```

---

### 6. **エラーハンドリング改善** (中優先度)
**目的**: ユーザーフレンドリーなエラー表示

**実装内容**:
- Toast通知システム
- 操作完了通知（録音保存完了など）
- エラー詳細表示とアクション提案
- ログ表示機能（デバッグ用）

**通知例**:
```
✅ 録音を保存しました (recording_20250712_180530.webm)
⚠️ マイクアクセスが拒否されました → 設定で許可してください
❌ ファイル保存に失敗しました → 別のフォルダを選択してください
```

---

## 📁 実装ファイル構造

### 新規作成ファイル
```
src/renderer/
├── components/
│   ├── AudioPlayer/
│   │   ├── AudioPlayer.tsx
│   │   ├── PlaybackControls.tsx
│   │   ├── SeekBar.tsx
│   │   └── VolumeControl.tsx
│   ├── Settings/
│   │   ├── SettingsModal.tsx
│   │   ├── GeneralSettings.tsx
│   │   ├── RecordingSettings.tsx
│   │   └── ShortcutSettings.tsx
│   ├── Toast/
│   │   ├── ToastProvider.tsx
│   │   └── Toast.tsx
│   └── AudioMeter/
│       └── AudioLevelMeter.tsx
├── hooks/
│   ├── useAudioPlayer.ts
│   ├── useKeyboardShortcuts.ts
│   ├── useAudioLevel.ts
│   └── useSettings.ts
└── utils/
    ├── audio.ts
    ├── storage.ts
    └── shortcuts.ts
```

### 拡張ファイル
```
既存ファイルの機能拡張:
├── BottomPanel/BottomPanel.tsx → 音声レベルメーター統合
├── LeftPanel/LeftPanel.tsx → ファイル管理機能強化
├── RightPanel/RightPanel.tsx → オーディオプレイヤー統合
└── TitleBar/TitleBar.tsx → 設定ボタン追加
```

---

## 🔧 技術実装詳細

### 1. Audio Player実装
```typescript
interface AudioPlayerState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playbackRate: number;
  loading: boolean;
}

// Web Audio API + HTMLAudioElement
const audioContext = new AudioContext();
const audioElement = new HTMLAudioElement();
```

### 2. Audio Level Meter実装
```typescript
// AnalyserNodeでリアルタイム音声レベル取得
const analyser = audioContext.createAnalyser();
analyser.fftSize = 256;
const dataArray = new Uint8Array(analyser.frequencyBinCount);

// フレームごとの音声レベル計算
const getAudioLevel = () => {
  analyser.getByteFrequencyData(dataArray);
  const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
  return (average / 255) * 100; // 0-100%
};
```

### 3. Settings Storage実装
```typescript
// Electron Store使用
interface AppSettings {
  general: {
    defaultSaveFolder: string;
    autoSave: boolean;
    language: 'ja' | 'en';
  };
  recording: {
    sampleRate: 44100 | 48000;
    bitRate: 128 | 192 | 320;
    format: 'webm' | 'mp3';
    autoGainControl: boolean;
  };
  shortcuts: Record<string, string>;
  appearance: {
    theme: 'dark' | 'light';
  };
}
```

---

## 🎯 Phase 1.5 完了条件

### 必須機能（高優先度）
- ✅ 音声ファイル再生機能（基本操作）
- ✅ ファイル一覧自動更新
- ✅ ファイル詳細情報表示
- ✅ リアルタイム音声レベルメーター

### 推奨機能（中優先度）
- ✅ キーボードショートカット（基本操作）
- ✅ 設定画面（基本項目）
- ✅ Toast通知システム

### オプション機能（低優先度）
- ファイル名変更機能
- 再生速度調整
- 高度な設定項目

---

## 🚀 Phase 2 準備

Phase 1.5完了後、以下のPhase 2機能を実装します：

### Phase 2: 音声処理機能
1. **MP3エンコード機能** - ffmpeg.wasm統合
2. **音声フォーマット変換** - WebM ↔ MP3
3. **音声品質最適化** - ノイズ除去、音量正規化
4. **バッチ処理機能** - 複数ファイル一括変換

### Phase 3: AI音声認識
1. **OpenAI Whisper統合** - ローカル音声認識
2. **リアルタイム文字起こし** - 録音中テキスト表示
3. **文字起こし編集機能** - テキスト修正・書式設定

---

## ✅ 実装の意義

**Phase 1.5により実現すること:**
1. **実用性向上** - 録音＋即座に再生確認の完全ワークフロー
2. **ユーザビリティ向上** - 直感的操作とビジュアルフィードバック
3. **Phase 2準備** - 音声処理機能の基盤となるインフラ整備
4. **完成度向上** - プロダクト品質のアプリケーション

これにより、Phase 2の本格的音声処理機能実装前に、 **実用的で完成度の高い音声録音アプリケーション** が完成します。