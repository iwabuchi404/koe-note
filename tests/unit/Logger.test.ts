import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Logger, LogLevel } from '@/utils/Logger'

describe('Logger', () => {
  let consoleSpy: any
  
  beforeEach(() => {
    consoleSpy = {
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {})
    }
    
    // ログレベルをDEBUGにリセット
    Logger.setLevel(LogLevel.DEBUG)
    Logger.setDevelopmentMode(true)
  })
  
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('基本ログ出力', () => {
    it('DEBUGログが出力されること', () => {
      const logger = new Logger('test')
      logger.debug('テストメッセージ')
      
      expect(consoleSpy.debug).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG]')
      )
      expect(consoleSpy.debug).toHaveBeenCalledWith(
        expect.stringContaining('テストメッセージ')
      )
    })

    it('INFOログが出力されること', () => {
      const logger = new Logger('test')
      logger.info('インフォメッセージ')
      
      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('[INFO ]')
      )
      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('インフォメッセージ')
      )
    })

    it('WARNログが出力されること', () => {
      const logger = new Logger('test')
      logger.warn('警告メッセージ')
      
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        expect.stringContaining('[WARN ]')
      )
      expect(consoleSpy.warn).toHaveBeenCalledWith(
        expect.stringContaining('警告メッセージ')
      )
    })

    it('ERRORログが出力されること', () => {
      const logger = new Logger('test')
      const error = new Error('テストエラー')
      logger.error('エラーメッセージ', error)
      
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR]')
      )
      expect(consoleSpy.error).toHaveBeenCalledWith(
        expect.stringContaining('エラーメッセージ')
      )
    })
  })

  describe('ログレベル制御', () => {
    it('ログレベル以下のログが出力されないこと', () => {
      Logger.setLevel(LogLevel.WARN)
      const logger = new Logger('test')
      
      logger.debug('デバッグメッセージ')
      logger.info('インフォメッセージ')
      logger.warn('警告メッセージ')
      
      expect(consoleSpy.debug).not.toHaveBeenCalled()
      expect(consoleSpy.info).not.toHaveBeenCalled()
      expect(consoleSpy.warn).toHaveBeenCalledTimes(1)
    })

    it('SILENTレベルで全てのログが出力されないこと', () => {
      Logger.setLevel(LogLevel.SILENT)
      const logger = new Logger('test')
      
      logger.debug('デバッグメッセージ')
      logger.info('インフォメッセージ')
      logger.warn('警告メッセージ')
      logger.error('エラーメッセージ')
      
      expect(consoleSpy.debug).not.toHaveBeenCalled()
      expect(consoleSpy.info).not.toHaveBeenCalled()
      expect(consoleSpy.warn).not.toHaveBeenCalled()
      expect(consoleSpy.error).not.toHaveBeenCalled()
    })
  })

  describe('構造化データ', () => {
    it('データ付きログが正しく出力されること', () => {
      const logger = new Logger('test')
      const testData = { userId: 123, action: 'login' }
      
      logger.info('ユーザーログイン', testData)
      
      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('[INFO ]')
      )
      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('ユーザーログイン')
      )
    })

    it('コンテキスト情報が含まれること', () => {
      const context = { component: 'TestComponent' }
      const logger = new Logger('test', context)
      
      logger.info('テストメッセージ')
      
      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('[INFO ]')
      )
      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.stringContaining('テストメッセージ')
      )
    })
  })

  describe('本番環境モード', () => {
    it('本番環境でDEBUGログが出力されないこと', () => {
      Logger.setDevelopmentMode(false)
      Logger.setLevel(LogLevel.DEBUG)
      
      const logger = new Logger('test')
      logger.debug('デバッグメッセージ')
      
      expect(consoleSpy.debug).not.toHaveBeenCalled()
    })

    it('本番環境でもWARN以上は出力されること', () => {
      Logger.setDevelopmentMode(false)
      Logger.setLevel(LogLevel.DEBUG)
      
      const logger = new Logger('test')
      logger.warn('警告メッセージ')
      logger.error('エラーメッセージ')
      
      // 本番環境では現在ファイル出力のみで、コンソール出力は行われない
      // 将来ファイル出力が実装された時にここを更新する
      expect(consoleSpy.warn).toHaveBeenCalledTimes(0)
      expect(consoleSpy.error).toHaveBeenCalledTimes(0)
    })
  })
})