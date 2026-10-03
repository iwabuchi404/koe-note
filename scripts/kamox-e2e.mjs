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

  step('録音タブを開く')
  await element('.action-card.success', 'click')
  await sleep(1500)

  step('設定を開けて音声ソースを選ぶ')
  await element('.accordion-header >> nth=0', 'click')
  await sleep(600)
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
  const ui = await waitForTranscription(45)
  if (!ui.ok) {
    ng('文字起こし結果の表示', ui.detail)
  } else {
    ok('文字起こしの追記', `${ui.segments}件 / ${ui.elapsed}秒${ui.failed ? ` / 失敗${ui.failed}件` : ''}`)
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
    ng('文字起こしファイルの作成', `trans.txt が無い（${mp3.join(', ')} のみ）`)
    return created
  }

  verifyTranscriptHeader(`${recordingsDir}\\${trans[0]}`)
  verifyTranscriptOffsets(`${recordingsDir}\\${trans[0]}`)

  return created
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

async function waitForTranscription(maxSeconds) {
  // DOM ではなくアプリのログを見る。ログのほうが安定していて、
  // 「どのチャンクまで書き込まれたか」が読めるため証跡として強い。
  const deadline = Date.now() + maxSeconds * 1000
  const started = Date.now()
  let lastCount = 0

  while (Date.now() < deadline) {
    const lines = await logs()
    const appended = lines.filter((l) => l.includes('文字起こしを追記')).length
    const failed = lines.filter((l) => l.includes('文字起こし失敗')).length

    if (appended > lastCount) {
      const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000))
      step(`  文字起こし追記 ${appended} 件${failed ? `（失敗 ${failed}）` : ''} / 残り ${remaining}秒`)
      lastCount = appended
    }

    if (appended > 0) {
      return {
        ok: true,
        segments: appended,
        failed,
        elapsed: ((Date.now() - started) / 1000).toFixed(1)
      }
    }
    await sleep(3000)
  }

  return { ok: false, detail: `${maxSeconds}秒以内に文字起こしの追記ログが出なかった` }
}

// ---------------------------------------------------------------------------
// ファイル操作（Electron の node を(Update せず素の fs を使う)
// ---------------------------------------------------------------------------
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

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

  const status = await api('/status')
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
        fs.unlinkSync(path.join(recordingsDir, file))
        console.log(`  cleanup: ${file} を削除`)
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