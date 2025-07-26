/**
 * LoggingMigrationHelper - 既存console.logからの移行支援
 * 
 * 既存のconsole.logパターンを新しいログシステムに変換するためのヘルパー関数
 */

import { LoggerFactory, LogCategories } from './LoggerFactory'

/**
 * 絵文字付きコンソールログパターンをログシステムに変換するマッピング
 */
export const EMOJI_TO_LOG_MAPPING = {
  // 成功・完了系
  '✅': 'info',
  '✓': 'info',
  '🎯': 'info',
  '🎆': 'info',
  '🎵': 'info',
  
  // 処理中・進行系
  '📝': 'debug',
  '📁': 'debug',
  '🔧': 'debug',
  '🔄': 'debug',
  '⏱️': 'debug',
  '🎛️': 'debug',
  
  // 警告系
  '⚠️': 'warn',
  '🔒': 'warn',
  
  // エラー系
  '❌': 'error',
  '🚫': 'error',
  
  // 情報系
  'ℹ️': 'info',
  '📊': 'info',
  '🌐': 'info',
  '👤': 'info',
  '🚀': 'debug'
} as const

/**
 * console.logの置き換えヘルパー関数
 */
export class LoggingMigrationHelper {
  
  /**
   * 絵文字付きログメッセージを解析してログレベルとメッセージを分離
   */
  static parseEmojiLog(message: string): {
    level: 'debug' | 'info' | 'warn' | 'error'
    cleanMessage: string
    emoji?: string
  } {
    // 絵文字を検出
    const emojiMatch = message.match(/^([🎯🎆🎵✅✓📝📁🔧🔄⏱️🎛️⚠️🔒❌🚫ℹ️📊🌐👤🚀])\s?/)
    
    if (emojiMatch) {
      const emoji = emojiMatch[1]
      const cleanMessage = message.replace(emojiMatch[0], '').trim()
      const level = EMOJI_TO_LOG_MAPPING[emoji as keyof typeof EMOJI_TO_LOG_MAPPING] || 'info'
      
      return { level, cleanMessage, emoji }
    }
    
    return { level: 'info', cleanMessage: message }
  }

  /**
   * ファイル名からカテゴリを推測
   */
  static inferCategoryFromContext(context?: string): keyof typeof LogCategories {
    if (!context) return 'DEBUG_GENERAL'
    
    const lowerContext = context.toLowerCase()
    
    // UI コンポーネント
    if (lowerContext.includes('bottompanel')) return 'UI_BOTTOM_PANEL'
    if (lowerContext.includes('speechrecognition')) return 'UI_SPEECH_RECOGNITION'
    if (lowerContext.includes('filelist')) return 'UI_FILE_LIST'
    if (lowerContext.includes('settings')) return 'UI_SETTINGS'
    
    // フック
    if (lowerContext.includes('recordingcontrol')) return 'HOOK_RECORDING_CONTROL'
    if (lowerContext.includes('devicemanager')) return 'HOOK_DEVICE_MANAGER'
    if (lowerContext.includes('bottompanelstate')) return 'HOOK_BOTTOM_PANEL_STATE'
    
    // サービス
    if (lowerContext.includes('recording')) return 'SERVICE_RECORDING'
    if (lowerContext.includes('transcription')) return 'SERVICE_TRANSCRIPTION'
    if (lowerContext.includes('filemanager')) return 'SERVICE_FILE_MANAGER'
    if (lowerContext.includes('audiomixing')) return 'SERVICE_AUDIO_MIXING'
    if (lowerContext.includes('microphonemonitor')) return 'SERVICE_MICROPHONE_MONITOR'
    
    // 音声処理
    if (lowerContext.includes('chunkprocessor')) return 'AUDIO_CHUNK_PROCESSOR'
    if (lowerContext.includes('differential')) return 'AUDIO_DIFFERENTIAL_GENERATOR'
    if (lowerContext.includes('chunkwatcher')) return 'AUDIO_CHUNK_WATCHER'
    
    // 文字起こし
    if (lowerContext.includes('engine')) return 'TRANSCRIPTION_ENGINE'
    if (lowerContext.includes('realtime')) return 'TRANSCRIPTION_REALTIME'
    if (lowerContext.includes('filebased')) return 'TRANSCRIPTION_FILE_BASED'
    
    return 'DEBUG_GENERAL'
  }

  /**
   * レガシーconsole.logを新しいログシステムに変換
   */
  static migrateConsoleLog(
    message: string, 
    data?: any, 
    context?: string
  ): void {
    const parsed = LoggingMigrationHelper.parseEmojiLog(message)
    const category = LoggingMigrationHelper.inferCategoryFromContext(context)
    const logger = LoggerFactory.getLogger(LogCategories[category])
    
    switch (parsed.level) {
      case 'debug':
        logger.debug(parsed.cleanMessage, data)
        break
      case 'info':
        logger.info(parsed.cleanMessage, data)
        break
      case 'warn':
        logger.warn(parsed.cleanMessage, data)
        break
      case 'error':
        logger.error(parsed.cleanMessage, data instanceof Error ? data : undefined, 
                    data instanceof Error ? undefined : data)
        break
    }
  }
}

/**
 * グローバル移行ヘルパー関数
 */

// 開発者向け便利関数：一時的にレガシーログを変換
export const legacyLog = (message: string, data?: any, context?: string) => {
  LoggingMigrationHelper.migrateConsoleLog(message, data, context)
}

// よく使われるパターンの短縮形
export const logSuccess = (message: string, data?: any, context?: string) => {
  LoggingMigrationHelper.migrateConsoleLog(`✅ ${message}`, data, context)
}

export const logError = (message: string, error?: Error, context?: string) => {
  LoggingMigrationHelper.migrateConsoleLog(`❌ ${message}`, error, context)
}

export const logWarning = (message: string, data?: any, context?: string) => {
  LoggingMigrationHelper.migrateConsoleLog(`⚠️ ${message}`, data, context)
}

export const logDebug = (message: string, data?: any, context?: string) => {
  LoggingMigrationHelper.migrateConsoleLog(`🔧 ${message}`, data, context)
}

export const logProcess = (message: string, data?: any, context?: string) => {
  LoggingMigrationHelper.migrateConsoleLog(`📝 ${message}`, data, context)
}

export const logFile = (message: string, data?: any, context?: string) => {
  LoggingMigrationHelper.migrateConsoleLog(`📁 ${message}`, data, context)
}

export const logNetwork = (message: string, data?: any, context?: string) => {
  LoggingMigrationHelper.migrateConsoleLog(`🌐 ${message}`, data, context)
}

export const logUser = (message: string, data?: any, context?: string) => {
  LoggingMigrationHelper.migrateConsoleLog(`👤 ${message}`, data, context)
}

/**
 * バッチ変換スクリプト用のパターンマッチング
 */
export const CONSOLE_LOG_PATTERNS = [
  // 成功パターン
  { pattern: /console\.log\('✅(.*)'\)/, replacement: "logger.info('$1')" },
  { pattern: /console\.log\('✓(.*)'\)/, replacement: "logger.info('$1')" },
  { pattern: /console\.log\('🎯(.*)'\)/, replacement: "logger.info('$1')" },
  
  // デバッグパターン
  { pattern: /console\.log\('📝(.*)'\)/, replacement: "logger.debug('$1')" },
  { pattern: /console\.log\('🔧(.*)'\)/, replacement: "logger.debug('$1')" },
  { pattern: /console\.log\('📁(.*)'\)/, replacement: "logger.fileIO('$1')" },
  
  // 警告パターン
  { pattern: /console\.warn\('⚠️(.*)'\)/, replacement: "logger.warn('$1')" },
  { pattern: /console\.log\('⚠️(.*)'\)/, replacement: "logger.warn('$1')" },
  
  // エラーパターン
  { pattern: /console\.error\('❌(.*)'\)/, replacement: "logger.error('$1')" },
  { pattern: /console\.log\('❌(.*)'\)/, replacement: "logger.error('$1')" },
  
  // 一般的なパターン
  { pattern: /console\.log\('(.*)'\)/, replacement: "logger.info('$1')" },
  { pattern: /console\.error\('(.*)'\)/, replacement: "logger.error('$1')" },
  { pattern: /console\.warn\('(.*)'\)/, replacement: "logger.warn('$1')" },
  { pattern: /console\.debug\('(.*)'\)/, replacement: "logger.debug('$1')" }
]

/**
 * 使用例とドキュメント
 */
export const MIGRATION_EXAMPLES = {
  // Before / After examples
  before: {
    success: "console.log('✅ 処理完了')",
    error: "console.error('❌ エラーが発生しました:', error)",
    debug: "console.log('🔧 デバッグ情報:', data)",
    warning: "console.warn('⚠️ 警告メッセージ')"
  },
  after: {
    success: "logger.info('処理完了')",
    error: "logger.error('エラーが発生しました', error)",
    debug: "logger.debug('デバッグ情報', data)",
    warning: "logger.warn('警告メッセージ')"
  }
}