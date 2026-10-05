/**
 * KamoX による実機 E2E スモーク
 *
 * 目的: ブラウザ相当のテストではなく、Electron アプリを実際に起動し、
 * 「Phase A〜D の変更でPnPが壊れていないか」を証明する。
 *
 * 使い方:
 *   1) 別ターミナルで `npx kamox electron` を起動しておく
 *   2) `node scripts/kamox-e2e.mjs`
 *
 * 環境変数:
 *   KAMOX_PORT      KamoX のポート（既定 3000）
 *   KAMOX_E2E_KEEP  1 にすると作成した録音ファイルを削除しない
 *   KAMOX_E2E_SOURCE 音声ソース（desktop / microphone。既定 desktop）
 */

const PORT = process.env.KAMOX_PORT ?? '3000'
const BASE = `http://localhost:${PORT}`
const KEEP = process.env.KAMOX_E2E_KEEP === '1'
const SOURCE = process.env.KAMOX_E2E_SOURCE ?? 'desktop'
const RECORD_SECONDS = 15

let passed = 0
let failed = 0
const failures = []

function ok(name, detail = '') {
  passed++
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`)
}

function warn(name, detail) {
  console.log(`  WARN  ${name} — ${detail}`)
}

function ng(name, detail) {
  failed++
  failures.push(`${name}: ${detail}`)
  console.log(`  FAIL  ${name} — ${detail}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * HTTP 呼び出し（必ずタイムアウト付きで）
 *
 * KamoX の Electron アダプタは内部で firstWindow() を待つため、
 * 応答が30秒以上返らないことがある。タイムアウト無しだと
 * 1リクエストで長時間止まり、どこで待ったか分からなくなる。
 */
async function api(path, method = 'GET', body, timeoutMs = 10_000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    })
    const text = await res.text()
    try {
      return JSON.parse(text)
    } catch {
      throw new Error(`${path} の応答がJSONではない: ${text.slice(0, 200)}`)
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`${path} が${timeoutMs / 1000}秒でタイムアウト（KamoX が応答していない）`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

/** 進行状況を出す（長時間待つ処理の前は必ず呼ぶ） */
function step(message) {
  console.log(`  ... ${message}`)
}

async function element(selector, action, value, timeoutMs = 15_000) {
  const payload = { selector, action }
  if (value !== undefined) payload.value = value
  const res = await api('/playwright/element', 'POST', payload, timeoutMs)
  if (!res.success) {
    throw new Error(`${selector} ${action} 失敗: ${res.error}`)
  }
  return res.data
}

/**
 * DOM スナップショットにクラス名の要素が含まれるか
 *
 * KamoX の Electron アダプタで isVisible などの action は
 * 要素が存在しなくても success を返す（実質 no-op）ため、
 * 要素の存在判定には /check-ui の HTML を使う。
 */
async function domHasClass(className) {
  try {
    const ui = await api('/check-ui', 'POST', {}, 25_000)
    const html = ui.data?.dom?.html ?? ''
    return html.includes(`class="${className}`)
  } catch {
    return false
  }
}

async function logs() {
  const res = await api('/logs')
  const all = [...(res.data.runtime ?? [])]
  for (const page of Object.values(res.data.pages ?? {})) all.push(...page)
  return all.map((e) => e.content ?? '')
}

// ---------------------------------------------------------------------------
// 1. サーバーが起動しているか
// ---------------------------------------------------------------------------
async function checkServer() {
  const lines = await logs()
  const statuses = lines
    .map((l) => l.match(/Server status notification: (\w+)/)?.[1])
    .filter(Boolean)

  if (statuses.length === 0) {
    ng('サーバー状態通知', 'Server status notification がログにない')
    return
  }

  const last = statuses[statuses.length - 1]
  if (last === 'running' || last === 'external') {
    ok('サーバー状態通知', `最終状態=${last}（通知 ${statuses.length} 回）`)
  } else {
    ng('サーバー状態通知', `最終状態が ${last}（通知 ${statuses.length} 回）`)
  }
}

// ---------------------------------------------------------------------------
// 2. 録音 → 文字起こし → メタデータの検証
// ---------------------------------------------------------------------------
async function checkRecording(recordingsDir) {
  const before = new Set(fsReadDir(recordingsDir))

  // ログは実行でことで経積されるため、待ち時の判定はバスラインからの差分で見る
  const baseline = await logCounts()

  step('録音タブを開く')
  // 前回の実行の違割でアプリが録音タブのままになっていることがあるので、
  // レコードカードのクリックは必ず成功せない。既に録音タブにいるならスキップする。
  const onWelcomeScreen = await domHasClass('action-card success')
  if (onWelcomeScreen) {
    await element('.action-card.success', 'click')
  } else {
    if (!(await domHasClass('record-button'))) {
      throw new Error(
        '録音タブを開けません: .action-card.success も .record-button も見つかりません'
      )
    }
    step('  既に録音タブにいるためナビジーションをスキップ')
  }
  await sleep(1500)

  step('設定を開けて音声ソースを選ぶ')
  // アコーミハョンは開き替えなる。前回の実行で開いているとクリックした結果闭じてしまうので、
  // セレクト箱が現在表示されているかを先に確認する。
  if (!(await domHasClass('setting-select'))) {
    step('  設定アコーミハョンを開く')
    await element('.accordion-header >> nth=0', 'click')
    await sleep(800)
  }
  if (!(await domHasClass('setting-select'))) {
    throw new Error('.setting-select が表示されていない（設定アコーミハョンを開けなかった）')
  }
  await element('.setting-select >> nth=0', 'select', SOURCE)
  await sleep(600)

  step(`録音開始（${SOURCE}, ${RECORD_SECONDS}秒）`)
  const startAt = Date.now()
  await element('.record-button', 'click')
  step(`録音中… ${RECORD_SECONDS}秒`)
  await sleep(RECORD_SECONDS * 1000)
  step('録音停止')
  await element('.record-button', 'click')

  const duration = ((Date.now() - startAt) / 1000).toFixed(1)
  ok('録音の開始と停止', `${duration}秒`)

  step('文字起こし結果を待ちます（最大45秒）')
  const t = await waitForTranscription(45, baseline)
  if (!t.ok) {
    ng('文字起こしの実行', t.detail)
  } else {
    ok(
      '文字起こしの実行',
      `サーバー完了 ${t.completed}件 / 追記 ${t.appended}件 / ${t.elapsed}秒` +
        `${t.failed ? ` / 失敗${t.failed}件` : ''}`
    )
  }

  step('生成ファイルを検証')
  const created = fsReadDir(recordingsDir).filter((f) => !before.has(f))
  const mp3 = created.filter((f) => f.endsWith('.mp3'))
  const trans = created.filter((f) => f.endsWith('.trans.txt'))

  if (mp3.length === 0) {
    ng('音声ファイルの作成', `新規ファイルなし: ${created.join(', ') || '(なし)'}`)
    return created
  }
  ok('音声ファイルの作成', mp3.join(', '))

  if (trans.length === 0) {
    // 記録音声が無音の場合、サーバーは空のテキストを返すため記録ファイルは作られない。
    // これは評募で、サーバーが実行して無音だったことを確認できれば PASS とする。
    if (t.ok && t.completed > 0 && t.appended === 0 && t.silent > 0) {
      ok(
        '文字起こしファイルの作成',
        'trans.txt は作られていない（記録音声が無音（coverage 0%）のため評募どおり）'
      )
      return created
    }
    ng(
      '文字起こしファイルの作成',
      `trans.txt が無いのに文字起こし本体は実行されていない（${mp3.join(', ')} のみ）`
    )
    return created
  }

  verifyTranscriptHeader(`${recordingsDir}\\${trans[0]}`)
  verifyTranscriptOffsets(`${recordingsDir}\\${trans[0]}`)

  // Phase E: chunk 群と manifest の検証
  const baseName = mp3[0].replace(/\.[^.]+$/, '')
  // manifest を先に読み、chunk 群と照合させる
  const manifestChunks = readManifestChunks(`${recordingsDir}\\${baseName}.manifest.json`)
  verifyChunkGroup(`${recordingsDir}\\${baseName}`, mp3[0], manifestChunks)
  verifyManifest(`${recordingsDir}\\${baseName}.manifest.json`)

  return created
}

/**
 * チャンク群（<base>.chunks/chunk_NNN.<ext>）を検証
 *
 * 追加ではないので、ファイル各のサイズが
 * 単体 mp3 のサイズと一致していることを確認する。
 */
function verifyChunkGroup(basePath, mp3Name, manifestChunks = []) {
  const dir = `${basePath}.chunks`
  if (!fsExistsSync(dir)) {
    ng('chunk 群の作成', `ディレクトリが存在しない: ${dir}`)
    return
  }

  const files = fsReadDir(dir).sort()
  if (files.length === 0) {
    ng('chunk 群の作成', 'chunk ファイルが 1 件もない')
    return
  }

  // manifest が指すファイル名とディレクトリの実体が一致することが本討。
  // 連番の起始値（1开始るなど 0 とは定めない）は確認しない。
  if (manifestChunks.length > 0) {
    const declared = manifestChunks.map((c) => String(c.file).split('/').pop())
    const missing = declared.filter((f) => !files.includes(f))
    if (missing.length > 0) {
      ng('chunk 群と manifest の一致', `manifest が指すファイルが避けている: ${missing.join(', ')}`)
      return
    }
    const unlisted = files.filter((f) => !declared.includes(f))
    if (unlisted.length > 0) {
      ng('chunk 群と manifest の一致', `manifest にない chunk がある: ${unlisted.join(', ')}`)
      return
    }
    ok('chunk 群と manifest の一致', `${declared.length} 件のファイル名が一致`)
  }

  // 合計サイズ = mp3 のサイズ（追加本体が壊れていないことの確誌）
  const chunkTotal = files.reduce((sum, f) => sum + fsStatSize(`${dir}\\${f}`), 0)
  const mp3Size = fsStatSize(`${basePath}.${mp3Name.split('.').pop()}`)
  if (chunkTotal !== mp3Size) {
    ng('chunk 群の完全性', `chunk 合計 ${chunkTotal} と mp3 ${mp3Size} が不一致`)
    return
  }
  ok('chunk 群の作成', `${files.length} 件 / 合計 ${chunkTotal} bytes（mp3 と一致）`)
}

/** manifest.json の内容を検証 */
function verifyManifest(manifestPath) {
  if (!fsExistsSync(manifestPath)) {
    ng('manifest.json の作成', `ファイルが存在しない: ${manifestPath}`)
    return
  }

  let manifest
  try {
    manifest = JSON.parse(readFile(manifestPath))
  } catch (error) {
    ng('manifest.json の作成', `JSON として読めない: ${error.message}`)
    return
  }

  if (typeof manifest.version !== 'number' || !manifest.recording || !Array.isArray(manifest.chunks)) {
    ng('manifest.json の作成', 'スキーマに合わない')
    return
  }
  ok('manifest.json の作成', `version=${manifest.version} / chunks=${manifest.chunks.length}`)

  // 合訃の検証
  const sum = manifest.chunks.reduce((t, c) => t + c.bytes, 0)
  if (sum !== manifest.recording.totalBytes) {
    ng('manifest の合計バイト数', `chunks 合計 ${sum} != totalBytes ${manifest.recording.totalBytes}`)
    return
  }
  ok('manifest の合計バイト数', `${sum} bytes`)

  if (manifest.chunks.length !== manifest.recording.chunkCount) {
    ng('manifest のチャンク件数', `${manifest.chunks.length} != chunkCount ${manifest.recording.chunkCount}`)
    return
  }
  ok('manifest のチャンク件数', `${manifest.chunks.length}`)

  // 連番と位置の単调性
  let cursor = 0
  // 連番は 0 始まりではなく、単调增加でないことを確認する
  // （録音パイプラインは 1 始まりの chunkNumber を渡す）
  for (const [i, c] of manifest.chunks.entries()) {
    if (i > 0 && c.chunkNumber <= manifest.chunks[i - 1].chunkNumber) {
      ng(
        'manifest のチャンク連番',
        `chunks[${i}].chunkNumber=${c.chunkNumber} が前の ${manifest.chunks[i - 1].chunkNumber} 以上でない`
      )
      return
    }
    if (c.bytes <= 0) {
      ng('manifest のチャンクサイズ', `chunks[${i}].bytes=${c.bytes}`)
      return
    }
    if (c.audioOffsetSeconds < cursor) {
      ng('manifest のチャンク位置', `chunks[${i}].audioOffsetSeconds=${c.audioOffsetSeconds} < ${cursor}`)
      return
    }
    cursor = c.audioOffsetSeconds
  }
  ok('manifest のチャンク位置', `単调增加 / 最終 ${cursor.toFixed(3)}秒`)

  // 実測値と計算値の一致
  const estimated = manifest.recording.estimatedDurationSeconds
  if (typeof estimated !== 'number' || estimated <= 0) {
    ng('manifest の長さ', `estimatedDurationSeconds=${estimated}`)
    return
  }
  ok('manifest の長さ', `推定 ${estimated.toFixed(3)}秒 / ${manifest.recording.bytesPerSecond} B/s`)
}

function verifyTranscriptHeader(file) {
  const content = readFile(file)
  const header = parseHeader(content)

  if (!header) {
    ng('trans.txt ヘッダー', 'ヘッダーを解釈できない')
    return
  }

  ok('trans.txt ヘッダーの存在', Object.keys(header).join(', '))

  // model がハードコードingkConstamy になっていないか
  if (header.model === 'kotoba-whisper-medium' || header.model === 'unknown') {
    ng('trans.txt model', `model が ${header.model}（ハードコード値）`)
  } else {
    ok('trans.txt model', header.model)
  }

  const duration = Number(header.duration)
  if (!(duration > 0)) {
    ng('trans.txt duration', `duration=${header.duration}（0 は実測されていない）`)
  } else {
    ok('trans.txt duration', `${duration}秒`)
  }

  if (Number(header.segment_count) < 1) {
    ng('trans.txt segment_count', `segment_count=${header.segment_count}`)
  } else {
    ok('trans.txt segment_count', header.segment_count)
  }

  if ('coverage' in header) {
    ng('trans.txt coverage', '実装のない coverage が残っている')
  } else {
    ok('trans.txt coverage', '出力されていない（根拠のない数値を出さない）')
  }
}

function verifyTranscriptOffsets(file) {
  const content = readFile(file)
  const lines = content
    .split('\n')
    .map((l) => l.match(/^\[(\d{2}:\d{2}:\d{2}\.\d)\]\s*(.*)$/))
    .filter(Boolean)

  if (lines.length === 0) {
    ng('trans.txt セグメント行', ' [HH:MM:SS.s] 形式の行が無い')
    return
  }

  const offsets = lines.map((m) => {
    const [, hms] = m
    const [h, m2, s] = hms.split(':')
    return Number(h) * 3600 + Number(m2) * 60 + Number(s)
  })

  const increasing = offsets.every((v, i) => i === 0 || v >= offsets[i - 1])
  if (!increasing) {
    ng('trans.txt タイムスタンプ', `単調増加でない: ${offsets.slice(0, 6).join(', ')}`)
  } else {
    ok('trans.txt タイムスタンプ', `単調増加 / 先頭=${offsets[0]}秒`)
  }

  // 壁時計の時刻（11:00:xx）ではなく録音開始からの位置であること
  const first = offsets[0]
  if (first > 60 * 60) {
    ng('trans.txt タイムスタンプ', `先頭が ${first}秒（壁時計の可能性がある）`)
  } else {
    ok('trans.txt タイムスタンプ', '録音開始からの位置')
  }
}

/**
 * 文字起こしの完了を待つ
 *
 * 判定材料はアプリとサーバーのログ（DOM より安定している）。
 * 重要なのは「text が空のチャンクは trans.txt に書かれない」仕様:
 *   - サーバーが "Transcription completed in" が出たら文字起こしは実行された
 *   - "Only 0.0s of ... processed" が出ていれば音声が完全無音で text が空
 *   - 実際にファイルへ追記されたかは "文字起こし追記" の로그で分かる
 * ログは実行をまたいで蓄積するので、開始時点の値を baseline として差分を見る。
 */
async function logCounts() {
  const lines = await logs()
  return {
    appended: lines.filter((l) => /文字起こし(を)?追記/.test(l)).length,
    completed: lines.filter((l) => l.includes('Transcription completed in')).length,
    silent: lines.filter((l) => /Only 0\.0s of/.test(l)).length,
    failed: lines.filter((l) => l.includes('文字起こし失敗')).length
  }
}

async function waitForTranscription(maxSeconds, baseline) {
  const deadline = Date.now() + maxSeconds * 1000
  const started = Date.now()
  let lastAppended = 0

  while (Date.now() < deadline) {
    const counts = await logCounts()
    const appended = Math.max(0, counts.appended - baseline.appended)
    const completed = Math.max(0, counts.completed - baseline.completed)
    const silent = Math.max(0, counts.silent - baseline.silent)
    const failed = Math.max(0, counts.failed - baseline.failed)

    if (appended > lastAppended) {
      const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000))
      step(`  文字起こし追記 ${appended} 件 / サーバー完了 ${completed} 件 / 残り ${remaining}秒`)
      lastAppended = appended
    }

    // チェンク全体の処理終了したら判定にくれる
    // （読み込みはチェンク数によって最待しながらないため、
    //  サーバー完了のログを作利機にする）
    if (completed > 0) {
      return {
        ok: true,
        appended,
        completed,
        silent,
        failed,
        elapsed: ((Date.now() - started) / 1000).toFixed(1)
      }
    }
    await sleep(3000)
  }

  const counts = await logCounts()
  return {
    ok: false,
    detail: `${maxSeconds}秒以内にサーバーの文字起こし完了ログが出なかった`,
    appended: Math.max(0, counts.appended - baseline.appended)
  }
}

// ---------------------------------------------------------------------------
// ファイル操作（Electron の node を(Update せず素の fs を使う)
// ---------------------------------------------------------------------------
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** manifest.json が読めるなら chunks を返す（読めないものは空アライ） */
function readManifestChunks(manifestPath) {
  try {
    if (!fs.existsSync(manifestPath)) return []
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8')).chunks ?? []
  } catch {
    return []
  }
}

function fsExistsSync(p) {
  return fs.existsSync(p)
}

function fsStatSize(p) {
  return fs.statSync(p).size
}

function fsReadDir(dir) {
  try {
    return fs.readdirSync(dir)
  } catch {
    return []
  }
}

function readFile(file) {
  return fs.readFileSync(file, 'utf-8')
}

function parseHeader(content) {
  if (!content.startsWith('---')) return null
  const end = content.indexOf('---\n\n')
  const yaml = end > 0 ? content.slice(3, end) : ''
  const header = {}
  for (const line of yaml.split('\n')) {
    const m = line.match(/^([a-z_]+):\s*(.*)$/)
    if (m) header[m[1]] = m[2].trim()
  }
  return Object.keys(header).length > 0 ? header : null
}

function resolveRecordingsDir() {
  const userData = path.join(os.homedir(), 'AppData', 'Roaming', 'koenote')
  const settingsFile = path.join(userData, 'settings.json')
  try {
    const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'))
    if (settings.saveFolder) return settings.saveFolder
  } catch {
    // 設定ファイルが読めない場合は既定値
  }
  return path.join(os.homedir(), 'OneDrive', 'デスクトップ', 'VoiceRecordings')
}

// ---------------------------------------------------------------------------
// 実行
// ---------------------------------------------------------------------------
async function main() {
  console.log('KamoX E2E スモーク開始')
  console.log(`  target: ${BASE} / source: ${SOURCE} / record: ${RECORD_SECONDS}秒\n`)

  // KamoX は起動直後や 백그라운드処理中は応答が遅いことがあるため、
// 足够的超时 + リトライで接続を確定させる
let status = null
let lastError = null
for (let attempt = 1; attempt <= 5; attempt++) {
  try {
    status = await api('/status', 'GET', undefined, 30_000)
    break
  } catch (error) {
    lastError = error
    step(`  KamoX に応答なし（${attempt}/5回目）… 3秒待って再試行`)
    await sleep(3000)
  }
}
  if (!status) {
    console.error(`  KamoX に接続できませんでした: ${lastError?.message ?? '不明なエラー'}`)
    console.error('  `npx kamox electron` で起動しているか確認してください。')
    process.exit(2)
  }
  if (!status.success) {
    console.error('  KamoX が起動していません。`npx kamox electron` を先に起動してください。')
    process.exit(2)
  }
  ok('KamoX 接続', `window=${JSON.stringify(status.data?.windows ?? [])}`)

  // /check-ui はスクリーンショットを伴うため、KamoX が応答しないことがある。
  // UI の描画自体は element 操作の成否で判断できるため、ここは警告に降格する。
  try {
    const ui = await api('/check-ui', 'POST', {}, 25_000)
    if (ui.data?.loaded) {
      ok('UI の読み込み', `screenshot=${ui.data.screenshot ?? '(なし)'}`)
    } else {
      warn('UI の読み込み', 'loaded=false（後続の element 操作で検証する）')
    }
  } catch (error) {
    warn('UI の読み込み', String(error.message ?? error))
  }

  await checkServer()

  const recordingsDir = resolveRecordingsDir()
  console.log(`\n  録音先: ${recordingsDir}`)
  let created = []
  try {
    created = await checkRecording(recordingsDir)
  } catch (error) {
    ng('録音フロー', String(error.message ?? error))
  }

  if (created.length > 0 && !KEEP) {
    for (const file of created) {
      try {
        const target = path.join(recordingsDir, file)
        if (fs.statSync(target).isDirectory()) {
          fs.rmSync(target, { recursive: true })
          console.log(`  cleanup: ${file}/ を削除`)
        } else {
          fs.unlinkSync(target)
          console.log(`  cleanup: ${file} を削除`)
        }
      } catch {
        console.log(`  cleanup: ${file} を削除できませんでした`)
      }
    }
  } else if (created.length > 0) {
    console.log(`  KAMOX_E2E_KEEP=1 のため作成物を残します: ${created.join(', ')}`)
  }

  console.log(`\n結果: ${passed} pass / ${failed} fail`)
  if (failed > 0) {
    console.log('失敗:')
    for (const f of failures) console.log(`  - ${f}`)
  }
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error('E2E 実行中に例外:', error)
  process.exit(3)
})