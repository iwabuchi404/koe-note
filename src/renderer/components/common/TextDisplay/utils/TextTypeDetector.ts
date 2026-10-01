/**
 * テキストファイル種別の判定
 *
 * 以前は特徴量のスコアリングで種別を判定しており、拡張子が .txt でも
 * ヘッダーがあれば transcription、判定基準がファイル内容で変動する
 * 構造だった。方針を1つにする:
 *
 *   .trans.txt ヘッダー（--- 区切り）があれば transcription、無ければ plain-text
 *
 * メタデータの解釈は MetadataParser / shared/transcriptFile に集約している。
 */
import { parseTranscriptHeader } from '@shared/transcriptFile'
import type { TextFileType } from '../types/TextDisplayTypes'

/** ファイル種別を判定する */
export function detectFileType(content: string): TextFileType {
  return parseTranscriptHeader(content) ? 'transcription' : 'plain-text'
}
