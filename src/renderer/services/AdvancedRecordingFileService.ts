/**
 * AdvancedRecordingFileService - 録音のファイル保存
 *
 * 実運用で使われるのは次の2つだけ:
 * - saveChunk: 録音チャンクを保存する
 * - appendTranscription: 文字起こしセグメントを .trans.txt に追記
 *
 * 過去のバッチ書き出し処理（saveRecording / saveAudioFile /
 * saveTranscriptionFile / getPresetOptions / showSaveDialog）は
 * 呼び出し元が存在しないため削除済み。
 *
 * Phase E で保存方法を変更した:
 *   以前はチャンクごとに「既存 mp3 を読み込み → 新規と結合 → 全体書き戻し」
 *   を行っていたため O(n²) になっていた。今は次の3つだけを書く。
 *     1. <base>.mp3        … 追記（O(1)/チャンク）
 *     2. <base>.chunks/chunk_NNN.mp3 … 不変ファイルとして新規保存
 *     3. <base>.manifest.json … チャンクインデックスの更新
 *   既存の mp3 と .trans.txt はそのまま残るので、再生もファイル一覧も
 *   壊れない。manifest には実測したバイト数と時刻だけを記録する。
 */

import { LoggerFactory, LogCategories } from '../utils/LoggerFactory'
import {
  TRANSCRIPT_HEADER_BOUNDARY,
  formatTranscriptHeader,
  formatTranscriptSegment,
  type TranscriptHeader,
  type TranscriptSegmentLine
} from '@shared/transcriptFile'
import {
  appendChunkToManifest,
  chunkDirName,
  chunkFileName,
  createManifest,
  formatManifest,
  manifestFileName,
  withTranscription,
  type ManifestTranscription,
  type RecordingManifest
} from '@shared/recordingManifest'
import type { AudioFormat } from '@shared/audioFormat'

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
   * 録音1セッション分の manifest をメモリ上に保持する
   *
   * renderer 侧的缓存。ディスクには manifest.json として書き出す。
   * key は録音のベースファイル名。
   */
  private static manifests = new Map<string, RecordingManifest>()

  /**
   * manifest を取得（未作成なら作成して保持する）
   *
   * RecordingContext は録音開始時に一度だけ呼び、以降は
   * saveChunk が内部で更新する。
   */
  static ensureManifest(
    baseName: string,
    format: AudioFormat,
    startedAt: string
  ): RecordingManifest {
    const existing = this.manifests.get(baseName)
    if (existing) {
      return existing
    }

    const created = createManifest({
      baseName,
      format,
      createdAt: startedAt
    })
    this.manifests.set(baseName, created)
    return created
  }

  /**
   * 録音チャンクを保存する
   *
   * 3 つの成果物を書く:
   *   1. <base>.<format>              … 追記（O(1)）
   *   2. <base>.chunks/chunk_NNN.<ext> … 不変ファイルとして新規保存
   *   3. <base>.manifest.json          … チャンクインデックスを更新
   */
  static async saveChunk(
    chunk: Blob,
    chunkNumber: number,
    baseName: string,
    format: 'mp3' | 'wav',
    workingDirectory?: string
  ): Promise<string> {
    const directory = workingDirectory || await this.getDefaultWorkingDirectory()
    const filePath = `${directory}/${baseName}.${format}`

    try {
      const arrayBuffer = await chunk.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      // 1) 既存 mp3 への追記（不要再読み込み）
      const appended = await window.electronAPI.appendFileToPath(filePath, buffer)
      if (!appended) {
        throw new Error('追記に失敗しました')
      }

      // 2) チャンク単体ファイルの保存（追記しない不変ファイル）
      const chunkPath = `${directory}/${chunkDirName(baseName)}/${chunkFileName(
        chunkNumber,
        format
      )}`
      const savedChunk = await window.electronAPI.saveFileToPath(chunkPath, buffer)
      if (!savedChunk) {
        throw new Error('チャンクファイルの保存に失敗しました')
      }

      // 3) manifest の更新
      await this.updateManifest(baseName, format, buffer.length, directory)

      logger.info(`チャンク#${chunkNumber}保存完了`, {
        filePath,
        chunkPath,
        bytes: buffer.length
      })
      return filePath
    } catch (error) {
      logger.error(`チャンク#${chunkNumber}保存エラー`, new Error(String(error)))
      throw new Error(
        `チャンク#${chunkNumber}の保存に失敗しました: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * manifest にチャンクを1件追記してディスクへ書き出す
   *
   * manifest は renderer 内存版を持ち、ディスクのファイルを毎回
   * 読み直さない。合計バイト数はチャンク配列から再計算する
   * （逐次加算だと食い違うため）。
   */
  private static async updateManifest(
    baseName: string,
    format: AudioFormat,
    bytes: number,
    directory: string
  ): Promise<RecordingManifest> {
    const current =
      this.manifests.get(baseName) ??
      createManifest({
        baseName,
        format,
        createdAt: new Date().toISOString()
      })

    const next = appendChunkToManifest(current, {
      bytes,
      recordedAt: new Date().toISOString()
    })
    this.manifests.set(baseName, next)

    const manifestPath = `${directory}/${manifestFileName(baseName)}`
    const written = await window.electronAPI.saveTextFile(manifestPath, formatManifest(next))
    if (!written) {
      throw new Error('manifest.json の保存に失敗しました')
    }

    return next
  }

  /**
   * manifest の文字起こし情報を更新してディスクへ書き出す
   *
   * 文字起こしが1件も無い録音（無音など）では trans.txt を作らないため、
   * manifest の transcription.enabled は false のままになる。
   */
  static async updateTranscriptionInManifest(
    baseName: string,
    transcription: ManifestTranscription
  ): Promise<void> {
    const current = this.manifests.get(baseName)
    if (!current) {
      logger.warn('manifest が未作成のため文字起こし情報を反映できません', { baseName })
      return
    }

    const next = withTranscription(current, transcription)
    this.manifests.set(baseName, next)

    const directory = await this.getDefaultWorkingDirectory()
    const manifestPath = `${directory}/${manifestFileName(baseName)}`
    const written = await window.electronAPI.saveTextFile(manifestPath, formatManifest(next))
    if (!written) {
      throw new Error('manifest.json の保存に失敗しました')
    }
  }

  /** メモリ上の manifest を取得（デバッグ・テスト用） */
  static peekManifest(baseName: string): RecordingManifest | undefined {
    return this.manifests.get(baseName)
  }

  /** セッション終了時にメモリ上の manifest を破棄する */
  static clearManifest(baseName: string): void {
    this.manifests.delete(baseName)
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
      const bodyStart = existing.indexOf(TRANSCRIPT_HEADER_BOUNDARY)
      const body =
        bodyStart >= 0 ? existing.slice(bodyStart + TRANSCRIPT_HEADER_BOUNDARY.length) : existing

      const header: TranscriptHeader = {
        audioFile: params.audioFileName,
        model: params.model,
        transcribedAt: params.transcribedAt,
        durationSeconds: params.durationSeconds,
        segmentCount: params.segmentCount,
        language: params.language,
        speakers: []
      }

      const segment: TranscriptSegmentLine = {
        chunkNumber,
        audioOffsetSeconds: params.audioOffsetSeconds,
        text
      }

      const content = formatTranscriptHeader(header) + body + formatTranscriptSegment(segment)
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

