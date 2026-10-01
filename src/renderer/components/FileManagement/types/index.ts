import type { AudioFile } from '@shared/types'

/**
 * ファイル一覧での表示状態を持つ AudioFile
 *
 * Transcription系フラグ（hasTranscriptionFile / isPairedFile など）は
 * 共有の AudioFile が既に持っており、ここで再宣言していた。
 *
 * なお contexts や props、FileAction などの型定義は呼び出し元が無く、
 * 実際に使われているのは本型のみのため削除した。
 */
export interface ExtendedAudioFile extends AudioFile {
  isSelected?: boolean
}
