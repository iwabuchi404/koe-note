# モデルダウンロード機能 実装プラン

## 1. 目的とスコープ

- Whisper モデルをユーザー環境にオンデマンドでダウンロード・管理できるようにする。
- 配布パッケージから大容量モデルを除外したため、UI からの取得・更新・削除を完結させる。
- 対象は Electron パッケージ版・開発版双方。Windows を主軸に、将来的に macOS / Linux 展開も見据える。

## 2. 現状の実装スナップショット

### 2.1 UI / フロントエンド

- `ModelManager` / `ModelDownloader` / `ModelStatus` コンポーネントで UI 骨格は実装済み。
- `ModelDownloader` は `modelDownloadService.downloadModel()` を呼び出し、進捗 UI・キャンセル UI を持つ。
- インストール済みモデル一覧を取得し、タブ切り替えでインストール／管理画面を切り替え可能。

### 2.2 レンダラサービス (`ModelDownloadService.ts`)

- 主要なエントリメソッド（一覧取得・ダウンロード・キャンセル・削除）を提供。
- `downloadModel()` は進捗コールバック対応済みで、`window.electronAPI.downloadWhisperModel(modelId)` を呼び出し。
- インストール済み判定やリスト更新は未完。`installedModels` セットは作成されるが、`getModelPath()` が最終ディレクトリと整合しない。

### 2.3 IPC / Main プロセス (`src/main/main.ts`)

- `models:getModelsPath` / `models:getInstalledModels` / `models:downloadWhisperModel` / `models:removeModel` などの IPC ハンドラが存在。
- `downloadWhisperModel` は Hugging Face から個別ファイルを順次ダウンロードし、`event.sender.send('models:downloadProgress', …)` で進捗イベントを送信。
- 書き込み先は `process.cwd()/whisper-server/models` 固定。パッケージ版では書き込み不可（読み取り専用）になる恐れがある。
- ダウンロード先ディレクトリは `models--<repo>` フォーマットだが、レンダラ側は `modelsPath/<modelId>` を想定しており非整合。

### 2.4 ファイル構造

- 期待する Hugging Face 互換構造（`models--<repo>/snapshots/main/<files>`）を作成中。
- ただし `.gitattributes` 相当の `refs/main` / `blobs` などは未作成。faster-whisper のローダーが必要とする構造が未検証。

### 2.5 既知課題

1. **保存先パスの不整合**
   - 開発モード：`<project>/whisper-server/models`。
   - 製品版：`resources`/`whisper-server/models` を返しているが、署名済み exe 配下は書き込み不可。

2. **データ構造の整合性**
   - faster-whisper のモデル読み込みには `models--<repo>/snapshots/<hash>/…` 以外にも `refs/main` や `blobs` が必要なケースがある。
   - ダウンロード後のファイル配置と `whisper-server` 側のロードロジック（Python）が未統合。

3. **インストール状態判定**
   - `ModelDownloadService` は `installedModels` をハードに保持するだけで、ディスクスキャン結果との同期が取れていない。
   - `models:getInstalledModels` から返る値は `<org>/<model>` 形式で、UI 期待値と差異がある。

4. **キャンセル / 再開処理**
   - `cancelDownload` はレンダラ側 Set のみクリアしているが、実際の HTTP リクエストを abort する実装が未実装。
   - ダウンロード中断時に破損ファイルを削除する処理も未整備。

5. **ダウンロード検証**
   - `checksum` フィールドは定義済みだが未使用。完全性検証が行われていない。

6. **モデル削除 / ModelSelector 連携**
   - UI から削除後、`ModelSelector` など既存のモデル選択 UI に反映させる連携が未実装。
  
7. **UX / エラーハンドリング**
   - ネットワーク切断・再開、ストレージ不足、ディスク書き込み失敗に対するメッセージが未整理。

8. **外部配布元依存**
   - Hugging Face 上のリポジトリ構成 / URL 変更・配布停止のリスクがある。
   - モデルライセンス遵守のための同意取得、第三者配布禁止モデルへの対応が未設計。

## 3. 実装要件まとめ

1. **保存ディレクトリ**
   - 開発：`<project-root>/whisper-server/models`（現状維持）
   - 製品版（ポータブル版のみ）：`process.env.PORTABLE_EXECUTABLE_DIR` を基点とし、`<exe と同じフォルダ>/models` を標準保存先とする。
   - 将来インストーラー版を導入する際は `app.getPath('userData')/models` 等へ切り替える案を別途検討。

2. **ダウンロードワークフロー**
   - モデルメタ情報（ファイル一覧・サイズ・チェックサム）を定義ファイル化する。
   - Main プロセスで HTTP(S) ダウンロード、レンダラは進捗イベント購読。
   - 中断時の再開（Range リクエスト）までは不要、ただし再試行で上書きされるようにする。

3. **ファイル配置統一**
   - faster-whisper 期待フォーマットに合わせたフォルダ構造を生成。
   - `refs/main` など必要なファイルを生成しておく。
   - Python 側 `whisper_server` でのモデル検索パス（`MODELS_ROOT = ...`) を確認・補正。

4. **状態同期**
   - ダウンロード完了後に `modelDownloadService` の内部キャッシュを更新。
   - `models:getInstalledModels` の戻り値を `modelId` ベースにマッピング（`repo -> id` の対応表が必要）。
   - アプリ起動時にディスクをスキャンして反映。

5. **エラーハンドリング / UI**
   - ネットワーク例外をユーザーに提示。
   - ストレージ不足時は `%free space%` を取得して警告。
   - 進捗 0% のまま一定時間経過した場合のタイムアウトなどを検討。

6. **テスト・検証**
   - 単体: ダウンロード関数のモックテスト。
   - 結合: 開発モードでのダウンロード→モデル適用→削除動作。
   - パッケージ版: `npm run dist` 後の exe でダウンロードが可能かを E2E 手順化。

## 4. 詳細実装プラン

### フェーズ 1: 基盤整備

1. **パス管理統合**
   - Main プロセスで `const modelsRoot = resolveModelsRoot()` とする。
     - 開発モード：`<project-root>/whisper-server/models`
     - ポータブル exe：`process.env.PORTABLE_EXECUTABLE_DIR` を基点に `models` フォルダを作成
   - `downloadWhisperModel` / `getInstalledModels` / `removeModel` すべてで同じ `modelsRoot` を利用。

2. **リポジトリ→ID マッピング**
   - `ModelDownloadService` 又は共通モジュールに `MODEL_CONFIG` を定義し、`id`, `repo`, `files`, `checksum` を持たせる。
   - Main 側 `modelConfigs` と同期させ、`modelId` を渡せば十分なようにする。
   - `getInstalledModels` は `modelsRoot/models--repo` を `modelId` に変換してレンダラへ返す。

3. **ファイル構造生成ヘルパー**
   - `downloadWhisperModel` 内で `refs/main`・`snapshots/main` 等のディレクトリ・メタファイルを作成。
   - 必要な場合は `blobs/<hash>` 形式も生成。（faster-whisper の参照を調査し、必要な最小セットをドキュメント化）

4. **AbortController 対応**
   - `modelDownloadService` が `AbortController` を保持し、IPC へ `models:cancelDownload` を送る仕組みを追加。
   - Main 側で HTTP リクエストを `req.abort()` できるよう、`downloadFile` 関数を Promise + Abort 対応に書き換え。

### フェーズ 2: UI/UX 拡充

1. **ダウンロード進捗詳細**
   - 現状速度・ETA はダミー。`downloadFile` から受け取る `chunk.length` と経過時間で計算。
   - 進捗イベント payload に `bytesDownloaded` / `totalBytes` / `speed` / `eta` を含める。

2. **ダウンロード再試行 / 自動再開**
   - エラー時に「再試行」ボタンを表示。
   - 中断した場合にテンポラリファイルを削除し、一貫した状態に戻す。

3. **インストール済みモデルの情報表示**
   - `ModelStatus` にモデルサイズ・更新日時・保存先ディレクトリを表示。
   - ディスク容量確認ボタンなどの UX 改善を追加。

### フェーズ 3: 連携と検証

1. **Whisper サーバー側の対応**
   - Python 側 `whisper-server` が新しい `modelsRoot` を参照するよう設定（環境変数 or 設定ファイル）。
   - モデル切り替え UI (`Transcription/ServerControl/ModelSelector`) がダウンロード済みモデルを反映できるようにする。

2. **テレメトリ・ログ**
   - `writeLog` を活用し、ダウンロード開始/完了/失敗を記録。
   - UI から閲覧できる「モデルダウンロードログ」を提供するとデバッグが容易。

3. **E2E テスト**
   - Playwright などで「モデルダウンロード→音声認識」を自動化。（ネットワーク依存のためモック or スタブ）

## 5. テスト戦略

| 観点 | 内容 |
|------|------|
| 単体テスト | `downloadFile` の正常系 / 失敗系、パスユーティリティ、`ModelDownloadService` のステート更新 |
| 結合テスト | 開発環境でのダウンロード～モデル削除の手動テスト手順書を整備 |
| パッケージテスト | ポータブル版でダウンロードが可能か、ディスク書き込み権限の問題が無いかを検証 |
| 回帰テスト | 音声認識（リアルタイム/ファイル両方）でダウンロード済みモデルが選択・利用できるか |

## 6. 未確定事項 / 追加検討ポイント

1. **ダウンロードソース**
   - Hugging Face 直ダウンロードで問題なければ継続。ただし帯域制限がある場合はミラー／キャッシュを検討。

2. **チェックサム・署名**
   - 現状 `checksum` 値が未設定。公式 SHA256 を記載し、ダウンロード完了後に検証してからインストール完了扱いにする。

3. **設定永続化**
   - 将来的に「モデル保存先」をユーザー設定と連動させるか検討。

4. **UI 文言 / ローカライズ**
   - 最終的に日本語 UI へ切り替える必要あり（現在は英語表記が混在）。

5. **将来的なインストーラー版対応**
   - 現時点ではポータブル版のみサポートするが、ユーザーからの要望や企業利用時の要件によってはインストーラー版の導入を再検討する可能性がある。
   - インストーラー版を追加する際は、保存先やアップデート機構（electron-updater など）の再設計が必要。

## 7. ライセンス / 配布ポリシー検討

1. **Hugging Face からのダウンロード可否**
   - 現在参照している `Systran/faster-whisper-*` や `kotoba-tech/kotoba-whisper-*` モデルは MIT 等の寛容ライセンスが明記されていることを確認済み。ただしモデル配布者のライセンス変更や利用条件追加の可能性がある。
   - ダウンロード前にライセンス URL を UI 上で確認できるようにし、ユーザーに明示的な同意（チェックボックス等）を求めることが望ましい。
   - 製品ドキュメント／README に「外部提供モデルをダウンロードする」旨とライセンス遵守の責任がユーザーにあることを記載する。

2. **URL / 構成変更への備え**
   - モデル情報（ファイル一覧、URL、Checksum）はアプリ内にバージョン管理されたメタデータとして保持し、変更時には更新すべきポイントを明確化。
   - Hugging Face 側で構造が変わった場合に備え、ダウンロード実装はリトライ／フォールバック（例：`resolve/main` → `raw/main`）をサポート。
   - 長期的には公式ミラーまたは社内 CDN を用意し、信頼性を高めることも検討。

3. **再配布禁止モデルへの対応**
   - 将来的にライセンスが CC-BY-NC 等へ変わった場合、商用利用可否が変わる可能性がある。モデル情報定義に `licenseUrl` / `allowCommercialUse` などのフィールドを追加しておく。
   - 禁止モデルをダウンロードできないようにトグル制御する仕組みを用意。

4. **証跡 / バージョン管理**
   - ダウンロードしたモデルのバージョン・チェックサム・取得日時を `metadata.json` として保存し、トラブルシューティングや法的証跡に利用。
   - 用途に応じてダウンロードログをエクスポート可能にしておくと安心。

---

このドキュメントは実装チーム・レビューア向けのガイドであり、今後の進捗に合わせて更新予定。実装担当 AI へは、上記フェーズ順にタスクを割り当てることを推奨する。


