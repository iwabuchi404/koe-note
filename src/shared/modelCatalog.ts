/**
 * モデルカタログ（src/shared/models.json）の型と補助関数
 *
 * この1枚がモデル定義の唯一の正（SSOT）。TS側（main / renderer）と
 * Python 側（whisper-server）の双方がこれを参照する。
 *
 * 此前は同じモデル一覧が4箇所に定義され、3種類の記法が混在していた。
 *   - src/main/main.ts の MODEL_CONFIGS（HuggingFace のファイル一覧を持つ）
 *   - src/renderer/config/models.json（表示用）
 *   - src/renderer/types/ModelTypes.ts の AVAILABLE_MODELS（3件のみ・古い）
 *   - whisper-server/src/whisper_server/config.py の MODEL_SIZES（許可リスト）
 * そのせいで「ダウンロードできる7モデルのうち4つと、renderer の
 * デフォルト値がサーバー側で拒否される」状態になっていた。
 */
import catalogJson from './models.json'

export interface ModelCatalogEntry {
  /** アプリ内で使う一意識別子 */
  id: string
  /** Python サーバーに渡す名前（WhisperModel が受け取る識別子） */
  serverModelName: string
  /** HuggingFace のリポジトリ（<org>/<name>） */
  huggingFaceRepo: string
  name: string
  description: string
  sizeBytes: number
  /** モデル本体として必要なファイル（リポジトリ内の相対パス） */
  files: string[]
  license: string
  licenseUrl: string
  /** 推奨モデルか */
  recommended?: boolean
}

export const MODEL_CATALOG = catalogJson as ModelCatalogEntry[]

/** id → カタログ項目 */
export const MODEL_CATALOG_BY_ID: ReadonlyMap<string, ModelCatalogEntry> = new Map(
  MODEL_CATALOG.map((entry) => [entry.id, entry])
)

/** id に該当するカタログ項目。未知の id なら null */
export function findModelById(modelId: string): ModelCatalogEntry | null {
  return MODEL_CATALOG_BY_ID.get(modelId) ?? null
}

/** HuggingFace の repo → カタログ項目 */
export function findModelByRepo(repo: string): ModelCatalogEntry | null {
  return MODEL_CATALOG.find((entry) => entry.huggingFaceRepo === repo) ?? null
}

/**
 * HuggingFace の repo をローカルキャッシュのフォルダ名に変換する
 * Systran/faster-whisper-small → models--Systran--faster-whisper-small
 */
export function repoToFolder(repo: string): string {
  return `models--${repo.replace(/\//g, '--')}`
}

/** キャッシュフォルダ名 → HuggingFace の repo */
export function folderToRepo(folderName: string): string {
  return folderName.replace(/^models--/, '').replace(/--/g, '/')
}

/** 推奨モデル。未定なら先頭のモデル */
export function getRecommendedModelId(): string {
  return MODEL_CATALOG.find((entry) => entry.recommended)?.id ?? MODEL_CATALOG[0]?.id ?? 'small'
}

/** バイト数を読みやすい表記にする */
export function formatModelSize(sizeBytes: number): string {
  if (sizeBytes >= 1024 ** 3) return `${(sizeBytes / 1024 ** 3).toFixed(1)}GB`
  return `${Math.round(sizeBytes / 1024 ** 2)}MB`
}
