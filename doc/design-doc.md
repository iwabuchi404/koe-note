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
    - **単一入力モード**: マイク、デスクトップ音声、ステレオミックスから一つを選択
    - **ミキシングモード**: マイク + デスクトップ音声の同時録音（Web Audio API使用）
    - **デスクトップ音声**: システム全体の音声録音（Windows WASAPI対応）
    - **将来実装**: アプリケーション別音声録音（外部ライブラリ使用）
    - **マルチソース・ミキシング録音**
      - マイク入力（自分の声）とデスクトップ音声（相手の声）を同時に録音する機能。
      - オンライン会議など、複数音源を一つのファイルに記録する主要ユースケースに対応。
      - ユーザーは入力デバイスを複数選択可能。
      


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

- **2.6 AI連携機能（将来実装）**
  - **テキスト選択・送信**
    - 文字起こし結果の部分選択
    - コンテキストメニュー連携: 文字起こし結果のテキスト選択後、右クリックメニューからAI機能を呼び出す。
    - 事前定義アクション: 「要約する」「誤字脱字を修正する」「アクションアイテムを抽出する」など、ワンクリックで実行できるアクションを提供。
    - 専用UIでの対話: AIからの応答を表示し、追加の質問を行える専用のサイドパネルを実装。
    - 対話履歴の保存: AIとのやり取りを対応する`*.ai.txt`ファイルに記録・保存する。

- **音声形式変換（Phase 3で実装）**
  - WebM → MP3変換機能
  - 品質設定（ビットレート選択）
  - バッチ変換機能

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
  - `navigator.mediaDevices` (Web API) - マイク入力・デスクトップ音声
  - **Windows デスクトップ音声**: `desktopCapturer` + `getDisplayMedia` (実装済み)
    - Windows WASAPI ロープバック機能使用
    - Electron v28以降で安定対応
    - 外部ライブラリ不要
    **録音バックエンドは、ユーザー環境のFFmpegの有無により動的に切り替えるハイブリッド構成を採用する。**
    - **1. FFmpegが存在しない場合 (標準モード)**:
      - `Web Audio API`: マイクとデスクトップ音声（システム全体）をミキシングするために使用。
    - **2. FFmpegが存在する場合 (高機能モード)**:
      - `@roamhq/electron-recorder`: アプリケーションごとの音声キャプチャを含む、より高度で安定した録音処理に使用。
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
  - **`navigator.mediaDevices.getDisplayMedia()` - デスクトップ音声 (実装済み)**
    - Windows: `desktopCapturer` + WASAPI ロープバック
    - `setDisplayMediaRequestHandler` での権限制御
    - `audio: 'loopback'` でシステム音声録音
- **ミキシング**: **`Web Audio API` (`AudioContext`, `MediaStreamAudioSourceNode`, `MediaStreamAudioDestinationNode`) を使用して、複数の`MediaStream`を一つのトラックに統合。**
  - **録音**: `MediaRecorder API`
  - **再生**: `HTMLAudioElement`
  - **録音**: `MediaRecorder API`
  - **再生**: `HTMLAudioElement`
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

| ライブラリ | 対応OS | 実装難易度 | 安定性 | 追加依存関係 | 推奨度 |
|------------|--------|------------|--------|------------|--------|
| **desktopCapturer + getDisplayMedia** | **Windows** | 簡単 | 高 | **なし** | ★★★★★ |
| **@roamhq/electron-recorder** | Win/Mac | 簡単 | 高 | 外部パッケージ | ★★★★☆ |
| **electron-audio-capture** | Win/Mac/Linux | 中程度 | 中 | 外部パッケージ | ★★★☆☆ |

**実装済み**: `desktopCapturer` + `getDisplayMedia` - Windows WASAPI ロープバック使用
**調査結果**: Windows環境ではElectron標準APIのみでシステム音声録音が実現可能

#### 4.4.1 Windows デスクトップ音声録音 実装詳細
**技術基盤**: 
- Electron v28以降の`desktopCapturer` API
- Windows WASAPI ロープバック機能
- `setDisplayMediaRequestHandler`による権限制御

**実装コード例**:
```typescript
// メインプロセス (main.ts)
import { desktopCapturer } from 'electron';

mainWindow.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
  desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
    callback({ 
      video: sources[0],
      audio: 'loopback'  // Windows WASAPIロープバック
    });
  });
});

// レンダラープロセス (BottomPanel.tsx)
const stream = await navigator.mediaDevices.getDisplayMedia({
  audio: true,  // システム音声を含む
  video: { width: { ideal: 1 }, height: { ideal: 1 } }
});
```

**対応状況**:
- ✅ Windows 10/11 - 完全対応
- ❓ macOS - 要調査（Screen Recording権限必要）
- ❓ Linux - 要調査（PulseAudio/ALSA依存）

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

### 【追記・更新】7.4 AI連携UI/UXデザイン
AI連携は、ユーザーの思考を中断させないシームレスな体験を提供することを目的とする。
#### 7.4.1 呼び出しフロー

1.  **テキスト選択**: ユーザーが文字起こし結果の中から、AIで処理したいテキスト範囲を選択する。
2.  **コンテキストメニュー**: 右クリックでコンテキストメニューを開く。
3.  **アクション選択**: メニュー内の「AIに質問する」から、具体的なアクション（例：「要約する」）を選択するか、「自由に質問する」を選ぶ。

#### 7.4.2 AIチャットパネル

アクションを選択すると、アプリケーション右端に専用のAIチャット用サイドパネルが出現する。

```
┌────────────────────────────────────────┐
│ [AIチャットパネル]                     │
│ ┌──────────────────────────────────┐ │
│ │ > 選択されたテキストがここに引用   │ │
│ │   表示されます。課題が3つ...     │ │
│ └──────────────────────────────────┘ │
│                                        │
│ ┌──────────────────────────────────┐ │
│ │ AI: 分析結果は以下の通りです...    │ │
│ │ 1. ...                             │ │
│ │ 2. ...                             │ │
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ ユーザー: ありがとうございます。   │ │
│ │ 対策案について詳しく教えてください │ │
│ └──────────────────────────────────┘ │
│                                        │
│ ┌──────────────────────────────────┐ │
│ │ [プロンプト入力欄...] [送信]       │ │
│ └──────────────────────────────────┘ │
└────────────────────────────────────────┘
```

- **構成要素**:
  - **引用エリア**: 選択したテキストが自動で引用され、対話のコンテキストが明確になる。
  - **会話履歴エリア**: ユーザーとAIのやり取りが時系列で表示される。AIの応答はストリーミングで表示され、待ち時間を低減する。
  - **プロンプト入力欄**: ユーザーが自由に追加の質問を入力できる。

- **インタラクション**:
  - パネルはリサイズ可能で、不要なときは閉じることができる。
  - AIとの対話履歴は、対応する音声ファイルに紐づけて自動保存される。

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

## 10. リアルタイム文字起こし詳細設計【実装完了】

### 10.1 実装済みファイルベースリアルタイム文字起こしシステム

#### 概要
**実装状況**: ✅ 完了
メモリベース処理からファイルベース処理に移行し、リアルタイム文字起こしの安定性が大幅に向上。

#### 実装アーキテクチャ

```
【録音制御】
RecordingControl → TrueDifferentialChunkGenerator
                ↓
        チャンクファイル自動生成（20秒間隔）
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
- 時間ベースの自動チャンク生成（20秒間隔）
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
truediff_chunk_001.webm
timerange_chunk_001.webm
```

##### 2. ChunkFileWatcher（チャンクファイル監視システム）
**ファイルパス**: `src/renderer/services/ChunkFileWatcher.ts`

**主要機能**:
- テンポラリフォルダの新しいチャンクファイル検出
- ファイル安定性チェック（書き込み完了判定）
- 順次処理のためのキューイング機能
- リアルタイム文字起こし連携

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
- 1回リトライ機能
- エラー分類とハンドリング（6種類のエラータイプ）
- ChunkTranscriptionQueueとの連携

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

##### 4. RealtimeTextManager（リアルタイムテキスト管理システム）
**ファイルパス**: `src/renderer/services/RealtimeTextManager.ts`

**主要機能**:
- 文字起こし結果の統合・メモリバッファ管理
- 自動ファイル書き込み（3秒間隔）
- 時間範囲ベースチャンクの重複除去処理
- メタデータ管理（進捗、エラー統計）

**出力ファイル形式**:
```
元ファイル: recording_20250714_143052.webm
出力ファイル: recording_20250714_143052.rt.txt
```

##### 5. FileBasedRealtimeProcessor（統合制御システム）
**ファイルパス**: `src/renderer/services/FileBasedRealtimeProcessor.ts`

**主要機能**:
- 上記4つのコンポーネントを統合制御
- システム全体の開始/停止/一時停止/再開
- 統計情報の統合管理
- UI通知システム

#### 実装済み設定・定数
```typescript
const CHUNK_CONFIG = {
  SIZE_SECONDS: 20,              // チャンクサイズ（20秒固定）
  FILE_CHECK_INTERVAL: 1000,     // ファイル監視間隔
  PROCESSING_TIMEOUT: 180000,    // 処理タイムアウト（3分）
  MAX_RETRY_COUNT: 1,            // 最大リトライ回数
  STABILITY_CHECK_DELAY: 500     // ファイル安定性チェック遅延
};

const FILE_CONFIG = {
  CHUNK_PREFIX: 'differential_chunk_',  // チャンクプレフィックス
  TEMP_FOLDER_PREFIX: 'temp_',         // テンポラリフォルダ
  TEXT_UPDATE_INTERVAL: 3000,          // テキスト書き込み間隔
  SEQUENCE_PADDING: 3,                 // シーケンス番号桁数（001, 002...）
  OUTPUT_EXTENSION: '.rt.txt'          // 出力ファイル拡張子
};
```

### 10.2 実装済み動作フロー

#### Phase 1: 録音開始・チャンク生成【実装完了】
```
1. 録音開始ボタン押下
   ↓
2. TrueDifferentialChunkGenerator.startRecording()
   ↓
3. 自動チャンク生成開始（20秒間隔タイマー）
   ↓
4. MediaRecorderからのデータを連続バッファに蓄積
   ↓
5. 時間間隔達成時にチャンクファイル生成
   ↓
6. differential_chunk_XXX.webmとして保存
```

#### Phase 2: ファイル監視・文字起こし処理【実装完了】
```
1. ChunkFileWatcher.startWatching(tempFolderPath)
   ↓
2. 1秒間隔でテンポラリフォルダを監視
   ↓
3. 新しいチャンクファイル検出
   ↓
4. ファイル安定性チェック（500ms遅延で2回サイズ確認）
   ↓
5. FileBasedTranscriptionEngine.addChunkFile()
   ↓
6. 順次キューイング・文字起こし処理実行（1回リトライ）
```

#### Phase 3: 結果統合・テキスト出力【実装完了】
```
1. 文字起こし完了
   ↓
2. RealtimeTextManager.addTranscriptionResult()
   ↓
3. 時間範囲ベースフィルタリング（重複除去）
   ↓
4. メモリバッファ更新・時間順ソート
   ↓
5. 3秒間隔での自動ファイル書き込み
   ↓
6. .rt.txt形式でリアルタイム結果保存
```

#### Phase 4: UI統合・状態管理【実装完了】
```
1. FileBasedRealtimeProcessor統合制御
   ↓
2. 統計情報リアルタイム更新（5秒間隔）
   ↓
3. CustomEventベースUI通知
   ↓
4. エラーハンドリング・リソース監視
   ↓
5. 自動スクロール・進捗表示
```

### 10.3 実装完了済み機能と品質保証

#### エラーハンドリング強化【実装完了】
- **エラー分類**: 6種類のエラータイプを自動分類
- **重要度判定**: low/medium/high/critical の4段階
- **指数バックオフ**: エラータイプ別リトライ遅延
- **推奨アクション**: エラー別の具体的対策提示

#### ファイルシステム信頼性【実装完了】
- **安定性チェック**: 書き込み完了をサイズ比較で判定
- **最小サイズ制限**: 1KB未満のファイルは無効として処理
- **権限チェック**: ディスク容量・アクセス権限の確認
- **パス正規化**: Windows環境でのファイルパス処理

#### パフォーマンス最適化【実装完了】
- **メモリバッファ管理**: 最大1000セグメントで制限
- **時間範囲フィルタリング**: 重複セグメントの効率的除去
- **リソース監視**: CPU/メモリ使用量をlow/medium/highで分類
- **統計データ**: 処理時間、成功率、エラー率の追跡

### 10.4 今後の改善予定項目

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

### 10.5 実装品質の向上

- **型安全性**: TypeScriptインターフェース完全定義
- **ログ充実**: 詳細デバッグ情報とプロセス追跡
- **設定分離**: コンフィグファイルでの一元管理
- **テスト容易性**: モジュラー設計と依存性注入

---

## 実装更新サマリー

### 主要変更点
1. **メモリベース → ファイルベース**: 実装で安定性を重視した設計に変更
2. **チャンク間隔**: 5秒 → 20秒に最適化
3. **処理方式**: 並列処理 → 順次処理でシンプル化  
4. **リトライ回数**: 3回 → 1回で効率化
5. **新システム追加**: 5つの主要コンポーネントによる統合アーキテクチャ

### 実装完了した新機能
- **TrueDifferentialChunkGenerator**: 高品質チャンク生成システム
- **ChunkFileWatcher**: ファイル監視・安定性チェックシステム
- **FileBasedTranscriptionEngine**: 順次処理・エラー分類システム
- **RealtimeTextManager**: テキスト統合・自動保存システム
- **FileBasedRealtimeProcessor**: 統合制御・監視システム

### 品質・性能向上
- **エラーハンドリング**: 6種類×4段階の詳細エラー管理
- **ファイルシステム信頼性**: 安定性チェック・権限確認
- **UI通知システム**: CustomEventベースのリアルタイム状態更新
- **パフォーマンス最適化**: メモリ管理・リソース監視

この実装により、元の設計で想定していた「ファイルベースリアルタイム文字起こし」が実現され、更に品質・性能・保守性の面で大幅な改善が図られています。
