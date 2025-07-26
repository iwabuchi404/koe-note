/**
 * LoggerInitializer - アプリケーション起動時のログシステム初期化
 * 
 * 機能:
 * - 環境変数からのログ設定読み込み
 * - パフォーマンス監視
 * - ログ統計収集
 * - 開発者向けデバッグユーティリティ
 */

import { LoggerFactory, LogCategories } from './LoggerFactory'
import { LogConfigManager, Environment } from '../config/LogConfig'
import { LogLevel } from './Logger'

/**
 * 環境変数による設定上書き
 */
interface EnvLogConfig {
  KOENOTE_LOG_LEVEL?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT'
  KOENOTE_LOG_ENABLE_CONSOLE?: 'true' | 'false'
  KOENOTE_LOG_ENABLE_PERFORMANCE?: 'true' | 'false'
  KOENOTE_LOG_CATEGORIES?: string // カンマ区切りでカテゴリ指定
  KOENOTE_LOG_EXCLUDE_CATEGORIES?: string // カンマ区切りで除外カテゴリ指定
}

/**
 * ログシステム初期化クラス
 */
export class LoggerInitializer {
  private static isInitialized: boolean = false
  private static initStartTime: number = 0
  private static appLogger: ReturnType<typeof LoggerFactory.getLogger>

  /**
   * メインの初期化関数
   */
  static async initialize(): Promise<void> {
    if (LoggerInitializer.isInitialized) {
      console.warn('LoggerInitializer: 既に初期化済みです')
      return
    }

    LoggerInitializer.initStartTime = performance.now()

    try {
      // 1. 基本設定の読み込み
      const baseConfig = LogConfigManager.initialize()
      
      // 2. 環境変数からの設定上書き
      const envConfig = LoggerInitializer.loadEnvironmentConfig()
      const finalConfig = { ...baseConfig, ...envConfig }

      // 3. LoggerFactoryの初期化
      LoggerFactory.initialize({
        level: finalConfig.globalLevel,
        isDevelopment: finalConfig.environment === Environment.DEVELOPMENT,
        globalContext: {
          ...finalConfig.globalContext,
          initTimestamp: new Date().toISOString(),
          processId: process.pid,
          platform: process.platform,
          nodeVersion: process.version
        }
      })

      // 4. アプリケーションロガーの取得
      LoggerInitializer.appLogger = LoggerFactory.getLogger(LogCategories.APP)

      // 5. 初期化完了ログ
      const initTime = performance.now() - LoggerInitializer.initStartTime
      LoggerInitializer.appLogger.info('ログシステム初期化完了', {
        initTime: `${initTime.toFixed(2)}ms`,
        environment: finalConfig.environment,
        logLevel: LogLevel[finalConfig.globalLevel],
        enableConsole: finalConfig.enableConsoleOutput,
        enableFile: finalConfig.enableFileOutput,
        categoriesCount: Object.keys(LogCategories).length
      })

      // 6. デバッグ情報の出力
      if (finalConfig.enableDebugLogs) {
        LoggerInitializer.logSystemInfo()
      }

      // 7. パフォーマンス監視の開始
      if (finalConfig.enablePerformanceLogs) {
        LoggerInitializer.startPerformanceMonitoring()
      }

      LoggerInitializer.isInitialized = true

    } catch (error) {
      console.error('ログシステム初期化エラー:', error)
      // フォールバック：最小限の設定で初期化
      LoggerFactory.initialize({
        level: LogLevel.WARN,
        isDevelopment: true
      })
      LoggerInitializer.isInitialized = true
    }
  }

  /**
   * 環境変数からのログ設定読み込み
   */
  private static loadEnvironmentConfig(): Partial<any> {
    const env = process.env as EnvLogConfig
    const config: any = {}

    // ログレベル設定
    if (env.KOENOTE_LOG_LEVEL) {
      config.globalLevel = LogLevel[env.KOENOTE_LOG_LEVEL as keyof typeof LogLevel]
    }

    // コンソール出力設定
    if (env.KOENOTE_LOG_ENABLE_CONSOLE) {
      config.enableConsoleOutput = env.KOENOTE_LOG_ENABLE_CONSOLE === 'true'
    }

    // パフォーマンスログ設定
    if (env.KOENOTE_LOG_ENABLE_PERFORMANCE) {
      config.enablePerformanceLogs = env.KOENOTE_LOG_ENABLE_PERFORMANCE === 'true'
    }

    // カテゴリフィルタ設定
    if (env.KOENOTE_LOG_CATEGORIES) {
      config.includeOnlyCategories = env.KOENOTE_LOG_CATEGORIES.split(',').map(c => c.trim())
    }

    if (env.KOENOTE_LOG_EXCLUDE_CATEGORIES) {
      config.excludeCategories = env.KOENOTE_LOG_EXCLUDE_CATEGORIES.split(',').map(c => c.trim())
    }

    return config
  }

  /**
   * システム情報のログ出力
   */
  private static logSystemInfo(): void {
    const logger = LoggerFactory.getLogger(LogCategories.SYSTEM_ELECTRON)
    
    // システム基本情報
    logger.debug('システム情報', {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      processId: process.pid,
      workingDirectory: process.cwd(),
      memoryUsage: process.memoryUsage()
    })

    // Logger統計情報
    const stats = LoggerFactory.getStats()
    logger.debug('Logger統計情報', stats)

    // ログ設定情報
    const debugInfo = LogConfigManager.getDebugInfo()
    logger.debug('ログ設定情報', debugInfo)
  }

  /**
   * パフォーマンス監視の開始
   */
  private static startPerformanceMonitoring(): void {
    const perfLogger = LoggerFactory.getLogger(LogCategories.PERF_MONITOR)
    
    // メモリ使用量監視
    setInterval(() => {
      const memUsage = process.memoryUsage()
      perfLogger.perf('メモリ使用量', {
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        external: `${Math.round(memUsage.external / 1024 / 1024)}MB`
      })
    }, 60000) // 1分間隔

    // Logger統計監視
    setInterval(() => {
      const stats = LoggerFactory.getStats()
      perfLogger.perf('Logger統計', stats)
    }, 300000) // 5分間隔

    perfLogger.info('パフォーマンス監視開始')
  }

  /**
   * 開発者向けデバッグユーティリティ
   */
  static enableDebugMode(): void {
    if (LoggerInitializer.appLogger) {
      LoggerInitializer.appLogger.info('デバッグモードを有効化')
    }

    // グローバルスコープにデバッグ関数を追加
    if (typeof window !== 'undefined') {
      (window as any).koeNoteLogDebug = {
        // ログレベル変更
        setLogLevel: (level: keyof typeof LogLevel) => {
          LoggerFactory.getLogger(LogCategories.APP).info(`ログレベルを${level}に変更`)
          LogConfigManager.updateConfig({ globalLevel: LogLevel[level] })
        },

        // カテゴリ別ログ統計
        getLogStats: () => {
          return LoggerFactory.getStats()
        },

        // システム情報表示
        showSystemInfo: () => {
          LoggerInitializer.logSystemInfo()
        },

        // 全カテゴリのテストログ出力
        testAllCategories: () => {
          Object.values(LogCategories).forEach(category => {
            const logger = LoggerFactory.getLogger(category)
            logger.debug(`テストログ: ${category}`)
          })
        },

        // ログ設定情報表示
        showConfig: () => {
          return LogConfigManager.getDebugInfo()
        }
      }

      LoggerInitializer.appLogger?.info('デバッグユーティリティをwindow.koeNoteLogDebugに追加')
    }
  }

  /**
   * 初期化状態の確認
   */
  static isReady(): boolean {
    return LoggerInitializer.isInitialized
  }

  /**
   * 初期化時間の取得
   */
  static getInitTime(): number {
    return LoggerInitializer.initStartTime > 0 
      ? performance.now() - LoggerInitializer.initStartTime 
      : 0
  }

  /**
   * ログシステムのシャットダウン
   */
  static shutdown(): void {
    if (LoggerInitializer.appLogger) {
      LoggerInitializer.appLogger.info('ログシステムシャットダウン開始')
    }

    // Factory のクリーンアップ
    LoggerFactory.clearAll()

    LoggerInitializer.isInitialized = false
    LoggerInitializer.initStartTime = 0

    console.log('ログシステムシャットダウン完了')
  }
}

/**
 * 便利な関数エクスポート
 */
export const initializeLogger = LoggerInitializer.initialize
export const enableLoggerDebugMode = LoggerInitializer.enableDebugMode
export const isLoggerReady = LoggerInitializer.isReady
export const shutdownLogger = LoggerInitializer.shutdown

/**
 * アプリケーション開始時の自動初期化
 */
if (typeof window !== 'undefined') {
  // ブラウザ環境での自動初期化
  document.addEventListener('DOMContentLoaded', () => {
    initializeLogger()
  })
} else if (typeof process !== 'undefined') {
  // Node.js環境での自動初期化
  process.nextTick(() => {
    initializeLogger()
  })
}