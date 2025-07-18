# Phase 2.5.3: 準リアルタイム文字起こし機能 設計書

## 概要

音声録音完了後に、チャンク分割による高速文字起こしを行う機能。
録音したファイルを選択して実行すると、10-30秒チャンクに分割して並列処理し、
統合された1つのファイルとして保存する。精度重視のアプローチ。

## 要件定義

### 機能要件

1. **分離型録音 + 文字起こし**
   - 録音を通常通り完了し、ファイルとして保存
   - 左ペインで録音ファイルを選択
   - 文字起こしボタンでチャンク分割処理を開始

2. **チャンク管理**
   - 音声を10-30秒間隔でチャンク分割（精度重視）
   - 各チャンクを並列して文字起こし処理
   - チャンク間の音声重複（オーバーラップ）で境界問題を軽減

3. **統合保存**
   - 全チャンクの処理完了後に結果を統合
   - 従来の文字起こしファイル形式で保存
   - 編集機能との互換性を維持

### 非機能要件

1. **パフォーマンス**
   - チャンク処理による低レイテンシー
   - UI応答性を維持
   - メモリ使用量の最適化

2. **信頼性**
   - チャンク単位でのエラーハンドリング
   - 一部チャンクの失敗が全体に影響しない
   - 録音データの確実な保存

## システム設計

### アーキテクチャ概要

```
Phase 1: [音声入力] → [録音] → [ファイル保存] → [左ペイン表示]
                                    ↓
Phase 2: [ファイル選択] → [チャンク分割] → [並列文字起こし] → [結果統合] → [保存]
                              ↓                ↓
                          [進捗表示]      [UI更新]
```

### コンポーネント構成

#### 1. ChunkTranscriptionManager
**役割**: チャンク分割文字起こしの中央制御
```typescript
interface ChunkTranscriptionManager {
  // 録音ファイルからチャンク分割文字起こし開始
  startChunkTranscription(audioFilePath: string): Promise<void>
  
  // 処理停止と結果統合
  stopAndConsolidate(): Promise<TranscriptionFile>
  
  // 現在の進捗状況
  getProgress(): ChunkProgress
  
  // チャンク結果のリスナー
  onChunkTranscribed(callback: (chunk: ChunkResult) => void): void
}
```

#### 2. AudioChunkProcessor
**役割**: 音声ファイルのチャンク分割と前処理
```typescript
interface AudioChunkProcessor {
  // チャンク設定
  configure(chunkSize: number, overlapSize: number): void
  
  // 音声ファイルをチャンクに分割
  processAudioFile(audioFilePath: string): Promise<AudioChunk[]>
  
  // チャンク品質チェック
  validateChunk(chunk: AudioChunk): boolean
}
```

#### 3. ChunkTranscriptionQueue
**役割**: チャンクの文字起こしキュー管理
```typescript
interface ChunkTranscriptionQueue {
  // チャンクを文字起こしキューに追加
  enqueue(chunk: AudioChunk): Promise<void>
  
  // 処理結果の取得
  getResults(): ChunkResult[]
  
  // キューの状態
  getQueueStatus(): QueueStatus
}
```

#### 4. ResultConsolidator
**役割**: チャンク結果の統合と最適化
```typescript
interface ResultConsolidator {
  // チャンク結果を統合
  consolidate(chunks: ChunkResult[]): TranscriptionFile
  
  // 重複部分の処理
  handleOverlaps(chunks: ChunkResult[]): ChunkResult[]
  
  // タイムスタンプの正規化
  normalizeTimestamps(segments: TranscriptionSegment[]): TranscriptionSegment[]
}
```

### データ構造

#### AudioChunk
```typescript
interface AudioChunk {
  id: string
  sequenceNumber: number
  startTime: number        // 録音開始からの時間（秒）
  endTime: number
  audioData: ArrayBuffer
  sampleRate: number
  channels: number
  overlapWithPrevious: number  // 前チャンクとの重複時間
}
```

#### ChunkResult
```typescript
interface ChunkResult {
  chunkId: string
  sequenceNumber: number
  status: 'processing' | 'completed' | 'failed'
  segments: TranscriptionSegment[]
  confidence: number
  processingTime: number
  error?: string
}
```

#### ChunkProgress
```typescript
interface ChunkProgress {
  isTranscribing: boolean
  totalChunks: number
  processedChunks: number
  failedChunks: number
  currentProcessingChunk: number
  averageProcessingTime: number
  estimatedTimeRemaining: number
}
```

## UI設計

### 1. 文字起こしコントロールの拡張

#### 新しいボタン配置（音声認識セクション）
```
[🎤 通常文字起こし] [⚡ チャンク分割文字起こし]
```

#### チャンク分割文字起こしボタンの状態
- **待機中**: `⚡ チャンク分割文字起こし`
- **処理中**: `⚡ 処理中... (5/8チャンク完了)`
- **完了**: `⚡ 完了 (結果を表示中)`

### 2. チャンク分割文字起こし表示エリア

#### レイアウト
```
┌─────────────────────────────────────────┐
│ ⚡ チャンク分割処理中 (sample_audio.wav) │
├─────────────────────────────────────────┤
│ 進捗: ████████░░ 8/10 チャンク処理完了   │
│ 残り時間: 約2分30秒                     │
├─────────────────────────────────────────┤
│ [チャンク分割文字起こし結果]             │
│                                         │
│ 00:00.0s  こんにちは、今日は...          │
│ 00:30.2s  準リアルタイム文字起こし機能の │
│ 01:00.1s  [処理中...] ████              │ ← 現在処理中のチャンク
│ 01:30.0s  [待機中]                      │ ← 未処理チャンク
│                                         │
│ [自動スクロール] [処理停止]             │
└─────────────────────────────────────────┘
```

#### セグメント表示の状態
- **完了**: 通常の文字起こし表示
- **処理中**: プログレスアニメーション付き
- **待機中**: グレーアウト表示
- **エラー**: 赤色で警告表示

### 3. 設定パネル

#### チャンク設定
```
┌─────────────────────────────────────┐
│ ⚙️ チャンク分割設定                  │
├─────────────────────────────────────┤
│ チャンクサイズ: [20秒 ▼]            │
│ オーバーラップ: [2秒 ▼]             │
│ 並列処理数: [2チャンク ▼]           │
│ 自動スクロール: [ON/OFF]            │
└─────────────────────────────────────┘
```

### 4. 状態インジケーター

#### アコーディオンセクションのタイトル強化
```
🎤 音声認識 ⚡ チャンク処理中 (8/10チャンク)
```

#### 左ペインの録音ファイル表示
- チャンク分割処理中のファイルには特別なアイコン表示
- 処理進捗の簡易表示

## 技術実装方針

### 1. 音声処理フロー

#### 録音ファイル → チャンク分割
```typescript
// 録音済みファイルからチャンクを生成
const processAudioFile = async (audioFilePath: string) => {
  const audioBuffer = await loadAudioFile(audioFilePath)
  const sampleRate = audioBuffer.sampleRate
  const duration = audioBuffer.duration
  
  // 20秒間隔でチャンク生成（オーバーラップ2秒）
  const chunkSize = 20 // 秒
  const overlapSize = 2 // 秒
  const chunks: AudioChunk[] = []
  
  for (let start = 0; start < duration; start += chunkSize - overlapSize) {
    const end = Math.min(start + chunkSize, duration)
    const chunk = extractAudioChunk(audioBuffer, start, end)
    chunks.push(chunk)
  }
  
  return chunks
}
```

#### チャンク → 文字起こし
```typescript
const processChunk = async (chunk: AudioChunk) => {
  try {
    // バックグラウンドで文字起こし処理
    const result = await transcribeChunk(chunk)
    
    // UIに結果を反映
    updateRealtimeDisplay(result)
    
    // 次のチャンクの準備
    prepareNextChunk()
  } catch (error) {
    handleChunkError(chunk, error)
  }
}
```

### 2. 状態管理

#### Redux/Context拡張
```typescript
interface ChunkTranscriptionState {
  isChunkTranscribing: boolean
  currentAudioFile: string | null
  chunks: Map<string, ChunkResult>
  progress: ChunkProgress
  settings: ChunkSettings
  consolidatedResult?: TranscriptionFile
}
```

### 3. IPC通信拡張

#### 新しいIPC チャンネル
```typescript
// メインプロセス → レンダラープロセス
'chunk:chunkProcessed'       // チャンク処理完了
'chunk:progressUpdate'       // 進捗更新
'chunk:error'               // エラー通知
'chunk:allCompleted'        // 全チャンク処理完了

// レンダラープロセス → メインプロセス  
'chunk:startTranscription'   // チャンク分割文字起こし開始
'chunk:stopTranscription'    // 停止と統合
'chunk:getProgress'         // 進捗状況取得
```

## フェーズ実装計画

### Phase 1: 基盤構築 (1-2日)
- [ ] ChunkTranscriptionManager実装
- [ ] AudioChunkProcessor実装（ファイルベース）
- [ ] 基本的なチャンク分割機能

### Phase 2: UI実装 (1-2日)  
- [ ] チャンク分割文字起こしボタン追加
- [ ] チャンク処理表示エリア実装
- [ ] 進捗表示とインジケーター

### Phase 3: 統合処理 (1-2日)
- [ ] ChunkTranscriptionQueue実装
- [ ] ResultConsolidator実装
- [ ] 保存機能の統合

### Phase 4: 最適化 (1日)
- [ ] パフォーマンス最適化
- [ ] エラーハンドリング強化
- [ ] ユーザビリティ改善

## 期待される効果

### ユーザーエクスペリエンス
- **即座のフィードバック**: 録音と同時に文字起こし結果を確認
- **効率的な録音**: 長時間録音での安心感
- **リアルタイム編集**: 録音中に内容を確認・調整可能

### 技術的メリット
- **低レイテンシー**: チャンク処理による高速化
- **スケーラビリティ**: 長時間録音への対応
- **互換性**: 既存の編集・保存機能との統合

## リスク・制約事項

### 技術的リスク
- チャンク間の音声境界での精度低下
- 並列処理によるメモリ使用量増加
- ネットワーク遅延による処理遅延

### 対策
- オーバーラップ処理による境界問題の軽減
- チャンクサイズの動的調整
- 適応的品質制御の実装

## 設定可能項目

### ユーザー設定
- **チャンクサイズ**: 3秒 / 5秒 / 10秒
- **オーバーラップ**: 0.5秒 / 1秒 / 2秒  
- **品質モード**: 速度優先 / バランス / 精度優先
- **自動スクロール**: ON / OFF
- **処理並列数**: 1-3チャンク

### 開発者設定
- チャンク品質閾値
- 再試行回数・間隔
- バッファサイズ
- タイムアウト時間

---

この設計に基づいて、段階的に準リアルタイム文字起こし機能を実装していきます。