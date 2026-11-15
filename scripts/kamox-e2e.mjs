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

/**
 * Phase F: 録音を開いてチャンク詳細パンルを確認
 *
 * パストしたまと利用ではない実機テストの代替になる。
 */
async function checkChunkPanel(recordingsDir) {
  step('チャンク詳細パンルを開くタブに移り、旧録音を開く')

  // バットのリスト画面に戻る（PlayerCard がのるところ）
  const backOnLibrary = await domHasClass('tab-bar')
  if (!backOnLibrary) {
    throw new Error('ライブラリ画面に移れません')
  }

  // Phase E 前の録音（manifest がない）を 1 件択げる
  const legacy = fsReadDir(recordingsDir)
    .filter((f) => f.endsWith('.mp3'))
    .filter((f) => !fsExistsSync(path.join(recordingsDir, f.replace(/\.[^.]+$/, '.manifest.json'))))
  if (legacy.length === 0) {
    warn('チャンク詳細パンル', 'Phase E 前の録音がなく、パンルの読み込みだけは確認しない')
    return
  }

  // ファイル一覧は録音物の削除後にリフレッシュされるため、
  // 行が描画されるまで最大15秒待つ（即クリックすると失敗する）
  step('  ファイル一覧の描画を待ちます（最大15秒）')
  let listReady = false
  for (let i = 0; i < 15; i++) {
    if (await domHasClass('file-list-item')) {
      listReady = true
      break
    }
    await sleep(1000)
  }
  if (!listReady) {
    warn('チャンク詳細パネル', 'ファイル一覧が描画されませんでした')
    return
  }

  const target = legacy[0]
  // ファイル行は .file-list-item の class でクリック実行できる。
  // ファイル行は .file-list-item の class でクリックする。
  // :has-text は Playwright のセレクタ語なので、ファイル名で拥功をなく。
  // 録音直後はファイル一覧がリフレッシュ中のため、行の detach が起きて
  // クリックが失敗することがある。さらに KamoX は check-ui（重い）と
  // element を直列処理するため、check-ui 連打直後のクリックは飢餓する。
  // 対策: 5秒の静寂（KamoX を呼ばない）でドレインしてから試す。
  step('  KamoX の処理落ち着き待ち（5秒）')
  await sleep(5000)

  // 対象のプレイヤータブが既に開いていればそれを使う。
  // タブは数が少なく再描画の影響を受けないため、1065 行の一覧より確実。
  const short = target.replace(/^advanced_recording_/, '').replace(/\.mp3$/, '')
  let opened = await element(
    `.tab:has-text("${short}") >> nth=0`,
    'click',
    undefined,
    8000
  ).catch(() => null)
  if (opened) {
    step('  既存のプレイヤータブを使用')
    await sleep(1500)
  } else {
    step('  一覧から開く（プレイヤータブが無いため）')
  }
  for (let attempt = 1; opened === null && attempt <= 2; attempt++) {
    opened = await element(
      `.file-list-item:has-text("${target}") >> nth=0`,
      'click',
      undefined,
      15000
    ).catch(() => null)
    if (opened) {
      break
    }
    step(`  クリック再試行 (${attempt}/2)… 4秒待ち`)
    await sleep(4000)
  }
  if (!opened) {
    // 次の調査用に facts だけ残す（推測しない）
    try {
      const html = await domHtml()
      const items = (html.match(/class="file-list-item"/g) || []).length
      const hits = html.split(target).length - 1
      const tabs = [...html.matchAll(/class="tab (active)?[^"]*"[^>]*title="([^"]*)"/g)].map(
        (m) => `${m[1] ? '*' : ''}${m[2].slice(0, 40)}`
      )
      warn(
        'チャンク詳細パネル診断',
        `file-list-item=${items} / 対象名出現=${hits} / tabs=[${tabs.join(' | ')}]`
      )
    } catch {
      // 診断自体が失敗しても本筋の WARN は出す
    }
    warn('チャンク詳細パンル', `録音行をクリックできなかった: ${target}`)
    return
  }
  await sleep(2000)

  // パンルが出てきるまで待ち
  step('  パンルの表示を待ち')
  let panelVisible = false
  for (let i = 0; i < 10; i++) {
    if (await domHasClass('chunks-panel')) {
      panelVisible = true
      break
    }
    await sleep(1000)
  }

  if (!panelVisible) {
    ng('チャンク詳細パヲル', '.chunks-panel が表示されない')
    return
  }

  const html = await domHtml()
  if (!html.includes('Phase E 引入前の録音です')) {
    ng('チャンク詳細パンル', 'manifest 無い録音での表示が出ない')
    return
  }
  ok('チャンク詳細パンル', `manifest 無い録音でも利用できる: ${target}`)

  // 開閉してチャンク一覧を開く
  const expanded = await element('.chunks-panel__header', 'click').catch(() => null)
  if (!expanded) {
    warn('チャンク一覧', 'パンルを開けなかった')
    return
  }
  await sleep(800)

  if (await domHasClass('chunks-table')) {
    ok('チャンク一覧', '表が表示された')
  } else {
    warn('チャンク一覧', '表は表示されない（チャンク情報のない録音の場合は正常）')
  }
}

/** DOM スナップショートの HTML を取得 */
async function domHtml() {
  try {
    const ui = await api('/check-ui', 'POST', {}, 25_000)
    return ui.data?.dom?.html ?? ''
  } catch {
    return ''
  }
}

// ---------------------------------------------------------------------------
// 2. 録音 → 文字起こし → メタデータの検証
// ---------------------------------------------------------------------------
async function checkRecording(recordingsDir) {
  // v2: 録音の成果物は <workspace>/sessions/<id>/ に集約される
  const sessionsDir = path.join(recordingsDir, 'sessions')
  const beforeSessions = new Set(fsReadDir(sessionsDir))

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

  step('生成セッションを検証（v2 sessions/ 形式）')
  const newSessions = fsReadDir(sessionsDir).filter((d) => !beforeSessions.has(d))

  if (newSessions.length === 0) {
    ng('セッションの作成', `sessions/ に新規ディレクトリなし: ${fsReadDir(recordingsDir).join(', ')}`)
    return []
  }

  const createdPaths = newSessions.map((d) => path.join(sessionsDir, d))
  ok('セッションの作成', newSessions.join(', '))

  for (const dir of createdPaths) {
    const session = verifySessionJson(dir)
    if (!session) continue
    verifySessionChunks(dir, session)
    verifyTranscriptJson(dir, session, t)
  }

  return createdPaths
}

/**
 * session.json を検証してパース結果を返す（失敗時は null）
 *
 * v2 スキーマの必須事項:
 *   - state は 'completed'（正常停止の場合）
 *   - sources[] にチャンクが記録されている
 *   - recording.durationSeconds / endedAt が確定している
 */
function verifySessionJson(sessionDir) {
  const sessionPath = path.join(sessionDir, 'session.json')
  if (!fsExistsSync(sessionPath)) {
    ng('session.json の作成', `ファイルが存在しない: ${sessionPath}`)
    return null
  }

  let session
  try {
    session = JSON.parse(readFile(sessionPath))
  } catch (error) {
    ng('session.json の作成', `JSON として読めない: ${error.message}`)
    return null
  }

  if (typeof session.version !== 'number' || !Array.isArray(session.sources) || !session.recording) {
    ng('session.json の作成', 'スキーマに合わない')
    return null
  }
  ok('session.json の作成', `id=${session.id} / sources=${session.sources.length}`)

  if (session.state !== 'completed') {
    ng('session.json の状態', `state=${session.state}（completed ではない）`)
  } else {
    ok('session.json の状態', 'completed')
  }

  const duration = session.recording.durationSeconds
  if (typeof duration !== 'number' || duration <= 0) {
    ng('session.json の長さ', `durationSeconds=${duration}`)
  } else {
    ok('session.json の長さ', `${duration.toFixed(1)}秒 / endedAt=${session.recording.endedAt ?? 'なし'}`)
  }

  return session
}

/**
 * セッションの音声チャンクを検証
 *
 * 本質: session.json が指す chunk ファイルが全て実在し、
 * 宣言バイト数と実ファイルサイズが一致し、
 * audioOffsetSeconds が単調増加していること。
 */
function verifySessionChunks(sessionDir, session) {
  const source = session.sources.find((s) => s.enabled !== false) ?? session.sources[0]
  if (!source || !source.audio || !Array.isArray(source.audio.chunks)) {
    ng('チャンク群', 'sources[].audio.chunks がない')
    return
  }

  const chunks = source.audio.chunks
  if (chunks.length === 0) {
    ng('チャンク群', 'chunk が 1 件も記録されていない')
    return
  }

  // 宣言ファイルが実在し、サイズが一致するか
  const missing = []
  const mismatched = []
  for (const c of chunks) {
    const p = path.join(sessionDir, c.file)
    if (!fsExistsSync(p)) {
      missing.push(c.file)
    } else if (fsStatSize(p) !== c.bytes) {
      mismatched.push(`${c.file}（宣言 ${c.bytes} / 実 ${fsStatSize(p)}）`)
    }
  }
  if (missing.length > 0) {
    ng('チャンク群の実在', `存在しない: ${missing.join(', ')}`)
    return
  }
  if (mismatched.length > 0) {
    ng('チャンク群のサイズ一致', `不一致: ${mismatched.join(', ')}`)
    return
  }
  ok('チャンク群の実在とサイズ', `${chunks.length} 件 / 宣言バイト数と実体が一致`)

  // offset/duration の単調性と正値
  let cursor = 0
  for (const [i, c] of chunks.entries()) {
    if (c.bytes <= 0) {
      ng('チャンク群のサイズ', `chunks[${i}].bytes=${c.bytes}`)
      return
    }
    if (c.durationSeconds <= 0) {
      ng('チャンク群の長さ', `chunks[${i}].durationSeconds=${c.durationSeconds}`)
      return
    }
    if (c.audioOffsetSeconds < cursor - 0.001) {
      ng('チャンク群の位置', `chunks[${i}].audioOffsetSeconds=${c.audioOffsetSeconds} < ${cursor}`)
      return
    }
    cursor = c.audioOffsetSeconds + c.durationSeconds
  }
  ok('チャンク群の位置', `単調増加 / 総延べ ${cursor.toFixed(3)}秒 / format=${source.audio.format}`)
}

/**
 * transcripts/*.json を検証
 *
 * v2 transcript はセグメントの実値 start/end を持つ。
 * 完全無音の録音ではセグメント 0 件の completed transcript が残る
 * （旧形式で trans.txt が作られないのと同じ意味）。その場合は
 * サーバー完了ログ + 無音ログで仕様どおりとみなす。
 */
function verifyTranscriptJson(sessionDir, session, t) {
  const refs = session.transcripts ?? []
  if (refs.length === 0) {
    // 文字起こし無効設定なら transcript は作られない
    warn('transcript の作成', 'session.transcripts が空（transcription 無効の可能性）')
    return
  }

  const file = path.join(sessionDir, refs[0].file)
  if (!fsExistsSync(file)) {
    ng('transcript の作成', `存在しない: ${refs[0].file}`)
    return
  }

  let transcript
  try {
    transcript = JSON.parse(readFile(file))
  } catch (error) {
    ng('transcript の作成', `JSON として読めない: ${error.message}`)
    return
  }

  ok('transcript の作成', `${refs[0].file} / status=${transcript.status} / model=${transcript.model}`)

  if (transcript.status !== 'completed') {
    ng('transcript の状態', `status=${transcript.status}`)
    return
  }

  const segments = transcript.segments ?? []
  if (segments.length === 0) {
    // 完全無音ではサーバーが空テキストを返しセグメントは増えない。
    // サーバー実行済み + 無音判定が出ていれば仕様どおり。
    if (t.ok && t.completed > 0 && t.silent > 0) {
      ok('transcript のセグメント', '0 件（録音が無音のため仕様どおり）')
      return
    }
    ng(
      'transcript のセグメント',
      `0 件（サーバー完了 ${t.completed} 件 / 保存 ${t.appended} 件 / 無音 ${t.silent} 件）`
    )
    return
  }

  // 実値タイムスタンプの検証（旧 trans.txt のタイムスタンプ検証に相当）
  const starts = segments.map((s) => s.start)
  const increasing = starts.every((v, i) => i === 0 || v >= starts[i - 1])
  if (!increasing) {
    ng('transcript タイムスタンプ', `単調増加でない: ${starts.slice(0, 6).join(', ')}`)
    return
  }
  const first = starts[0]
  if (first > 60 * 60) {
    ng('transcript タイムスタンプ', `先頭が ${first}秒（壁時計の可能性）`)
    return
  }
  ok('transcript タイムスタンプ', `単調増加 / ${segments.length} セグメント / 先頭=${first}秒`)

  const hasText = segments.every((s) => typeof s.text === 'string' && s.text.trim().length > 0)
  if (!hasText) {
    ng('transcript の本文', '空テキストのセグメントがある')
    return
  }
  ok('transcript の本文', `先頭: "${segments[0].text.slice(0, 30)}"`)
}

/**
 * 文字起こしの完了を待つ
 *
 * 判定材料はアプリとサーバーのログ（DOM より安定している）。
 * 重要なのは「text が空のチャンクは transcript にセグメントが増えない」仕様:
 *   - サーバーが "Transcription completed in" が出たら文字起こしは実行された
 *   - "Only 0.0s of ... processed" が出ていれば音声が完全無音で text が空
 *   - 実際に transcript へ保存されたかは "セッションtranscript保存完了" のログで分かる
 * ログは実行をまたいで蓄積するので、開始時点の値を baseline として差分を見る。
 */
async function logCounts() {
  const lines = await logs()
  return {
    appended: lines.filter((l) => /セッションtranscript保存完了/.test(l)).length,
    completed: lines.filter((l) => l.includes('Transcription completed in')).length,
    silent: lines.filter((l) => /Only 0\.0s of/.test(l)).length,
    failed: lines.filter((l) => /セッションtranscript保存失敗|文字起こし.*失敗/.test(l)).length
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
  // PANEL_ONLY=1 のときはパネル検証だけを実行する。
  // 呼び出し回数が少ない状態で通るかどうかで、
  // 「KamoX の累積負荷で後半が飢餓する」仮説を検証できる。
  if (process.env.PANEL_ONLY === '1') {
    console.log('KamoX E2E パネル単独検証開始')
    const recordingsDir = resolveRecordingsDir()
    await checkChunkPanel(recordingsDir)
    console.log(`\n結果: ${passed} pass / ${failed} fail`)
    if (failed > 0) {
      console.log('失敗:')
      for (const f of failures) console.log(`  - ${f}`)
      process.exit(1)
    }
    return
  }

  console.log('KamoX E2E スモーク開始')
  console.log(`  target: ${BASE} / source: ${SOURCE} / record: ${RECORD_SECONDS}秒\n`)

  // KamoX は起動直後や 백그라운드処理中は応答が遅いことがあるため、
// 十分なタイムアウト + リトライで接続を確定させる
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
    for (const target of created) {
      try {
        if (fs.statSync(target).isDirectory()) {
          fs.rmSync(target, { recursive: true })
          console.log(`  cleanup: ${path.basename(target)}/ を削除`)
        } else {
          fs.unlinkSync(target)
          console.log(`  cleanup: ${target} を削除`)
        }
      } catch {
        console.log(`  cleanup: ${target} を削除できませんでした`)
      }
    }
  } else if (created.length > 0) {
    console.log(
      `  KAMOX_E2E_KEEP=1 のため作成物を残します: ${created.map((p) => path.basename(p)).join(', ')}`
    )
  }

    // Phase F: 旧録音を開いてチャンク詳細パンルを確認（新作成物の削除後に行う）
  await checkChunkPanel(recordingsDir)

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