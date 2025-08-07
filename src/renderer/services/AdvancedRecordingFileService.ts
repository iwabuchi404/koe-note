/**
 * AdvancedRecordingFileService - 新録音システム専用ファイル保存サービス
 * 音声ファイルと文字起こしテキストの統合保存機能
 */

import { AdvancedRecordingTabData } from '../types/TabTypes'
import { LoggerFactory, LogCategories } from '../utils/LoggerFactory'

const logger = LoggerFactory.getLogger(LogCategories.SERVICE_FILE_MANAGER)

export interface SaveFileOptions {
  baseName?: string // ベースファイル名（省略時は自動生成）
  saveAudio: boolean // 音声ファイルを保存するか
  saveTranscription: boolean // 文字起こしテキストを保存するか
  format: 'mp3' | 'wav' // 音声フォーマット
  includeTimestamps: boolean // テキストにタイムスタンプを含めるか
  workingDirectory?: string // 保存先ディレクトリ
}

export interface SaveResult {
  success: boolean
  audioFilePath?: string
  textFilePath?: string
  errors: string[]
}

export interface TranscriptionData {
  chunkNumber: number
  timestamp: Date
  text: string
  duration?: number
}

export interface TranscriptionMetadata {
  audioFile: string
  model: string
  transcribedAt: string
  duration: number
  segmentCount: number
  language: string
  speakers: string[]
  coverage: number
}

export interface TranscriptionSegment {
  start: number
  end: number
  text: string
  speaker?: string
  isEdited?: boolean
}

export class AdvancedRecordingFileService {
  
  /**
   * 録音データを統合保存
   */
  static async saveRecording(
    recordingData: AdvancedRecordingTabData,
    options: SaveFileOptions
  ): Promise<SaveResult> {
    const result: SaveResult = {
      success: false,
      errors: []
    }

    try {
      logger.info('録音データ保存開始', { options, chunksCount: recordingData.chunks.length })

      // ベースファイル名生成
      const baseName = options.baseName || this.generateBaseName(recordingData.startTime)
      
      // 作業ディレクトリの確認
      const workingDir = options.workingDirectory || await this.getDefaultWorkingDirectory()
      
      // 音声ファイル保存
      if (options.saveAudio && recordingData.chunks.length > 0) {
        try {
          const audioFilePath = await this.saveAudioFile(
            recordingData.chunks.map(chunk => chunk.blob),
            workingDir,
            baseName,
            options.format
          )
          result.audioFilePath = audioFilePath
          logger.info('音声ファイル保存完了', { path: audioFilePath })
        } catch (error) {
          const errorMessage = `音声ファイル保存失敗: ${error instanceof Error ? error.message : String(error)}`
          result.errors.push(errorMessage)
          logger.error('音声ファイル保存エラー', new Error(errorMessage))
        }
      }

      // 文字起こしテキスト保存
      if (options.saveTranscription) {
        try {
          const transcriptionData = this.extractTranscriptionData(recordingData)
          
          if (transcriptionData.length > 0) {
            const textFilePath = await this.saveTranscriptionFile(
              transcriptionData,
              workingDir,
              baseName,
              options.includeTimestamps
            )
            result.textFilePath = textFilePath
            logger.info('文字起こしファイル保存完了', { path: textFilePath })
          } else {
            result.errors.push('文字起こしデータが見つかりません')
          }
        } catch (error) {
          const errorMessage = `文字起こしファイル保存失敗: ${error instanceof Error ? error.message : String(error)}`
          result.errors.push(errorMessage)
          logger.error('文字起こしファイル保存エラー', new Error(errorMessage))
        }
      }

      // 成功判定
      result.success = result.errors.length === 0 && 
        ((!options.saveAudio || !!result.audioFilePath) && 
         (!options.saveTranscription || !!result.textFilePath))

      logger.info('録音データ保存完了', { success: result.success, errors: result.errors.length })
      return result

    } catch (error) {
      const errorMessage = `保存処理エラー: ${error instanceof Error ? error.message : String(error)}`
      result.errors.push(errorMessage)
      logger.error('保存処理エラー', new Error(errorMessage))
      return result
    }
  }

  /**
   * 音声ファイル保存
   */
  private static async saveAudioFile(
    chunks: Blob[],
    directory: string,
    baseName: string,
    format: 'mp3' | 'wav'
  ): Promise<string> {
    // チャンクを統合
    const combinedBlob = new Blob(chunks, { 
      type: format === 'mp3' ? 'audio/mp3' : 'audio/wav' 
    })

    const fileName = `${baseName}.${format}`
    const filePath = `${directory}/${fileName}`

    try {
      // BlobをArrayBufferに変換してBufferに変換
      const arrayBuffer = await combinedBlob.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      
      // saveToPath APIを使用（フルパス指定）
      const success = await window.electronAPI.saveFileToPath(filePath, buffer)
      
      if (success) {
        logger.info('音声ファイル保存完了', { filePath })
        return filePath
      } else {
        throw new Error('音声ファイルの保存に失敗しました')
      }
    } catch (error) {
      logger.error('音声ファイル保存エラー', new Error(String(error)))
      throw new Error(`音声ファイルの保存に失敗しました: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 文字起こしテキストファイル保存
   */
  private static async saveTranscriptionFile(
    transcriptionData: TranscriptionData[],
    directory: string,
    baseName: string,
    includeTimestamps: boolean
  ): Promise<string> {
    const fileName = `${baseName}.trans.txt`
    const filePath = `${directory}/${fileName}`

    // YAML+テキスト形式で内容生成
    const metadata = this.generateTranscriptionMetadata(transcriptionData, baseName)
    const content = this.formatTranscriptionContent(transcriptionData, metadata, includeTimestamps)

    try {
      // saveTextFile APIを使用
      const success = await window.electronAPI.saveTextFile(filePath, content)
      
      if (success) {
        logger.info('文字起こしファイル保存完了', { filePath })
        return filePath
      } else {
        throw new Error('文字起こしファイルの保存に失敗しました')
      }
    } catch (error) {
      logger.error('文字起こしファイル保存エラー', new Error(String(error)))
      throw new Error(`文字起こしファイルの保存に失敗しました: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 文字起こしデータ抽出
   */
  private static extractTranscriptionData(recordingData: AdvancedRecordingTabData): TranscriptionData[] {
    return recordingData.chunks
      .filter(chunk => chunk.transcriptionText && chunk.transcriptionText.trim())
      .map(chunk => ({
        chunkNumber: chunk.id,
        timestamp: chunk.timestamp,
        text: chunk.transcriptionText!,
        duration: undefined // 今後実装
      }))
      .sort((a, b) => a.chunkNumber - b.chunkNumber) // チャンク順でソート
  }

  /**
   * ベースファイル名生成（design-doc準拠）
   */
  private static generateBaseName(startTime: Date): string {
    const timestamp = startTime.toISOString()
      .replace(/:/g, '')
      .replace(/\./g, '')
      .replace(/[-T]/g, '_')
      .slice(0, 15) // YYYYMMDD_HHMMSS

    return `recording_${timestamp}`
  }

  /**
   * デフォルト作業ディレクトリ取得
   */
  private static async getDefaultWorkingDirectory(): Promise<string> {
    try {
      // 設定から保存フォルダを取得
      const settings = await window.electronAPI.loadSettings()
      if (settings && settings.saveFolder) {
        logger.info('設定フォルダを使用', { folder: settings.saveFolder })
        return settings.saveFolder
      }
      
      // フォールバック: Electron APIから作業ディレクトリを取得
      const workingDir = await window.electronAPI.getWorkingDirectory()
      return workingDir || './recordings'
    } catch (error) {
      logger.warn('作業ディレクトリ取得失敗、デフォルトを使用', { error })
      return './recordings'
    }
  }

  /**
   * 保存オプションのプリセット
   */
  static getPresetOptions(): Record<string, SaveFileOptions> {
    return {
      audioOnly: {
        saveAudio: true,
        saveTranscription: false,
        format: 'mp3',
        includeTimestamps: false
      },
      transcriptionOnly: {
        saveAudio: false,
        saveTranscription: true,
        format: 'mp3',
        includeTimestamps: true
      },
      both: {
        saveAudio: true,
        saveTranscription: true,
        format: 'mp3',
        includeTimestamps: true
      },
      bothPlainText: {
        saveAudio: true,
        saveTranscription: true,
        format: 'mp3',
        includeTimestamps: false
      }
    }
  }

  /**
   * チャンク単位での音声ファイル保存（追記）
   */
  static async saveChunk(
    chunk: Blob,
    chunkNumber: number,
    baseName: string,
    format: 'mp3' | 'wav',
    workingDirectory?: string
  ): Promise<string> {
    const directory = workingDirectory || await this.getDefaultWorkingDirectory()
    const fileName = `${baseName}.${format}`
    const filePath = `${directory}/${fileName}`

    try {
      // 既存ファイルがある場合は結合、ない場合は新規作成
      let finalBlob: Blob
      
      try {
        // 既存ファイルを読み込み
        const existingBuffer = await window.electronAPI.readFile(filePath)
        const existingBlob = new Blob([existingBuffer], { 
          type: format === 'mp3' ? 'audio/mp3' : 'audio/wav' 
        })
        
        // 既存ファイルと新しいチャンクを結合
        finalBlob = new Blob([existingBlob, chunk], { 
          type: format === 'mp3' ? 'audio/mp3' : 'audio/wav' 
        })
        
        logger.info(`チャンク#${chunkNumber}を既存ファイルに追記`, { filePath })
      } catch (error) {
        // ファイルが存在しない場合は新規作成
        finalBlob = chunk
        logger.info(`チャンク#${chunkNumber}で新規ファイル作成`, { filePath })
      }

      // BlobをArrayBufferに変換してBufferに変換
      const arrayBuffer = await finalBlob.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      
      // saveToPath APIを使用（フルパス指定）
      const success = await window.electronAPI.saveFileToPath(filePath, buffer)
      
      if (success) {
        logger.info(`チャンク#${chunkNumber}保存完了`, { filePath })
        return filePath
      } else {
        throw new Error(`チャンク#${chunkNumber}の保存に失敗しました`)
      }
    } catch (error) {
      logger.error(`チャンク#${chunkNumber}保存エラー`, new Error(String(error)))
      throw new Error(`チャンク#${chunkNumber}の保存に失敗しました: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * 文字起こし結果をファイルに追記
   */
  static async appendTranscription(
    chunkNumber: number,
    text: string,
    timestamp: Date,
    baseName: string,
    includeTimestamps: boolean = true,
    workingDirectory?: string
  ): Promise<string> {
    const directory = workingDirectory || await this.getDefaultWorkingDirectory()
    const fileName = `${baseName}.trans.txt`
    const filePath = `${directory}/${fileName}`

    try {
      let content = ''
      
      // 既存ファイルの内容を読み込み
      try {
        const existingBuffer = await window.electronAPI.readFile(filePath)
        content = Buffer.from(existingBuffer).toString('utf-8')
      } catch (error) {
        // ファイルが存在しない場合はヘッダーを作成
        if (includeTimestamps) {
          // 新規ファイル作成時はメタデータヘッダーを生成
          const tempData: TranscriptionData[] = [{ chunkNumber, timestamp, text }]
          const metadata = this.generateTranscriptionMetadata(tempData, baseName)
          content = this.formatTranscriptionMetadataHeader(metadata)
        }
      }

      // 新しい文字起こし結果を追記
      let newLine = ''
      if (includeTimestamps) {
        // HH:MM:SS.s 形式に変換
        const timeString = this.formatTimestamp(timestamp)
        newLine = `[${timeString}] ${text}\n`
      } else {
        newLine = `${text}\n`
      }

      content += newLine

      const success = await window.electronAPI.saveTextFile(filePath, content)
      
      if (success) {
        logger.info(`チャンク#${chunkNumber}文字起こしを追記`, { filePath, text: text.substring(0, 50) + '...' })
        return filePath
      } else {
        throw new Error(`チャンク#${chunkNumber}の文字起こし追記に失敗しました`)
      }
    } catch (error) {
      logger.error(`チャンク#${chunkNumber}文字起こし追記エラー`, new Error(String(error)))
      throw new Error(`チャンク#${chunkNumber}の文字起こし追記に失敗しました: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * ファイル保存ダイアログ表示
   */
  static async showSaveDialog(
    defaultName: string,
    filters: Array<{ name: string, extensions: string[] }>
  ): Promise<string | null> {
    try {
      const filePath = await window.electronAPI.showSaveDialog({
        defaultPath: defaultName,
        filters
      })
      return filePath
    } catch (error) {
      logger.error('ファイル保存ダイアログエラー', new Error(String(error)))
      // ダイアログが利用できない場合は、現在時刻をベースとしたファイル名を返す
      const timestamp = new Date().toISOString()
        .replace(/:/g, '')
        .replace(/\./g, '')
        .replace(/[-T]/g, '_')
        .slice(0, 15) // YYYYMMDD_HHMMSS
      return `./recordings/${defaultName}_${timestamp}`
    }
  }

  /**
   * 文字起こしメタデータ生成
   */
  private static generateTranscriptionMetadata(
    transcriptionData: TranscriptionData[],
    baseName: string
  ): TranscriptionMetadata {
    const now = new Date().toISOString()
    const totalDuration = transcriptionData.length > 0 
      ? (transcriptionData[transcriptionData.length - 1].timestamp.getTime() - transcriptionData[0].timestamp.getTime()) / 1000
      : 0
    
    return {
      audioFile: `${baseName}.mp3`,
      model: 'kotoba-whisper-medium',
      transcribedAt: now,
      duration: totalDuration,
      segmentCount: transcriptionData.length,
      language: 'ja',
      speakers: [],
      coverage: 95.0 // 仮の値、将来的に実際の計算に変更
    }
  }

  /**
   * YAML+テキスト形式で文字起こし内容をフォーマット
   */
  private static formatTranscriptionContent(
    transcriptionData: TranscriptionData[],
    metadata: TranscriptionMetadata,
    includeTimestamps: boolean
  ): string {
    let content = ''
    
    // YAMLメタデータヘッダー
    content += '---\n'
    content += `audio_file: ${metadata.audioFile}\n`
    content += `model: ${metadata.model}\n`
    content += `transcribed_at: ${metadata.transcribedAt}\n`
    content += `duration: ${metadata.duration.toFixed(3)}\n`
    content += `segment_count: ${metadata.segmentCount}\n`
    content += `language: ${metadata.language}\n`
    content += `speakers: []\n`
    content += `coverage: ${metadata.coverage.toFixed(1)}\n`
    content += '---\n\n'
    
    // 文字起こし内容
    if (includeTimestamps) {
      transcriptionData.forEach((data) => {
        const timeString = this.formatTimestamp(data.timestamp)
        content += `[${timeString}] ${data.text}\n`
      })
    } else {
      content = transcriptionData
        .map(data => data.text)
        .filter(text => text && text.trim())
        .join('\n')
    }
    
    return content
  }

  /**
   * YAMLメタデータヘッダーのみ生成（追記モード用）
   */
  private static formatTranscriptionMetadataHeader(metadata: TranscriptionMetadata): string {
    let content = ''
    content += '---\n'
    content += `audio_file: ${metadata.audioFile}\n`
    content += `model: ${metadata.model}\n`
    content += `transcribed_at: ${metadata.transcribedAt}\n`
    content += `duration: ${metadata.duration.toFixed(3)}\n`
    content += `segment_count: ${metadata.segmentCount}\n`
    content += `language: ${metadata.language}\n`
    content += `speakers: []\n`
    content += `coverage: ${metadata.coverage.toFixed(1)}\n`
    content += '---\n\n'
    return content
  }

  /**
   * タイムスタンプをHH:MM:SS.s形式にフォーマット
   */
  private static formatTimestamp(timestamp: Date): string {
    const hours = timestamp.getHours().toString().padStart(2, '0')
    const minutes = timestamp.getMinutes().toString().padStart(2, '0')
    const seconds = timestamp.getSeconds().toString().padStart(2, '0')
    const milliseconds = Math.floor(timestamp.getMilliseconds() / 100)
    return `${hours}:${minutes}:${seconds}.${milliseconds}`
  }
}