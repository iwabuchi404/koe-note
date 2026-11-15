# KoeNote v2 Phase 0 設計ドラフト

「KoeNote v2 改修計画.txt」の Phase 0 成果物。
録音と文字起こしを分離し、複数エンジンを収容できる内部構造を定義する。

状態: **ドラフト（未実装）**。確定したら shared/core の型としてコード化する。

---

## 1. 現状の結合点（何を分離するか）

現行パイプラインは renderer 内で1本化している:

```
RecordingContext
  └─ AudioWorkletRecordingService
       ├─ PCM → lamejs → MP3チャンク ──(onChunkReady)──> AdvancedRecordingFileService (IPC保存)
       └─ TranscriptionWebSocketService (renderer → WS → whisper-server)
```

結合の問題:

- **エンコーダーが録音サービスに内蔵** — MP3 固定。lamejs のグローバル script 読み込み依存
- **文字起こしが録音サービス内で起動・送信される** — ASR の失敗・切断が録音寿命と結合
- **WS クライアントが renderer 直結** — speech.cpp（子プロセス+HTTP）は main 側にしか置けないため、エンジン実装場所が統一されない
- **保存先がフラットなファイル集合** — `<base>.mp3` + `.trans.txt` + `.manifest.json` + `.chunks/`。複数トラック・複数文字起こし結果を表現できない

---

## 2. 目標構造：ポートとユースケース

### 2.1 レイヤ構成

```
src/
├── shared/
│   ├── session.ts          # session.json スキーマ + 純粋関数（新設）
│   ├── transcript.ts       # 構造化文字起こし結果スキーマ（新設）
│   └── ipcContract.ts      # sessions:* / speech:* チャンネル追加
│
├── core/                   # Electron非依存のドメイン層（新設）
│   ├── ports.ts            # AudioCapture / TranscriptionEngine / SessionStore IF
│   └── usecases/
│       ├── RecordingSession.ts     # 録音オーケストレーション
│       └── TranscriptionJob.ts     # Live/Post 共通の文字起こし制御
│
├── renderer/features/recording/
│   └── adapters/
│       ├── WorkletAudioCapture.ts  # AudioWorklet 実装（既存を薄く移植）
│       └── IpcSessionStore.ts      # sessions:* IPC のクライアント実装
│
└── main/services/
    ├── sessionStore.ts             # sessions/ 以下の fs 永続化
    └── engines/
        ├── EngineRegistry.ts       # エンジン登録・選択
        ├── fasterWhisperAdapter.ts # whisper-server WS（whisperClient 拡張）
        └── speechCppAdapter.ts     # speech.cpp 子プロセス + HTTP（Phase 3）
```

### 2.2 プロセス境界の決定

| ポート | 実装場所 | 理由 |
|---|---|---|
| `AudioCapture` | renderer | AudioWorklet / MediaStream は DOM API |
| `SessionStore` | main（fs）+ renderer は IPC 経由 | 既存 file:* IPC と同じパターン |
| `TranscriptionEngine` | **main** | speech.cpp は子プロセス=main。faster-whisper も main に寄せて実装場所を統一する |

**現行の renderer → WS 直結は移行時に main 側へ移す。**
現状 `whisperClient`（main 側、`speech:transcribe` で使用中）を拡張すれば WS 足回りは再利用できる。renderer→main→WS の1ホップ追加はローカル IPC で実害なし。

### 2.3 ポート定義（案）

```ts
// core/ports.ts — Electron・具体エンジン非依存

/** 音声キャプチャ（renderer実装） */
interface AudioCapture {
  start(config: CaptureConfig): Promise<void>
  stop(): Promise<void>
  onChunk(cb: (e: AudioChunkEvent) => void): void
  onStats(cb: (s: CaptureStats) => void): void
  onError(cb: (e: Error) => void): void
}

interface AudioChunkEvent {
  sourceId: string            // 'microphone' | 'desktop' | 'mixed'
  chunk: Blob                 // エンコード済みデータ
  chunkNumber: number
  audioOffsetSeconds: number  // セッション開始からの相対位置（推定でなく実値）
  durationSeconds: number
  bytes: number
}

/** 推論エンジン（main実装。エンジン差異を隠蔽） */
interface TranscriptionEngine {
  readonly id: string                    // 'faster-whisper' | 'speech.cpp'
  capabilities(): EngineCapabilities
  /** ファイル/チャンク単位の推論（Post・Live共通の最小単位） */
  transcribe(req: TranscribeRequest): Promise<TranscriptSegment[]>
}

interface EngineCapabilities {
  live: boolean            // ストリーミング入力可能か
  post: boolean            // ファイル丸ごと推論可能か
  diarization: boolean
  vad: boolean
  timestampGranularity: 'segment' | 'word'
}

interface TranscribeRequest {
  engine: string
  model: string
  audio: { path: string } | { pcm: ArrayBuffer; sampleRate: number }
  language: string
  audioOffsetSeconds?: number   // 結果タイムスタンプの原点補正
}

/** セッション永続化（main=fs / renderer=IPC） */
interface SessionStore {
  create(meta: SessionMeta): Promise<SessionRef>
  appendAudioChunk(sessionId: string, sourceId: string, chunk: ChunkWrite): Promise<void>
  updateSession(sessionId: string, patch: SessionPatch): Promise<void>
  saveTranscript(sessionId: string, t: TranscriptResult): Promise<void>
  load(sessionId: string): Promise<Session>
  list(): Promise<SessionSummary[]>
}
```

### 2.4 ユースケース（core/usecases）

`RecordingContext`（555行）の手続きを Electron 非依存な制御に分離:

- **RecordingSession** — capture.start → sessionStore.create → onChunk毎に appendAudioChunk → stop で finalizing → completed。保存失敗・ASR失敗で録音を止めない不変条件はここに閉じ込める（T1 のテストを usecase 層に移植できる構造にする）
- **TranscriptionJob** — Live（チャンク逐次）と Post（セッション音声全体）を同一の `TranscriptionEngine.transcribe` 呼び出し列として表現。キュー・再試行・部分失敗を管理。F2（未文字起こしチャンク再実行）は Job の入力選別に過ぎなくなる

---

## 3. Session スキーマ案（shared/session.ts）

```jsonc
// sessions/<session-id>/session.json
{
  "version": 1,
  "id": "20261115_134200_ab12",
  "createdAt": "2026-11-15T13:42:00.000Z",
  "state": "recording" | "finalizing" | "completed" | "interrupted",

  "recording": {
    "startedAt": "...",
    "endedAt": null,
    "durationSeconds": 0,
    "sampleRate": 44100,
    "channels": 1
  },

  "sources": [
    {
      "id": "microphone",
      "kind": "microphone",          // microphone | desktop | mixed
      "enabled": true,
      "audio": {
        "dir": "audio/microphone",   // 分割 WAV 群の配置先
        "format": "wav",
        "encoding": { "sampleRate": 44100, "channels": 1, "bitDepth": 16 },
        "chunks": [
          { "file": "audio/microphone/chunk_000.wav",
            "bytes": 529200,
            "audioOffsetSeconds": 0.0,
            "durationSeconds": 3.0,
            "recordedAt": "..." }
        ]
      }
    }
  ],

  "transcripts": [
    {
      "id": "live-001",
      "file": "transcripts/live-001.json",
      "mode": "live",                // live | post
      "engine": "faster-whisper",
      "model": "kotoba-whisper-v2.0-faster",
      "sourceId": "microphone",
      "language": "ja",
      "status": "running",           // running | completed | failed
      "createdAt": "...",
      "error": null
    }
  ],

  "meta": { "appVersion": "2.0.0" }
}
```

### 文字起こし結果（shared/transcript.ts, 計画§6.3ベース）

```jsonc
// transcripts/live-001.json
{
  "version": 1,
  "id": "live-001",
  "sessionId": "20261115_134200_ab12",
  "mode": "live",
  "engine": "faster-whisper",
  "model": "kotoba-whisper-v2.0-faster",
  "sourceId": "microphone",
  "language": "ja",
  "status": "completed",
  "createdAt": "...",
  "edited": false,                  // 手動修正を別領域に保持する目印
  "segments": [
    {
      "id": "seg-0001",
      "chunkNumber": 0,              // 旧manifestとの対応付け用（任意）
      "start": 0.0,                  // セッション相対秒で統一
      "end": 2.87,
      "text": "では会議を始めましょう",
      "speakerId": null,             // Phase 4 で使用
      "confidence": null
    }
  ]
}
```

### ディレクトリ（計画§6.1を初期実装に合わせて調整）

```
KoeNote/sessions/<session-id>/
├── session.json
├── audio/
│   ├── microphone/chunk_000.wav ...     # 分割 WAV（原本）
│   └── desktop/chunk_000.wav ...
├── transcripts/live-001.json, post-001.json
└── work/                                # 復旧・一時領域
```

- Phase 1 は **分割 WAV のみ**。MP3/FLAC/Opus はエクスポート扱い（後続）
- `work/` に未確定チャンク・書き込み中ファイルを置き、completed 時に掃除

---

## 4. 旧形式の互換ポリシー（決定案）

| 対象 | 方針 |
|---|---|
| 旧ファイル群（`*.mp3` + `.trans.txt` + `.manifest.json` + `.chunks/`） | **read-only 継続対応**。`fileLibrary.listFiles` が読む現行形式は維持し、v2 は sessions/ だけを書く |
| 旧ファイルへの追記 | v2 移行後は新規録音を旧形式で**書かない**（二重管理を避ける） |
| 旧 → 新 変換 | オプションの移行ツールとして後続フェーズ（MVP外） |
| `.manifest.json` を持つ録音の「セッション化表示」 | manifest → Session 変換する純粋関数 `sessionFromLegacyManifest()` を shared に用意し、ライブラリ表示を統一 |

---

## 5. speech.cpp スパイク計画（Phase 0 の検証作業）

目的: `TranscriptionEngine` ポートが speech.cpp に本当に適合するかを、実装前に潰す。

1. **バイナリ調達**: Windows で speech.cpp をビルド or リリース取得。HTTP サーバーモードの有無確認（無ければ CLI 呼び出しアダプタ案も検討）
2. **推論確認**: P0 モデル（Parakeet TDT-CTC 0.6B JA）を1つロードし、既存録音 WAV を推論させる
3. **API 形状の記録**: リクエスト/レスポンス・タイムスタンプ形式・セグメント分割の粒度を `TranscribeRequest/TranscriptSegment` にマッピングできるか確認
4. **レイテンシ**: 3秒チャンクの推論時間を計測（Live 利用可否の目安）
5. **失敗時挙動**: プロセス異常終了・モデル未ロード時の応答を確認 → EngineRegistry の状態管理設計に反映

成果物: `doc/research-speechcpp.md`（Cortex research/ にも転載候補）

---

## 6. Phase 1 への移行設計（書き込み経路の切り替え）

現行 `AdvancedRecordingFileService.saveChunk` が担う3書き込み（連結mp3・chunk・manifest）を、新経路に置き換える順序:

```
Step 1: shared/session.ts + transcript.ts の型・純粋関数 + テスト
Step 2: main/services/sessionStore.ts（fs 実装）+ sessions:* IPC 契約
Step 3: renderer IpcSessionStore + RecordingContext を usecase 経由に切替
        （この時点で新録音は sessions/ に書かれる）
Step 4: fileLibrary を sessions/ も読めるように拡張（表示統一）
Step 5: 旧書き込み経路（AdvancedRecordingFileService）は削除
```

不変条件（T1 テストで固定済み・引き継ぐ）:

- チャンク保存失敗・ASR 失敗・WS 切断で録音は停止しない
- chunkNumber は送信側が持つ値を全経路で保存（推測しない）
- `audioOffsetSeconds` は推定値ではなく録音側の実値を使う（旧 manifest は推定だった欠陥を直す）
- 書き込み順: chunk ファイル → session.json 更新（manifest 相当）。session.json 更新失敗でも chunk は原本として残る

---

## 7. 未決事項（Phase 1 開始前に決める）

1. **session-id の形式** — `YYYYMMDD_HHMMSS_<rand4>` 案。旧 baseName との併記をどうするか
2. **デスクトップ音声の個別トラック** — 現行は mix のみ。AudioWorklet の2ストリーム同時録音を新設計に入れるか、Phase 1 で「mic 個別 + desktop 個別」まで行くか範囲要確認
3. **renderer→main→WS 移行のタイミング** — Phase 1 で即やるか、renderer WS を `TranscriptionEngine` の暫定実装として残すか。後者なら IPC 契約変更を Phase 2 に遅らせられる
4. **WAV チャンクのサンプルレート** — AudioContext ネイティブ（48k等）のまま書くか 16kHz にリサンプルするか（ASR 入力との一致を考える）
5. **lamejs の去留** — 分割 WAV 原本化によりエクスポート用のみに縮小。`@breezystack/lamejs` 移行 or エクスポート機能側で再検討

---

## 8. 対応表（改修計画 → 本設計）

| 計画項目 | 本設計での位置づけ |
|---|---|
| Audio Session Manager | `core/usecases/RecordingSession` |
| Recording/Live パイプライン分離 | `AudioCapture` → `SessionStore`（必須）と `TranscriptionEngine`（任意・独立） |
| Transcription Queue | `core/usecases/TranscriptionJob` |
| 共通文字起こし結果型 | `shared/transcript.ts` |
| セッション単位の保存 | `sessions/<id>/` + `SessionStore` |
| 旧形式互換 | §4（read 継続・write 新形式のみ） |
| エンジン共存 | `TranscriptionEngine` ポート + main 側 EngineRegistry |
| F2 再文字起こし | TranscriptionJob の入力選別（Phase 2 に吸収） |
| lamejs | エクスポート用に縮小（§7-5） |
