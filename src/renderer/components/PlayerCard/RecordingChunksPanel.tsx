/**
 * RecordingChunksPanel - 録音のチャンク詳細パネル
 *
 * Phase E で manifest.json（チャンクインデックス）が導入され、
 * trans.txt（文字起こし）と別々に書かれるようになった。
 * このパネルは両者を突き合わせて「どのチャンクが文字起こし済みか」を見せる。
 *
 * 責務:
 *   - manifest.json を読む（無ければ「Phase E より前の録音」と明示する）
 *   - trans.txt をパースしてチャンク単位の状況を出す
 *   - manifest の不整合があれば隠さず表示する
 *
 * 処理の本体は shared/chunkReport.ts（純粋ロジック）にある。
 * このコンポーネントは I/O と描画だけを担当する。
 */

import React, { useCallback, useEffect, useState } from 'react'
import {
  buildChunkReport,
  formatChunkReportSummary,
  type ChunkReport
} from '@shared/chunkReport'
import { parseManifest } from '@shared/recordingManifest'
import { parseTranscriptFile } from '@shared/transcriptFile'
import { LoggerFactory, LogCategories } from '../../utils/LoggerFactory'
import './RecordingChunksPanel.css'

const logger = LoggerFactory.getLogger(LogCategories.UI_BOTTOM_PANEL)

interface RecordingChunksPanelProps {
  /** 音声ファイルの絶対パス（manifest は同ディレクトリの <base>.manifest.json） */
  audioFilePath: string
  /** 文字起こしファイルのパス（無ければ manifest のみ表示する） */
  transcriptionPath?: string
}

type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; report: ChunkReport }
  | { kind: 'error'; message: string }

function baseNameOf(audioFilePath: string): string {
  const fileName = audioFilePath.split(/[\\/]/).pop() ?? ''
  return fileName.replace(/\.[^.]+$/, '')
}

function directoryOf(audioFilePath: string): string {
  const parts = audioFilePath.split(/[\\/]/)
  parts.pop()
  return parts.join('\\') || '.'
}

/** manifest.json を読み込む。無ければ null（Phase E より前の録音） */
async function loadManifest(
  audioFilePath: string
): Promise<ReturnType<typeof parseManifest> | null> {
  const manifestPath = `${directoryOf(audioFilePath)}\\${baseNameOf(audioFilePath)}.manifest.json`
  try {
    const buffer = await window.electronAPI.readFile(manifestPath)
    return parseManifest(Buffer.from(buffer).toString('utf-8'))
  } catch (error) {
    // ファイルが無いのは異常ではない（manifest 導入前の録音）
    logger.debug('manifest.json が無いため読み込みをスキップします', { manifestPath })
    return null
  }
}

/** trans.txt を読み込んでセグメントを返す。無ければ空配列 */
async function loadTranscriptSegments(transcriptionPath?: string) {
  if (!transcriptionPath) {
    return []
  }
  try {
    const buffer = await window.electronAPI.readFile(transcriptionPath)
    const parsed = parseTranscriptFile(Buffer.from(buffer).toString('utf-8'))
    // chunkNumber が無いセグメント（手書きの trans.txt 等）は扱わない
    return parsed.segments
      .filter((segment) => typeof segment.chunkNumber === 'number')
      .map((segment) => ({
        chunkNumber: segment.chunkNumber as number,
        audioOffsetSeconds: segment.audioOffsetSeconds,
        text: segment.text
      }))
  } catch (error) {
    logger.debug('trans.txt を読み込めませんでした', { transcriptionPath })
    return []
  }
}

const RecordingChunksPanel: React.FC<RecordingChunksPanelProps> = ({
  audioFilePath,
  transcriptionPath
}) => {
  const [state, setState] = useState<LoadState>({ kind: 'idle' })
  const [expanded, setExpanded] = useState(false)

  const reload = useCallback(async () => {
    setState({ kind: 'loading' })
    try {
      const [manifest, segments] = await Promise.all([
        loadManifest(audioFilePath),
        loadTranscriptSegments(transcriptionPath)
      ])
      setState({ kind: 'ready', report: buildChunkReport(manifest, segments) })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('チャンク情報の読み込みに失敗しました', new Error(message))
      setState({ kind: 'error', message })
    }
  }, [audioFilePath, transcriptionPath])

  useEffect(() => {
    if (!audioFilePath) {
      setState({ kind: 'idle' })
      return
    }
    void reload()
  }, [audioFilePath, transcriptionPath, reload])

  if (!audioFilePath) {
    return null
  }

  if (state.kind === 'idle' || state.kind === 'loading') {
    return (
      <div className="chunks-panel chunks-panel--muted">
        チャンク情報を読み込んでいます...
      </div>
    )
  }

  if (state.kind === 'error') {
    return (
      <div className="chunks-panel chunks-panel--error">
        <strong>チャンク情報を読み込めませんでした</strong>
        <div>{state.message}</div>
      </div>
    )
  }

  const { report } = state
  const hasChunks = report.rows.length > 0

  return (
    <div className="chunks-panel">
      <div
        className="chunks-panel__header"
        onClick={() => setExpanded((prev) => !prev)}
        role="button"
        aria-expanded={expanded}
      >
        <span className="chunks-panel__title">
          チャンク詳細
          <span className={`chunks-panel__chevron ${expanded ? 'expanded' : ''}`}>▼</span>
        </span>
        <span className="chunks-panel__summary">{formatChunkReportSummary(report)}</span>
      </div>

      {report.manifestProblems.length > 0 && (
        <div className="chunks-panel__problems">
          <strong>manifest の不整合</strong>
          <ul>
            {report.manifestProblems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      )}

      {!report.hasManifest && (
        <div className="chunks-panel__notice">
          manifest.json がありません（Phase E 導入前の録音です）
        </div>
      )}

      {report.orphanedChunkNumbers.length > 0 && (
        <div className="chunks-panel__notice">
          trans.txt にあるが manifest に無いチャンク:{' '}
          {report.orphanedChunkNumbers.join(', ')}
        </div>
      )}

      {expanded && (
        <div className="chunks-panel__body">
          {!hasChunks ? (
            <div className="chunks-panel__muted">チャンク情報がありません</div>
          ) : (
            <table className="chunks-table">
              <thead>
                <tr>
                  <th>チャンク</th>
                  <th>ファイル</th>
                  <th>サイズ</th>
                  <th>長さ</th>
                  <th>開始位置</th>
                  <th>文字起こし</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((row) => (
                  <tr key={row.chunkNumber} className={`chunks-table__row ${row.status}`}>
                    <td>#{row.chunkNumber}</td>
                    <td>{row.file ?? '-'}</td>
                    <td>{row.bytes === null ? '-' : `${(row.bytes / 1024).toFixed(1)}KB`}</td>
                    <td>
                      {row.durationSeconds === null ? '-' : `${row.durationSeconds.toFixed(3)}秒`}
                    </td>
                    <td>{row.audioOffsetSeconds === null ? '-' : `${row.audioOffsetSeconds.toFixed(3)}秒`}</td>
                    <td>
                      {row.status === 'transcribed'
                        ? '✅ 済'
                        : row.status === 'missing'
                          ? '⏳ 未'
                          : '⚠ manifest なし'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

export default RecordingChunksPanel