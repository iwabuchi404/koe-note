/**
 * speech:* — Whisper サーバーの状態/起動/停止と文字起こし・モデル変更
 *
 * WS の足回り（接続→送信→応答待ち→timeout/切断）は services/whisperClient.ts に集約。
 */
import fs from 'fs'
import { AppError } from '../core/errors'
import { writeLog } from '../services/appLog'
import { whisperCall } from '../services/whisperClient'
import { handle } from './handle'
import type { MainContext } from './context'

export function registerSpeechIpc(ctx: MainContext): void {
  const { whisperServer } = ctx

  // Pythonサーバー状態確認
  handle('speech:getServerStatus', async (): Promise<{ isRunning: boolean; pid?: number }> => {
    writeLog('サーバー状態確認要求');
    const internalStatus = whisperServer.getStatus();
    writeLog(`内部プロセス状態: isRunning=${internalStatus.isRunning}, pid=${internalStatus.pid}`);

    // 内部プロセスが動作していない場合、外部サーバーをチェック
    if (!internalStatus.isRunning) {
      writeLog('内部プロセスが動作していないため、外部サーバーをチェック');
      const externalRunning = await whisperServer.isServerReachable();
      const result = {
        isRunning: externalRunning,
        pid: externalRunning ? -1 : undefined // -1は外部サーバーを示す
      };
      writeLog(`最終的なサーバー状態: isRunning=${result.isRunning}, pid=${result.pid}`);
      return result;
    }

    writeLog(`内部プロセスが動作中: ${JSON.stringify(internalStatus)}`);
    return internalStatus;
  });

  // Pythonサーバー手動起動
  handle('speech:startServer', async (): Promise<void> => {
    // ポートが既に使用されている場合は外部サーバーとして扱う
    if (await whisperServer.isServerReachable()) {
      writeLog('既にサーバーが起動中のため、外部サーバーを使用します');
      return;
    }

    const started = await whisperServer.start();
    if (!started) {
      throw new AppError(
        'SERVER_UNAVAILABLE',
        'Whisper サーバーを起動できませんでした。Python が利用可能か、モデルがダウンロード済みか確認してください。'
      );
    }
  });

  // Pythonサーバー停止
  handle('speech:stopServer', async (): Promise<void> => {
    await whisperServer.stop();
  });

  // 音声ファイル文字起こし
  handle('speech:transcribe', async (event, filePath: string): Promise<unknown> => {
    writeLog(`音声認識開始: ${filePath}`);

    // ファイル存在確認
    if (!fs.existsSync(filePath)) {
      throw new Error('音声ファイルが見つかりません');
    }

    return whisperCall<unknown>({
      request: {
        type: 'transcribe_file',
        file_path: filePath,
        language: 'ja'
      },
      timeoutMs: 120000,
      timeoutMessage: '音声認識がタイムアウトしました（120秒）',
      sendFailureMessage: '音声認識リクエストの送信に失敗しました',
      closeMessage: '音声認識サーバーとの接続が切断されました',
      mapError: (error) =>
        error.message.includes('ECONNREFUSED') || error.message.includes('connect')
          ? new Error('音声認識サーバーが起動していません。「サーバー起動」ボタンを押してサーバーを起動してください。')
          : new Error(`音声認識サーバーとの通信に失敗しました: ${error.message}`),
      onResponse: (response) => {
        if (response.type === 'transcription_result') {
          if (response.status === 'completed') {
            const result = response.result as { segment_count?: number } | undefined
            writeLog(`音声認識完了: セグメント数 ${result?.segment_count}`);
            return { type: 'resolve', value: response.result };
          }
          if (response.status === 'failed') {
            writeLog(`音声認識失敗: ${response.message}`);
            return { type: 'reject', message: response.message || '音声認識に失敗しました' };
          }
        } else if (response.type === 'transcription_progress') {
          writeLog(`音声認識進捗: ${response.status}`);
        } else if (response.type === 'connection') {
          writeLog(`サーバー接続確認: ${response.message}`);
        } else if (response.type === 'error') {
          writeLog(`サーバーエラー: ${response.message}`);
          return { type: 'reject', message: response.message || 'サーバーエラーが発生しました' };
        } else {
          writeLog(`未知のメッセージタイプ: ${response.type}`);
        }
      }
    });
  });

  // モデル変更
  handle('speech:changeModel', async (event, modelName: string): Promise<boolean> => {
    writeLog(`モデル変更リクエスト: ${modelName}`);

    return whisperCall<boolean>({
      request: {
        type: 'change_model',
        model_name: modelName
      },
      timeoutMs: 180000,
      timeoutMessage: 'モデル変更がタイムアウトしました（180秒）',
      sendFailureMessage: 'モデル変更リクエストの送信に失敗しました',
      closeMessage: 'モデル変更サーバーとの接続が切断されました',
      mapError: () => new Error('モデル変更サーバーとの通信に失敗しました'),
      onResponse: (response) => {
        if (response.type === 'model_changed') {
          if (response.status === 'success' || response.status === 'already_loaded') {
            writeLog(`モデル変更${response.status === 'success' ? '成功' : '既に読み込み済み'}: ${response.model_name}`);
            return { type: 'resolve', value: true };
          }
          if (response.status === 'failed') {
            writeLog(`モデル変更失敗: ${response.message}`);
            return { type: 'resolve', value: false };
          }
        } else if (response.type === 'model_loading') {
          writeLog(`モデル読み込み中: ${response.model_name}`);
        } else if (response.type === 'error') {
          writeLog(`モデル変更エラー: ${response.message}`);
          return { type: 'reject', message: response.message || 'モデル変更でエラーが発生しました' };
        }
      }
    });
  });
}
