/**
 * デスクトップ（システム）音声の取得
 *
 * Chromium は要求されたソースに音声がない場合、マイクにフォールバックして
 * MediaStream を返してくる。既知の挙動であり、気づかないままマイクを録音して
 * しまう事故を起こしうるため、音声トラックがシステム音声であることを必ず
 * 検証し、満たさなければ明示的に失敗させる。
 */
import { LoggerFactory, LogCategories } from '@renderer/shared/utils/LoggerFactory'

const logger = LoggerFactory.getLogger(LogCategories.SERVICE_AUDIO_MIXING)

const MICROPHONE_LABEL_PATTERN = /microphone|マイク|麦克风|麥克風/i

export type DesktopAudioTrackKind = 'system' | 'microphone' | 'unknown'

/**
 * トラックのlabelから種別を判定する
 *
 * 日本語Windowsでは "Speakers (Realtek High Definition Audio)" のように
 * 出力デバイス名になる。マイクにフォールバックした場合は
 * "Default - Microphone (HyperX QuadCast)" のようにマイク名を含む。
 */
export function classifyDesktopAudioTrack(track: MediaStreamTrack): DesktopAudioTrackKind {
  const label = track.label || ''
  if (MICROPHONE_LABEL_PATTERN.test(label)) {
    return 'microphone'
  }
  return label ? 'system' : 'unknown'
}

export class DesktopAudioUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DesktopAudioUnavailableError'
  }
}

/**
 * 音声トラックがシステム音声であることを保証する
 *
 * @throws {DesktopAudioUnavailableError} 音声トラックが無い、
 *   またはマイクにフォールバックしている場合
 */
export function assertSystemAudioTrack(tracks: MediaStreamTrack[]): MediaStreamTrack {
  if (tracks.length === 0) {
    throw new DesktopAudioUnavailableError(
      'システム音声が取得できませんでした。Windowsの「設定 > 音」で、' +
      'デスクトップアプリがシステム音を使えることを確認してください。'
    )
  }

  const kinds = tracks.map(classifyDesktopAudioTrack)
  if (kinds.every((kind) => kind === 'microphone')) {
    const labels = tracks.map((t) => t.label || '(ラベルなし)').join(', ')
    throw new DesktopAudioUnavailableError(
      `システム音声の代わりにマイクが返されました（検出: ${labels}）。` +
      'アプリログの setDisplayMediaRequestHandler が loopback を返しているか確認してください。'
    )
  }

  const systemTrack = tracks.find((_, i) => kinds[i] === 'system') ?? tracks[0]
  logger.debug('デスクトップ音声トラック検証OK', {
    labels: tracks.map((t) => t.label)
  })
  return systemTrack
}

/**
 * デスクトップ音声のストリームを取得する
 *
 * 映像トラックは停止・除去し、音声のみを返す。マイクへフォールバックした
 * 場合は必ず DesktopAudioUnavailableError を投げる。
 */
export async function captureDesktopAudioStream(): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    audio: true,
    video: true
  })

  for (const videoTrack of stream.getVideoTracks()) {
    videoTrack.stop()
    stream.removeTrack(videoTrack)
  }

  assertSystemAudioTrack(stream.getAudioTracks())
  return stream
}

/**
 * 取得失敗をユーザ向けの案内に変換する
 */
export function toUserFacingDesktopAudioError(error: unknown): Error {
  if (error instanceof DesktopAudioUnavailableError) {
    return error
  }
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.message.includes('aborted')) {
      return new DesktopAudioUnavailableError(
        'デスクトップ音声の取得がキャンセルされました。画面共有ダイアログで「共有」をクリックし、「システム音声を共有」にチェックを入れてください。'
      )
    }
    if (error.name === 'NotAllowedError') {
      return new DesktopAudioUnavailableError(
        'デスクトップ音声の取得が拒否されました。画面共有を許可してください。'
      )
    }
    if (error.name === 'NotFoundError') {
      return new DesktopAudioUnavailableError(
        'デスクトップ音声デバイスが見つかりません。システム音声が有効か確認してください。'
      )
    }
  }
  return new DesktopAudioUnavailableError(
    `デスクトップ音声の取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`
  )
}
