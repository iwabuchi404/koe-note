/**
 * パス解決とガード
 *
 * 此前は 13 個のファイルパス引数が無検証で、renderer が渡した任意の
 * パスに対して read / write / delete が走る状態だった。
 * 加えて `exec(`dir /-c "${dirPath}"`)` のようにシェル文字列に
 * パスが埋め込まれていた（シェル注入）。
 *
 * 方針: **許可ルートを1つ持ち、全 file ハンドラがここを経由する**。
 *  録音されたファイル（transcribe / loadAudio）も同様。
 */
import path from 'path'
import { AppError } from './errors'

/** 文字起こしファイルの拡張子 */
export const TRANSCRIPT_SUFFIX = '.trans.txt'

/** 過去の文字起こしファイル名（_transcription.txt）も読む */
export const LEGACY_TRANSCRIPT_SUFFIX = '_transcription.txt'

/** AI対話記録の拡張子 */
export const AI_CHAT_SUFFIX = '.ai-chat.txt'

/**
 * candidate が root 配下にあるか（小文字比較でWindowsのケース差を吸収）
 *
 * `C:\Users\me\rec` と `C:\Users\me\recording\x.mp3` のように
 * 別ディレクトリで始まるケースを誤って許可しないよう、
 * 区切り文字で切って比較する。
 */
export function isWithinRoot(root: string, candidate: string): boolean {
  const normalizedRoot = path.resolve(root).toLowerCase()
  const normalizedCandidate = path.resolve(candidate).toLowerCase()

  if (normalizedCandidate === normalizedRoot) return true

  const rootWithSep = normalizedRoot.endsWith(path.sep)
    ? normalizedRoot
    : normalizedRoot + path.sep

  return normalizedCandidate.startsWith(rootWithSep)
}

/**
 * candidate を root 配下に解決する
 *
 * @throws {AppError} FORBIDDEN_PATH — ルート外を指している場合
 */
export function resolveWithinRoot(root: string, candidate: string): string {
  const resolved = path.isAbsolute(candidate)
    ? path.resolve(candidate)
    : path.resolve(root, candidate)

  if (!isWithinRoot(root, resolved)) {
    throw new AppError(
      'FORBIDDEN_PATH',
      `許可されていないパスです: ${candidate}`,
      { root, resolved }
    )
  }

  return resolved
}

/**
 * 既存ファイルへのパスを解決する（存在しなければ NOT_FOUND）
 */
export function resolveExistingFile(root: string, filePath: string, exists: (p: string) => boolean): string {
  const resolved = resolveWithinRoot(root, filePath)
  if (!exists(resolved)) {
    throw new AppError('NOT_FOUND', `ファイルが見つかりません: ${filePath}`)
  }
  return resolved
}

/**
 * 音声ファイルに対応する .trans.txt のパスを作る（存在を優先して解決）
 */
export function transcriptionPathFor(audioFilePath: string, exists: (p: string) => boolean): string {
  const dir = path.dirname(audioFilePath)
  const base = path.basename(audioFilePath, path.extname(audioFilePath))

  const current = path.join(dir, `${base}${TRANSCRIPT_SUFFIX}`)
  if (exists(current)) return current

  // 過去の形式（advanced_recording_..._transcription.txt）も探す
  const legacy = path.join(dir, `${base}${LEGACY_TRANSCRIPT_SUFFIX}`)
  if (exists(legacy)) return legacy

  return current
}

/** AI対話記録のパスを作る */
export function aiChatPathFor(audioFilePath: string): string {
  const dir = path.dirname(audioFilePath)
  const base = path.basename(audioFilePath, path.extname(audioFilePath))
  return path.join(dir, `${base}${AI_CHAT_SUFFIX}`)
}

/**
 * 文字起こしファイル名から、対応する音声ファイルのベース名を取り出す
 *
 * recording_2026_10_01_0200.trans.txt          → recording_2026_10_01_0200
 * recording_2026_10_01_0200_transcription.txt   → recording_2026_10_01_0200
 */
export function transcriptionBaseName(fileName: string): string | null {
  if (fileName.endsWith(TRANSCRIPT_SUFFIX)) {
    return fileName.slice(0, -TRANSCRIPT_SUFFIX.length)
  }
  if (fileName.endsWith(LEGACY_TRANSCRIPT_SUFFIX)) {
    return fileName.slice(0, -LEGACY_TRANSCRIPT_SUFFIX.length)
  }
  return null
}

