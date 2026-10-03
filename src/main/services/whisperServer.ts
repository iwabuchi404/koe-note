/**
 * Kotoba-Whisper サーバーのライフサイクル管理
 *
 * Electron に依存しない（Node の child_process / fs / path / ws のみ）。
 * 环境的依赖（アプリパス・モデルルート・ポート確認・ログ・状態通知）は
 * コンストラクタで注入され、main.ts が合成ルートとして実装を渡す。
 *
 * 此前は main.ts 内にあり、以下の問題を抱えていた:
 *   - モジュールグローバル変数 mainWindow を直接参照していた（rendererへの通知）
 *   - app.getAppPath() と process.resourcesPath を中で呼んでいた
 *   - writeLog / isPortInUse / resolveModelsRoot を自由なスコープから参照
 * そのため単体テストも移動もできなかった。
 */
import { spawn, execSync, type ChildProcess, type SpawnOptions } from 'child_process'
import fs from 'fs'
import path from 'path'
import WebSocket from 'ws'

/** サーバー起動状態 */
export type ServerStatus = 'starting' | 'running' | 'stopped' | 'failed' | 'external'

export interface WhisperServerPaths {
  /** Electron の app.getAppPath() 相当 */
  appPath: string
  /** Electron の process.resourcesPath 相当 */
  resourcesPath: string
  /** このファイル（バンドルされた main.js）の位置 */
  bundleDir: string
}

export interface WhisperServerDeps {
  /** ログ出力 */
  log: (message: string) => void
  /** サーバー状態変化の通知（main.ts が renderer に送る） */
  onStatus: (status: ServerStatus, pid?: number) => void
  /** モデルのルートディレクトリ */
  resolveModelsRoot: () => string
/** ポートが使用中か */
  isPortInUse: (port: number) => Promise<boolean>
  /**
   * 開発時に使う python 実行ファイルを解決する（null なら python 不使用）
   *
   * main.ts が venv を優先して解決する。システムの python には
   * faster-whisper / websockets が入っていないため、
   * 単に「python があるか」で判定すると起動に失敗する。
   */
  resolvePython: () => Promise<string | null>
  paths: WhisperServerPaths
  /** テスト用に待ち時間を縮める */
  timings?: {
    /** 起動待機の最大試行回数（既定180 = 3分。実測でモデル読込に約50秒） */
    readyMaxAttempts?: number
    /** 起動待機のポーリング間隔(ms) */
    readyIntervalMs?: number
    /** 再起動までの待ち(ms) */
    reconnectDelayMs?: number
  }
}

/** Whisperサーバーのポート */
export const WHISPER_PORT = 8770

export class WhisperServerService {
  private process: ChildProcess | null = null
  private isRunning = false
  private isExternalServer = false
  private isShuttingDown = false
  private isStopping = false
  private isQuitting = false
  private reconnectAttempts = 0
  private readonly maxReconnectAttempts = 3

  private readonly log: (message: string) => void
  private readonly onStatus: (status: ServerStatus, pid?: number) => void
  private readonly resolveModelsRoot: () => string
  private readonly isPortInUse: (port: number) => Promise<boolean>
  private readonly resolvePython: () => Promise<string | null>
  private readonly paths: WhisperServerPaths
  private readonly timings: Required<NonNullable<WhisperServerDeps['timings']>>

  constructor(deps: WhisperServerDeps) {
    this.log = deps.log
    this.onStatus = deps.onStatus
    this.resolveModelsRoot = deps.resolveModelsRoot
    this.isPortInUse = deps.isPortInUse
    this.resolvePython = deps.resolvePython
    this.paths = deps.paths
    this.timings = {
      readyMaxAttempts: deps.timings?.readyMaxAttempts ?? 180,
      readyIntervalMs: deps.timings?.readyIntervalMs ?? 1000,
      reconnectDelayMs: deps.timings?.reconnectDelayMs ?? 5000
    }

    this.log('WhisperServerService 初期化')

    // プロセス終了時の同期クリーンアップ（クラッシュ・異常終了時）
    process.on('exit', () => this.syncCleanup())
  }

  /** アプリ終了フラグ（再起動を完全に止める） */
  setQuitting(value: boolean): void {
    this.isQuitting = value
  }

  /** 停止中フラグをリセット（before-quit から stopServer を再実行できるようにする） */
  resetStopping(): void {
    this.isStopping = false
  }

  getStatus(): { isRunning: boolean; pid?: number } {
    return { isRunning: this.isRunning, pid: this.process?.pid }
  }

  /**
   * サーバーを起動する
   *
   * 1. ポートが使用中なら外部サーバーとして扱う
   * 2. 開発環境で python があれば main.py を起動
   * 3. それ以外はビルド済み実行ファイルを探索
   *
   * @returns 起動できた（または外部サーバーを採用した）ら true
   */
  async start(): Promise<boolean> {
    if (this.isRunning) {
      this.log('Whisperサーバーは既に起動中です')
      return true
    }

    this.isShuttingDown = false

    try {
      if (await this.isPortInUse(WHISPER_PORT)) {
        this.log(`Port ${WHISPER_PORT} is already in use. 外部サーバーを使用します。`)
        this.isRunning = false
        this.isExternalServer = true
        this.onStatus('external', this.process?.pid)
        return true
      }

      this.log('Kotoba-Whisper Pythonサーバー起動中...')
      this.onStatus('starting', undefined)

      const launch = await this.resolveLaunchCommand()
      this.log(`Using ${launch.command} ${launch.args.join(' ')} (cwd: ${launch.cwd})`)

      const spawnOptions: SpawnOptions = {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: launch.cwd,
        env: {
          ...process.env,
          WHISPER_MODELS_PATH: this.resolveModelsRoot()
        }
      }
      if (process.platform === 'win32') {
        spawnOptions.windowsHide = true
      }

      this.process = spawn(launch.command, launch.args, spawnOptions)
      this.isExternalServer = false
      this.attachProcessHandlers(this.process)

      this.reconnectAttempts = 0

      const ready = await this.waitForReady()
      if (ready) {
        this.isRunning = true
        this.log('Kotoba-Whisper Pythonサーバー起動完了')
        this.onStatus('running', this.process?.pid)
        return true
      }

      this.log('Kotoba-Whisper Pythonサーバー起動タイムアウト')
      this.isRunning = false
      this.onStatus('failed', this.process?.pid)
      return false
    } catch (error) {
      this.log(`Pythonサーバー起動エラー: ${error}`)
      this.isRunning = false
      this.onStatus('failed', undefined)
      return false
    }
  }

  /**
   * サーバーを停止する（graceful shutdown → 強制終了の2段構え）
   */
  async stop(): Promise<void> {
    if (this.isStopping) {
      this.log('stop 既に実行中のためスキップ')
      return
    }
    this.isStopping = true
    this.isShuttingDown = true

    // 外部サーバーの場合は graceful shutdown のみ
    if (this.isExternalServer && !this.process) {
      this.log('外部サーバーのgraceful shutdownを試行...')
      await this.sendGracefulShutdown()
      this.isExternalServer = false
      this.isRunning = false
      this.isShuttingDown = false
      this.isStopping = false
      this.onStatus('stopped', undefined)
      return
    }

    if (!this.process) {
      this.log('停止対象のプロセスがありません')
      this.isRunning = false
      this.isShuttingDown = false
      this.isStopping = false
      return
    }

    const pid = this.process.pid
    this.log(`Kotoba-Whisper Pythonサーバー停止中 (pid: ${pid})...`)

    const graceful = await this.sendGracefulShutdown()
    if (graceful) {
      const exited = await this.waitForExit(10000)
      if (exited) {
        this.finishStop()
        this.log('Kotoba-Whisper Pythonサーバー停止完了（graceful）')
        return
      }
      this.log('Graceful shutdown後にプロセスが終了しないため、強制終了します')
    }

    if (this.process) {
      try {
        if (process.platform === 'win32' && pid) {
          spawn('taskkill', ['/pid', String(pid), '/f', '/t'], { stdio: 'ignore' })
        } else {
          this.process.kill('SIGTERM')
        }
      } catch (error) {
        this.log(`強制終了エラー: ${error}`)
      }
      await this.waitForExit(5000)
    }

    this.finishStop()
    this.log('Kotoba-Whisper Pythonサーバー停止完了')
  }

  /**
   * ポート8770に既存サーバーがあるか調べる
   *
   * 外部で起動済みのサーバーを採用するかどうかの判断に使う。
   */
  async isServerReachable(timeoutMs = 3000): Promise<boolean> {
    const ws = new WebSocket(`ws://127.0.0.1:${WHISPER_PORT}`)
    return new Promise((resolve) => {
      const settle = (value: boolean) => {
        clearTimeout(timeout)
        try {
          ws.close()
        } catch {
          // already closed
        }
        resolve(value)
      }
      const timeout = setTimeout(() => settle(false), timeoutMs)

      ws.on('open', () => settle(true))
      ws.on('error', () => settle(false))
      ws.on('close', () => clearTimeout(timeout))
    })
  }

  // ---------------------------------------------------------------------
  // 内部処理
  // ---------------------------------------------------------------------

  private finishStop(): void {
    this.process = null
    this.isRunning = false
    this.isExternalServer = false
    this.isShuttingDown = false
    this.isStopping = false
    this.onStatus('stopped', undefined)
  }

  /**
   * 起動コマンドを決定する
   *
   * 開発環境で python が使える場合はソースを直接実行する。
   * それ以外はビルド済み実行ファイルを候補パスから探す。
   */
  private async resolveLaunchCommand(): Promise<{ command: string; args: string[]; cwd: string }> {
    const { appPath, resourcesPath, bundleDir } = this.paths
    const isDevelopment = process.env.NODE_ENV !== 'production' || appPath.includes('node_modules')

    if (isDevelopment) {
      const python = await this.resolvePython()
      if (python) {
        return { command: python, args: ['main.py'], cwd: path.join(appPath, 'whisper-server') }
      }
      this.log('開発用のpythonが見つからないため、ビルド済み実行ファイルを使います')
    }

    const candidates = [
      path.join(appPath, 'whisper-server', 'dist', 'whisper-server', 'whisper-server.exe'),
      path.join(appPath, 'whisper-server', 'dist', 'whisper-server.exe'),
      path.resolve(bundleDir, '..', 'whisper-server', 'dist', 'whisper-server.exe'),
      path.join(resourcesPath, 'whisper-server.exe'),
      path.join(resourcesPath, 'whisper-server', 'dist', 'whisper-server.exe'),
      path.join(resourcesPath, 'whisper-server', 'dist', 'whisper-server', 'whisper-server.exe')
    ]

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return { command: candidate, args: [], cwd: path.dirname(candidate) }
      }
    }

    throw new Error(
      `Whisper server exe not found in any of these locations:\n${candidates.join('\n')}`
    )
  }

  private attachProcessHandlers(child: ChildProcess): void {
    child.stdout?.on('data', (data) => {
      const output = data.toString().trim()
      if (output) this.log(`[Python Server] ${output}`)
    })

    child.stderr?.on('data', (data) => {
      const output = data.toString().trim()
      if (output) this.log(`[Python Server Error] ${output}`)
    })

    child.on('exit', (code, signal) => {
      this.log(`Python server exited with code ${code}, signal ${signal}`)
      this.isRunning = false
      this.process = null

      if (this.isQuitting || this.isShuttingDown || code === 0) {
        this.log('再起動をスキップ（アプリ終了中/手動停止/正常終了）')
        if (!this.isShuttingDown && !this.isQuitting) {
          this.onStatus('stopped', undefined)
        }
        return
      }

      // 予期しない終了は再起動を試す
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++
        this.log(`Pythonサーバー再起動試行 ${this.reconnectAttempts}/${this.maxReconnectAttempts}`)
        this.onStatus('failed', undefined)
        setTimeout(() => {
          void this.start()
        }, this.timings.reconnectDelayMs)
      } else {
        this.log('再起動試行回数上限に到達')
        this.onStatus('failed', undefined)
      }
    })

    child.on('error', (error) => {
      this.log(`Python server spawn error: ${error.message}`)
      this.isRunning = false
    })
  }

  /**
   * ヘルスチェックで起動完了を待つ
   *
   * Kotoba-Whisper のモデル読込には実測で約50秒かかるため、
   * 既定は180秒（3分）まで待つ。
   */
  private async waitForReady(): Promise<boolean> {
    const { readyMaxAttempts, readyIntervalMs } = this.timings
    const startedAt = Date.now()

    for (let attempt = 0; attempt < readyMaxAttempts; attempt++) {
      if (!this.process) {
        this.log('waitForReady: プロセスが既に終了')
        return false
      }
      if (await this.isServerReachable()) {
        this.log(`waitForReady: 準備完了 (${((Date.now() - startedAt) / 1000).toFixed(1)}秒)`)
        return true
      }
      if ((attempt + 1) % 10 === 0) {
        this.log(`waitForReady: 待機中 ${((attempt + 1) * readyIntervalMs) / 1000}秒（モデル読込中）`)
        this.onStatus('starting', this.process?.pid)
      }
      await new Promise((resolve) => setTimeout(resolve, readyIntervalMs))
    }

    this.log(`waitForReady: タイムアウト (${readyMaxAttempts}回試行)`)
    return false
  }

  /** WebSocket 経由で graceful shutdown を要求する */
  private async sendGracefulShutdown(): Promise<boolean> {
    if (!this.process && !this.isExternalServer) {
      return false
    }

    const ws = new WebSocket(`ws://127.0.0.1:${WHISPER_PORT}`)
    return new Promise((resolve) => {
      const finish = (value: boolean) => {
        clearTimeout(timeout)
        try {
          ws.close()
        } catch {
          // already closed
        }
        resolve(value)
      }
      const timeout = setTimeout(() => {
        this.log('Graceful shutdown: タイムアウト (5秒)')
        finish(false)
      }, 5000)

      ws.on('open', () => {
        this.log('Graceful shutdown: 送信')
        ws.send(JSON.stringify({ type: 'shutdown' }))
      })

      ws.on('message', (data: Buffer) => {
        try {
          const response = JSON.parse(data.toString())
          if (response.type === 'shutdown_ack') {
            this.log('Graceful shutdown: ACK受信')
            finish(true)
          }
        } catch {
          // 解析できないメッセージは無視
        }
      })

      ws.on('error', (error: Error) => {
        this.log(`Graceful shutdown: エラー - ${error.message}`)
        finish(false)
      })
    })
  }

  /** プロセス終了を待つ */
  private waitForExit(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const child = this.process
      if (!child) {
        resolve(true)
        return
      }

      let settled = false
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true
          resolve(false)
        }
      }, timeoutMs)

      child.on('exit', () => {
        if (!settled) {
          settled = true
          clearTimeout(timeout)
          resolve(true)
        }
      })
    })
  }

  /** プロセス終了時の同期クリーンアップ（確実に子プロセスを殺す） */
  private syncCleanup(): void {
    const pid = this.process?.pid
    if (!pid) return

    this.log(`syncCleanup: killing pid ${pid}`)
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /pid ${pid} /f /t`, { stdio: 'ignore' })
      } else {
        this.process?.kill('SIGKILL')
      }
    } catch {
      // 既に終了している
    }
  }
}




