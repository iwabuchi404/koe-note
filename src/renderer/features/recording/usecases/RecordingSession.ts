/**
 * RecordingSession - 録音セッションのオーケストレーション（v2 usecase）
 *
 * RecordingContext が持っていた「セッションの永続化手続き」をここに閉じる。
 * Electron・React に触れず、SessionStore ポートを注入して使う。
 *
 * 担保する不変条件:
 *   - チャンクの audioOffsetSeconds は前チャンクの累積長から連続的に採番する
 *     （旧 manifest のような推定値ではなく、録音側が逐次管理する実値）
 *   - 文字起こし結果は chunk の実測位置（offset/duration）を持つセグメントに
 *     変換して保存する。チャンクのタイミングがまだ来ていない結果は
 *     ペンディングし、appendChunk 時に後追いで反映する
 *   - finalize 時に transcript を completed にして全体を保存し、
 *     セッションを completed/endedAt/durationSeconds で締める
 *   - 失敗は呼び出し側に投げる（RecordingContext が記録して録音継続を
 *     判断する）。ここでは握り潰さない
 */
import type { SessionStore } from '../ports/SessionStore'
import type { AudioEncoding, AudioFormat } from '@shared/audioFormat'
import { durationFromBytes, roundSeconds } from '@shared/audioFormat'
import {
  createTranscript,
  appendTranscriptSegment,
  withTranscriptStatus,
  type TranscriptResult
} from '@shared/transcript'
import type { CreateSessionParams, SessionSourceKind } from '@shared/session'

export interface RecordingSessionConfig {
  /** ソース ID（'microphone' | 'desktop' | 'mixed'） */
  sourceId: string
  sourceKind: SessionSourceKind
  /** 録音デバイス（mic deviceId 等。任意） */
  device?: string
  /** 出力フォーマット（'mp3' | 'wav'） */
  format: AudioFormat
  /** エンコーダ設定 */
  encoding: AudioEncoding
  /** 文字起こしが有効な場合のエンジン情報（省略時は transcript を作らない） */
  transcription?: {
    engine: string
    model: string
    language: string
  }
  /** session.json の meta に載せる補助情報 */
  meta?: Record<string, unknown>
}

/** チャンク番号 → 音声上の位置（セッション開始からの秒） */
interface ChunkTiming {
  offsetSeconds: number
  durationSeconds: number
}

/** タイミング未到着の文字起こし結果 */
interface PendingTranscription {
  chunkNumber: number
  text: string
}

const TRANSCRIPT_ID = 'live-001'

export class RecordingSession {
  private readonly store: SessionStore

  private sessionId: string | null = null
  private config: RecordingSessionConfig | null = null
  /** 次に来るチャンクの開始位置（source ごと。現在は単一ソース） */
  private nextOffsetSeconds = 0
  private readonly chunkTimings = new Map<number, ChunkTiming>()
  private transcript: TranscriptResult | null = null
  private pendingTranscriptions: PendingTranscription[] = []

  constructor(store: SessionStore) {
    this.store = store
  }

  /** セッション ID（start 完了後に有効） */
  get id(): string | null {
    return this.sessionId
  }

  /** 開始したか（録音中に参照される簡易判定） */
  get isStarted(): boolean {
    return this.sessionId !== null
  }

  /**
   * セッションを開始する（sessions/<id>/ + session.json を作る）
   *
   * 以降の appendChunk / appendTranscription / finalize はこの id を
   * 前提とする。transcription 有効時は空の TranscriptResult を
   * 'running' で用意する。
   */
  async start(config: RecordingSessionConfig): Promise<string> {
    this.config = config

    const params: CreateSessionParams = {
      sources: [
        {
          id: config.sourceId,
          kind: config.sourceKind,
          device: config.device,
          format: config.format,
          encoding: config.encoding
        }
      ],
      meta: config.meta
    }
    const { id } = await this.store.createSession(params)
    this.sessionId = id

    if (config.transcription) {
      this.transcript = createTranscript({
        id: TRANSCRIPT_ID,
        sessionId: id,
        mode: 'live',
        engine: config.transcription.engine,
        model: config.transcription.model,
        sourceId: config.sourceId,
        language: config.transcription.language
      })
    }

    return id
  }

  /**
   * チャンクを保存する
   *
   * offset/duration はここで採番する（呼び出し側に推測させない）。
   * durationFromBytes は CBR 前提の実測換算で、旧 trans.txt の
   * セグメント位置と同じ計算規則を踏襲する。
   */
  async appendChunk(
    chunkNumber: number,
    data: ArrayBuffer | Blob,
    recordedAt: string
  ): Promise<void> {
    const config = this.requireConfig('appendChunk')
    const sessionId = this.requireSessionId('appendChunk')

    const bytes = data instanceof Blob ? data.size : data.byteLength
    const durationSeconds = durationFromBytes(bytes, config.format, config.encoding)
    const offsetSeconds = this.nextOffsetSeconds
    this.nextOffsetSeconds = roundSeconds(offsetSeconds + durationSeconds)
    this.chunkTimings.set(chunkNumber, { offsetSeconds, durationSeconds })

    // 先にタイミングを登録する。後で来た pending 結果に位置を付けられる
    await this.store.appendChunk({
      sessionId,
      sourceId: config.sourceId,
      data,
      audioOffsetSeconds: offsetSeconds,
      durationSeconds,
      recordedAt
    })

    // チャンクのタイミングが確定したので、溜まっていた結果を反映する
    await this.flushPendingTranscriptions()
  }

  /**
   * 文字起こし結果をセグメントとして追記し、transcript を保存する
   *
   * transcript が無効（transcription 未設定）なら no-op。
   * チャンクのタイミングがまだ来ていない場合はペンディングする
   * （WS 応答が appendChunk より先に届くレース対策）。
   */
  async appendTranscription(chunkNumber: number, text: string): Promise<void> {
    if (!this.transcript || !this.sessionId) {
      return
    }

    const timing = this.chunkTimings.get(chunkNumber)
    if (!timing) {
      this.pendingTranscriptions.push({ chunkNumber, text })
      return
    }

    const transcript = appendTranscriptSegment(this.transcript, {
      chunkNumber,
      start: timing.offsetSeconds,
      end: timing.offsetSeconds + timing.durationSeconds,
      text
    })
    this.transcript = transcript
    await this.store.saveTranscript(this.sessionId, transcript)
  }

  /**
   * 録音終了を確定する
   *
   * transcript があれば completed にして保存し、セッションを
   * completed / endedAt / durationSeconds で閉じる。
   * 未送信の pending 結果は残っていても finalize を妨げない
   * （その場合はセグメントが欠けるだけで session 自体は閉じる）。
   */
  async finalize(endedAt: string, durationSeconds: number): Promise<void> {
    const sessionId = this.sessionId
    if (!sessionId) {
      return
    }

    if (this.transcript) {
      const transcript = withTranscriptStatus(this.transcript, 'completed')
      this.transcript = transcript
      await this.store.saveTranscript(sessionId, transcript)
    }
    await this.store.updateSession(sessionId, {
      state: 'completed',
      endedAt,
      durationSeconds
    })
  }

  /**
   * ペンディング中の文字起こし結果を、タイミングが揃ったものから処理する
   *
   * appendChunk の後に呼ぶ（その時点でタイミングが揃うため）。
   * 1件でも反映したら transcript 全体を保存する（冪等の全体書き換え）。
   */
  private async flushPendingTranscriptions(): Promise<void> {
    if (!this.transcript || !this.sessionId || this.pendingTranscriptions.length === 0) {
      return
    }

    const remaining: PendingTranscription[] = []
    let transcript = this.transcript
    let touched = false
    for (const pending of this.pendingTranscriptions) {
      const timing = this.chunkTimings.get(pending.chunkNumber)
      if (!timing) {
        remaining.push(pending)
        continue
      }
      transcript = appendTranscriptSegment(transcript, {
        chunkNumber: pending.chunkNumber,
        start: timing.offsetSeconds,
        end: timing.offsetSeconds + timing.durationSeconds,
        text: pending.text
      })
      touched = true
    }
    this.transcript = transcript
    this.pendingTranscriptions = remaining

    if (touched) {
      await this.store.saveTranscript(this.sessionId, transcript)
    }
  }

  private requireConfig(caller: string): RecordingSessionConfig {
    if (!this.config) {
      throw new Error(`${caller}: セッションが start されていません`)
    }
    return this.config
  }

  private requireSessionId(caller: string): string {
    if (!this.sessionId) {
      throw new Error(`${caller}: セッションが start されていません`)
    }
    return this.sessionId
  }
}
