# 作業状況: refactor/architecture-v2（Phase A〜G1）

最終更新: 2026-11-15
ブランチ: `refactor/architecture-v2`
HEAD: `63daf2b refactor: main.ts を起動専用に縮小し ipc/* と services/* に分割（G1）`

目的: KoeNote を拡張性・安全性・保守性の高い構造へ再構成する。
方針: 推測しない（実測値のみ記録）、死亡コードは削除、到達可能性は import graph で確認、
品質ゲートは `npm run verify`（tsc + Vitest）+ `npm run build` + KamoX 実機 E2E。

## 1. 完了フェーズ

### Phase A: 現状担保
- `7051c48` 型チェック・型追従 mock・App スモークテスト、`npm run verify` 導入

### Phase B: 死亡コード削除
- `7f670b6` 未到達 UI 65 ファイル削除
- `fe6d191` 未到達 chunk/service/型と孤児テスト削除
- `f817eda` 未使用依存 7 パッケージ削除
- import graph 上、全ソース到達可能・未到達 0

### 録音まわりの修正（実測ベース）
- `f58444d` デスクトップ音声がマイクにフォールバックする問題を修正
- `dee33f8` Whisper 起動待機 30秒 → 180秒（実測でモデル読込に約50秒）
- `5756f0c` 文字起こしメタデータとタイムスタンプの誤りを修正

### Phase C: 集約
- `96ebe92` 共有型を `src/shared/types.ts` に集約、preload 分離、不要 IPC 17 件削除
- `2a1e9b4` `.trans.txt` writer/parser 3組 → `src/shared/transcriptFile.ts` 1組
- `2d1b1c3` モデルカタログ 4箇所 → `src/shared/models.json` 1枚
- `380e6bb` whisper-server（Python）15ファイルを Git 管理下へ追加

### D0: チャンク紐付けの是正
- `2587eb8` Python の chunk 応答に `chunkNumber` / `timestamp` 付与、TS 側の最古 pending 推測を削除

### D3/D2: main 分割とパスガード
- `b806ee1` `WhisperServerService` 抽出、fileLibrary 抽出、単一許可ルート・パスガード導入
- `main.ts` 2,236行 → 1,634行、main 純粋ロジック 30 件追加

### D1: IPC エラー規約の統一
- `072279a` 全 29 IPC ハンドラを `handle()` に統一、`AppError` code を `[CODE]` 形式で renderer へ返却

### D4b: KamoX 実機スモーク
- `dcd6876` `scripts/kamox-e2e.mjs`（`npm run e2e:kamox`）新規、開発時 python 解決の修正
- `4e53429` タイムアウト・進捗表示・ログベース判定への改善
- `978e11c` 無音録音では trans.txt が生成されないことを仕様として扱う

### Phase E: chunk 群 + manifest（E1〜E4）
- `b105edd` (E1) バイト⇔時間の換算 SSOT（`src/shared/audioFormat.ts`）と manifest スキーマ（`src/shared/recordingManifest.ts`）
- `6b6bac6` (E2) `file:appendToPath` IPC 追加（O(n²) の全体読み書き → O(1) 追記）
- `a4ec012` (E3) `AdvancedRecordingFileService.saveChunk` を「mp3 追記 + chunk ファイル + manifest 更新」に変更
- `058ce74` (E4) manifest の chunkNumber を実ファイル名（1 始まり）に一致

### Phase F1: チャンク詳細 UI
- `322ae3e` `src/shared/chunkReport.ts`（manifest × trans.txt の突き合わせ純粋ロジック）+
  `RecordingChunksPanel.tsx`（PlayerCard 内のチャンク詳細パネル）

## 2. 検証状況

- `npm run verify`: **226 tests passed（17 ファイル）**、tsc clean
- `npm run build`: 成功（既知の警告 3 件のみ）
- KamoX E2E（`scripts/kamox-e2e.mjs`）: **20 pass / 0 fail**（+ WARN 1 件、後述）
  - 実機確認済み: manifest の `estimatedDurationSeconds` 12.304秒 =
    trans.txt の `duration` 12.304秒（SSOT 統一の証明）
  - chunk 合計 235,311 bytes = mp3 と一致（追記が壊れていない証明）

## 3. 実機検証で見つけた不具合と対応

| # | 内容 | 対応 | 状態 |
|---|---|---|---|
| 1 | 2025年ビルドの古い exe が起動されていた（`app.getAppPath()` が `dist/` を指すため探索が全滅 → stale onefile にフォールバック → chunkNumber が返らず文字起こし全滅） | `projectRoot` を明示化、候補を純粋関数化、旧 onefile を候補から永久除外・削除、回帰テスト 10 件 | 修正済み（`17200f5`） |
| 2 | 長時間録音でレンダラ main thread が飽和し停止ボタンが効かなくなる（pending 353 件、MP3 16.7MB まで膨張） | `ChunkViews.tsx`（React.memo + 表示 200 件上限） | 修正済み（`17200f5`）。実測 15秒録音が 15.8秒で停止 |
| 3 | manifest の chunkNumber（0 始まり）と実ファイル名（1 始まり）の不整合 | manifest は実ファイル名の値をそのまま記録、検証は単調増加に変更 | 修正済み（`058ce74`） |
| 4 | 「録音停止直後の chunk_result が捨てられる竞态」との診断 | **誤診だった。**ログ精査で原因は完全無音（coverage 0.0s×4）と判明。text 空 → trans.txt 未生成は仕様 | 訂正済み（`978e11c` に明記） |

## 4. 未コミットの作業（2026-10-05 時点）

- `scripts/kamox-e2e.mjs`: チャンク詳細パネルの E2E 検証（`checkChunkPanel`、`readManifestChunks`、cleanup のディレクトリ対応）
- `src/renderer/components/LeftPanel/SimpleFileList.tsx`: ファイル行に `file-list-item` クラス付与（E2E の操作用フック）
- ローカル専用（コミット対象外）: `.claude/settings.local.json`、`dist/*`、` .claude/project-mixer-hook.cjs`、`.opencode/`

## 4.5 追加フェーズ（2026-11-15、Devin）

### F1 追完コミット
- `802c39c` 未コミットだった chunk パネル E2E（checkChunkPanel + file-list-item フック）と kamox 0.1.12 を確定

### 孤児クリーンアップ
- `3ad66d5` tsx 削除後に残った CSS-only ディレクトリ（AudioWorkletTest / ToneRecorderTest /
  AudioFileCard）と types/tone.d.ts を削除

### Phase G1: main.ts の起動専用化
- `63daf2b` main.ts 1,684 → 232 行。構成:
  - `main/` … 起動・ウィンドウ・ライフサイクルのみ
  - `main/ipc/` … handle.ts（既存）+ context.ts + register.ts + ドメイン別 7 ファイル
    （dialog / window / files / settings / transcription / speech / models）
  - `main/services/` … appLog（writeLog）、workspace（許可ルート・settings.json）、
    modelStore（モデル配置・検証・DL）、whisperClient（WS 1往復の足回り）、
    whisperServer（isPortInUse / resolveDevPython も移管、Electron非依存のまま）
- 挙動の意図的変更点:
  - whisperCall で終了時にソケットを必ず close（此前は server error 経路で未クローズのまま残り得た）
  - models:cancelDownload の cancelledDownloads（読み取り先が無い Set）を除去
- 死亡コード除去: getTranscriptionPath、generateAIChatFileContent / parseAIChatFileContent、
  未使用 import（ipcMain / execSync / ChildProcess / SpawnOptions / aiChatPathFor）
- 検証: `npm run verify`（tsc clean + 226 tests）/`npm run build` 共に通過

### Phase G2: renderer feature 再編 + AppContext 解体（607ed63〜）

- **G2a AppContext 解体**（`607ed63`）:
  - `fileList`/`setFileList` → 新設 `LibraryContext`
  - `recordingFile` → RecordingContext に統合（生成元が所有）
  - `currentModel` → SettingsModal のローカル state に降格（参照者がそこだけ）
  - dead state 削除: `selectedFile`・`transcriptionDisplayData`（書き込み専用）、
    `isRecording`/`isPlaying`/`isTranscribing`（実状態は RecordingContext・PlayerCard ローカルが持つ）
  - App.tsx は Provider 合成のみに（Settings → Library → Recording → Tab）
- **G2b feature-based 再編**: `components/`・`contexts/`・`audio/`・`services/`・`utils/`・`types/` を解体し:
  - `renderer/app/` … index.tsx/index.html, App.tsx, シェルUI (TitleBar/MainLayout/MainControlPanel)
  - `renderer/features/{library,player,recording,models,settings,tabs}/` … ドメイン別
  - `renderer/shared/` … TextDisplay, utils(Logger系), config, types
  - 境界越えの import は `@renderer/` エイリアスに統一、同一 feature 内は `./` 相対
  - webpack.renderer.config.js の entry/template を `app/` 配下に変更
  - CLAUDE.md の構成記述・配置基準を新構造に更新
- 検証: `npm run verify`（tsc clean + 226 tests）/`npm run build` 共に通過
- 注: SettingsModal の `currentModel` は `'small'` 初期値のローカル state（元の AppContext と同等）。
  `settings.transcription.model` との二重管理は残課題

### Phase G3: IPC 型付き契約

- `src/shared/ipcContract.ts` 新設: 全30 invoke チャンネルの req/res と
  2 push イベント（speech:serverStatus / models:downloadProgress）のペイロードを定義
- `ipc/handle.ts` の handle() を `keyof IpcContract` ジェネリック化。
  契約外チャンネル名・シグネチャ不一致はコンパイルエラーになる
- preload api.ts: 型付き `invoke()`/`subscribe()` ヘルパで全呼び出しを契約検査
- ElectronAPI: 汎用 `on`/`removeListener` を削除し `onModelDownloadProgress` を追加。
  `onSpeechServerStatus`/`onModelDownloadProgress` は購読解除関数を返す
- `speech:transcribe` の res を `unknown` → `TranscriptionResult` に確定
- `file:*` の wire バイナリ型を `Buffer` → `Uint8Array` に（Buffer は Uint8Array の部分型）
- `models:downloadProgress` 送信 payload を `ModelDownloadProgressEvent` で型付け
- 検証: `npm run verify`（tsc clean + 226 tests）/`npm run build` 共に通過
- ~~既知の残課題: `models:removeModel` の実引数はモデルIDではなくモデルルートパス~~
  → `c2e868d` で修正（getModelPath を models--<org>--<name> へ + main 側ガード）

### Phase T1: 録音周りのテスト拡充（v2改修計画の前倒し安全網）

- 過去の実害（exe誤起動・レンダラ飽和・manifest番号ズレ・WS障害）を踏まえ、
  録音パイプラインの振る舞いを担保するテストを追加（226 → 269 tests）
- `tests/unit/RecordingContext.test.tsx`（10件）:
  AudioWorkletRecordingService / AdvancedRecordingFileService をモック化し、
  開始→チャンク保存→文字起こし追記→停止の全経路を検証。
  「保存失敗・文字起こし失敗でも録音は継続する」不変条件を固定
- `tests/unit/transcriptionWebSocket.test.ts`（12件）:
  FakeWebSocket で接続・送信形式・chunkNumber 紐付け・切断・再接続を検証。
  chunkNumber 欠落時は「推測しないで onError」になることを固定
- `tests/unit/fileLibrary.test.ts`（16件）:
  分類・ペアリング（純粋関数）+ listFiles を実 tmp ディレクトリで統合検証
- `tests/unit/modelRemove.test.ts`（5件）:
  removeModel バグの回帰防止（renderer のパス解決 + main の rm ガード）
- 検証: `npm run verify`（tsc clean + 269 tests）通過

### Phase T2: Electron 28(EOL) → 45.3.2 更新

- electron: `^28.1.0` → `^45.3.2`（Node 22 / Chromium 同梱の最新安定）
- electron-builder: `^24.13.3` → `^26.18.0`（新 Electron とのパッケージング互換）
- API 追従（影響箇所は2箇所のみ）:
  - `console-message`: 位置引数 → イベントオブジェクト形式（E35 非推奨・E47 削除予定）
  - `crashed` イベント → `render-process-gone`（E33 非推奨・削除済み）
- 検証: tsc clean / 269 tests / build / 起動スモーク
  （レンダラー描画・ファイル一覧・Whisper サーバー自動起動まで実動作確認）
- 残課題:
  - `npm audit` 62件（5 critical）は推移的依存由来が中心。別途棚卸し要
  - KamoX 実機 E2E は未実行。録音・デスクトップ音声の実機確認を推奨
  - macOS で desktopCapturer 音声を使う場合は Info.plist に
    `NSAudioCaptureUsageDescription` が必要（E39 〜。Windows 主体なら後回し可）
  - `ws` パッケージは Node 22 のネイティブ WebSocket で置き換え可能（任意）

## 4b. v2 改修計画（doc/KoeNote v2 改修計画.txt の実施状況）

### Phase 0: 設計（完了）

- `001410e` `doc/v2-phase0-design.md` — v2 アーキテクチャ・スキーマ・互換ポリシーの設計
- `51d9cc5` 未決事項を確定:
  - session-id: `YYYYMMDD_HHMMSS_<rand4>`
  - desktop 個別トラック → Phase 2（スキーマは `sources[]` で拡張余地あり）
  - renderer→main→WS 移行 → Phase 2（Phase 1 は既存 WS を継続利用）
  - WAV サンプルレートは設定で選択可能
  - lamejs はエクスポート用途のみに縮小
- `3e1cc9f` `doc/research-speechcpp.md` — speech.cpp スパイク調査
  （OpenAI 互換 HTTP で TranscriptionEngine ポートに適合することを実測確認。
  parakeet-ja q8_0 で 3s チャンク HTTP 往復 ~200ms）

### Phase 1: 録音・保存基盤

| Step | 内容 | 状態 |
|---|---|---|
| 1 | `shared/session.ts` + `shared/transcript.ts`（`4f54987`、+41 tests） | 完了 |
| 2 | main 側 fs `sessionStore.ts` + `sessions:*` IPC | 完了（下記） |
| 3 | renderer `IpcSessionStore` + RecordingContext を usecase 経由に | 完了（下記） |
| 4 | fileLibrary を sessions/ 読み対応に拡張 | 完了（下記） |
| 5 | 旧書き込み経路（AdvancedRecordingFileService）削除 | 未着手 |

#### Step 2 の内容

- `src/main/services/sessionStore.ts` — Electron 非依存の fs 実装（rootDir 注入）。
  チャンク tmp→rename・session.json 原子書き込み・ID 検証（SAFE_ID）・
  読み出し時の interrupted 正規化（クラッシュ復旧）
- `src/main/ipc/sessions.ts` — `sessions:create/appendChunk/update/saveTranscript/
  list/load/loadTranscript` の7チャンネル（typed `handle()` 契約準拠）
- `src/shared/ipcContract.ts` — 上記契約 + `SessionAppendChunkRequest` /
  `SessionUpdateRequest`
- `src/shared/types.ts` / `src/preload/api.ts` — `session*` メソッド追加。
  chunk の data は renderer 側 Blob/ArrayBuffer → wire 上 Uint8Array に preload で変換
- `tests/unit/sessionStore.test.ts` — 23 tests（作成・一覧・連番・複数ソース・
  transcript roundtrip・パストラバーサル拒否・破損スキップ・interrupted 正規化）
- 実装中に検出・修正したバグ:
  - 読み出し正規化が書き込み経路に漏れて state を interrupted 汚染する
    → `loadSessionRaw`（内部用）と `loadSession`（正規化）を分離
  - `appendSessionChunk` の戻り値が Windows で `\` 区切りになる
    → POSIX 相対パスで返すよう修正
- 検証: `npm run verify`（tsc clean + 333 tests）・`npm run build` 通過

#### Step 3 の内容（dual-write 移行）

- `features/recording/ports/SessionStore.ts` — 永続化ポート（注入用 IF）
- `features/recording/usecases/RecordingSession.ts` — Electron 非依存の
  オーケストレーション。chunk offset/duration の連続採番、
  タイミング未到着の transcription 結果のペンディング→後追い、
  finalize で transcript completed + セッション締め
- `features/recording/services/IpcSessionStore.ts` — ポートの実装
  （window.electronAPI の session* を呼ぶ）
- `RecordingContext` — 録音開始時に RecordingSession を起動し、
  chunk/transcription/stop を旧 manifest 経路と並走して書く（dual-write）。
  旧経路は Step 4（library の sessions 読み対応）→ Step 5 で削除する
- `tests/unit/recordingSession.test.ts` — 8 tests（インメモリ SessionStore 注入）
- `tests/unit/RecordingContext.test.tsx` — +7 tests（IpcSessionStore モック化し
  セッション呼び出し・失敗時の録音継続を検証）
- 実装中に検出・修正したバグ:
  - startRecording 末尾の `errors: []` リセットが開始処理中に記録した
    エラー（セッション作成失敗等）を消していた
    → 開始時に先にクリアし、末尾は prev.errors を引き継ぐよう修正
- 検証: `npm run verify`（tsc clean + 348 tests）・`npm run build` 通過

#### Step 4 の内容（sessions/ の読み対応）

- `shared/types.ts` — `AudioFile` に `isSession` / `sessionId` を追加
- `sessionStore.ts` — `readSessionAudio(dir)` 追加。再生用にチャンクを結合:
  - mp3 はそのまま連結、wav は 44byte ヘッダを後続チャンクから除去し
    PCM 連結 + 先頭 RIFF ヘッダのサイズを書き換え
- `fileLibrary.ts` — `listFiles` で `<workspace>/sessions` を `listSessions` で走査し、
  セッションを `AudioFile`（`isSession: true`、filepath=セッションディレクトリ、
  transcript 参照からは `transcripts/<id>.json` の絶対パス）として旧形式と混在ソート
- `ipc/files.ts` — `file:loadAudio` がディレクトリを検出したら `readSessionAudio` で
  再構築し `data:<mime>;base64,...` を返す
- `ipc/transcription.ts` — `transcription:load` が `.json` を検出したら
  `parseTranscript` で読み `TranscriptionFile` 形に変換（renderer は既存型のまま）
- `MetadataParser.ts` — `parseTranscriptionFile` が `.json` 対応。
  v2 セグメントは実値の start/end をそのまま使い表示セグメントへ変換
- テスト: `fileLibrary.test.ts` +3（セッション列挙・transcript ペア・旧形式と並存）、
  `sessionStore.test.ts` +3（mp3 連結・wav ヘッダ書き換え・空セッションでエラー）
- 検証: `npm run verify`（tsc clean + 354 tests）・`npm run build` 通過

## 5. 現在のプロセス状態（2026-10-05 記録時）

- KamoX: 起動中（port 3000 で listen 確認、window 未確認）
- electron: 4 プロセス（= アプリ 1 インスタンス相当）
- whisper-server: 0（アプリ起動直後の可能性。要確認: KamoX 経由で status を見ること）

## 6. 残作業

1. **チャンク詳細パネルの E2E WARN 解消**（優先）: 旧録音を開けなかった
   （`advanced_recording_2025-08-03T16-59-57.mp3`）。ファイル行クリックの
   セレクタ（`:has-text`）を再ビルド後に再実行して確認する
2. ~~未コミット 2 ファイルのコミット~~ → `802c39c` で済
3. Phase F の次: F2（未文字起こしチャンクの再文字起こし、`selectMissingChunkNumbers` は用意済み）、F3（mp3 の再構成）
4. E2E の CI 組み込み（`npm run verify` とは別フローで固定する案あり）
5. G 系の残り:
   - ~~G2: renderer の feature 再編 + AppContext（god context）解体~~ → Phase G2 で済
   - ~~G3: IPC 型付き契約（shared に req/res 型。preload/main を契約準拠に）~~ → Phase G3 で済
   - 基盤: Electron 28(EOL) 更新、lamejs scriptタグ読み込み → ESM import 化、（任意で electron-vite）
   - whisper-server: pyproject.toml の pyinstaller → dev 移動、asyncio-mqtt 要否確認

## 7. 運用メモ

- 長時間コマンドは 1 回の呼び出し内で sleep しない。バックグラウンド起動＋短時間ポーリングに統一する
- コミットはソース・スクリプト・テストのみ。`dist/`、`.claude/`、`.opencode/` はステージしない
- KamoX の `isVisible` 系 action は要素が無くても success を返す no-op 実装。存在判定は `/check-ui` の DOM スナップショットで行う
- E2E はアプリの状態（開いているタブ、アコーディオン開閉）に依存するため、DOM スナップショットで現在状態を調べて冪等に操作する
