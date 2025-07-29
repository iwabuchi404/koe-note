/**
 * LoggerFactory - カテゴリ別Loggerインスタンス管理
 * 
 * 機能:
 * - カテゴリ別Logger生成
 * - インスタンスキャッシュ
 * - プリセットカテゴリ定義
 * - グローバル設定管理
 */

import { Logger, LogLevel, LogContext } from './Logger'

/**
 * プリセットカテゴリ定義
 */
export const LogCategories = {
  // アプリケーション全般
  APP: 'App',
  
  // UI コンポーネント
  UI_BOTTOM_PANEL: 'UI.BottomPanel',
  UI_SPEECH_RECOGNITION: 'UI.SpeechRecognition',
  UI_FILE_LIST: 'UI.FileList',
  UI_SETTINGS: 'UI.Settings',
  
  // タブシステム
  TAB_SYSTEM: 'Tab.System',
  
  // フック
  HOOK_RECORDING_CONTROL: 'Hook.RecordingControl',
  HOOK_DEVICE_MANAGER: 'Hook.DeviceManager',
  HOOK_BOTTOM_PANEL_STATE: 'Hook.BottomPanelState',
  
  // サービス
  SERVICE_RECORDING: 'Service.Recording',
  SERVICE_TRANSCRIPTION: 'Service.Transcription',
  SERVICE_FILE_MANAGER: 'Service.FileManager',
  SERVICE_AUDIO_MIXING: 'Service.AudioMixing',
  SERVICE_MICROPHONE_MONITOR: 'Service.MicrophoneMonitor',
  
  // 音声処理
  AUDIO_CHUNK_PROCESSOR: 'Audio.ChunkProcessor',
  AUDIO_DIFFERENTIAL_GENERATOR: 'Audio.DifferentialGenerator',
  AUDIO_CHUNK_WATCHER: 'Audio.ChunkWatcher',
  AUDIO_WEBM_PROCESSOR: 'Audio.WebMProcessor',
  AUDIO_CHUNK_GENERATOR: 'Audio.ChunkGenerator',
  
  // 文字起こし処理
  TRANSCRIPTION_ENGINE: 'Transcription.Engine',
  TRANSCRIPTION_REALTIME: 'Transcription.Realtime',
  TRANSCRIPTION_FILE_BASED: 'Transcription.FileBased',
  TRANSCRIPTION_QUEUE: 'Transcription.Queue',
  
  // ファイル処理
  FILE_CHUNK_WATCHER: 'File.ChunkWatcher',
  FILE_REALTIME_PROCESSOR: 'File.RealtimeProcessor',
  FILE_TEXT_MANAGER: 'File.TextManager',
  
  // ネットワーク
  NETWORK_API: 'Network.API',
  NETWORK_WEBSOCKET: 'Network.WebSocket',
  
  // システム
  SYSTEM_ELECTRON: 'System.Electron',
  SYSTEM_PRELOAD: 'System.Preload',
  SYSTEM_MAIN: 'System.Main',
  
  // エラー処理
  ERROR_HANDLER: 'Error.Handler',
  ERROR_RECOVERY: 'Error.Recovery',
  
  // パフォーマンス
  PERF_MONITOR: 'Perf.Monitor',
  PERF_METRICS: 'Perf.Metrics',
  
  // デバッグ
  DEBUG_GENERAL: 'Debug.General',
  DEBUG_STATE: 'Debug.State',
  
  // チャンクシステム
  CHUNK_PROCESSOR: 'Chunk.Processor',
  CHUNK_MANAGER: 'Chunk.Manager',
  CHUNK_WATCHER: 'Chunk.Watcher'
} as const

export type LogCategory = typeof LogCategories[keyof typeof LogCategories]

/**
 * Logger Factory クラス
 */
export class LoggerFactory {
  private static instances: Map<string, Logger> = new Map()
  private static initialized: boolean = false

  /**
   * ファクトリー初期化
   */
  static initialize(config?: {
    level?: LogLevel
    isDevelopment?: boolean
    globalContext?: LogContext
  }): void {
    if (LoggerFactory.initialized) return

    // グローバル設定を適用
    if (config?.level !== undefined) {
      Logger.setLevel(config.level)
    }

    if (config?.isDevelopment !== undefined) {
      Logger.setDevelopmentMode(config.isDevelopment)
    }

    LoggerFactory.initialized = true

    // デバッグ用にグローバル関数を公開
    if (typeof window !== 'undefined') {
      (window as any).setLogLevel = (level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SILENT') => {
        const logLevel = LogLevel[level as keyof typeof LogLevel]
        LoggerFactory.setLogLevel(logLevel)
        console.log(`✅ ログレベルを ${level} に変更しました`)
      }
      
      (window as any).getLogLevel = () => {
        const currentLevel = LoggerFactory.getCurrentLogLevel()
        const levelName = LogLevel[currentLevel]
        console.log(`📊 現在のログレベル: ${levelName}`)
        return levelName
      }
      
      (window as any).showLogHelp = () => {
        console.log(`
📋 ログレベル変更コマンド:
- setLogLevel('DEBUG')  - デバッグレベル（全てのログを表示）
- setLogLevel('INFO')   - 情報レベル（情報以上を表示） 
- setLogLevel('WARN')   - 警告レベル（警告以上を表示）
- setLogLevel('ERROR')  - エラーレベル（エラーのみ表示）
- setLogLevel('SILENT') - サイレント（ログ出力なし）
- getLogLevel()         - 現在のログレベルを確認
- showLogHelp()         - このヘルプを表示
        `)
      }
      
      console.log('📋 ログレベル変更機能が利用可能です。showLogHelp() でヘルプを表示できます。')
    }

    // 初期化ログ
    const appLogger = LoggerFactory.getLogger(LogCategories.APP)
    appLogger.info('LoggerFactory初期化完了', {
      level: LogLevel[config?.level || LogLevel.INFO],
      isDevelopment: config?.isDevelopment || false,
      categoriesCount: Object.keys(LogCategories).length
    })
  }

  /**
   * カテゴリ別Loggerインスタンス取得
   */
  static getLogger(category: LogCategory, context?: LogContext): Logger {
    const key = `${category}${context ? JSON.stringify(context) : ''}`
    
    if (!LoggerFactory.instances.has(key)) {
      LoggerFactory.instances.set(key, new Logger(category, context))
    }

    return LoggerFactory.instances.get(key)!
  }

  /**
   * 特定カテゴリのLoggerを全て削除
   */
  static clearCategory(category: LogCategory): void {
    const keysToDelete = Array.from(LoggerFactory.instances.keys())
      .filter(key => key.startsWith(category))
    
    keysToDelete.forEach(key => LoggerFactory.instances.delete(key))
  }

  /**
   * 全てのLoggerインスタンスをクリア
   */
  static clearAll(): void {
    LoggerFactory.instances.clear()
  }

  /**
   * アクティブなLoggerの統計情報
   */
  static getStats(): {
    totalInstances: number
    categories: string[]
    memoryUsage: string
  } {
    const categories = Array.from(new Set(
      Array.from(LoggerFactory.instances.keys())
        .map(key => key.split('{')[0]) // コンテキスト部分を除去
    ))

    return {
      totalInstances: LoggerFactory.instances.size,
      categories,
      memoryUsage: `${Math.round(LoggerFactory.instances.size * 0.1)}KB` // 概算
    }
  }

  /**
   * 環境別デフォルト設定
   */
  static getDefaultConfig(): {
    level: LogLevel
    isDevelopment: boolean
  } {
    const isDev = process.env.NODE_ENV === 'development'
    
    return {
      level: isDev ? LogLevel.DEBUG : LogLevel.WARN,
      isDevelopment: isDev
    }
  }

  /**
   * 動的にログレベルを変更
   */
  static setLogLevel(level: LogLevel): void {
    Logger.setLevel(level)
    const appLogger = LoggerFactory.getLogger(LogCategories.APP)
    appLogger.info('ログレベル変更', { newLevel: LogLevel[level] })
  }

  /**
   * 現在のログレベルを取得
   */
  static getCurrentLogLevel(): LogLevel {
    return (Logger as any).globalLevel || LogLevel.INFO
  }

  /**
   * プリセットLoggerファクトリーメソッド
   */
  
  // UI関連Logger
  static createUILogger(component: string, context?: LogContext): Logger {
    return LoggerFactory.getLogger(`UI.${component}` as LogCategory, context)
  }

  // サービス関連Logger
  static createServiceLogger(service: string, context?: LogContext): Logger {
    return LoggerFactory.getLogger(`Service.${service}` as LogCategory, context)
  }

  // 音声処理関連Logger
  static createAudioLogger(processor: string, context?: LogContext): Logger {
    return LoggerFactory.getLogger(`Audio.${processor}` as LogCategory, context)
  }

  // 文字起こし関連Logger
  static createTranscriptionLogger(engine: string, context?: LogContext): Logger {
    return LoggerFactory.getLogger(`Transcription.${engine}` as LogCategory, context)
  }

  // ファイル処理関連Logger
  static createFileLogger(processor: string, context?: LogContext): Logger {
    return LoggerFactory.getLogger(`File.${processor}` as LogCategory, context)
  }

  // エラー処理関連Logger
  static createErrorLogger(handler: string, context?: LogContext): Logger {
    return LoggerFactory.getLogger(`Error.${handler}` as LogCategory, context)
  }

  // パフォーマンス関連Logger
  static createPerfLogger(monitor: string, context?: LogContext): Logger {
    return LoggerFactory.getLogger(`Perf.${monitor}` as LogCategory, context)
  }
}

/**
 * 便利な関数エクスポート
 */

// よく使用されるLoggerの短縮形
export const createLogger = LoggerFactory.getLogger
export const getAppLogger = () => LoggerFactory.getLogger(LogCategories.APP)
export const getUILogger = (component: string) => LoggerFactory.createUILogger(component)
export const getServiceLogger = (service: string) => LoggerFactory.createServiceLogger(service)
export const getAudioLogger = (processor: string) => LoggerFactory.createAudioLogger(processor)
export const getTranscriptionLogger = (engine: string) => LoggerFactory.createTranscriptionLogger(engine)
export const getFileLogger = (processor: string) => LoggerFactory.createFileLogger(processor)

// グローバル初期化関数
export const initializeLogging = () => {
  const config = LoggerFactory.getDefaultConfig()
  LoggerFactory.initialize(config)
}