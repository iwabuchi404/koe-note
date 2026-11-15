/**
 * transcription:* — 文字起こしファイルの読み込み・存在確認・パス解決
 */
import fs from 'fs'
import path from 'path'
import type { TranscriptionFile, TranscriptionSegmentExtended } from '@shared/types'
import { parseTranscriptFile, type ParsedTranscriptFile } from '@shared/transcriptFile'
import { resolveWithinRoot, transcriptionPathFor } from '../core/paths'
import { AppError } from '../core/errors'
import { workspaceRoot } from '../services/workspace'
import { writeLog } from '../services/appLog'
import { handle } from './handle'

export function registerTranscriptionIpc(): void {
  handle('transcription:load', async (event, transFilePath: string): Promise<TranscriptionFile> => {
    try {
      writeLog(`文字起こしファイル読み込み: ${transFilePath}`);

      const target = resolveWithinRoot(workspaceRoot(), transFilePath);
      if (!fs.existsSync(target)) {
        throw new AppError('NOT_FOUND', '文字起こしファイルが見つかりません');
      }

      const content = fs.readFileSync(target, 'utf8');
      const transcription = toTranscriptionFile(parseTranscriptFile(content), target);

      writeLog(`文字起こしファイル読み込み完了: ${transFilePath}`);
      return transcription;
    } catch (error) {
      writeLog(`文字起こしファイル読み込みエラー: ${error}`);
      throw error;
    }
  });

  handle('transcription:exists', async (event, audioFilePath: string): Promise<boolean> => {
    try {
      const audioPath = resolveWithinRoot(workspaceRoot(), audioFilePath);
      const transFilePath = transcriptionPathFor(audioPath, (p) => fs.existsSync(p));
      return fs.existsSync(transFilePath);
    } catch (error) {
      // 存在確認は「無い / 範囲外」を false として返す（例外にしない）
      writeLog(`文字起こしファイル存在確認: ${error}`);
      return false;
    }
  });

  handle('transcription:getPath', async (event, audioFilePath: string): Promise<string> => {
    const audioPath = resolveWithinRoot(workspaceRoot(), audioFilePath);
    return transcriptionPathFor(audioPath, (p) => fs.existsSync(p));
  });
}

/**
 * shared の解析結果を IPC 用の型へ変換する
 *
 * 終了時刻は次のセグメントの開始時刻で決める。最終セグメントは
 * テキスト長から推定する（最低3秒）。
 */
function toTranscriptionFile(parsed: ParsedTranscriptFile, filePath: string): TranscriptionFile {
  const header = parsed.header;
  const segments: TranscriptionSegmentExtended[] = parsed.segments.map((segment, index) => {
    const next = parsed.segments[index + 1];
    return {
      start: segment.audioOffsetSeconds,
      end: next
        ? next.audioOffsetSeconds
        : segment.audioOffsetSeconds + Math.max(3, segment.text.length * 0.2),
      text: segment.text,
      speaker: segment.speaker
    };
  });

  return {
    metadata: header
      ? {
          audioFile: header.audioFile,
          model: header.model,
          transcribedAt: header.transcribedAt,
          duration: header.durationSeconds,
          segmentCount: header.segmentCount,
          language: header.language,
          speakers: header.speakers
        }
      : {
          audioFile: path.basename(filePath).replace(/\.trans\.txt$/, ''),
          model: 'unknown',
          transcribedAt: '',
          duration: 0,
          segmentCount: segments.length,
          language: 'ja',
          speakers: []
        },
    segments,
    filePath,
    isModified: false
  };
}
