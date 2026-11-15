/**
 * Logger - 統一されたログ管理システム
 * 
 * 機能:
 * - ログレベル制御（DEBUG, INFO, WARN, ERROR）
 * - カテゴリ別ログ管理
 * - 環境別出力制御
 * - 構造化ログ形式
 * - タイムスタンプとコンテキスト情報の自動付与
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4
}

export interface LogContext {
  component?: string
  function?: string
  userId?: string
  sessionId?: string
  [key: string]: any
}

export interface LogEntry {
  timestamp: string
  level: LogLevel
  category: string
  message: string
  context?: LogContext
  data?: any
  error?: Error | unknown
}

/**
 * ログフォーマッター
 */
export class LogFormatter {
  /**
   * 安全なオブジェクトシリアライゼーション
   */
  private static safeStringify(obj: any): string {
    try {
      return JSON.stringify(obj, null, 0)
    } catch (error) {
      // 循環参照などでJSONシリアライゼーションが失敗した場合
      try {
        return JSON.stringify(obj, (key, value) => {
          if (typeof value === 'object' && value !== null) {
            if (value.constructor?.name) {
              return `[${value.constructor.name}]`
            }
            return '[Object]'
          }
          return value
        })
      } catch {
        return '[非シリアライズ可能オブジェクト]'
      }
    }
  }

  /**
   * コンソール出力用フォーマット
   */
  static formatForConsole(entry: LogEntry): string {
    const timestamp = entry.timestamp
    const level = LogLevel[entry.level].padEnd(5)
    const category = entry.category.padEnd(20)
    
    let formatted = `${timestamp} [${level}] ${category} ${entry.message}`
    
    if (entry.context && Object.keys(entry.context).length > 0) {
      formatted += ` | Context: ${LogFormatter.safeStringify(entry.context)}`
    }
    
    if (entry.data) {
      formatted += ` | Data: ${LogFormatter.safeStringify(entry.data)}`
    }
    
    return formatted
  }

  /**
   * ファイル出力用フォーマット（JSON構造化）
   */
  static formatForFile(entry: LogEntry): string {
    return JSON.stringify(entry)
  }
}

/**
 * メインLoggerクラス
 */
export class Logger {
  private category: string
  private context: LogContext
  private static globalLevel: LogLevel = LogLevel.INFO
  private static isDevelopment: boolean = process.env.NODE_ENV === 'development'
  
  constructor(category: string, context: LogContext = {}) {
    this.category = category
    this.context = context
  }

  /**
   * グローバルログレベル設定
   */
  static setLevel(level: LogLevel): void {
    Logger.globalLevel = level
  }

  /**
   * 開発モード設定
   */
  static setDevelopmentMode(isDev: boolean): void {
    Logger.isDevelopment = isDev
  }

  /**
   * コンテキスト情報を更新
   */
  updateContext(context: Partial<LogContext>): void {
    this.context = { ...this.context, ...context }
  }

  /**
   * ログエントリ作成
   */
  private createLogEntry(level: LogLevel, message: string, data?: any, error?: Error | unknown): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      category: this.category,
      message,
      context: Object.keys(this.context).length > 0 ? this.context : undefined,
      data,
      error
    }
  }

  /**
   * ログ出力判定
   */
  private shouldLog(level: LogLevel): boolean {
    return level >= Logger.globalLevel
  }

  /**
   * 実際のログ出力処理
   */
  private output(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) return

    const formatted = LogFormatter.formatForConsole(entry)
    
    // 開発環境でのみコンソール出力
    if (Logger.isDevelopment) {
      switch (entry.level) {
        case LogLevel.DEBUG:
          console.debug(formatted)
          break
        case LogLevel.INFO:
          console.info(formatted)
          break
        case LogLevel.WARN:
          console.warn(formatted)
          break
        case LogLevel.ERROR:
          console.error(formatted)
          break
      }
    }

    // 本番環境では重要なログをファイル出力
    if (!Logger.isDevelopment && entry.level >= LogLevel.WARN) {
      const fileLine = LogFormatter.formatForFile(entry)
      window.electronAPI?.logWrite(fileLine).catch(() => {
        // IPC呼び出し失敗時はサイレントに無視
      })
    }
  }

  /**
   * DEBUGレベルログ
   */
  debug(message: string, data?: any): void {
    const entry = this.createLogEntry(LogLevel.DEBUG, message, data)
    this.output(entry)
  }

  /**
   * INFOレベルログ
   */
  info(message: string, data?: any): void {
    const entry = this.createLogEntry(LogLevel.INFO, message, data)
    this.output(entry)
  }

  /**
   * WARNレベルログ
   */
  warn(message: string, data?: any, error?: Error | unknown): void {
    const entry = this.createLogEntry(LogLevel.WARN, message, data, error)
    this.output(entry)
  }

  /**
   * ERRORレベルログ
   */
  error(message: string, error?: Error | unknown, data?: any): void {
    const entry = this.createLogEntry(LogLevel.ERROR, message, data, error)
    this.output(entry)
  }

  /**
   * 条件付きログ出力
   */
  debugIf(condition: boolean, message: string, data?: any): void {
    if (condition) this.debug(message, data)
  }

  infoIf(condition: boolean, message: string, data?: any): void {
    if (condition) this.info(message, data)
  }

  warnIf(condition: boolean, message: string, data?: any): void {
    if (condition) this.warn(message, data)
  }

  errorIf(condition: boolean, message: string, error?: Error | unknown, data?: any): void {
    if (condition) this.error(message, error, data)
  }

  /**
   * 計測ログ（処理時間測定）
   */
  timeStart(label: string): void {
    this.debug(`⏱️ 処理開始: ${label}`)
  }

  timeEnd(label: string, startTime: number): void {
    const duration = Date.now() - startTime
    this.debug(`⏱️ 処理完了: ${label} (${duration}ms)`)
  }

  /**
   * 統計ログ
   */
  stats(message: string, stats: Record<string, number>): void {
    this.info(`📊 ${message}`, stats)
  }

  /**
   * パフォーマンスログ
   */
  perf(message: string, metrics: Record<string, any>): void {
    this.debug(`🚀 ${message}`, metrics)
  }

  /**
   * セキュリティログ
   */
  security(message: string, data?: any): void {
    this.warn(`🔒 ${message}`, data)
  }

  /**
   * ネットワークログ
   */
  network(message: string, data?: any): void {
    this.info(`🌐 ${message}`, data)
  }

  /**
   * ファイルI/Oログ
   */
  fileIO(message: string, data?: any): void {
    this.debug(`📁 ${message}`, data)
  }

  /**
   * ユーザーアクションログ
   */
  userAction(message: string, data?: any): void {
    this.info(`👤 ${message}`, data)
  }
}