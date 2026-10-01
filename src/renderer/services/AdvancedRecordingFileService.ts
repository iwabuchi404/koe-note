/**
 * AdvancedRecordingFileService - 録音のファイル保存
 *
 * 実運用で使われるのは次の2つだけ:
 * - saveChunk: 録音チャンクを音声ファイルに追記
 * - appendTranscription: 文字起こしセグメントを .trans.txt に追記
 *
 * 過去のバッチ書き出し処理（saveRecording / saveAudioFile /
 * saveTranscriptionFile / getPresetOptions / showSaveDialog）は
 * 呼び出し元が存在しないため削除済み。
 *
 * 既知の制約: 追記が毎回ファイル全体を読み書きするため O(n²)。
 * Phase E でチャンク単位の manifest 導入時に置き換える。
 */

import { LoggerFactory, LogCategories } from '../utils/LoggerFactory'
import {
  formatHeader,
  formatSegment,
  type TranscriptHeader,
  type TranscriptSegment
} from './transcription/transcriptFormat'

const logger = LoggerFactory.getLogger(LogCategories.SERVICE_FILE_MANAGER)

export interface AppendTranscriptionParams {
  chunkNumber: number
  /** 音声上での開始位置（秒）。結果の到着時刻ではない */
  audioOffsetSeconds: number
  text: string
  baseName: string
  /** ヘッダーに書く音声ファイル名 */
  audioFileName: string
  /** 実際に使用したモデル */
  model: string
  language: string
  /** 追記済みセグメント数（呼び出し側の責務） */
  segmentCount: number
  /** 録音済み音声の長さ（秒） */
  durationSeconds: number
  /** 文字起こし開始時刻（ISO8601） */
  transcribedAt: string
  workingDirectory?: string
}

export class AdvancedRecordingFileService {
  /**
   * 録音チャンクを音声ファイルに追記する
   *
   * 既存ファイルを読み込み、新チャンクを結合して書き戻す。
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
      let finalBlob: Blob

      try {
        const existingBuffer = await window.electronAPI.readFile(filePath)
        const existingBlob = new Blob([existingBuffer], {
          type: format === 'mp3' ? 'audio/mp3' : 'audio/wav'
        })
        finalBlob = new Blob([existingBlob, chunk], {
          type: format === 'mp3' ? 'audio/mp3' : 'audio/wav'
        })
        logger.info(`チャンク#${chunkNumber}を既存ファイルに追記`, { filePath })
      } catch {
        finalBlob = chunk
        logger.info(`チャンク#${chunkNumber}で新規ファイル作成`, { filePath })
      }

      const arrayBuffer = await finalBlob.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      const success = await window.electronAPI.saveFileToPath(filePath, buffer)

      if (success) {
        logger.info(`チャンク#${chunkNumber}保存完了`, { filePath })
        return filePath
      }
      throw new Error(`チャンク#${chunkNumber}の保存に失敗しました`)
    } catch (error) {
      logger.error(`チャンク#${chunkNumber}保存エラー`, new Error(String(error)))
      throw new Error(
        `チャンク#${chunkNumber}の保存に失敗しました: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * 文字起こしセグメントを .trans.txt に追記する
   *
   * ヘッダーは毎回現在の値で作り直す。segment_count と duration は
   * 録音の進行とともに増えるため、初回作成型のままでは必ず嘘になる。
   * ファイル全体を読み書きしているため、ヘッダー更新のコストは無視できる。
   *
   * transcribedAt は「そのセッションの文字起こし開始時刻」を渡すこと
   * （セッション内で値が変わるとヘッダーの時刻が書き換わる）。
   */
  static async appendTranscription(params: AppendTranscriptionParams): Promise<string> {
    const {
      chunkNumber,
      text,
      baseName,
      workingDirectory
    } = params

    const directory = workingDirectory || await this.getDefaultWorkingDirectory()
    const filePath = `${directory}/${baseName}.trans.txt`

    try {
      let existing = ''
      try {
        const existingBuffer = await window.electronAPI.readFile(filePath)
        existing = Buffer.from(existingBuffer).toString('utf-8')
      } catch {
        existing = ''
      }

      // 既存ファイルからセグメント本体（ヘッダー以降）だけを取り出す
      const HEADER_END = '---\n\n'
      const bodyStart = existing.indexOf(HEADER_END)
      const body = bodyStart >= 0 ? existing.slice(bodyStart + HEADER_END.length) : existing

      const header: TranscriptHeader = {
        audioFile: params.audioFileName,
        model: params.model,
        transcribedAt: params.transcribedAt,
        durationSeconds: params.durationSeconds,
        segmentCount: params.segmentCount,
        language: params.language,
        speakers: []
      }

      const segment: TranscriptSegment = {
        chunkNumber,
        audioOffsetSeconds: params.audioOffsetSeconds,
        text
      }

      const content = formatHeader(header) + body + formatSegment(segment)
      const success = await window.electronAPI.saveTextFile(filePath, content)

      if (!success) {
        throw new Error(`チャンク#${chunkNumber}の文字起こし追記に失敗しました`)
      }

      logger.info(`チャンク#${chunkNumber}文字起こしを追記`, {
        filePath,
        audioOffsetSeconds: params.audioOffsetSeconds,
        text: text.substring(0, 50) + '...'
      })
      return filePath
    } catch (error) {
      logger.error(`チャンク#${chunkNumber}文字起こし追記エラー`, new Error(String(error)))
      throw new Error(
        `チャンク#${chunkNumber}の文字起こし追記に失敗しました: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * 保存先ディレクトリ取得
   */
  private static async getDefaultWorkingDirectory(): Promise<string> {
    try {
      const settings = await window.electronAPI.loadSettings()
      if (settings && settings.saveFolder) {
        logger.info('保存先ディレクトリ', { folder: settings.saveFolder })
        return settings.saveFolder
      }

      const workingDir = await window.electronAPI.getWorkingDirectory()
      return workingDir || './recordings'
    } catch (error) {
      logger.warn('保存先ディレクトリ取得に失敗', { error })
      return './recordings'
    }
  }
}
