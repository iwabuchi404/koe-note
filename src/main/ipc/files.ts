/**
 * file:* — ファイル操作（保存/読込/一覧/削除/追記/作業ディレクトリ）
 *
 * すべてのハンドラは workspaceRoot() 配下に限定される（core/paths のパスガード）。
 */
import { app } from 'electron'
import { exec } from 'child_process'
import fs from 'fs'
import path from 'path'
import type { AudioFile } from '@shared/types'
import { listFiles } from '../services/fileLibrary'
import { workspaceRoot } from '../services/workspace'
import { resolveWithinRoot } from '../core/paths'
import { AppError, toAppError } from '../core/errors'
import { writeLog } from '../services/appLog'
import { handle } from './handle'

export function registerFileIpc(): void {
  // ファイル保存
  handle('file:save', async (event, buffer: Buffer, filename: string, subfolder?: string): Promise<string> => {
    try {
      // デフォルトの保存フォルダ（デスクトップのVoiceRecordingsフォルダ）
      // 保存先は許可ルート（作業フォルダ）基準。subfolder はその配下のみ許可
      const baseFolder = workspaceRoot();
      // サブフォルダが指定されている場合は追加
      const targetFolder = subfolder ? resolveWithinRoot(baseFolder, subfolder) : baseFolder;

      // フォルダが存在しない場合は作成
      if (!fs.existsSync(targetFolder)) {
        try {
          fs.mkdirSync(targetFolder, { recursive: true });
          writeLog(`フォルダを作成しました: ${targetFolder}`);
        } catch (mkdirError) {
          writeLog(`フォルダ作成エラー: ${mkdirError}`);
          throw new Error(`フォルダ作成失敗: ${mkdirError}`);
        }
      }

      const filePath = path.join(targetFolder, filename);

      // 容量チェック
      const freeSpace = await checkDiskSpace(targetFolder);
      const requiredSpace = buffer.length;

      if (freeSpace < requiredSpace + (100 * 1024 * 1024)) { // +100MB バッファ
        throw new Error(`容量不足: ${Math.round(freeSpace / (1024 * 1024))}MB 空き容量、${Math.round(requiredSpace / (1024 * 1024))}MB 必要`);
      }

      // 一時ファイルに書き込み → 原子的リネーム
      const tempPath = filePath + '.tmp';
      try {
        fs.writeFileSync(tempPath, buffer);
        fs.renameSync(tempPath, filePath);
      } catch (writeError) {
        // 一時ファイルのクリーンアップ
        try {
          if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
          }
        } catch (cleanupError) {
          writeLog(`一時ファイルクリーンアップエラー: ${cleanupError}`);
        }
        throw writeError;
      }

      writeLog(`ファイル保存完了: ${filename} (${subfolder || 'メイン'}) - ${buffer.length} bytes`);

      return filePath;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('ファイル保存エラー:', errorMsg);
      writeLog('ファイル保存エラー: ' + errorMsg);

      // エラー分類
      if (errorMsg.includes('ENOSPC') || errorMsg.includes('容量不足')) {
        throw new Error(`ディスク容量不足: ${errorMsg}`);
      } else if (errorMsg.includes('EACCES') || errorMsg.includes('EPERM')) {
        throw new Error(`権限エラー: ${errorMsg}`);
      } else if (errorMsg.includes('EBUSY') || errorMsg.includes('EAGAIN')) {
        throw new Error(`一時的なI/Oエラー: ${errorMsg}`);
      } else {
        throw new Error(`ファイル保存エラー: ${errorMsg}`);
      }
    }
  });

  // ファイル読み込み
  handle('file:read', async (event, filePath: string): Promise<Uint8Array> => {
    try {
      const target = resolveWithinRoot(workspaceRoot(), filePath);
      return new Uint8Array(fs.readFileSync(target));
    } catch (error) {
      writeLog(`ファイル読み込みエラー: ${filePath} - ${error}`);
      throw toAppError(error, 'ファイルの読み込みに失敗しました');
    }
  });

  // ファイル一覧取得
  // ディレクトリ走査・分類・ペアリングは services/fileLibrary.ts（テスト可能）
  handle('file:getList', async (event, folderPath: string): Promise<AudioFile[]> => {
    try {
      const resolved = resolveWithinRoot(workspaceRoot(), folderPath);
      return listFiles(resolved, writeLog);
    } catch (error) {
      throw toAppError(error, 'ファイル一覧の取得に失敗しました');
    }
  });

  // ファイル削除
  handle('file:delete', async (event, filePath: string): Promise<boolean> => {
    try {
      const target = resolveWithinRoot(workspaceRoot(), filePath);
      if (!fs.existsSync(target)) {
        throw new AppError('NOT_FOUND', `ファイルが見つかりません: ${filePath}`);
      }
      fs.unlinkSync(target);
      writeLog(`ファイル削除: ${target}`);
      return true;
    } catch (error) {
      throw toAppError(error, 'ファイルの削除に失敗しました');
    }
  });

  // 音声ファイル読み込み（再生用）
  handle('file:loadAudio', async (event, filePath: string): Promise<string> => {
    try {
      writeLog(`Audio File Loading Started: ${filePath}`);

      // パスガード（許可ルートの外は拒否）
      const target = resolveWithinRoot(workspaceRoot(), filePath);
      if (!fs.existsSync(target)) {
        throw new AppError('NOT_FOUND', `File not found: ${filePath}`);
      }

      // 録音中のファイルかチェック（録音中は読み込みを拒否）
      const fileName = path.basename(filePath);
      if (fileName.startsWith('recording_') && fileName.includes(new Date().toISOString().split('T')[0].replace(/-/g, ''))) {
        // 今日の日付を含む録音ファイルは録音中の可能性が高い
        const stats = fs.statSync(filePath);
        const now = Date.now();
        const fileAge = now - stats.mtime.getTime();

        if (fileAge < 60000) { // 1分以内に更新されたファイルは録音中とみなす
          writeLog(`Recording file detected, skipping load: ${filePath} (age: ${fileAge}ms)`);
          throw new Error('Cannot load recording file while recording is in progress');
        }
      }

      // ファイルサイズチェック（0バイトまたは極小ファイルは読み込まない）
      const stats = fs.statSync(filePath);
      if (stats.size === 0) {
        writeLog(`Empty file detected: ${filePath}`);
        throw new Error('Empty file cannot be loaded');
      }

      if (stats.size < 100) { // 100バイト未満は無効とみなす
        writeLog(`File too small: ${filePath} (${stats.size} bytes)`);
        throw new Error('File too small to be a valid audio file');
      }

      // ファイルを読み込んでBase64に変換
      const fileBuffer = fs.readFileSync(filePath);
      const base64Data = fileBuffer.toString('base64');

      // ファイルの実際の内容からMIMEタイプを判定
      let mimeType = 'audio/webm'; // デフォルト（録音の標準形式）

      // ファイルの先頭バイトを確認してフォーマットを判定
      if (fileBuffer.length >= 4) {
        const header = fileBuffer.subarray(0, 4);
        const headerString = header.toString('hex');

        if (headerString === '1a45dfa3') { // EBML header (WebM)
          mimeType = 'audio/webm';
          writeLog('Detected WebM format from EBML header');
        } else if (header.toString('ascii') === 'RIFF') {
          // WAVファイルかどうかさらに確認
          if (fileBuffer.length >= 12) {
            const waveHeader = fileBuffer.subarray(8, 12).toString('ascii');
            if (waveHeader === 'WAVE') {
              mimeType = 'audio/wav';
              writeLog('Detected WAV format from RIFF-WAVE header');
            }
          }
        } else if (header.toString('ascii').startsWith('ID3') || headerString.startsWith('fff')) {
          mimeType = 'audio/mpeg';
          writeLog('Detected MP3 format from header');
        } else if (headerString.startsWith('4f676753')) { // OggS header
          mimeType = 'audio/ogg';
          writeLog('Detected OGG format from header');
        } else {
          // フォールバック：拡張子から判定
          const ext = path.extname(filePath).toLowerCase();
          if (ext === '.webm') {
            mimeType = 'audio/webm';
          } else if (ext === '.wav') {
            mimeType = 'audio/wav';
          } else if (ext === '.mp3') {
            mimeType = 'audio/mpeg';
          } else if (ext === '.ogg') {
            mimeType = 'audio/ogg';
          }
          writeLog(`Using extension-based MIME type: ${mimeType} for ${ext}`);
        }
      }

      // Data URLとして返す
      const dataUrl = `data:${mimeType};base64,${base64Data}`;

      writeLog(`Audio File Loading Completed: ${path.basename(filePath)} (${fileBuffer.length} bytes)`);

      return dataUrl;
    } catch (error) {
      throw toAppError(error, '音声ファイルの読み込みに失敗しました');
    }
  });

  // テキストファイル保存ハンドラー（新録音システム用）
  handle('file:saveText', async (event, filePath: string, content: string): Promise<boolean> => {
    try {
      const target = resolveWithinRoot(workspaceRoot(), filePath);

      // 親ディレクトリの作成
      const directory = path.dirname(target);
      if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
      }

      fs.writeFileSync(target, content, 'utf8');
      writeLog(`テキストファイル保存完了: ${target}`);

      return true;
    } catch (error) {
      writeLog(`テキストファイル保存エラー: ${error}`);
      throw toAppError(error, 'テキストファイルの保存に失敗しました');
    }
  });

  // バイナリファイル保存ハンドラー（新録音システム用）
  handle('file:saveToPath', async (event, filePath: string, buffer: Buffer): Promise<boolean> => {
    try {
      const target = resolveWithinRoot(workspaceRoot(), filePath);

      const directory = path.dirname(target);
      if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
      }

      fs.writeFileSync(target, buffer);
      writeLog(`バイナリファイル保存完了: ${target} (${buffer.length} bytes)`);

      return true;
    } catch (error) {
      writeLog(`バイナリファイル保存エラー: ${error}`);
      throw toAppError(error, 'バイナリファイルの保存に失敗しました');
    }
  });

  // バイナリファイル追記ハンドラー（録音チャンクの書き込み）
  //
  // 録音はチャンクごとにこの IPC を呼ぶ。saveToPath で「既存を読み込み →
  // 新規と結合 → 全体書き戻し」をすると O(n²) になり、長時間録音では
  // ファイル全体の読み書きが支配的になるため、追記専用の IPC を用意する。
  handle('file:appendToPath', async (event, filePath: string, buffer: Buffer): Promise<boolean> => {
    try {
      const target = resolveWithinRoot(workspaceRoot(), filePath);

      const directory = path.dirname(target);
      if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
      }

      fs.appendFileSync(target, buffer);

      // 追記後の総サイズをログに残す（manifest の totalBytes と突き合わせるため）
      const total = fs.statSync(target).size;
      writeLog(`バイナリファイル追記完了: ${target} (+${buffer.length} bytes, 合計 ${total} bytes)`);

      return true;
    } catch (error) {
      writeLog(`バイナリファイル追記エラー: ${error}`);
      throw toAppError(error, 'バイナリファイルの追記に失敗しました');
    }
  });

  // 作業ディレクトリ取得ハンドラー
  handle('file:getWorkingDirectory', async (): Promise<string> => {
    try {
      // デスクトップのVoiceRecordingsフォルダをデフォルトとして返す
      const workingDirectory = path.join(app.getPath('desktop'), 'VoiceRecordings');
      writeLog(`作業ディレクトリ取得: ${workingDirectory}`);
      return workingDirectory;
    } catch (error) {
      writeLog(`作業ディレクトリ取得エラー: ${error}`);
      return './recordings';
    }
  });
}

// ディスク容量チェック関数
async function checkDiskSpace(dirPath: string): Promise<number> {
  try {
    const { free } = await new Promise<{ free: number; total: number }>((resolve, reject) => {
      if (process.platform === 'win32') {
        exec(`dir /-c "${dirPath}"`, (error, stdout) => {
          if (error) {
            reject(error);
            return;
          }

          const lines = stdout.split('\n');
          const lastLine = lines[lines.length - 2] || '';
          const match = lastLine.match(/(\d+)\s+bytes\s+free/i);

          if (match) {
            const free = parseInt(match[1]);
            resolve({ free, total: free * 2 });
          } else {
            resolve({ free: 1024 * 1024 * 1024, total: 10 * 1024 * 1024 * 1024 });
          }
        });
      } else {
        exec(`df "${dirPath}"`, (error, stdout) => {
          if (error) {
            reject(error);
            return;
          }

          const lines = stdout.split('\n');
          const dataLine = lines[1];
          const values = dataLine.split(/\s+/);

          if (values.length >= 4) {
            const total = parseInt(values[1]) * 1024;
            const available = parseInt(values[3]) * 1024;
            resolve({ free: available, total });
          } else {
            resolve({ free: 1024 * 1024 * 1024, total: 10 * 1024 * 1024 * 1024 });
          }
        });
      }
    });

    return free;
  } catch (error) {
    writeLog(`ディスク容量チェックエラー: ${error}`);
    return 1024 * 1024 * 1024; // 1GB デフォルト
  }
}
