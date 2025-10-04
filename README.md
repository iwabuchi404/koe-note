# KoeNote

AudioWorklet + lamejsを使用した音声録音と、Whisperによる文字起こしを統合したElectronアプリケーション。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-28.x-47848F?logo=electron)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18.x-61DAFB?logo=react)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://www.typescriptlang.org/)

---

## 概要

KoeNoteは音声録音と文字起こしを行うデスクトップアプリケーションです。

### 録音機能

- AudioWorkletによるPCMデータ取得
- lamejsによるMP3エンコード (128kbps)
- チャンク分割録音（時間ベースまたはサイズベース）
- MP3エンコード失敗時のWAVフォールバック
- チャンク毎の自動ファイル保存

### 文字起こし機能

- 内蔵Whisperサーバーによるローカル処理
- 録音と同時に文字起こし実行
- 複数Whisperモデル対応（Tiny / Base / Small / Medium / Large-v2 / Large-v3 / Kotoba Whisper v2.0）
- テキストファイル自動保存

### その他

- マイク、デスクトップ音声、ミックス録音対応
- 音量メーター、録音時間、文字起こし結果のリアルタイム表示

---

## 📸 スクリーンショット

<details>
<summary>アプリケーション画面を見る</summary>

![KoeNote メイン画面](screenshot/Clipboard_08-06-2025_01.jpg)
*録音・文字起こしのメイン画面*

![KoeNote 設定画面](screenshot/Clipboard_08-06-2025_02.jpg)
*詳細設定とモデル選択*

</details>

---

## インストール

### システム要件

- **OS**: Windows 10/11、macOS、Linux
- **メモリ**: 4GB以上（Largeモデル使用時は8GB以上推奨）
- **ストレージ**: モデルファイル用に追加容量必要（最大3.1GB）

### ビルド方法

```bash
# 依存関係をインストール
npm install

# 開発モードで起動
npm run dev

# プロダクションビルド
npm run build

# 実行可能ファイルを生成
npm run dist
```

---

## 📖 使い方

### 1. 基本的な録音と文字起こし

1. **音声ソースを選択**
   - マイク入力
   - デスクトップ音声（システム音声）
   - ミックス（マイク + デスクトップ音声）

2. **文字起こしモデルを選択**
   - 初回起動時、または設定からWhisperモデルをダウンロード
   - 推奨: 日本語なら **Kotoba Whisper v2.0**、英語なら **Whisper Medium**

3. **録音開始**
   - 「録音開始」ボタンをクリック
   - リアルタイムで音量レベルと録音時間を確認
   - 文字起こしが有効な場合、自動的に文字起こしが開始

4. **録音停止**
   - 「録音停止」ボタンをクリック
   - 音声ファイルとテキストファイルが自動保存

### 2. 詳細設定

#### 録音設定
- **チャンクサイズ**: 64KB - 512KB（サイズベース）
- **チャンク時間**: 1秒 - 15秒（時間ベース）
- **フォーマット**: MP3（デフォルト）/ WAV（フォールバック）

#### 文字起こし設定
- **Whisperサーバー**: ローカルサーバー（自動起動）
- **言語**: 日本語 / 英語 / 自動検出
- **モデル**: Tiny / Base / Small / Medium / Large-v2 / Large-v3 / Kotoba Whisper

---

## 技術スタック

- **Electron 28** + **React 18** + **TypeScript 5**
- **AudioWorklet** - PCMデータ取得
- **lamejs** - MP3エンコード (128kbps)
- **Faster Whisper** - 文字起こしエンジン
- **WebSocket** - Whisperサーバーとの通信

### システム構成図

```
┌─────────────────────────────────────────────────────────────────┐
│                KoeNote AudioWorklet録音システム                 │
├─────────────────────────────────────────────────────────────────┤
│  UI Layer (React)                                              │
│  - 録音コントロール  - 設定管理  - リアルタイム表示            │
├─────────────────────────────────────────────────────────────────┤
│  State Management (Custom Hooks)                               │
│  - 録音状態管理  - チャンク管理  - エラー処理                  │
├─────────────────────────────────────────────────────────────────┤
│  Service Layer                                                 │
│  ┌──────────────────┐  ┌─────────────────┐  ┌──────────────┐   │
│  │AudioWorklet      │  │Transcription    │  │File Service  │   │
│  │RecordingService  │  │WebSocketService │  │              │   │
│  └──────────────────┘  └─────────────────┘  └──────────────┘   │
├─────────────────────────────────────────────────────────────────┤
│  Audio Processing (AudioWorklet + lamejs)                      │
│  [音声入力] → [PCMProcessor] → [lamejs] → [MP3チャンク]         │
├─────────────────────────────────────────────────────────────────┤
│  File System + WebSocket                                       │
│  [自動保存] ←→ [設定フォルダ]   [WebSocket] ←→ [Whisperサーバー] │
└─────────────────────────────────────────────────────────────────┘
```

### パフォーマンス参考値

- **録音遅延**: < 100ms
- **CPU使用率**: 通常時 5-10%、ピーク時 15-20%
- **メモリ使用量**: 追加 50-80MB
- **チャンク生成遅延**: 平均 100-200ms

※文字起こし精度はWhisperモデルに依存します。

---

## 開発

### プロジェクト構造

```
KoeNote/
├── src/
│   ├── main/              # Electronメインプロセス
│   ├── preload/           # Preloadスクリプト
│   └── renderer/          # Reactアプリケーション
│       ├── audio/         # オーディオ処理モジュール
│       ├── components/    # UIコンポーネント
│       ├── hooks/         # カスタムHooks
│       ├── services/      # アプリケーションサービス
│       └── types/         # TypeScript型定義
├── whisper-server/        # 内蔵Whisperサーバー
├── doc/                   # 設計ドキュメント
└── tests/                 # テストコード
```

### 開発コマンド

```bash
# 開発サーバー起動
npm run dev

# ビルド
npm run build

# テスト実行
npm run test:unit
npm run test:e2e

# パッケージング
npm run dist
```

---

## ライセンス

MIT License

---

## 謝辞

本プロジェクトは以下のオープンソースソフトウェアを使用しています。

- [Whisper](https://github.com/openai/whisper) - OpenAIによる音声認識モデル
- [faster-whisper](https://github.com/guillaumekln/faster-whisper) - Whisper高速実装
- [Kotoba-Whisper](https://huggingface.co/kotoba-tech/kotoba-whisper-v2.0-faster) - 日本語最適化Whisperモデル
- [lamejs](https://github.com/zhuker/lamejs) - JavaScript MP3エンコーダー
- [Electron](https://www.electronjs.org/) - クロスプラットフォームデスクトップフレームワーク
- [React](https://reactjs.org/) - UIライブラリ