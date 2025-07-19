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

## 5. アーキテクチャ設計

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

## 10. リアルタイム文字起こし詳細設計

### 10.1 ファイルベースリアルタイム文字起こし実装プラン

#### 概要
現在のメモリベース処理から、ファイルベース処理に変更してリアルタイム文字起こしの安定性を向上させる。

#### 実装方針
- **段階的実装**: 既存システムを残しながら新システムを構築
- **シンプル設計**: 並列処理なし、単一ファイル順次処理
- **エラー耐性**: 1回リトライ→失敗時スキップ記録

#### 実装ステップ

**Phase 1: 基盤整備**
- 目標: チャンクファイル保存とファイル監視機能
- Step 1.1: 録音制御の拡張
  ```typescript
  // 対象ファイル: src/renderer/components/RecordingControl/*
  // 新機能:
  - MediaRecorder timeslice設定（20秒間隔）
  - チャンクファイル自動保存
  - テンポラリフォルダ管理
  ```
- Step 1.2: ファイル監視システム
  ```typescript
  // 新ファイル: src/renderer/services/ChunkFileWatcher.ts
  // 機能:
  - テンポラリフォルダの新ファイル検出
  - ファイル処理順序保証
  - 処理済みファイル管理
  ```

**Phase 2: 文字起こし処理**
- 目標: 順次ファイル処理とエラーハンドリング
- Step 2.1: ファイルベース文字起こしエンジン
  ```typescript
  // 新ファイル: src/renderer/services/FileBasedTranscriptionEngine.ts
  // 機能:
  - 単一ファイル順次処理
  - 1回リトライ機能
  - スキップ記録
  ```
- Step 2.2: 結果統合システム
  ```typescript
  // 新ファイル: src/renderer/services/RealtimeTextManager.ts
  // 機能:
  - メモリバッファ管理
  - ファイル書き込み
  - UI表示用データ提供
  ```

**Phase 3: UI統合**
- 目標: 新システムとUIの連携
- Step 3.1: 表示制御の更新
- Step 3.2: 録音・文字起こし統合ボタン

**Phase 4: エラーハンドリング・最適化**
- 目標: 安定性とパフォーマンス向上
- Step 4.1: 包括的エラーハンドリング
- Step 4.2: パフォーマンス最適化

**Phase 5: 統合・テスト**
- 目標: 新旧システムの統合とテスト
- Step 5.1: システム統合
- Step 5.2: 総合テスト

#### 設定・定数
```typescript
const CHUNK_CONFIG = {
  SIZE_SECONDS: 20,           // チャンクサイズ
  FILE_CHECK_INTERVAL: 1000,  // ファイル監視間隔（ms）
  PROCESSING_TIMEOUT: 180000, // 処理タイムアウト（3分）
  MAX_RETRY_COUNT: 1,         // 最大リトライ回数
};

const FILE_CONFIG = {
  CHUNK_PREFIX: 'chunk_',
  TEMP_FOLDER_PREFIX: 'temp_',
  TEXT_UPDATE_INTERVAL: 3000,  // テキスト書き込み間隔
  SEQUENCE_PADDING: 5,         // シーケンス番号桁数
};

const UI_CONFIG = {
  DISPLAY_UPDATE_DEBOUNCE: 500, // 表示更新遅延
  AUTO_SCROLL_THRESHOLD: 100,   // 自動スクロール閾値
  STATUS_UPDATE_INTERVAL: 1000, // 進行状況更新間隔
};
```

### 10.2 リアルタイム文字起こし動作フロー

#### 主要コンポーネント
1. **RealTimeTranscriptionProcessor**: リアルタイム文字起こしの中央制御
2. **ChunkTranscriptionManager**: チャンク処理の統合管理
3. **SpeechRecognition コンポーネント**: 文字起こし結果の表示

#### 動作フロー詳細

**Phase 1: 初期化・開始**
```
1. ユーザーが録音中ファイルに対して文字起こし開始
   ↓
2. ChunkTranscriptionManager.startChunkTranscription() 呼び出し
   ↓
3. 録音中WebMファイル検出
   ↓
4. RealTimeTranscriptionProcessor.startRealTimeTranscription() 開始
   ↓
5. 初期化処理:
   - chunkSequence = 0
   - lastProcessedOffset = 0
   - processedChunks.clear()
   - 処理間隔 5秒のタイマー開始
```

**Phase 2: 定期監視・データ検出**
```
タイマー実行（5秒間隔）:
1. checkAndProcessNewData() 実行
   ↓
2. ファイルサイズチェック
   - 現在のファイルサイズ取得
   - 前回処理位置と比較
   ↓
3. 新しいデータ検出判定
   - 推定時間計算: (新しいデータサイズ) / 16000 bytes/秒
   - 最小処理時間（20秒）との比較
   ↓
4. 処理条件満たした場合 → processNewChunk() 呼び出し
```

**Phase 3: チャンク処理**
```
processNewChunk() 実行:
1. チャンクID生成: realtime_chunk_{chunkSequence}
   ↓
2. 時間範囲計算:
   - startTime = chunkSequence * chunkSize
   - endTime = startTime + chunkSize
   ↓
3. 重複処理チェック:
   - 既に処理済みか確認
   - 処理中フラグ確認
   ↓
4. 処理中フラグ設定:
   - processingChunkId = chunkId
   - processedChunks.set(processing_{chunkId})
   ↓
5. transcribeRecordingChunk() 呼び出し
```

**Phase 4: WAVファイル作成・文字起こし**
```
transcribeRecordingChunk() 実行:
1. リトライループ開始（最大3回）
   ↓
2. createTempWavFromRecording() 呼び出し:
   - WebMファイルからArrayBuffer取得
   - 時間範囲指定でデータ抽出
   - WAVヘッダー追加
   - 一時ファイル保存
   ↓
3. サーバー状態確認:
   - ensureServerRunning()
   ↓
4. 文字起こしAPI呼び出し:
   - window.electronAPI.speechTranscribe()
   ↓
5. 結果処理:
   - ChunkResult形式に変換
   - 成功時: 次チャンクへ進行
   - 失敗時: リトライまたはエラー記録
```

**Phase 5: 結果統合・表示**
```
文字起こし完了後:
1. processedChunks.set(chunkId, result)
   ↓
2. コールバック実行:
   - onChunkCompletedCallbacks.forEach()
   ↓
3. イベント発火:
   - chunkTranscriptionCompleted
   ↓
4. SpeechRecognition コンポーネント:
   - transcriptionResult 更新
   - UI再レンダリング
   ↓
5. 次チャンク準備:
   - chunkSequence++
   - lastProcessedOffset 更新
```

#### 現在の設定値
- **チャンクサイズ**: 20秒
- **処理間隔**: 5秒
- **最小処理時間**: 20秒
- **最大リトライ回数**: 2回
- **処理中フラグタイムアウト**: 3分
- **推定バイト/秒**: 16,000 bytes

#### 問題発生パターンと対策
1. **処理中フラグスタック**: 3分タイムアウトで強制削除
2. **サーバー接続切断**: エラー検出時の自動再起動
3. **チャンク時間範囲エラー**: 固定サイズチャンク使用
4. **データ不足エラー**: 初回チャンクの最小時間緩和

#### 改善案：新しいファイルベースアプローチ

**録音制御**
1. 録音開始が押される
2. 録音開始
3. 保存用に内容が空のファイル作成
4. テンポラリ用にファイル名と同じフォルダ作成
5. チャンクサイズがたまったらチャンクごとにファイル保存
6. 録音停止が押される
7. トータル録音ファイルを空のファイルに上書き

**文字起こし制御**
1. リアルタイム文字起こし開始
2. テンポラリフォルダに新しいファイルがあるか定期的にチェック
3. 新しいファイルがあったら文字起こし開始
4. １ファイルの文字起こしが終わるテキストをテキストファイルに書きだし、なければ作成
5. 次のファイルを文字起こし開始、次のファイルがなければテンポラリフォルダを定期的にチェック
6. 3に戻る

**UI制御**
- 文字起こし結果エリア: 書き出されたテキストファイルを定期監視して表示更新
- 文字起こしエリア: チャンク書き出し・文字起こし状況を監視して表示
- 録音コントロール: 録音・文字起こし統合ボタンを追加

### 10.3 次ステップへの準備

#### 技術的準備
- 録音データのリアルタイム送信準備
- WebSocket通信の基盤設計
- チャンク分割処理の考慮

#### スケジュール
| Phase | 期間 | 主要成果物 |
|-------|------|------------|
| Phase 1 | 3日 | ファイル保存・監視 |
| Phase 2 | 4日 | 文字起こしエンジン |
| Phase 3 | 2日 | UI統合 |
| Phase 4 | 2日 | エラーハンドリング |
| Phase 5 | 2日 | 統合・テスト |
| **合計** | **13日** | **完全実装** |
