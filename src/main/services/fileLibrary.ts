/**
 * ファイル一覧の走査と分類
 *
 * 此前は main.ts の ipcMain.handle('file:getList') に192行のロジックが1本にまとまっていた。
 * ディレクトリ走査・分類・ペアリング・ソートが全部入り、
 * さらに 1 ファイルごとに writeLog していた（実測で1062件のフォルダを
 * 読むたびに1062行のログが出力される。録音開始/停止のたびに起きる）。
 *
 * ここでは「分類とペアリング」を純粋関数として切り出し（テストできる）、
 * IOだけをこのモジュールに置く。
 */
import fs from 'fs'
import path from 'path'
import type { AudioFile, AudioFileFormat } from '@shared/types'
import { SESSIONS_DIR, sessionTotalBytes, type Session } from '@shared/session'
import { listSessions } from './sessionStore'
import { transcriptionBaseName } from '../core/paths'

const AUDIO_EXTENSIONS = new Set(['webm', 'wav', 'mp3'])
const TEXT_EXTENSIONS = new Set(['txt', 'md'])

export type FileKind = 'audio' | 'transcription' | 'realtime-transcription' | 'text' | 'other'

/**
 * ファイル名から種別を判定する
 *
 * 注意: 判定は拡張子「より長い拡張子を先に」見る。
 * `a.trans.txt` は .txt ではなく transcription として扱う。
 */
export function classifyFileName(fileName: string): FileKind {
  const extension = path.extname(fileName).slice(1).toLowerCase()

  if (transcriptionBaseName(fileName) !== null) return 'transcription'
  if (fileName.endsWith('.rt.txt')) return 'realtime-transcription'
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio'
  if (TEXT_EXTENSIONS.has(extension)) return 'text'
  return 'other'
}

/** 音声ファイルの形式（分類が audio のときだけ使う） */
export function audioFormatOf(fileName: string): AudioFileFormat {
  const extension = path.extname(fileName).slice(1).toLowerCase()
  return (AUDIO_EXTENSIONS.has(extension) ? extension : 'mp3') as AudioFileFormat
}

/** 1ファイル分の情報（stat結果はテストで差し替えられる） */
export interface FileEntry {
  name: string
  size: number
  createdAt: Date
  /** .meta.json から読み取った再生時間（秒）。無ければ0 */
  duration: number
}

/**
 * ファイル群を、音声＋文字起こしのペアに整理する
 *
 * ルール:
 * - 音声ファイルに対応する .trans.txt / _transcription.txt があればペアにする
 * - ペアにならなかった文字起こしファイルは単独で残す
 * - 音声＋テキストは両方残す
 * - 最終並びは作成日時の降順
 */
export function buildFileList(entries: FileEntry[]): AudioFile[] {
  const audio: Array<AudioFile & { duration: number }> = []
  const transcriptions: Array<AudioFile & { baseFileName: string }> = []
  const others: AudioFile[] = []

  for (const entry of entries) {
    const kind = classifyFileName(entry.name)
    const base = {
      id: entry.name,
      filename: entry.name,
      size: entry.size,
      createdAt: entry.createdAt
    }

    switch (kind) {
      case 'audio':
        audio.push({
          ...base,
          filepath: entry.name,
          format: audioFormatOf(entry.name),
          duration: entry.duration,
          isAudioFile: true,
          isRealtimeTranscription: false
        })
        break

      case 'transcription': {
        const baseFileName = transcriptionBaseName(entry.name)
        if (baseFileName === null) break
        transcriptions.push({
          ...base,
          filepath: entry.name,
          format: 'txt',
          duration: 0,
          isTranscriptionFile: true,
          baseFileName
        })
        break
      }

      case 'realtime-transcription':
        others.push({
          ...base,
          filepath: entry.name,
          format: 'rt.txt',
          duration: 0,
          isRealtimeTranscription: true
        })
        break

      case 'text':
        others.push({
          ...base,
          filepath: entry.name,
          format: path.extname(entry.name).slice(1).toLowerCase() === 'md' ? 'md' : 'txt',
          duration: 0,
          isTextFile: true
        })
        break

      default:
        break
    }
  }

  // 音声と文字起こしのペアリング
  const result: AudioFile[] = []
  const usedTranscriptions = new Set<string>()

  for (const audioFile of audio) {
    const baseName = path.parse(audioFile.filename).name
    const match = transcriptions.find(
      (candidate) => candidate.baseFileName === baseName && !usedTranscriptions.has(candidate.filename)
    )

    if (match) {
      usedTranscriptions.add(match.filename)
      result.push({
        ...audioFile,
        hasTranscriptionFile: true,
        transcriptionPath: match.filepath,
        transcriptionSize: match.size,
        isPairedFile: true
      })
    } else {
      result.push({ ...audioFile, hasTranscriptionFile: false, isPairedFile: false })
    }
  }

  // ペアにならなかった文字起こしファイル
  for (const transcription of transcriptions) {
    if (usedTranscriptions.has(transcription.filename)) continue
    result.push({
      id: transcription.filename,
      filename: transcription.filename,
      filepath: transcription.filepath,
      format: 'txt',
      size: transcription.size,
      createdAt: transcription.createdAt,
      duration: 0,
      isTextFile: true,
      isTranscriptionFile: true,
      isPairedFile: false
    })
  }

  result.push(...others)
  return result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}

/**
 * セッションをファイル一覧の AudioFile 形に写す
 *
 * filepath は sessions/<id>/（相対）。呼び出し側が folderPath を前置する。
 * transcriptionPath は最初の completed（無ければ先頭）の transcript を指す。
 */
export function sessionToAudioFile(folderPath: string, session: Session): AudioFile {
  const sessionDir = path.join(SESSIONS_DIR, session.id)
  const source = session.sources.find((s) => s.enabled) ?? session.sources[0]
  const transcript =
    session.transcripts.find((t) => t.status === 'completed') ?? session.transcripts[0]

  const transcriptAbsolutePath = transcript
    ? path.join(folderPath, sessionDir, transcript.file)
    : null
  const hasTranscript =
    transcriptAbsolutePath !== null && fs.existsSync(transcriptAbsolutePath)

  return {
    id: `session-${session.id}`,
    filename: session.id,
    filepath: sessionDir,
    format: (source?.audio.format ?? 'wav') as AudioFileFormat,
    size: sessionTotalBytes(session),
    createdAt: new Date(session.createdAt),
    duration: session.recording.durationSeconds,
    isAudioFile: true,
    isSession: true,
    sessionId: session.id,
    isRealtimeTranscription: false,
    hasTranscriptionFile: hasTranscript,
    transcriptionPath: hasTranscript ? transcriptAbsolutePath! : undefined,
    isPairedFile: hasTranscript
  }
}

/** 1ファイル分の統計（メタファイルが存在しなければ 0） */
export function readDurationFromMeta(folderPath: string, fileName: string): number {
  const metaPath = path.join(folderPath, `${fileName}.meta.json`)
  try {
    if (!fs.existsSync(metaPath)) return 0
    const parsed = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    return typeof parsed.duration === 'number' ? parsed.duration : 0
  } catch {
    return 0
  }
}

/**
 * ディレクトリを読み取ってファイル一覧を組み立てる
 *
 * ログは要約のみ（此前は1ファイルごとに書いていた）。
 */
export function listFiles(folderPath: string, log?: (message: string) => void): AudioFile[] {
  if (!fs.existsSync(folderPath)) {
    return []
  }

  const entries: FileEntry[] = []

  for (const name of fs.readdirSync(folderPath)) {
    const kind = classifyFileName(name)
    if (kind === 'other') continue

    const fullPath = path.join(folderPath, name)
    let stats: fs.Stats
    try {
      stats = fs.statSync(fullPath)
    } catch {
      continue
    }
    if (!stats.isFile()) continue

    entries.push({
      name,
      size: stats.size,
      createdAt: stats.birthtime,
      duration: kind === 'audio' ? readDurationFromMeta(folderPath, name) : 0
    })
  }

  const files = buildFileList(entries)

  // v2 セッションを一覧に混ぜる（sessions/<id>/ 配下の録音）。
  // filepath は session ディレクトリ — file:loadAudio がディレクトリを
  // 検出してチャンクを結合して返す。削除系は Step 5 で別チャンネル化する。
  const sessionsRoot = path.join(folderPath, SESSIONS_DIR)
  for (const session of listSessions(sessionsRoot)) {
    files.push(sessionToAudioFile(folderPath, session))
  }
  files.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  log?.(
    `ファイル一覧取得: ${files.length}件 ` +
      `(音声=${files.filter((f) => f.isAudioFile).length}, ` +
      `ペア=${files.filter((f) => f.isPairedFile).length})`
  )

  return files.map((file) => ({
    ...file,
    // filepath は main 側で(folderPath を前置して)埋める
    filepath: path.join(folderPath, file.filepath)
  }))
}

