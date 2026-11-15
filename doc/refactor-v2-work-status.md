# 作業状況: refactor/architecture-v2（Phase A〜F1）

最終更新: 2026-10-05
ブランチ: `refactor/architecture-v2`
HEAD: `322ae3e feat(Phase F): 録音のチャンク詳細 UI を追加（F1）`

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

## 5. 現在のプロセス状態（2026-10-05 記録時）

- KamoX: 起動中（port 3000 で listen 確認、window 未確認）
- electron: 4 プロセス（= アプリ 1 インスタンス相当）
- whisper-server: 0（アプリ起動直後の可能性。要確認: KamoX 経由で status を見ること）

## 6. 残作業

1. **チャンク詳細パネルの E2E WARN 解消**（優先）: 旧録音を開けなかった
   （`advanced_recording_2025-08-03T16-59-57.mp3`）。ファイル行クリックの
   セレクタ（`:has-text`）を再ビルド後に再実行して確認する
2. 未コミット 2 ファイルのコミット（1 の確認後）
3. Phase F の次: F2（未文字起こしチャンクの再文字起こし、`selectMissingChunkNumbers` は用意済み）、F3（mp3 の再構成）
4. E2E の CI 組み込み（`npm run verify` とは別フローで固定する案あり）

## 7. 運用メモ

- 長時間コマンドは 1 回の呼び出し内で sleep しない。バックグラウンド起動＋短時間ポーリングに統一する
- コミットはソース・スクリプト・テストのみ。`dist/`、`.claude/`、`.opencode/` はステージしない
- KamoX の `isVisible` 系 action は要素が無くても success を返す no-op 実装。存在判定は `/check-ui` の DOM スナップショットで行う
- E2E はアプリの状態（開いているタブ、アコーディオン開閉）に依存するため、DOM スナップショットで現在状態を調べて冪等に操作する
