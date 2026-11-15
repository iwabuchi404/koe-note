/**
 * models:* — モデルのパス解決・一覧・検証・ダウンロード・削除
 *
 * 配置/検証/ダウンロードの実装は services/modelStore.ts。
 */
import fs from 'fs'
import path from 'path'
import { findModelById, folderToRepo, repoToFolder } from '@shared/modelCatalog'
import {
  activeDownloads,
  downloadFile,
  repoToId,
  resolveModelsRoot,
  verifyModelInternal
} from '../services/modelStore'
import { writeLog } from '../services/appLog'
import { handle } from './handle'
import type { MainContext } from './context'

export function registerModelsIpc(ctx: MainContext): void {
  handle('models:getModelsPath', async (): Promise<string> => {
    try {
      const root = resolveModelsRoot();
      // 事前にフォルダ作成
      if (!fs.existsSync(root)) {
        fs.mkdirSync(root, { recursive: true });
      }
      return root;
    } catch (error) {
      writeLog(`Failed to get models path: ${error}`);
      throw error;
    }
  });

  handle('models:getInstalledModels', async (): Promise<string[]> => {
    try {
      const modelsPath = resolveModelsRoot();
      const installedModelIds: string[] = [];
      if (fs.existsSync(modelsPath)) {
        const entries = fs.readdirSync(modelsPath, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory() || !entry.name.startsWith('models--')) continue;

          const repo = folderToRepo(entry.name);
          const id = repoToId(repo);
          if (!id) continue;

          // ディレクトリが存在するだけでは「インストール済み」と言えない。
          // 実測では snapshots/main に 0バイトの config.json だけが残った壊れた
          // 状態を、UIが「インストール済み」と表示していた。
          const verification = await verifyModelInternal(id);
          if (verification.valid) {
            installedModelIds.push(id);
          } else {
            writeLog(
              `Model directory exists but incomplete: ${id} ` +
              `(missing=${verification.missingFiles.join(',') || '-'} ` +
              `corrupt=${verification.corruptFiles.join(',') || '-'})`
            );
          }
        }
      }
      return installedModelIds;
    } catch (error) {
      writeLog(`Failed to get installed models: ${error}`);
      throw error;
    }
  });

  handle('models:removeModel', async (event, modelPath: string): Promise<void> => {
    try {
      writeLog(`Removing model: ${modelPath}`);

      if (fs.existsSync(modelPath)) {
        fs.rmSync(modelPath, { recursive: true, force: true });
        writeLog(`Model removed successfully: ${modelPath}`);
      } else {
        writeLog(`Model path does not exist: ${modelPath}`);
      }
    } catch (error) {
      writeLog(`Failed to remove model: ${modelPath}, error: ${error}`);
      throw error;
    }
  });

  // Node.jsベースのモデルダウンロード
  handle('models:downloadWhisperModel', async (event, modelId: string): Promise<void> => {
    try {
      writeLog(`Starting model download: ${modelId}`);
      const config = findModelById(modelId);
      if (!config) {
        throw new Error(`Unknown model: ${modelId}`);
      }

      const modelsPath = resolveModelsRoot();
      const modelDir = path.join(modelsPath, repoToFolder(config.huggingFaceRepo));

      // モデルディレクトリを作成
      if (!fs.existsSync(modelDir)) {
        fs.mkdirSync(modelDir, { recursive: true });
      }

      const refsDir = path.join(modelDir, 'refs');
      const snapshotsDir = path.join(modelDir, 'snapshots', 'main');
      if (!fs.existsSync(snapshotsDir)) {
        fs.mkdirSync(snapshotsDir, { recursive: true });
      }
      if (!fs.existsSync(refsDir)) {
        fs.mkdirSync(refsDir, { recursive: true });
      }
      // refs/main を simple に作成（実運用ではcommit hash等を記録）
      try {
        fs.writeFileSync(path.join(refsDir, 'main'), 'main');
      } catch {}

      // 各ファイルをダウンロード
      let completedFiles = 0;
      const totalFiles = config.files.length;

      for (const fileName of config.files) {
        const fileUrl = `https://huggingface.co/${config.huggingFaceRepo}/resolve/main/${fileName}`;
        const filePath = path.join(snapshotsDir, fileName);
        const tempPath = filePath + '.partial';

        writeLog(`Downloading ${fileName}...`);

        await downloadFile(fileUrl, tempPath, (downloadedBytes, totalBytes, speedBps, elapsedMs) => {
          const fileProgress = (downloadedBytes / totalBytes) * 100;
          const overallProgress = ((completedFiles + fileProgress / 100) / totalFiles) * 100;
          const remainingBytes = (totalFiles - completedFiles - 1) * (totalBytes || 0) + Math.max((totalBytes || 0) - downloadedBytes, 0);
          const etaSec = speedBps > 0 ? Math.round(remainingBytes / speedBps) : 0;

          // ウィンドウが破棄されていないかチェック
          const mainWindow = ctx.getMainWindow()
          if (mainWindow && !mainWindow.isDestroyed()) {
            event.sender.send('models:downloadProgress', {
              modelId,
              percent: Math.round(overallProgress),
              message: `Downloading ${fileName}...`,
              bytesDownloaded: downloadedBytes,
              totalBytes,
              speed: speedBps,
              eta: etaSec
            });
          }
        });
        // 原子的リネーム
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch {}
        fs.renameSync(tempPath, filePath);

        completedFiles++;
      }

      // ダウンロード完了後、自動検証
      writeLog(`Starting post-download verification for: ${modelId}`);

      // 検証を実行
      const verificationResult = await verifyModelInternal(modelId);

      // 検証結果を通知
      const mainWindow = ctx.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (verificationResult.valid) {
          event.sender.send('models:downloadProgress', {
            modelId,
            percent: 100,
            message: 'Download completed and verified',
            verified: true
          });
          writeLog(`Model download completed and verified: ${modelId}`);
        } else {
          // 検証失敗時は破損モデルとして通知
          event.sender.send('models:downloadProgress', {
            modelId,
            percent: 100,
            message: 'Download completed but verification failed',
            verified: false,
            errors: verificationResult.errors.length > 0 ? verificationResult.errors : ['Unknown verification error']
          });
          writeLog(`Model download completed but verification failed: ${modelId}`);

          // エラーをスローして呼び出し元に通知
          throw new Error(`Model verification failed: ${verificationResult.errors.join(', ')}`);
        }
      }

    } catch (error) {
      writeLog(`Model download error: ${modelId}, error: ${error}`);
      throw error;
    }
  });

  // ダウンロードキャンセル
  handle('models:cancelDownload', async (event, modelId: string): Promise<void> => {
    const download = activeDownloads.get(modelId);
    if (download) {
      download.abort();
      activeDownloads.delete(modelId);
    }
  });
}
