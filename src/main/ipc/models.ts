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
import { AppError } from '../core/errors'
import { resolveWithinRoot } from '../core/paths'
import { handle } from './handle'
import type { ModelDownloadProgressEvent } from '@shared/ipcContract'
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
    // 任意パスを rm -rf できる状態だったため、モデルルート配下に限定する。
    // 加えてルート自身（=全モデル一括削除）は常に拒否する。
    const modelsRoot = resolveModelsRoot();
    const target = resolveWithinRoot(modelsRoot, modelPath);
    if (path.resolve(target).toLowerCase() === path.resolve(modelsRoot).toLowerCase()) {
      throw new AppError('FORBIDDEN_PATH', 'モデルルート自身は削除できません');
    }

    try {
      writeLog(`Removing model: ${target}`);

      if (fs.existsSync(target)) {
        fs.rmSync(target, { recursive: true, force: true });
        writeLog(`Model removed successfully: ${target}`);
      } else {
        writeLog(`Model path does not exist: ${target}`);
      }
    } catch (error) {
      writeLog(`Failed to remove model: ${target}, error: ${error}`);
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
            const payload: ModelDownloadProgressEvent = {
              modelId,
              percent: Math.round(overallProgress),
              message: `Downloading ${fileName}...`,
              bytesDownloaded: downloadedBytes,
              totalBytes,
              speed: speedBps,
              eta: etaSec
            };
            event.sender.send('models:downloadProgress', payload);
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
          const payload: ModelDownloadProgressEvent = {
            modelId,
            percent: 100,
            message: 'Download completed and verified',
            verified: true
          };
          event.sender.send('models:downloadProgress', payload);
          writeLog(`Model download completed and verified: ${modelId}`);
        } else {
          // 検証失敗時は破損モデルとして通知
          const payload: ModelDownloadProgressEvent = {
            modelId,
            percent: 100,
            message: 'Download completed but verification failed',
            verified: false,
            errors: verificationResult.errors.length > 0 ? verificationResult.errors : ['Unknown verification error']
          };
          event.sender.send('models:downloadProgress', payload);
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
