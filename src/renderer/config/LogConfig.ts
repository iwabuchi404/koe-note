/**
 * LogConfig - 環境別ログ設定管理
 * 
 * 機能:
 * - 開発・本番環境別設定
 * - カテゴリ別ログレベル制御
 * - パフォーマンス設定
 * - ログ出力先設定
 */

import { LogLevel, LogContext } from '../utils/Logger'
import { LogCategory, LogCategories } from '../utils/LoggerFactory'

/**
 * 環境タイプ
 */
export enum Environment {
  DEVELOPMENT = 'development',
  PRODUCTION = 'production',
  TEST = 'test'
}

/**
 * カテゴリ別ログレベル設定
 */
export interface CategoryLogLevels {
  [category: string]: LogLevel
}

/**
 * ログ設定インターフェース
 */
export interface LoggingConfig {
  // 基本設定
  globalLevel: LogLevel
  environment: Environment
  enableConsoleOutput: boolean
  enableFileOutput: boolean
  
  // カテゴリ別設定
  categoryLevels: CategoryLogLevels
  
  // パフォーマンス設定
  enablePerformanceLogs: boolean
  enableDebugLogs: boolean
  maxLogHistorySize: number
  
  // 出力設定
  timestampFormat: string
  includeStackTrace: boolean
  
  // フィルタ設定
  excludeCategories: string[]
  includeOnlyCategories?: string[]
  
  // グローバルコンテキスト
  globalContext: LogContext
}

/**
 * 環境別デフォルト設定
 */
export const LOG_CONFIGS: Record<Environment, LoggingConfig> = {
  [Environment.DEVELOPMENT]: {
    globalLevel: LogLevel.DEBUG,
    environment: Environment.DEVELOPMENT,
    enableConsoleOutput: true,
    enableFileOutput: false,
    
    categoryLevels: {
      // UI系は詳細ログ
      [LogCategories.UI_BOTTOM_PANEL]: LogLevel.DEBUG,
      [LogCategories.UI_SPEECH_RECOGNITION]: LogLevel.DEBUG,
      [LogCategories.UI_FILE_LIST]: LogLevel.INFO,
      [LogCategories.UI_SETTINGS]: LogLevel.INFO,
      
      // フック系は中程度
      [LogCategories.HOOK_RECORDING_CONTROL]: LogLevel.DEBUG,
      [LogCategories.HOOK_DEVICE_MANAGER]: LogLevel.INFO,
      [LogCategories.HOOK_BOTTOM_PANEL_STATE]: LogLevel.INFO,
      
      // サービス系は詳細ログ（重要）
      [LogCategories.SERVICE_RECORDING]: LogLevel.DEBUG,
      [LogCategories.SERVICE_TRANSCRIPTION]: LogLevel.DEBUG,
      [LogCategories.SERVICE_FILE_MANAGER]: LogLevel.INFO,
      [LogCategories.SERVICE_AUDIO_MIXING]: LogLevel.DEBUG,
      [LogCategories.SERVICE_MICROPHONE_MONITOR]: LogLevel.INFO,
      
      // 音声処理系は詳細ログ
      [LogCategories.AUDIO_CHUNK_PROCESSOR]: LogLevel.DEBUG,
      [LogCategories.AUDIO_DIFFERENTIAL_GENERATOR]: LogLevel.DEBUG,
      [LogCategories.AUDIO_CHUNK_WATCHER]: LogLevel.INFO,
      
      // 文字起こし系は詳細ログ
      [LogCategories.TRANSCRIPTION_ENGINE]: LogLevel.DEBUG,
      [LogCategories.TRANSCRIPTION_REALTIME]: LogLevel.DEBUG,
      [LogCategories.TRANSCRIPTION_FILE_BASED]: LogLevel.DEBUG,
      
      // ファイル処理系は中程度
      [LogCategories.FILE_CHUNK_WATCHER]: LogLevel.INFO,
      [LogCategories.FILE_REALTIME_PROCESSOR]: LogLevel.DEBUG,
      [LogCategories.FILE_TEXT_MANAGER]: LogLevel.INFO,
      
      // ネットワーク系は警告以上
      [LogCategories.NETWORK_API]: LogLevel.INFO,
      [LogCategories.NETWORK_WEBSOCKET]: LogLevel.WARN,
      
      // システム系は情報以上
      [LogCategories.SYSTEM_ELECTRON]: LogLevel.INFO,
      [LogCategories.SYSTEM_PRELOAD]: LogLevel.INFO,
      [LogCategories.SYSTEM_MAIN]: LogLevel.INFO,
      
      // エラー処理系は警告以上
      [LogCategories.ERROR_HANDLER]: LogLevel.WARN,
      [LogCategories.ERROR_RECOVERY]: LogLevel.INFO,
      
      // パフォーマンス系はデバッグ
      [LogCategories.PERF_MONITOR]: LogLevel.DEBUG,
      [LogCategories.PERF_METRICS]: LogLevel.DEBUG,
      
      // デバッグ系はデバッグ
      [LogCategories.DEBUG_GENERAL]: LogLevel.DEBUG,
      [LogCategories.DEBUG_STATE]: LogLevel.DEBUG
    },
    
    enablePerformanceLogs: true,
    enableDebugLogs: true,
    maxLogHistorySize: 10000,
    
    timestampFormat: 'HH:mm:ss.SSS',
    includeStackTrace: true,
    
    excludeCategories: [],
    
    globalContext: {
      environment: 'development',
      version: '1.0.0'
    }
  },

  [Environment.PRODUCTION]: {
    globalLevel: LogLevel.WARN,
    environment: Environment.PRODUCTION,
    enableConsoleOutput: false,
    enableFileOutput: true,
    
    categoryLevels: {
      // 本番環境では重要なログのみ
      [LogCategories.APP]: LogLevel.INFO,
      
      // UI系は警告以上
      [LogCategories.UI_BOTTOM_PANEL]: LogLevel.WARN,
      [LogCategories.UI_SPEECH_RECOGNITION]: LogLevel.WARN,
      [LogCategories.UI_FILE_LIST]: LogLevel.ERROR,
      [LogCategories.UI_SETTINGS]: LogLevel.WARN,
      
      // サービス系は情報以上
      [LogCategories.SERVICE_RECORDING]: LogLevel.INFO,
      [LogCategories.SERVICE_TRANSCRIPTION]: LogLevel.INFO,
      [LogCategories.SERVICE_FILE_MANAGER]: LogLevel.WARN,
      [LogCategories.SERVICE_AUDIO_MIXING]: LogLevel.WARN,
      [LogCategories.SERVICE_MICROPHONE_MONITOR]: LogLevel.ERROR,
      
      // 音声処理系は警告以上
      [LogCategories.AUDIO_CHUNK_PROCESSOR]: LogLevel.WARN,
      [LogCategories.AUDIO_DIFFERENTIAL_GENERATOR]: LogLevel.WARN,
      [LogCategories.AUDIO_CHUNK_WATCHER]: LogLevel.ERROR,
      
      // 文字起こし系は情報以上
      [LogCategories.TRANSCRIPTION_ENGINE]: LogLevel.INFO,
      [LogCategories.TRANSCRIPTION_REALTIME]: LogLevel.INFO,
      [LogCategories.TRANSCRIPTION_FILE_BASED]: LogLevel.INFO,
      
      // ファイル処理系は警告以上
      [LogCategories.FILE_CHUNK_WATCHER]: LogLevel.WARN,
      [LogCategories.FILE_REALTIME_PROCESSOR]: LogLevel.INFO,
      [LogCategories.FILE_TEXT_MANAGER]: LogLevel.WARN,
      
      // ネットワーク系は情報以上
      [LogCategories.NETWORK_API]: LogLevel.INFO,
      [LogCategories.NETWORK_WEBSOCKET]: LogLevel.WARN,
      
      // システム系は警告以上
      [LogCategories.SYSTEM_ELECTRON]: LogLevel.WARN,
      [LogCategories.SYSTEM_PRELOAD]: LogLevel.WARN,
      [LogCategories.SYSTEM_MAIN]: LogLevel.WARN,
      
      // エラー処理系は情報以上
      [LogCategories.ERROR_HANDLER]: LogLevel.INFO,
      [LogCategories.ERROR_RECOVERY]: LogLevel.INFO,
      
      // パフォーマンス系は無効
      [LogCategories.PERF_MONITOR]: LogLevel.SILENT,
      [LogCategories.PERF_METRICS]: LogLevel.SILENT,
      
      // デバッグ系は無効
      [LogCategories.DEBUG_GENERAL]: LogLevel.SILENT,
      [LogCategories.DEBUG_STATE]: LogLevel.SILENT
    },
    
    enablePerformanceLogs: false,
    enableDebugLogs: false,
    maxLogHistorySize: 1000,
    
    timestampFormat: 'YYYY-MM-DD HH:mm:ss',
    includeStackTrace: false,
    
    excludeCategories: [
      LogCategories.DEBUG_GENERAL,
      LogCategories.DEBUG_STATE,
      LogCategories.PERF_MONITOR,
      LogCategories.PERF_METRICS
    ],
    
    globalContext: {
      environment: 'production',
      version: '1.0.0'
    }
  },

  [Environment.TEST]: {
    globalLevel: LogLevel.ERROR,
    environment: Environment.TEST,
    enableConsoleOutput: false,
    enableFileOutput: false,
    
    categoryLevels: {
      // テスト環境ではエラーのみ
      [LogCategories.APP]: LogLevel.ERROR,
      [LogCategories.ERROR_HANDLER]: LogLevel.ERROR,
      [LogCategories.ERROR_RECOVERY]: LogLevel.ERROR
    },
    
    enablePerformanceLogs: false,
    enableDebugLogs: false,
    maxLogHistorySize: 100,
    
    timestampFormat: 'HH:mm:ss',
    includeStackTrace: true,
    
    excludeCategories: [],
    
    globalContext: {
      environment: 'test',
      version: '1.0.0'
    }
  }
}

/**
 * ログ設定管理クラス
 */
export class LogConfigManager {
  private static currentConfig: LoggingConfig
  private static currentEnvironment: Environment

  /**
   * 環境を検出して設定を初期化
   */
  static initialize(): LoggingConfig {
    LogConfigManager.currentEnvironment = LogConfigManager.detectEnvironment()
    LogConfigManager.currentConfig = LOG_CONFIGS[LogConfigManager.currentEnvironment]
    
    return LogConfigManager.currentConfig
  }

  /**
   * 現在の環境を検出
   */
  private static detectEnvironment(): Environment {
    const nodeEnv = process.env.NODE_ENV
    
    switch (nodeEnv) {
      case 'production':
        return Environment.PRODUCTION
      case 'test':
        return Environment.TEST
      case 'development':
      default:
        return Environment.DEVELOPMENT
    }
  }

  /**
   * 現在の設定を取得
   */
  static getCurrentConfig(): LoggingConfig {
    if (!LogConfigManager.currentConfig) {
      LogConfigManager.initialize()
    }
    return LogConfigManager.currentConfig
  }

  /**
   * 現在の環境を取得
   */
  static getCurrentEnvironment(): Environment {
    if (!LogConfigManager.currentEnvironment) {
      LogConfigManager.initialize()
    }
    return LogConfigManager.currentEnvironment
  }

  /**
   * カテゴリ別ログレベルを取得
   */
  static getLogLevelForCategory(category: LogCategory): LogLevel {
    const config = LogConfigManager.getCurrentConfig()
    return config.categoryLevels[category] ?? config.globalLevel
  }

  /**
   * カテゴリがフィルタ対象かチェック
   */
  static isCategoryFiltered(category: LogCategory): boolean {
    const config = LogConfigManager.getCurrentConfig()
    
    // 除外カテゴリに含まれているかチェック
    if (config.excludeCategories.includes(category)) {
      return true
    }
    
    // 包含カテゴリが指定されている場合、それに含まれていないかチェック
    if (config.includeOnlyCategories && !config.includeOnlyCategories.includes(category)) {
      return true
    }
    
    return false
  }

  /**
   * 設定の部分更新
   */
  static updateConfig(updates: Partial<LoggingConfig>): void {
    LogConfigManager.currentConfig = {
      ...LogConfigManager.currentConfig,
      ...updates
    }
  }

  /**
   * デバッグ用設定情報取得
   */
  static getDebugInfo(): {
    environment: Environment
    globalLevel: string
    enabledCategories: string[]
    filteredCategories: string[]
  } {
    const config = LogConfigManager.getCurrentConfig()
    
    const allCategories = Object.values(LogCategories)
    const enabledCategories = allCategories.filter(category => 
      !LogConfigManager.isCategoryFiltered(category) &&
      LogConfigManager.getLogLevelForCategory(category) < LogLevel.SILENT
    )
    const filteredCategories = allCategories.filter(category => 
      LogConfigManager.isCategoryFiltered(category)
    )

    return {
      environment: LogConfigManager.currentEnvironment,
      globalLevel: LogLevel[config.globalLevel],
      enabledCategories,
      filteredCategories
    }
  }
}

/**
 * 便利な関数エクスポート
 */
export const getLogConfig = LogConfigManager.getCurrentConfig
export const getLogLevelForCategory = LogConfigManager.getLogLevelForCategory
export const isCategoryFiltered = LogConfigManager.isCategoryFiltered
export const initializeLogConfig = LogConfigManager.initialize