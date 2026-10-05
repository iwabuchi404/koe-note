/**
 * recordingManifest - 録音成果物 manifest.json のスキーマと構築
 *
 * Phase E で導入する manifest は、1 回の録音について
 * 「どのチャンクが、どの位置の、どの長さの音声か」を説明する。
 *  以降のように推測をしない。
 *  実際に保存したバイト数と時刻だけを書く。
 *
 * 成果物レイアウト（既存 mp3 を維持する加算方式）:
 *   <saveFolder>/recording_YYYYMMDD_HHMMSS.mp3            ← 既存の再生対象
 *   <saveFolder>/recording_YYYYMMDD_HHMMSS.trans.txt      ← 既存の文字起こし
 *   <saveFolder>/recording_YYYYMMDD_HHMMSS.chunks/
 *       chunk_000.mp3, chunk_001.mp3, ...                  ← 追記しない不変ファイル
 *   <saveFolder>/recording_YYYYMMDD_HHMMSS.manifest.json  ← 下記スキーマ
 *
 * manifest により、将来的に以下が可能になる:
 *   - 特定チャンクだけacji 再文字起こしする
 *   - チャンク単位で音声を取り出し直す（可変長書き出しのzzaし）
 *   - mp3 が壊れても manifest から音声を再構成できる
 */

import {
  bytesPerSecond,
  durationFromBytes,
  roundSeconds,
  type AudioEncoding,
  type AudioFormat
} from './audioFormat'

/** manifest のスキーマバージョン。将来壊す 경우にArchives递增させる */
export const MANIFEST_VERSION = 1

/** manifest ファイル名の接尾辞（音声ファイル名の後ろに付ける） */
export const MANIFEST_SUFFIX = '.manifest.json'

/** チャンクディレクトリ名（音声ファイル名の後ろに付ける） */
export const CHUNK_DIR_SUFFIX = '.chunks'

export interface ManifestChunk {
  /** 0 始まりの連番 */
  chunkNumber: number
  /** チャンクディレクトリ内の相対パス（ POSIX 区切り） */
  file: string
  /** 実測サイズ（バイト） */
  bytes: number
  /** 録音内での開始位置（秒）。バイト数からの推定値 */
  audioOffsetSeconds: number
  /** このチャンクの長さ（秒）。バイト数からの推定値 */
  durationSeconds: number
  /** チャンクが確定した時刻（ISO8601） */
  recordedAt: string
}

export interface ManifestRecording {
  /** 音声ファイル名（保存フォルダ直下） */
  audioFile: string
  format: AudioFormat
  /** 録音開始時刻（ISO8601） */
  createdAt: string
  /** 実際に使用したエンコーディング */
  encoding: AudioEncoding
  /** 1 秒あたりのバイト数（manifest 読者が再計算せずに済むように） */
  bytesPerSecond: number
  /** 累計バイト数（mp3 の途中まで） */
  totalBytes: number
  /** バイト数から推定した長さ（秒） */
  estimatedDurationSeconds: number
  chunkCount: number
}

export interface ManifestTranscription {
  enabled: boolean
  /** 使用したモデル */
  model?: string
  language?: string
  /** trans.txt のファイル名 */
  file?: string
  segmentCount?: number
  transcribedAt?: string
}

export interface RecordingManifest {
  version: number
  recording: ManifestRecording
  transcription: ManifestTranscription
  chunks: ManifestChunk[]
}

/** チャンクファイル名（例: chunk_007.mp3） */
export function chunkFileName(chunkNumber: number, format: AudioFormat): string {
  return `chunk_${String(chunkNumber).padStart(3, '0')}.${format}`
}

/** チャンクディレクトリ名（例: recording_20261004_125800.chunks） */
export function chunkDirName(baseName: string): string {
  return `${baseName}${CHUNK_DIR_SUFFIX}`
}

/** manifest ファイル名（例: recording_20261004_125800.manifest.json） */
export function manifestFileName(baseName: string): string {
  return `${baseName}${MANIFEST_SUFFIX}`
}

/** 録音開始 info から manifest の土台を作る（チャンクはまだ空） */
export function createManifest(params: {
  baseName: string
  format: AudioFormat
  createdAt: string
  encoding?: AudioEncoding
}): RecordingManifest {
  const encoding = params.encoding
  return {
    version: MANIFEST_VERSION,
    recording: {
      audioFile: `${params.baseName}.${params.format}`,
      format: params.format,
      createdAt: params.createdAt,
      encoding: encoding ?? { sampleRate: 44100, channels: 1, bitDepth: 16, mp3BitrateKbps: 128 },
      bytesPerSecond: bytesPerSecond(params.format, encoding),
      totalBytes: 0,
      estimatedDurationSeconds: 0,
      chunkCount: 0
    },
    transcription: { enabled: false },
    chunks: []
  }
}

/**
 * 既存 manifest にチャンクを追記した次の manifest を返す（イミュータブル）
 *
 * chunkNumber は呼び出し側（録音パイプライン）が持つ値をそのまま使う。
 * manifest 側で連番を振り直さないこと。実ファイル名と食い違うと
 * manifest からチャンクを引けなくなるため。
 * 連番の検証は「0 始まりであること」ではなく「単調増加であること」で行う。
 */
export function appendChunkToManifest(
  manifest: RecordingManifest,
  chunk: { chunkNumber: number; bytes: number; recordedAt: string }
): RecordingManifest {
  const totalBytes =
    manifest.chunks.reduce((sum, c) => sum + c.bytes, 0) + chunk.bytes

  const entry: ManifestChunk = {
    chunkNumber: chunk.chunkNumber,
    file: chunkFileName(chunk.chunkNumber, manifest.recording.format),
    bytes: chunk.bytes,
    audioOffsetSeconds: durationFromBytes(
      totalBytes - chunk.bytes,
      manifest.recording.format,
      manifest.recording.encoding
    ),
    durationSeconds: durationFromBytes(
      chunk.bytes,
      manifest.recording.format,
      manifest.recording.encoding
    ),
    recordedAt: chunk.recordedAt
  }

  return {
    ...manifest,
    recording: {
      ...manifest.recording,
      totalBytes,
      estimatedDurationSeconds: durationFromBytes(
        totalBytes,
        manifest.recording.format,
        manifest.recording.encoding
      ),
      chunkCount: manifest.chunks.length + 1
    },
    chunks: [...manifest.chunks, entry]
  }
}

/** manifest に文字起こし情報を設定した次の manifest を返す（イミュータブル） */
export function withTranscription(
  manifest: RecordingManifest,
  transcription: ManifestTranscription
): RecordingManifest {
  return { ...manifest, transcription }
}

/** manifest.json のシリアライズ（読みやすい 2 スペースインデント） */
export function formatManifest(manifest: RecordingManifest): string {
  return JSON.stringify(manifest, null, 2) + '\n'
}

/**
 * manifest.json のパース
 *
 * 壊れた manifest を黙って無視しないこと（後で manifest 必須の処理が
 * 壊れたデータで動くのを防ぐため、呼び出し側で判断できるように投げる）。
 */
export function parseManifest(text: string): RecordingManifest {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new Error(
      `manifest.json を JSON として解釈できません: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('manifest.json のトップレベルがオブジェクトではありません')
  }

  const manifest = parsed as Partial<RecordingManifest>
  if (typeof manifest.version !== 'number') {
    throw new Error('manifest.json に version がありません')
  }
  if (manifest.version > MANIFEST_VERSION) {
    throw new Error(
      `manifest.json の version ${manifest.version} は このアプリの対応 version ${MANIFEST_VERSION} より新しいです`
    )
  }
  if (!manifest.recording || typeof manifest.recording.audioFile !== 'string') {
    throw new Error('manifest.json に recording.audioFile がありません')
  }
  if (!Array.isArray(manifest.chunks)) {
    throw new Error('manifest.json に chunks 配列がありません')
  }

  return manifest as RecordingManifest
}

/** manifest 内で合計バイト数が整合しているか検証する（テスト・診断用） */
export function validateManifest(manifest: RecordingManifest): string[] {
  const problems: string[] = []
  const sum = manifest.chunks.reduce((total, c) => total + c.bytes, 0)

  if (sum !== manifest.recording.totalBytes) {
    problems.push(
      `chunks の合計 ${sum} が recording.totalBytes ${manifest.recording.totalBytes} と一致しません`
    )
  }
  if (manifest.chunks.length !== manifest.recording.chunkCount) {
    problems.push(
      `chunks の件数 ${manifest.chunks.length} が recording.chunkCount ${manifest.recording.chunkCount} と一致しません`
    )
  }
  manifest.chunks.forEach((chunk, index) => {
    if (index > 0) {
      const previous = manifest.chunks[index - 1]
      if (chunk.chunkNumber <= previous.chunkNumber) {
        problems.push(
          `chunks[${index}].chunkNumber ${chunk.chunkNumber} が前の ${previous.chunkNumber} より大きくなっていません（単調増加でないか重複）`
        )
      }
    }
    if (chunk.durationSeconds < 0 || !Number.isFinite(chunk.durationSeconds)) {
      problems.push(`chunks[${index}].durationSeconds が不正です: ${chunk.durationSeconds}`)
    }
    if (chunk.file !== chunkFileName(chunk.chunkNumber, manifest.recording.format)) {
      problems.push(
        `chunks[${index}].file ${chunk.file} が chunkNumber ${chunk.chunkNumber} から作る名前と一致しません`
      )
    }
  })

  const expectedBps = bytesPerSecond(
    manifest.recording.format,
    manifest.recording.encoding
  )
  if (manifest.recording.bytesPerSecond !== expectedBps) {
    problems.push(
      `recording.bytesPerSecond ${manifest.recording.bytesPerSecond} が encoding から計算した ${expectedBps} と一致しません`
    )
  }

  const expectedDuration = roundSeconds(
    durationFromBytes(
      manifest.recording.totalBytes,
      manifest.recording.format,
      manifest.recording.encoding
    )
  )
  if (manifest.recording.estimatedDurationSeconds !== expectedDuration) {
    problems.push(
      `recording.estimatedDurationSeconds ${manifest.recording.estimatedDurationSeconds} が totalBytes から計算した ${expectedDuration} と一致しません`
    )
  }

  return problems
}