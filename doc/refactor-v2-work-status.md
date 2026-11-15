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
