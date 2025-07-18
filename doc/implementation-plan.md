# 音声録音・再生アプリ 実装プラン

## プロジェクト概要
TypeScript + Electron + Reactを使用した音声録音・再生アプリケーションの段階的実装計画

## Phase 1: 基本セットアップ（高優先度）

### 1. プロジェクト初期化
- [x] 実装プランの作成・保存
- [x] Electron 28.x + React 18.x + TypeScript環境セットアップ
- [x] Webpack設定とビルドパイプライン構築
- [x] 基本的なプロジェクト構造の作成

### 2. VSCodeスタイルUI構築
- [x] TitleBar、LeftPanel、RightPanel（上下分割）レイアウト作成
- [x] CSS Modules + VSCode Darkテーマカラー適用
- [x] レスポンシブレイアウト（1200×800px）

### 3. コア機能実装
- [x] React Context + useReducer状態管理システム
- [x] IPC通信基盤（Main ↔ Renderer）
- [x] 音声入力デバイス選択・一覧取得機能

### 4. 録音機能基本実装
- [x] マイク録音（MediaRecorder API）
- [x] WebM形式でのファイル保存
- [x] 録音時間表示とコントロール（開始/停止）

## Phase 1.5: 拡張録音機能（中優先度）

### 5. 高度な録音機能
- [x] デスクトップ音声録音（@roamhq/electron-recorder）
- [ ] 音声レベルメーター表示
- [ ] 録音一時停止・再開機能

### 6. ファイル管理システム
- [x] ファイルエクスプローラー（VSCodeツリー形式）
- [x] 自動ファイル名生成（タイムスタンプベース）
- [x] ファイル削除・メタデータ表示機能

## Phase 2: AI音声認識機能（最高優先度）

### 7. 音声再生機能 ✅ 完了
- [x] HTMLAudioElement統合
- [x] 再生コントロール（再生/停止/シーク）
- [x] 進捗バー・時間表示

### 8. Whisper音声認識統合
- [ ] OpenAI Whisper API統合
- [ ] WebMファイル直接アップロード
- [ ] 文字起こし結果表示・編集
- [ ] 音声とテキストの時間軸同期

### 9. リアルタイム音声認識
- [ ] 録音中のリアルタイム文字起こし
- [ ] ストリーミング音声処理
- [ ] チャンク分割・結合処理

### 10. 文字起こし結果管理
- [ ] 文字起こし結果の保存・読み込み
- [ ] テキスト編集機能
- [ ] エクスポート機能（TXT/MD/JSON）
- [ ] 品質設定・バッチ変換

## Phase 3: 音声フォーマット変換（後回し実装）

### 11. MP3変換機能
- [ ] ffmpeg.wasm統合  
- [ ] WebM → MP3変換機能
- [ ] 音声品質設定・バッチ変換

## Phase 4: 高度AI機能（将来実装）

### 12. 高度音声認識機能
- [ ] カスタムWhisperモデル対応
- [ ] 話者分離機能
- [ ] 音声要約・キーワード抽出
- [ ] faster-whisper (Kotoba) 統合（ローカル処理）

## 技術スタック

### フロントエンド
- **フレームワーク**: Electron 28.x
- **UI**: React 18.x + TypeScript
- **スタイリング**: CSS Modules + VSCode テーマ
- **ビルドツール**: Webpack + TypeScript

### 音声処理
- **音声入力**: navigator.mediaDevices (Web API)
- **デスクトップ音声**: @roamhq/electron-recorder
- **録音**: MediaRecorder API
- **再生**: HTMLAudioElement
- **MP3変換**: ffmpeg.wasm

### 状態管理・通信
- **状態管理**: React Context + useReducer
- **キーボードショートカット**: react-hotkeys-hook
- **日付操作**: dayjs

## データ構造

### AppState
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

### AudioFile
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

## UI/UXデザイン

### レイアウト（VSCode スタイル）
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

### カラーパレット（VSCode Dark テーマ）
- **背景**: #1E1E1E (エディタ背景)
- **サイドバー**: #252526 (サイドバー背景)
- **アクティブ**: #094771 (選択アイテム)
- **ボーダー**: #3C3C3C (境界線)
- **テキスト**: #CCCCCC (通常テキスト)
- **アクセント**: #007ACC (VSCode Blue)
- **成功**: #4FC1FF (録音中)
- **エラー**: #F44747 (エラー状態)

## 現在の進捗

### Phase 1 - 実行中
- [x] 実装プランドキュメント作成
- [x] Electronプロジェクト初期セットアップ
- [x] React環境構築（webpack設定、TypeScript設定）
- [x] プロジェクト構造作成
- [x] メインプロセス実装（main.ts）
- [x] プリロードスクリプト実装（preload.ts）
- [x] HTML テンプレート作成
- [x] Reactエントリーポイント作成
- [ ] VSCodeスタイルUI作成 ← **次のタスク**
- [ ] 基本的な状態管理実装

## 作成済みファイル
```
D:\work\voise-encoder\
├── design-doc.md
├── implementation-plan.md
├── package.json
├── tsconfig.json
├── webpack.main.config.js
├── webpack.renderer.config.js
└── src\
    ├── main\
    │   └── main.ts
    ├── preload\
    │   └── preload.ts
    ├── renderer\
    │   ├── index.html
    │   ├── index.tsx
    │   └── styles\
    └── shared\
```

## 次のステップ
1. **npm install**で依存関係をインストール
2. **App.tsx**の作成（Reactメインコンポーネント）
3. **global.css**の作成（VSCodeテーマ適用）
4. **VSCodeスタイルUIレイアウト**の構築：
   - TitleBar コンポーネント
   - LeftPanel（ファイルエクスプローラー）
   - RightPanel（上下分割：テキストエリア＋コントロール）
5. **状態管理**（React Context + useReducer）の実装

## 技術的な実装詳細

### IPC通信設計
- `dialog:selectFolder` - フォルダ選択ダイアログ
- `file:save` - 音声ファイル保存
- `file:getList` - ファイル一覧取得
- `file:delete` - ファイル削除
- `settings:load/save` - 設定の読み込み・保存

### 型定義完了
- `ElectronAPI` - メイン⇔レンダラー通信インターフェース
- `AudioFile` - 音声ファイル情報
- `AppSettings` - アプリケーション設定

### プロジェクト設定完了
- TypeScript設定（絶対パス、エイリアス設定）
- Webpack設定（メイン・レンダラー両プロセス）
- ESLint設定は未実装