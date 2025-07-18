# Phase 2 実装プラン - ローカルAI音声認識機能

## 概要
Phase 1.5で完成した音声録音・再生基盤に、**faster-whisper + Kotoba-Whisper large-v2**を使用したローカルAI音声認識機能を統合します。WebMファイルを直接ローカル処理することで、プライバシーを保護しつつ高精度な日本語音声認識を実現します。

## 実装スケジュール
**期間**: 4-5日  
**優先度**: 最高（プライバシー保護 + 高精度日本語認識）

## 実行環境
**ターゲットハードウェア**: Ryzen 7 7840HS  
**メモリ要件**: 16-32GB DDR5  
**処理方式**: CPUベースローカル処理（オフライン対応）

---

## 🎯 Phase 2 実装目標

### 1. **faster-whisper + Kotoba-Whisper統合** (最高優先度)
**目的**: WebMファイルをローカルで高精度日本語音声認識

**技術スタック**:
```
faster-whisper + Kotoba-Whisper large-v2
- モデル: kotoba-tech/kotoba-whisper-v2.0-faster
- 処理速度: OpenAI Whisper large-v3の6.3倍高速
- 精度: 日本語特化で高精度（ReazonSpeechデータセット訓練）
- メモリ使用量: 約3-4GB（int8量子化時）
- プライバシー: 完全ローカル処理、データ送信なし
```

**Ryzen 7 7840HS最適化**:
- **8コア16スレッド活用**: マルチスレッド並列処理
- **DDR5メモリ**: 高速メモリアクセス最適化
- **チャンク処理**: メモリ効率的な分割処理
- **quantization**: int8量子化でメモリ使用量削減

**実装内容**:
- Python faster-whisperサーバープロセス構築
- Electron ↔ Python間通信（IPC/WebSocket）
- WebMファイル直接処理
- リアルタイム進捗表示
- 日本語・英語・多言語対応

---

### 2. **リアルタイム音声認識** (高優先度)
**目的**: 録音中のリアルタイム文字起こし（Kotoba-Whisperでの最適化）

**Kotoba-Whisper chunkedアルゴリズム活用**:
- **9倍高速化**: OpenAIシーケンシャル実装比
- **chunked long-form**: 長時間音声の効率的処理
- **オーバーラップ処理**: 30秒チャンクで5秒オーバーラップ
- **メモリ効率**: 固定メモリ使用量での連続処理

**実装内容**:
- 録音中30秒チャンク分割処理
- faster-whisperでのストリーミング処理
- リアルタイムテキスト更新・表示
- 音声と文字の時間同期
- Ryzen 7840HS最適化（8スレッド並列）

**パフォーマンス目標**:
```
Ryzen 7 7840HS期待性能:
- 30秒音声チャンク: 5-8秒で処理完了
- リアルタイム率: 約4-6倍速（faster-whisper効果）
- メモリ使用量: 3-4GB（int8量子化）
- CPU使用率: 50-70%（8コア活用時）
```

---

### 3. **文字起こし結果管理** (高優先度)
**目的**: 音声認識結果の編集・管理機能

**実装内容**:
- テキスト編集機能（リッチテキストエディタ）
- 音声とテキストの時間軸同期
- 文字起こし結果の保存・読み込み
- エクスポート機能（TXT, MD, JSON）
- 検索・置換機能

**データ構造**:
```typescript
interface TranscriptionResult {
  audioFile: string
  segments: TranscriptionSegment[]
  language: string
  confidence: number
  createdAt: string
  editedAt: string
}

interface TranscriptionSegment {
  start: number  // 開始時間（秒）
  end: number    // 終了時間（秒）
  text: string   // 認識テキスト
  confidence: number
  isEdited: boolean
}
```

---

### 4. **UI/UX統合** (高優先度)
**目的**: 既存UIへのシームレスな音声認識機能統合

**実装内容**:
- TopPanel（テキストエリア）の拡張
- 音声認識ボタンの実装
- 進捗表示・ステータス管理
- 音声再生と文字起こしの同期表示
- キーボードショートカット対応

**UI改善**:
```
TopPanel 拡張後:
┌─────────────────────────────────────┐
│ 📝 文字起こし結果                    │
├─────────────────────────────────────┤
│ [音声認識開始] [一時停止] [停止]      │
│ 進捗: ████████░░ 80% (2分30秒/3分)   │
├─────────────────────────────────────┤
│ こんにちは、これはテストの音声認識    │
│ です。とても正確に認識されています。  │
│ [編集モード] [エクスポート] [検索]    │
└─────────────────────────────────────┘
```

---

## 🔧 技術実装詳細

### 1. faster-whisper + Kotoba-Whisper統合アーキテクチャ

#### UV管理Python faster-whisperサーバー
```python
# whisper_server/main.py - UV環境で実行
from faster_whisper import WhisperModel
import asyncio
import websockets
import json
import logging
from pathlib import Path

class KotobaWhisperServer:
    def __init__(self):
        logging.basicConfig(level=logging.INFO)
        self.logger = logging.getLogger(__name__)
        
        # Kotoba-Whisper large-v2モデル読み込み
        self.model = WhisperModel(
            "kotoba-tech/kotoba-whisper-v2.0-faster",
            device="cpu",
            compute_type="int8",  # メモリ最適化
            num_workers=8,        # Ryzen 7840HS 8コア活用
            download_root="./models"  # UV環境内にモデル保存
        )
        self.logger.info("Kotoba-Whisper model loaded successfully")
    
    async def transcribe_file(self, audio_path: str) -> dict:
        self.logger.info(f"Starting transcription: {audio_path}")
        
        segments, info = self.model.transcribe(
            audio_path,
            language="ja",        # 日本語優先
            beam_size=5,          # 精度重視
            vad_filter=True,      # 音声区間検出
            chunk_length=30,      # 30秒チャンク
            word_timestamps=True  # 単語レベルタイムスタンプ
        )
        
        result = {
            "language": info.language,
            "duration": info.duration,
            "segments": [
                {
                    "start": s.start, 
                    "end": s.end, 
                    "text": s.text,
                    "words": [{"start": w.start, "end": w.end, "word": w.word} 
                             for w in s.words] if s.words else []
                } 
                for s in segments
            ]
        }
        
        self.logger.info(f"Transcription completed: {len(result['segments'])} segments")
        return result

# UV環境での起動エントリーポイント
if __name__ == "__main__":
    server = KotobaWhisperServer()
    # WebSocketサーバー起動（後述）
```

#### Electron ↔ UV Python通信
```typescript
// メインプロセス (main.ts) - UV Python子プロセス管理
import { spawn } from 'child_process'
import WebSocket from 'ws'
import path from 'path'

interface WhisperService {
  startServer: () => Promise<void>
  transcribeFile: (filePath: string) => Promise<TranscriptionResult>
  transcribeStream: (audioChunk: Buffer) => Promise<PartialTranscription>
  stopServer: () => Promise<void>
}

class UVWhisperService implements WhisperService {
  private pythonProcess: ChildProcess
  private wsConnection: WebSocket
  private serverPath: string
  
  constructor() {
    // whisper-serverディレクトリのパス
    this.serverPath = path.join(__dirname, '../../whisper-server')
  }
  
  async startServer() {
    // UV環境でPython faster-whisperサーバー起動
    this.pythonProcess = spawn('uv', ['run', 'python', 'main.py'], {
      cwd: this.serverPath,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    
    // サーバー起動待機
    await this.waitForServerReady()
    
    // WebSocket接続確立
    this.wsConnection = new WebSocket('ws://localhost:8765')
    
    this.pythonProcess.stdout?.on('data', (data) => {
      console.log(`UV Python Server: ${data}`)
    })
    
    this.pythonProcess.stderr?.on('data', (data) => {
      console.error(`UV Python Server Error: ${data}`)
    })
  }
  
  private async waitForServerReady(timeout = 30000): Promise<void> {
    const startTime = Date.now()
    
    while (Date.now() - startTime < timeout) {
      try {
        // ヘルスチェック
        const ws = new WebSocket('ws://localhost:8765')
        await new Promise((resolve, reject) => {
          ws.on('open', resolve)
          ws.on('error', reject)
          setTimeout(reject, 1000)
        })
        ws.close()
        return
      } catch {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
    
    throw new Error('UV Python server failed to start within timeout')
  }
}
```

### 2. Kotoba-Whisper最適化リアルタイム処理

```typescript
class KotobaRealtimeTranscriber {
  private audioBuffer: Float32Array[] = []
  private chunkSize: number = 30 * 1000      // 30秒チャンク
  private overlapSize: number = 5 * 1000     // 5秒オーバーラップ
  private processQueue: AudioSegment[] = []
  private isProcessing: boolean = false
  
  // Ryzen 7840HS最適化並列処理
  async processAudioChunk(chunk: Float32Array): Promise<void> {
    this.audioBuffer.push(chunk)
    
    if (this.shouldCreateSegment()) {
      const segment = this.extractOptimizedSegment()
      this.processQueue.push(segment)
      
      // 非同期並列処理（8コア活用）
      if (!this.isProcessing) {
        this.processTranscriptionQueue()
      }
    }
  }
  
  private async processTranscriptionQueue() {
    this.isProcessing = true
    
    while (this.processQueue.length > 0) {
      const segment = this.processQueue.shift()
      
      // Kotoba-Whisper chunked処理
      const result = await this.transcribeWithKotoba(segment)
      this.mergeWithPreviousResults(result)
      this.updateRealtimeDisplay(result)
    }
    
    this.isProcessing = false
  }
  
  private async transcribeWithKotoba(segment: AudioSegment): Promise<TranscriptionSegment> {
    // WebSocket経由でPython faster-whisperサーバーへ
    return await this.whisperService.transcribeChunk(segment, {
      model: "kotoba-tech/kotoba-whisper-v2.0-faster",
      language: "ja",
      chunk_length: 30,
      overlap: 5,
      beam_size: 5,           // 精度重視
      compute_type: "int8"    // メモリ最適化
    })
  }
}
```

### 3. データ永続化設計

```typescript
// ファイル構造
interface ProjectStructure {
  'audio/': {
    'recording_20250713_140000.webm': ArrayBuffer
  }
  'transcriptions/': {
    'recording_20250713_140000.json': TranscriptionResult
  }
  'exports/': {
    'recording_20250713_140000.txt': string
    'recording_20250713_140000.md': string
  }
}
```

---

## 📁 実装ファイル構造

### UV Python環境
```
whisper-server/                    # UV管理Pythonプロジェクト
├── pyproject.toml                 # UV依存関係定義
├── uv.lock                        # ロックファイル
├── .python-version               # Python バージョン指定
├── main.py                       # サーバーエントリーポイント
├── src/
│   ├── whisper_server/
│   │   ├── __init__.py
│   │   ├── server.py            # WebSocketサーバー
│   │   ├── transcriber.py       # Kotoba-Whisper処理
│   │   ├── audio_processor.py   # 音声前処理
│   │   └── utils.py            # ユーティリティ
│   └── models/                  # Kotoba-Whisperモデル保存
└── tests/                       # テスト
    ├── __init__.py
    ├── test_transcriber.py
    └── test_server.py
```

### UV設定ファイル例
```toml
# whisper-server/pyproject.toml
[project]
name = "kotoba-whisper-server"
version = "0.1.0"
description = "Local Kotoba-Whisper transcription server"
requires-python = ">=3.10"
dependencies = [
    "faster-whisper>=1.0.0",
    "websockets>=12.0",
    "asyncio",
    "pathlib",
    "logging",
    "numpy>=1.24.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=7.0.0",
    "pytest-asyncio>=0.21.0",
    "black>=23.0.0",
    "mypy>=1.0.0",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.uv]
dev-dependencies = [
    "pytest>=7.0.0",
    "pytest-asyncio>=0.21.0",
]
```

### Electron統合
```
src/renderer/
├── components/
│   ├── Transcription/
│   │   ├── TranscriptionPanel.tsx
│   │   ├── TranscriptionControls.tsx
│   │   ├── TranscriptionProgress.tsx
│   │   ├── TranscriptionEditor.tsx
│   │   └── TranscriptionExport.tsx
│   ├── AudioSync/
│   │   ├── AudioTextSync.tsx
│   │   └── SyncTimeline.tsx
│   └── Settings/
│       └── TranscriptionSettings.tsx
├── hooks/
│   ├── useTranscription.ts
│   ├── useRealtimeTranscription.ts
│   └── useAudioTextSync.ts
├── services/
│   ├── uvWhisperService.ts        # UV Python連携
│   ├── audioProcessor.ts
│   └── transcriptionStorage.ts
└── types/
    └── transcription.ts
```

### 拡張ファイル
```
既存ファイルの機能拡張:
├── TopPanel/TopPanel.tsx → 文字起こし結果表示・編集
├── BottomPanel/BottomPanel.tsx → 音声認識ボタン追加
├── LeftPanel/LeftPanel.tsx → 文字起こしファイル表示
├── RightPanel/RightPanel.tsx → 音声認識パネル統合
├── main/main.ts → Whisper API統合
└── preload/preload.ts → 音声認識IPC追加
```

---

## 🚀 段階的実装ステップ

### Step 1: UV Python環境構築 (1-2日)
**優先度**: 最高
```
1.1 UV環境セットアップ
- UV インストール（高速Pythonパッケージマネージャー）
- whisper-serverプロジェクト初期化
- 依存関係定義（pyproject.toml）

1.2 faster-whisper + Kotoba-Whisper環境
- faster-whisper インストール（UV経由）
- Kotoba-Whisper large-v2モデルダウンロード
- UV仮想環境での動作確認

1.3 WebSocketサーバー構築
- asyncio + websockets実装
- UV環境でのサーバー起動テスト
- Electron ↔ Python通信確立
```

### Step 2: 基本音声認識機能 (1-2日)
**優先度**: 高
```
2.1 WebMファイル音声認識
- faster-whisperでのWebM直接処理
- Kotoba-Whisper large-v2モデル使用
- 進捗表示・結果取得

2.2 基本UI実装
- TranscriptionPanelコンポーネント作成
- 音声認識ボタンの追加
- 結果表示エリアの実装

2.3 日本語最適化
- 言語自動検出（日本語優先）
- Kotoba-Whisper特有の後処理
- 精度向上パラメータ調整
```

### Step 3: 音声とテキストの同期 (1日)
**優先度**: 高
```
3.1 時間軸同期機能
- 音声再生位置とテキストの連動
- クリック位置へのジャンプ機能
- ハイライト表示

3.2 セグメント分割
- 音声認識結果のセグメント化
- 時間情報の保持
- 編集可能な単位での管理
```

### Step 3: 結果管理・編集機能 (1日)
**優先度**: 高
```
3.1 文字起こし結果の保存
- TranscriptionResultの永続化
- JSONファイルでの保存
- ファイル一覧への統合

3.2 テキスト編集機能
- 基本的なテキストエディタ実装
- 保存・読み込み機能
- 元音声との関連付け

3.3 エクスポート機能
- TXT形式での出力
- Markdown形式での出力
- SRT字幕形式対応
```

### Step 4: Kotoba-Whisper最適化リアルタイム認識 (1-2日)
**優先度**: 中
```
4.1 chunkedアルゴリズム実装
- 30秒チャンク・5秒オーバーラップ
- Kotoba-Whisperの9倍高速化活用
- Ryzen 7840HS並列処理最適化

4.2 ストリーミング処理
- 録音中リアルタイム認識
- メモリ効率的な連続処理
- 結果結合・重複除去アルゴリズム
```

### Step 5: UV環境最適化・高度な機能 (1日)
**優先度**: 低
```
5.1 UV環境最適化
- uvx コマンドでの一時実行
- uv tool による開発ツール管理
- 仮想環境の効率的管理

5.2 多言語対応
- 言語自動検出
- 手動言語選択
- 混合言語対応

5.3 認識精度向上
- 音声前処理の実装
- ノイズ除去機能
- 話者分離（将来実装）
```

## 🛠️ UV環境セットアップ手順

### 1. UV インストール
```bash
# Windows環境でのUVインストール
curl -LsSf https://astral.sh/uv/install.sh | sh

# または PowerShell
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
```

### 2. whisper-serverプロジェクト作成
```bash
# プロジェクトディレクトリ作成
cd D:\work\voise-encoder
mkdir whisper-server
cd whisper-server

# UV プロジェクト初期化
uv init --name kotoba-whisper-server
uv python pin 3.11  # Python 3.11固定

# 依存関係追加
uv add faster-whisper
uv add websockets
uv add numpy

# 開発依存関係
uv add --dev pytest pytest-asyncio black mypy
```

### 3. モデルダウンロード・テスト
```bash
# UV環境でKotoba-Whisperテスト
uv run python -c "
from faster_whisper import WhisperModel
model = WhisperModel('kotoba-tech/kotoba-whisper-v2.0-faster', device='cpu')
print('Kotoba-Whisper model loaded successfully')
"
```

### 4. 開発・テスト・実行
```bash
# サーバー起動
uv run python main.py

# テスト実行
uv run pytest

# コードフォーマット
uv run black .

# 型チェック
uv run mypy src/
```

---

## 🎯 Phase 2 完了条件

### 必須機能（最高・高優先度）
- ✅ WebMファイルの音声認識（OpenAI API）
- ✅ 文字起こし結果の表示・保存
- ✅ 基本的なテキスト編集機能
- ✅ 音声とテキストの時間軸同期
- ✅ エクスポート機能（TXT/MD）

### 推奨機能（中優先度）
- ✅ リアルタイム音声認識
- ✅ 進捗表示・ステータス管理
- ✅ 多言語対応（日本語・英語）

### オプション機能（低優先度）
- 高度な認識精度向上機能
- カスタムWhisperモデル対応
- Transformers.js統合（ローカル処理）

---

## 💰 コスト見積もり

### faster-whisper + Kotoba-Whisperローカル処理
```
初期セットアップコスト:
- Python環境構築: 無料
- faster-whisperライブラリ: 無料（オープンソース）
- Kotoba-Whisper large-v2モデル: 無料（HuggingFace）
- モデルサイズ: 約3GB（ダウンロード1回のみ）

ランニングコスト: $0
- API料金なし（完全ローカル処理）
- インターネット不要（オフライン動作）
- プライバシー保護（データ外部送信なし）
```

### ハードウェア要件コスト
```
Ryzen 7 7840HS環境:
- 推奨メモリ: 16-32GB DDR5（Kotoba-Whisper + OS）
- ストレージ: 5GB程度（モデル + キャッシュ）
- 電力消費: 約30-50W（CPU推論時）

ROI（投資対効果）:
- 月額API費用削減: 約800円/月 → 0円
- 年間削減効果: 約9,600円
- プライバシー保護: プライスレス
```

---

## 🔮 Phase 3 準備

Phase 2完了後、以下の拡張機能を実装予定：

### Phase 3: 高度な音声処理・認識機能
1. **カスタムWhisperモデル** - 特定用途向け精度向上
2. **話者分離機能** - 複数話者の識別・分離
3. **音声要約機能** - AI要約・キーワード抽出
4. **音声翻訳機能** - リアルタイム多言語翻訳

### Phase 4: 音声フォーマット変換（従来のPhase 2）
1. **MP3エンコード機能** - ffmpeg.wasm統合
2. **音声フォーマット変換** - WebM ↔ MP3 ↔ WAV
3. **音声品質最適化** - ノイズ除去、音量正規化

---

## ✅ 実装の意義

**Phase 2により実現すること:**
1. **プライバシー保護** - 完全ローカル処理でデータ漏洩リスクゼロ
2. **高精度日本語認識** - Kotoba-Whisper特化モデルで最高品質
3. **ゼロランニングコスト** - API料金不要、オフライン動作
4. **高速処理** - faster-whisper + Ryzen 7840HSで6倍高速化
5. **ワークフロー完成** - 録音→再生→文字起こし→編集の完全な流れ

## 🎯 Kotoba-Whisper + faster-whisperの技術的優位性

### **日本語特化**
- **ReazonSpeechデータセット**: 720万音声クリップで訓練
- **日本語精度**: OpenAI Whisper比で大幅向上
- **自然な句読点**: 日本語特有の文脈理解

### **処理性能**
- **6.3倍高速**: OpenAI Whisper large-v3比
- **chunked処理**: 9倍高速化アルゴリズム
- **Ryzen最適化**: 8コア16スレッド完全活用

### **メモリ効率**
- **int8量子化**: 3-4GB使用量（原版の1/3）
- **ストリーミング**: 固定メモリで長時間処理
- **DDR5最適化**: 高速メモリアクセス活用

これにより、**プライバシーを完全保護した高精度日本語音声認識アプリケーション**が完成し、ユーザーにとって理想的なローカル音声認識ツールとなります。