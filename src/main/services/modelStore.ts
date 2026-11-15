/**
 * モデルの配置・検証・ダウンロード
 *
 * HuggingFace キャッシュ風レイアウト（models--<org>--<name>/refs,snapshots）
 * を管理する。モデル定義の正は src/shared/models.json（modelCatalog）。
 */
import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import http from 'http'
import https from 'https'
import { findModelById, findModelByRepo, repoToFolder } from '@shared/modelCatalog'
import { writeLog } from './appLog'

// モデル検証結果の型定義
export interface ModelVerificationResult {
  valid: boolean
  modelId: string
  missingFiles: string[]
  corruptFiles: string[]
  totalFiles: number
  checkedFiles: number
  errors: string[]
}

// モデル保存ルートを解決（開発/本番/ポータブル対応）
export function resolveModelsRoot(): string {
  try {
    const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
    if (portableDir && portableDir.length > 0) {
      return path.join(portableDir, 'models');
    }
    const appPath = app.getAppPath();
    const isDevelopment = process.env.NODE_ENV !== 'production' || appPath.includes('node_modules');
    if (isDevelopment) {
      // 開発モード: プロジェクトルートの whisper-server/models
      return path.join(process.cwd(), 'whisper-server', 'models');
    }
    // 本番モード: ユーザーデータディレクトリを使用（書き込み可能）
    return path.join(app.getPath('userData'), 'models');
  } catch (error) {
    writeLog(`resolveModelsRoot error: ${error}`);
    // フォールバック: プロジェクトルート
    return path.join(process.cwd(), 'whisper-server', 'models');
  }
}

export function repoToId(repo: string): string | null {
  const entry = findModelByRepo(repo);
  return entry ? entry.id : null;
}

/**
 * モデルの実体があるスナップショットディレクトリを解決する
 *
 * HuggingFace のキャッシュは本来この構造:
 *   models--<org>--<name>/refs/main        → 40文字のコミット sha
 *   models--<org>--<name>/snapshots/<sha>/  → 実体
 *
 * しかし本アプリのダウンローダは refs/main にリテラル "main" を書いて
 * snapshots/main へ直接配置する（fast_hf の解決ロジックでも "main" は
 * 正しい revision 名として通用する）。
 *
 * そのため refs の値だけでは snapshot の場所を決められない。
 *   1. refs/main の値が指すディレクトリ
 *   2. snapshots/main
 *   3. snapshots 配下のディレクトリ
 * の順に実体が了回来ものを採用する。実測では (3) だけが
 * 存在し、refs は sha を指んでいた。
 *
 * @returns 実体のあるディレクトリのパス。無ければ null
 */
export function resolveSnapshotDir(modelsRoot: string, repo: string): string | null {
  const modelDir = path.join(modelsRoot, repoToFolder(repo));
  const snapshotsRoot = path.join(modelDir, 'snapshots');
  if (!fs.existsSync(snapshotsRoot)) return null;

  const candidates: string[] = [];

  try {
    const ref = fs.readFileSync(path.join(modelDir, 'refs', 'main'), 'utf8').trim();
    if (ref) candidates.push(path.join(snapshotsRoot, ref));
  } catch {
    // refs/main が無い（直接 snapshots へ配置したケース）
  }

  candidates.push(path.join(snapshotsRoot, 'main'));

  try {
    const dirs = fs
      .readdirSync(snapshotsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(snapshotsRoot, entry.name));
    candidates.push(...dirs);
  } catch {
    // snapshots を読めない場合は候補なし
  }

  for (const dir of candidates) {
    try {
      if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) return dir;
    } catch {
      // 権限等で読めない場合は次へ
    }
  }
  return null;
}

// 内部検証関数（IPCハンドラとダウンロード完了時の検証で共有）
export async function verifyModelInternal(modelId: string): Promise<ModelVerificationResult> {
  const result: ModelVerificationResult = {
    valid: false,
    modelId,
    missingFiles: [],
    corruptFiles: [],
    totalFiles: 0,
    checkedFiles: 0,
    errors: []
  };

  try {
    writeLog(`Verifying model: ${modelId}`);

    const config = findModelById(modelId);
    if (!config) {
      result.errors.push(`Unknown model: ${modelId}`);
      writeLog(`Model verification failed: ${modelId} - unknown model`);
      return result;
    }

    const modelsPath = resolveModelsRoot();
    const snapshotsDir = resolveSnapshotDir(modelsPath, config.huggingFaceRepo);

    if (!snapshotsDir) {
      result.errors.push(`Model directory not found: ${repoToFolder(config.huggingFaceRepo)}`);
      writeLog(`Model verification failed: ${modelId} - directory not found`);
      return result;
    }

    result.totalFiles = config.files.length;

    // 各ファイルをチェック
    for (const fileName of config.files) {
      const filePath = path.join(snapshotsDir, fileName);
      result.checkedFiles++;

      if (!fs.existsSync(filePath)) {
        result.missingFiles.push(fileName);
        result.errors.push(`Missing file: ${fileName}`);
        writeLog(`Model verification: ${modelId} - missing file: ${fileName}`);
        continue;
      }

      // ファイルサイズチェック（0バイトファイルは破損とみなす）
      const stats = fs.statSync(filePath);
      if (stats.size === 0) {
        result.corruptFiles.push(fileName);
        result.errors.push(`Corrupt file (0 bytes): ${fileName}`);
        writeLog(`Model verification: ${modelId} - corrupt file (0 bytes): ${fileName}`);
        continue;
      }

      // JSONファイルの場合はパース可能かチェック
      if (fileName.endsWith('.json')) {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          JSON.parse(content);
        } catch (parseError) {
          result.corruptFiles.push(fileName);
          result.errors.push(`Invalid JSON: ${fileName}`);
          writeLog(`Model verification: ${modelId} - invalid JSON: ${fileName}`);
        }
      }
    }

    // 検証結果の判定
    result.valid = result.missingFiles.length === 0 && result.corruptFiles.length === 0 && result.errors.length === 0;

    if (result.valid) {
      writeLog(`Model verification passed: ${modelId}`);
    } else {
      writeLog(`Model verification failed: ${modelId} - ${result.errors.length} errors`);
    }

    return result;
  } catch (error) {
    const errorMsg = `Verification error: ${error}`;
    result.errors.push(errorMsg);
    writeLog(`Model verification error: ${modelId} - ${error}`);
    return result;
  }
}

// ダウンロード中の管理（キャンセル用）
export const activeDownloads = new Map<string, { abort: () => void }>();

// ファイルダウンロード関数
export async function downloadFile(
  url: string,
  targetPath: string,
  onProgress: (bytesDownloaded: number, totalBytes: number, speedBps: number, elapsedMs: number) => void,
  abortKey?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(targetPath);
    let downloadedBytes = 0;
    let totalBytes = 0;
    let startTime = Date.now();
    let currentUrl = url;
    let redirectCount = 0;
    const maxRedirects = 5;

    const request = url.startsWith('https:') ? https : http;

    const makeRequest = (requestUrl: string) => {
      const req = request.get(requestUrl, (response) => {
        if (response.statusCode !== 200) {
          if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
            const location = response.headers.location;
            if (location && redirectCount < maxRedirects) {
              redirectCount++;
              currentUrl = location.startsWith('http') ? location : new URL(location, requestUrl).href;
              writeLog(`Following redirect ${redirectCount}/${maxRedirects}: ${currentUrl}`);
              makeRequest(currentUrl);
              return;
            } else {
              reject(new Error(`Too many redirects or invalid redirect: ${response.statusCode}`));
              return;
            }
          }
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }

        totalBytes = parseInt(response.headers['content-length'] || '0', 10);

        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          const elapsedMs = Date.now() - startTime;
          const speedBps = elapsedMs > 0 ? (downloadedBytes * 1000) / elapsedMs : 0;
          onProgress(downloadedBytes, totalBytes, speedBps, elapsedMs);
        });

        response.on('end', () => {
          file.close();
          resolve();
        });

        response.on('error', (error) => {
          file.close();
          fs.unlinkSync(targetPath); // 失敗したファイルを削除
          reject(error);
        });
      });

      req.on('error', (error) => {
        file.close();
        fs.unlinkSync(targetPath); // 失敗したファイルを削除
        reject(error);
      });

      file.on('error', (error) => {
        reject(error);
      });

      // Abort 対応
      if (abortKey) {
        activeDownloads.set(abortKey, { abort: () => {
          try { req.destroy(new Error('aborted')); } catch {}
          try { file.close(); } catch {}
          try { if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath); } catch {}
        }});
      }
    };

    makeRequest(currentUrl);
  });
}
