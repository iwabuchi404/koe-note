/**
 * モデルカタログ（src/shared/models.json）の整合性テスト
 *
* このファイルの正は「1枚だけ」である。以前は4箇所に同じモデル一覧が
 * あり、AIが main.ts の MODEL_CONFIGS を正規表現でスクレイプする
 * スクリプト（scripts/verify-model-consistency.ts）で一致性チェックを
 * 依存していた（そのスクリプトは14件の偽のエラーを報告していた）。
 *
 * 定義が1枚になったことで、保証すべきことは単純になる。
 */
import { describe, it, expect } from 'vitest'
import {
  MODEL_CATALOG,
  MODEL_CATALOG_BY_ID,
  findModelById,
  findModelByRepo,
  repoToFolder,
  folderToRepo,
  getRecommendedModelId,
  formatModelSize
} from '@shared/modelCatalog'
import catalogJson from '@shared/models.json'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('モデルカタログ', () => {
  it('空でない', () => {
    expect(MODEL_CATALOG.length).toBeGreaterThan(0)
  })

  it('id が重複しない', () => {
    const ids = MODEL_CATALOG.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('serverModelName が重複しない（サーバーの許可リストとして一意）', () => {
    const names = MODEL_CATALOG.map((m) => m.serverModelName)
    expect(new Set(names).size).toBe(names.length)
  })

  it('huggingFaceRepo が重複しない', () => {
    const repos = MODEL_CATALOG.map((m) => m.huggingFaceRepo)
    expect(new Set(repos).size).toBe(repos.length)
  })

  it('各項目が取り漏れなく揃っている', () => {
    for (const model of MODEL_CATALOG) {
      expect(model.id, 'id').toBeTruthy()
      expect(model.serverModelName, `${model.id} serverModelName`).toBeTruthy()
      expect(model.huggingFaceRepo, `${model.id} repo`).toMatch(/^[^/]+\/.+$/)
      expect(model.files.length, `${model.id} files`).toBeGreaterThan(0)
      expect(model.sizeBytes, `${model.id} sizeBytes`).toBeGreaterThan(0)
      expect(model.name, `${model.id} name`).toBeTruthy()
      expect(model.license, `${model.id} license`).toBeTruthy()
    }
  })

  it('モデルは必ず model.bin を含む（Whisperの重み）', () => {
    for (const model of MODEL_CATALOG) {
      expect(model.files, `${model.id}`).toContain('model.bin')
      expect(model.files, `${model.id}`).toContain('config.json')
    }
  })

  it('推奨モデルは1つだけ', () => {
    const recommended = MODEL_CATALOG.filter((m) => m.recommended)
    expect(recommended.length).toBeLessThanOrEqual(1)
  })

  it('id検索とrepo検索が整合する', () => {
    for (const model of MODEL_CATALOG) {
      expect(findModelById(model.id)?.huggingFaceRepo).toBe(model.huggingFaceRepo)
      expect(findModelByRepo(model.huggingFaceRepo)?.id).toBe(model.id)
    }
  })

  it('未知のidはnull（例外を出さない）', () => {
    expect(findModelById('no-such-model')).toBeNull()
    expect(findModelByRepo('no/such-repo')).toBeNull()
  })

  it('推奨モデルのidが実際に存在する', () => {
    expect(MODEL_CATALOG_BY_ID.has(getRecommendedModelId())).toBe(true)
  })
})

describe('HuggingFace キャッシュフォルダ名の変換', () => {
  it('repo → フォルダ名', () => {
    expect(repoToFolder('Systran/faster-whisper-small')).toBe('models--Systran--faster-whisper-small')
    expect(repoToFolder('kotoba-tech/kotoba-whisper-v2.0-faster')).toBe(
      'models--kotoba-tech--kotoba-whisper-v2.0-faster'
    )
  })

  it('フォルダ名 → repo（逆変換）', () => {
    for (const model of MODEL_CATALOG) {
      expect(folderToRepo(repoToFolder(model.huggingFaceRepo))).toBe(model.huggingFaceRepo)
    }
  })
})

describe('サイズ表記', () => {
  it('MB / GB に切り替える', () => {
    expect(formatModelSize(39 * 1024 * 1024)).toBe('39MB')
    expect(formatModelSize(3.1 * 1024 * 1024 * 1024)).toBe('3.1GB')
  })
})

describe('Python 側との整合', () => {
  /**
   * Python 側は同じJSONを runtime に読む。開発環境では
   * リポジトリルートを指すため、spec への同梱が漏れていても
   * テストで気づける。
   */
  const pythonCatalogPath = join(
    process.cwd(),
    'src',
    'shared',
    'models.json'
  )

  it('Python が読むファイルが同じ内容である', () => {
    const fromFs = JSON.parse(readFileSync(pythonCatalogPath, 'utf-8'))
    expect(fromFs).toEqual(catalogJson)
  })
})

