# 音声録音・再生アプリ 設計仕様書

## 1. プロジェクト概要

### 1.1 目的
- TypeScript + Electron + Reactで音声録音・再生・文字起こし機能を実装
- 通話記録 + 半リアルタイム文字起こし + AI連携を主要ユースケースとする
- 簡便な文字起こしツールとしても利用可能

### 1.2 主要ユースケース
- **通話での会話記録**: 会議、打ち合わせの音声録音
- **半リアルタイム文字起こし**: 録音と同時に文字起こし実行
- **AI連携**: 文字起こし結果の一部をAIチャットに送信してアドバイス取得
- **簡便な文字起こしツール**: 一般的な音声ファイルの文字起こし

### 1.3 対象ユーザー
- 個人使用（開発者自身）
- 会議録音、通話記録、音声メモなどの用途
## 2. 機能要件

### 2.1 必須機能
- **録音機能**
  - **音声入力デバイス選択**
    - マイク入力（複数デバイス対応）
    - デスクトップ音声キャプチャ
    - アプリケーション音声キャプチャ

- **録音制御**
  - 録音開始/停止/一時停止
  - リアルタイム録音時間表示
  - 音声レベルメーター表示

- **入力デバイス管理**
  - 利用可能デバイス一覧表示
  - デバイス切り替え機能
  
- **ファイル管理機能**
  - ユーザー指定フォルダへのファイル保存
  - ファイル名の自動生成（タイムスタンプベース）
  - 保存済みファイル一覧表示（VSCodeスタイルツリー）
  - ファイル削除機能

- **再生機能**
  - 録音ファイルの再生/停止/一時停止
  - 再生位置のシーク機能
  - 再生時間・総時間表示

- **文字起こし機能（Phase 2で実装）**
  - **音声認識**
    - faster-whisper + Kotoba-Whisperモデル使用
    - モデル選択機能（small/medium/large-v2）
    - 半リアルタイム処理（チャンク分割）
  - **結果表示**
    - 専用テキストエリアでの表示
    - タイムスタンプ付き文字起こし
    - 話者識別（将来実装）

- **音声形式変換（Phase 2で実装）**
  - WebM → MP3変換機能
  - 品質設定（ビットレート選択）
  - バッチ変換機能

- **2.6 AI連携機能（将来実装）**
  - **テキスト選択・送信**
    - 文字起こし結果の部分選択
    - 選択テキストのAIチャットへの送信
    - AI応答の記録・表示


### 2.2 オプション機能（後実装）
- 音声波形の可視化
- MP3形式での保存
- ファイルメタデータ表示（作成日時、ファイルサイズ等）

## 3. 技術仕様

## 3. 技術仕様

### 3.1 技術スタック
- **フレームワーク**: Electron 28.x
- **UI**: React 18.x + TypeScript
- **スタイリング**: CSS Modules + VSCode テーマ
- **ビルドツール**: Webpack + TypeScript

### 3.2 音声処理ライブラリ
- **音声入力**: 
  - `navigator.mediaDevices` (Web API)
  - `@roamhq/electron-recorder` - デスクトップ音声
  - `electron-audio-capture` - システム音声
- **録音**: `MediaRecorder API`
- **再生**: `HTMLAudioElement`
- **MP3変換**: 
  - **Option 1**: `ffmpeg.wasm` (推奨) - 高品質、多機能
  - **Option 2**: `lamejs` - 軽量、シンプル
  - **Option 3**: `node-lame` - Node.js native

### 3.3 UI・ユーティリティライブラリ
- **UI フレームワーク**: 
  - **Option 1**: 素のCSS + CSS Modules (推奨) - 軽量、VSCodeテーマ再現しやすい
- **状態管理**: React Context + useReducer (標準)
- **ドラッグ&ドロップ**: `react-dnd` (ファイルドロップ用)
- **キーボードショートカット**: `react-hotkeys-hook`
- **日付操作**: `dayjs`

### 3.4 AI・音声認識関連ライブラリ
- **音声認識バックエンド**:
  - `faster-whisper` (Python) - メイン音声認識
  - `websockets` (Python) - リアルタイム通信
  - `fastapi` + `uvicorn` (Python) - WebSocketサーバー
- **フロントエンド通信**:
  - `ws` (TypeScript) - WebSocket クライアント
  - `axios` (TypeScript) - HTTP通信
- **AI API統合** (将来的):
  - `openai` - OpenAI API
  - `@anthropic-ai/sdk` - Claude API
  - `@google/generative-ai` - Gemini API
- **音声処理支援**:
  - `audiobuffer-to-wav` - 音声データ変換
  - `lamejs` - MP3エンコード（ffmpeg.wasmの代替）

### 3.4 音声処理仕様
- **録音形式**: WebM (Opus codec) → 後にMP3変換可能
- **音声入力**:
  - `navigator.mediaDevices.getUserMedia()` - マイク入力
  - `navigator.mediaDevices.getDisplayMedia()` - デスクトップ音声
  - `@roamhq/electron-recorder` - アプリケーション音声キャプチャ
- **録音**: `MediaRecorder API`
- **再生**: `HTMLAudioElement`
- **MP3変換**: `ffmpeg.wasm` または `lamejs`

### 3.3 ファイル仕様
- **保存形式**: WebM
- **ファイル名**: `recording_YYYYMMDD_HHMMSS.webm`
- **保存場所**: ユーザー指定フォルダ
- **設定保存**: Electronの`app.getPath('userData')`にJSON形式

## 4. ライブラリ選定・比較

## 4. ライブラリ選定・比較


### 4.2 状態管理

React Context + useReducer

### 4.3 MP3変換ライブラリ比較

| ライブラリ | サイズ | 品質 | 速度 | 依存関係 | 推奨度 |
|------------|--------|------|------|----------|--------|
| **ffmpeg.wasm** | 大(25MB) | 最高 | 高速 | なし | ★★★★★ |
| **lamejs** | 小(100KB) | 良好 | 中速 | なし | ★★★★☆ |
| **node-lame** | 中(5MB) | 高品質 | 高速 | Native依存 | ★★★☆☆ |

**推奨**: `ffmpeg.wasm` - 機能豊富で将来の拡張性が高い

### 4.4 デスクトップ音声録音ライブラリ比較

| ライブラリ | 対応OS | 実装難易度 | 安定性 | 推奨度 |
|------------|--------|------------|--------|--------|
| **@roamhq/electron-recorder** | Win/Mac | 簡単 | 高 | ★★★★★ |
| **electron-audio-capture** | Win/Mac/Linux | 中程度 | 中 | ★★★☆☆ |
| **desktop-capturer** | Win/Mac/Linux | 難しい | 高 | ★★☆☆☆ |

**推奨**: `@roamhq/electron-recorder` - 最も簡単で安定

### 4.5 音声可視化ライブラリ比較

| ライブラリ | 機能 | パフォーマンス | 学習コスト | 推奨度 |
|------------|------|----------------|------------|--------|
| **wavesurfer.js** | 波形表示 | 高 | 低 | ★★★★★ |
| **audiomotion-analyzer** | スペクトラム | 高 | 中 | ★★★★☆ |
| **Web Audio API** | カスタム | 最高 | 高 | ★★★☆☆ |

**推奨**: `wavesurfer.js` - バランスが良く実装が簡単

### 4.6 AI・通信ライブラリ比較

axios

### 5.1 プロセス構成
```
┌─────────────────┐    IPC    ┌─────────────────┐
│  Main Process   │ ←──────→  │ Renderer Process│
│                 │           │                 │
│ - ウィンドウ管理 │           │ - React UI      │
│ - ファイル操作   │           │ - 音声処理      │
│ - 設定管理      │           │ - 状態管理      │
│ - ffmpeg実行    │           │ - デバイス管理   │
└─────────────────┘           └─────────────────┘
```

### 5.2 コンポーネント設計（VSCode スタイル）
```
App
├── TitleBar
│   └── WindowControls, AppTitle
├── MainLayout
│   ├── LeftPanel (FileExplorer)
│   │   ├── FolderSelector
│   │   ├── FileTree
│   │   └── FileItem (with context menu)
│   └── RightPanel
│       ├── TopPanel (TextEditor)
│       │   ├── TranscriptionDisplay
│       │   └── TextControls
│       └── BottomPanel (ControlPanel)
│           ├── InputDeviceSelector
│           ├── RecordingControls
│           ├── PlaybackControls
│           ├── TranscribeButton
│           ├── ConvertToMP3Button
│           └── AudioLevelMeter
```

### 5.3 状態管理
React Context + useReducer パターンを使用

```typescript
interface AppState {
  // 録音関連
  isRecording: boolean;
  isPaused: boolean;
  recordingTime: number;
  audioLevel: number;
  selectedInputDevice: MediaDeviceInfo | null;
  availableInputDevices: MediaDeviceInfo[];
  
  // ファイル管理
  saveFolder: string;
  fileList: AudioFile[];
  selectedFile: AudioFile | null;
  
  // 再生関連
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  
  // 文字起こし関連
  transcriptionText: string;
  isTranscribing: boolean;
  transcriptionProgress: number;
  
  // 変換関連
  isConverting: boolean;
  conversionProgress: number;
}
```

## 5. アーキテクチャ設計
```
App
├── TitleBar
│   └── WindowControls, AppTitle
├── MainLayout
│   ├── LeftPanel (FileExplorer)
│   │   ├── FolderSelector
│   │   ├── FileTree
│   │   └── FileItem (with context menu)
│   └── RightPanel
│       ├── TopPanel (TextEditor)
│       │   ├── TranscriptionDisplay
│       │   └── TextControls
│       └── BottomPanel (ControlPanel)
│           ├── InputDeviceSelector
│           ├── RecordingControls
│           ├── PlaybackControls
│           ├── TranscribeButton
│           ├── ConvertToMP3Button
│           └── AudioLevelMeter
```

### 4.3 状態管理
React Context + useReducer パターンを使用

```typescript
interface AppState {
  // 録音関連
  isRecording: boolean;
  isPaused: boolean;
  recordingTime: number;
  audioLevel: number;
  selectedInputDevice: MediaDeviceInfo | null;
  availableInputDevices: MediaDeviceInfo[];
  
  // ファイル管理
  saveFolder: string;
  fileList: AudioFile[];
  selectedFile: AudioFile | null;
  
  // 再生関連
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  
  // 文字起こし関連
  transcriptionText: string;
  isTranscribing: boolean;
  transcriptionProgress: number;
  
  // 変換関連
  isConverting: boolean;
  conversionProgress: number;
}
```

## 6. データ構造

### 6.1 オーディオファイル型定義
```typescript
interface AudioFile {
  id: string;
  filename: string;
  filepath: string;
  format: 'webm' | 'mp3';
  duration: number;
  size: number;
  createdAt: Date;
  transcription?: string;
  inputDevice?: string;
}
```

### 6.2 設定データ
```typescript
interface AppSettings {
  saveFolder: string;
  audioQuality: 'low' | 'medium' | 'high';
  defaultVolume: number;
  defaultInputDevice: string;
  mp3Bitrate: 128 | 192 | 320;
  autoTranscribe: boolean;
}
```

### 6.3 入力デバイス情報
```typescript
interface InputDeviceInfo extends MediaDeviceInfo {
  type: 'microphone' | 'desktop' | 'application';
  isDefault: boolean;
}
```

## 7. API設計（IPC通信）

### 7.1 Main → Renderer
```typescript
interface ElectronAPI {
  // ファイル操作
  selectFolder: () => Promise<string | null>;
  saveAudioFile: (buffer: ArrayBuffer, filename: string, format: 'webm' | 'mp3') => Promise<string>;
  getFileList: (folderPath: string) => Promise<AudioFile[]>;
  deleteFile: (filepath: string) => Promise<boolean>;
  
  // 音声変換
  convertToMP3: (webmPath: string, bitrate: number) => Promise<string>;
  
  // デバイス管理
  getInputDevices: () => Promise<InputDeviceInfo[]>;
  enableDesktopCapture: () => Promise<MediaStream>;
  
  // 設定
  loadSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<void>;
}
```

## 7. UI/UX設計

### 7.1 レイアウト（VSCode スタイル）
- **横幅**: 1200px
- **縦幅**: 800px
- **レスポンシブ**: なし（デスクトップ専用）

```
┌─────────────────────────────────────────────────────────────┐
│                    タイトルバー                              │
├───────────────┬─────────────────────────────────────────────┤
│               │                                             │
│               │          テキストエリア                      │
│  ファイル      │        （文字起こし結果）                    │
│  エクスプローラー│                                             │
│               │                                             │
│               ├─────────────────────────────────────────────┤
│               │                                             │
│               │    録音・再生コントロールパネル               │
│               │  [●録音] [▶再生] [文字起こし] [レベルメーター] │
│               │                                             │
└───────────────┴─────────────────────────────────────────────┘
```

### 7.2 カラーパレット（VSCode Dark テーマ）
- **背景**: #1E1E1E (エディタ背景)
- **サイドバー**: #252526 (サイドバー背景)
- **アクティブ**: #094771 (選択アイテム)
- **ボーダー**: #3C3C3C (境界線)
- **テキスト**: #CCCCCC (通常テキスト)
- **アクセント**: #007ACC (VSCode Blue)
- **成功**: #4FC1FF (録音中)
- **エラー**: #F44747 (エラー状態)

### 7.3 パネル構成
1. **左パネル**: ファイルエクスプローラー（幅: 300px）
   - フォルダ選択ボタン
   - 録音ファイル一覧（ツリー形式）
   - ファイル右クリックメニュー

2. **右上パネル**: テキストエディター（高さ: 60%）
   - 文字起こし結果表示
   - スクロール可能
   - テキスト選択・コピー可能
   - モノスペースフォント

3. **右下パネル**: コントロールパネル（高さ: 40%）
   - 録音ボタン、再生ボタン
   - 文字起こしボタン
   - 音声レベルメーター
   - プログレスバー


### 8 文字起こしファイル形式

#### ファイル命名規則
```
音声ファイル: recording_20250714_143052.wav
文字起こし: recording_20250714_143052.trans.txt
AI対話記録: recording_20250714_143052.ai-chat.txt
```

#### 文字起こしファイル内容（.trans.txt）
```
---
audio_file: recording_20250714_143052.wav
model: kotoba-whisper-v1.0-medium
transcribed_at: 2025-07-14T14:31:25Z
speakers: 田中, 佐藤
duration: 1800
---

[00:15] 田中: こんにちは、今日の会議を始めます
[00:32] 佐藤: プロジェクトの進捗について話しましょう
[01:05] 田中: 課題が3つあります...
[02:15] 佐藤: スケジュールについて確認したいことがあります
```

#### AI対話記録ファイル（.ai-chat.txt）
```
---
source_file: recording_20250714_143052.trans.txt
created_at: 2025-07-14T14:45:30Z
---

[14:45:30] 選択テキスト: "課題が3つあります..."
質問: この課題について詳しく分析してください
AI応答: 分析結果...

[14:50:15] 選択テキスト: "スケジュールが遅れています"
質問: 対策を教えて
AI応答: 対策案...
```


## 8. エラーハンドリング

### 8.1 想定エラー
- マイク権限が拒否された場合
- 保存フォルダへの書き込み権限がない場合
- ディスク容量不足
- 音声デバイスが見つからない場合

### 8.2 エラー表示
- トースト通知形式
- エラーモーダル（重要なエラー）

## 9. 開発段階

### 9.1 Phase 1: 基本セットアップ + 録音機能
- Electronプロジェクト作成
- React環境構築
- VSCodeスタイルUI作成
- マイク録音機能実装
- デスクトップ音声録音機能実装
- 入力デバイス選択機能

### 9.2 Phase 1.5: MP3変換機能
- ffmpeg.wasm統合
- WebM → MP3変換機能
- 変換品質設定
- バッチ変換機能

### 9.3 Phase 2: 再生・ファイル管理
- HTMLAudioElement統合
- 再生コントロール
- プログレスバー
- ファイル一覧表示
- ファイル削除機能

### 9.4 Phase 3: 音声認識統合
- Python WebSocketサーバー
- faster-whisper (Kotoba) 統合
- リアルタイム文字起こし

## 10. 次ステップへの準備

### 10.1 音声認識統合準備
- 録音データのリアルタイム送信準備
- WebSocket通信の基盤設計
- チャンク分割処理の考慮
