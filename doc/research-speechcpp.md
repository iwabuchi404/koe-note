# speech.cpp スパイク調査結果（v2 Phase 0）

調査日: 2026-11-15 / 実施環境: Windows x64, Ryzen 7 7840HS + Radeon 780M (Vulkan)
対象: speech.cpp **v0.11.0**（MIT, https://github.com/nyosegawa/speech.cpp）

結論: **`TranscriptionEngine` ポートに適合する。HTTP サーバー方式（計画§5.1どおり）で進めてよい。**

---

## 1. 配布・動作確認

| 項目 | 結果 |
|---|---|
| Windows バイナリ | `speech-0.11.0-windows-x64-vulkan.zip` 29.7MB（exe+dll+lib+speech.h） |
| インストール | 展開するだけで動く。公式 installer (`install.ps1`) は PATH への追加を行うため本番統合ではリリース zip を同梱 or 独自DL経路を作るのが自然 |
| デバイス | `Vulkan0` (iGPU Radeon 780M) と `CPU` を `speech devices` で列挙。Vulkan で動作確認 |
| モデルキャッシュ | `%LOCALAPPDATA%\speech.cpp\models\sakasegawa--<name>-GGUF\<sha256>\` |
| モデル取得 | `speech pull NAME` or 使用時に自動 fetch。SHA-256 検証・中断再開・同時取得の待機あり（cli 実績十分） |

## 2. KoeNote との統合面（API 適合性）

### `speech serve` — OpenAI 互換 HTTP API（採用案）

```sh
speech serve parakeet-tdt_ctc-0.6b-ja --port 8780
# listen はモデルロード完了後。stderr に進行ログ
```

| エンドポイント | 用途 | 実測 |
|---|---|---|
| `GET /health` | 起動待機ポーリングに使える | `{"status":"ok"}` |
| `GET /v1/models` | ロード済みモデル列挙 | OK |
| `POST /v1/audio/transcriptions` | **Post 文字起こしの主経路** | 後述 |
| `GET /v1/realtime` | OpenAI Realtime 互換 WS | エンドポイント存在（本スパイクでは未検証。Live の本命候補） |

`verbose_json` 応答（実測）:

```json
{"task":"transcribe","duration":8.1465,
 "text":"ふだんやっぱり結構…",
 "segments":[{"id":0,"start":0,"end":7.92,"text":"…"}]}
```

`timestamp_granularities[]=word` で `words:[{word,start,end}]`（日本語は字/語単位）。

**`TranscribeRequest` → API マッピング**:

| ポート側 | speech.cpp 側 |
|---|---|
| `audio:{path}` | multipart `file=`（WAV のみ。16/24/32-bit PCM or f32、任意レート・自動リサンプル） |
| `model` | `model` メンバー（省略可=サーバーのデフォルト） |
| `language` | `language` メンバー（`ja` or `auto`） |
| `audioOffsetSeconds` | **クライアント側で segments に加算**（サーバーは入力ファイル相対時刻を返す） |

### エラー形式（全て OpenAI 形式）

```json
{"error":{"message":"…","type":"invalid_request_error","param":"model","code":"model_not_found"}}
```

実測した失敗系: 非 WAV or >25MB → 413/400、`model` 不一致 → `model_not_found`、未知パラメータ → `unknown_parameter`、未ロード task の endpoint → 何が serve されているかを含む詳細メッセージ。

### `speech worker`（代替・JSON Lines）

stdin/stdout の JSONL（protocol 4）。`chunk`+`transcribe` で逐次 PCM 投入可。
**HTTP の方が Live/Post を1つの IF で扱えるため serve 採用が自然**。worker はプロセス直結を避けたい場合の代替。

## 3. 実測性能（parakeet-tdt_ctc-0.6b-ja q8_0, Vulkan0）

| 計測 | 値 |
|---|---|
| モデルロード（2回目以降） | 0.71〜1.55 s |
| 8.15s 音声（CLI, 暖機済み） | 0.185 s（RTFx 44） |
| 3s チャンク HTTP 往復 | **188〜207 ms**（推論部 82 ms） |
| プロセス常駐メモリ | 約 750〜830 MB |
| 日本語精度 | 実録音で妥当な出力（句読点なし・表記はモデル依存） |

→ **Live（3s チャンク間隔）は余裕で間に合う。** Post の長尺は `chunking_strategy`（VAD 分割）で区切る設計が適切。

## 4. モデルカタログ適合

計画§5.2 の P0/P1 全てカタログに存在:

| 計画のモデル | speech.cpp 名 | サイズ(q8_0) |
|---|---|---|
| Parakeet TDT-CTC 0.6B JA | `parakeet-tdt_ctc-0.6b-ja` | 0.66 GB（検証済み） |
| Qwen3-ASR 1.7B / 0.6B | `qwen3-asr-1.7b` / `qwen3-asr-0.6b` | 2.18 / 0.84 GB |
| Haas-ja-v1.0 | `haas-ja-v1.0` | 0.66 GB |
| ReazonSpeech NeMo v2 | `reazonspeech-v2` | 0.66 GB |
| Silero VAD | `silero-vad` | 1.2 MB（detection task） |
| Nemotron 3 Diarization | `nemotron-3-diarization` | 106 MB（diarization task） |

`speech models` がカタログ+FETCHED 状態を出力 → **Model Registry はこのコマンド or キャッシュ dir を読む設計**でよい。`NAME:TYPE` で量子化選択可能。

VAD・話者分離・ノイズ除去は同一サーバーに別 task として同居でき、transcriptions の `chunking_strategy`（server_vad）・`diarized_json`・`noise_reduction` で発動 → **Phase 4 の実装経路が API 上に既にある**。

## 5. 注意点・制約

1. **WAV 入力のみ** — mp3 は拒否。旧データ(mp3)の Post 文字起こしにはデコードが必要（ffmpeg 同梱 or ライブラリデコード）。v2 が WAV 原本化する方針と一致
2. **1リクエストずつ** — モデルごとに直列。TranscriptionJob のキューと整合
3. **25MB/リクエスト** — 長尺はチャンク分割必須（v2 のチャンク構造と一致）
4. **認証なし** — `127.0.0.1` バインド必須（既定値。KoeNote も同じ思想）
5. **終了は taskkill /F が確実**（Git Bash の SIGTERM では落ちず。whisperServer と同じ Windows 終了経路を使う）
6. **Realtime WS（`/v1/realtime`）は未検証** — Live の本命だが、Phase 2 までは「WAV チャンクを POST する現行パターン」で十分間に合う（200ms/3s）

## 6. 設計への反映

- `EngineCapabilities`: `{live:true, post:true, diarization:(model依存), vad:(model依存), timestampGranularity:'word'}` を実測で確認
- `speechCppAdapter`: `health` ポーリング → モデル待機 → `POST /v1/audio/transcriptions`、エラーコードを `AppError` に写像
- EngineRegistry のモデル待ち状態: `speech serve` は listen 前にロード完了するため「起動中=ポート未open」で判定可能
- プロセス管理: whisperServer.ts のライフサイクル実装（起動・status 通知・taskkill 終了）をそのまま流用可能
