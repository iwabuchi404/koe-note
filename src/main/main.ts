import { app, BrowserWindow, ipcMain, dialog, desktopCapturer } from 'electron';
import type { AppSettings, AudioFile, TranscriptionFile, TranscriptionSegmentExtended, ClipboardCopyRecord, AIChatFile } from '@shared/types';
import { parseTranscriptFile, type ParsedTranscriptFile } from '@shared/transcriptFile';
import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, exec, execSync, ChildProcess, SpawnOptions } from 'child_process';
import * as https from 'https';
import { WhisperServerService } from './services/whisperServer';
import { listFiles } from './services/fileLibrary';
import { resolveWithinRoot, transcriptionPathFor, aiChatPathFor } from './core/paths';
import { AppError, toAppError } from './core/errors';
import { handle, setIpcContext } from './ipc/handle';
import * as http from 'http';

// ログファイルのパス
const logFilePath = path.join(app.getPath('userData'), 'app.log');

// ログ関数
function writeLog(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(logMessage.trim());
  
  try {
    fs.appendFileSync(logFilePath, logMessage);
  } catch (error) {
    console.error('ログファイル書き込みエラー:', error);
  }
}

writeLog('アプリケーション開始');

// IPC ハンドラがログを書き込めるようにする
setIpcContext({ log: writeLog });

// アプリケーション設定
const isDev = process.env.NODE_ENV === 'development';
// モデル保存ルートを解決（開発/本番/ポータブル対応）
function resolveModelsRoot(): string {
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

// モデル定義は src/shared/models.json が正。
// Python サーバーも同じJSONを読むため、UIに表示されるモデルと
// サーバーが受け付けるモデルは必ず一致する。
import { findModelById, findModelByRepo, repoToFolder, folderToRepo } from '@shared/modelCatalog';

function repoToId(repo: string): string | null {
  const entry = findModelByRepo(repo);
  return entry ? entry.id : null;
}

// ダウンロード中の管理（キャンセル用）
const activeDownloads = new Map<string, { abort: () => void }>();
const cancelledDownloads = new Set<string>();

let mainWindow: BrowserWindow | null = null;

// シングルインスタンスロック（重複起動防止）
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  writeLog('Second instance detected. Quitting this instance.');
  app.quit();
} else {
  app.on('second-instance', () => {
    writeLog('Second instance event - focusing existing window.');
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Pythonサブプロセス管理クラス
// Python環境チェック関数
async function checkPythonAvailability(): Promise<boolean> {
  return new Promise((resolve) => {
    const pythonProcess = spawn('python', ['--version'], { stdio: 'pipe' });
    pythonProcess.on('close', (code) => {
      resolve(code === 0);
    });
    pythonProcess.on('error', () => {
      resolve(false);
    });
  });
}

// Kotoba-Whisper サーバー管理（Electron 非依存の実装は services/whisperServer.ts）
// ここでは合成ルートとして Electron 固有の依存を差し込む
const whisperServer = new WhisperServerService({
  log: writeLog,
  onStatus: (status, pid) => {
    writeLog(`Server status notification: ${status}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('speech:serverStatus', { status, pid });
    }
  },
  resolveModelsRoot,
  isPortInUse,
  checkPython: checkPythonAvailability,
  paths: {
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    bundleDir: __dirname
  }
});

// メインウィンドウの作成
function createWindow(): void {
  // ウィンドウの作成
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // デスクトップキャプチャ用に無効化
      allowRunningInsecureContent: true,
      experimentalFeatures: true,
      preload: path.join(__dirname, 'preload.js'),
      // 音声録音権限を明示的に有効化
      backgroundThrottling: false, // 音声録音中のスロットリング防止
    },
    frame: false, // カスタムタイトルバーのため標準フレームを無効化
    titleBarStyle: 'hiddenInset', // macOS対応
    // icon: path.join(__dirname, '../../assets/icon.png'), // アイコン（後で追加）
  });

  // HTMLファイルの読み込み
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    if (!mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.webContents.openDevTools();
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));
  }

  // メディア権限要求ハンドラー（音声録音・映像キャプチャ・デスクトップキャプチャ）
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    writeLog(`権限要求: ${permission}`);
    // 全てのメディア関連権限を許可
    if (permission === 'media') {
      callback(true);
    } else {
      callback(true);
    }
  });

  // getDisplayMediaのハンドラー（Windowsのシステム音声はWASAPIループバックでのみ取得できる）
  //
  // Electron 28 の Streams.audio は 'loopback' | 'loopbackWithMute' のみを受け付ける。
  // loopback を指定しても OS 側でシステム音声が出力されていない場合は
  // Chromium がマイクへフォールバックしたMediaStreamを返すため、
  // 正しさの担保は renderer 側（desktopAudioSource.ts）に置いている。
  // ここでは各ソースの音声対応状況を出力して、原因の判別できるようにする。
  mainWindow.webContents.session.setDisplayMediaRequestHandler((request, callback) => {
    writeLog('ディスプレイメディア要求を受信');

    desktopCapturer
      .getSources({ types: ['screen'] })
      .then((sources) => {
        writeLog(`利用可能スクリーン数: ${sources.length}`);

        // 診断用: Electronの型には audio フィールドは無いが、
        // 実行時に存在する場合はシステム音声の対応状況を示してくれる
        for (const source of sources) {
          const audioFlag = (source as unknown as { audio?: string }).audio;
          writeLog(`  source: ${source.name} (id=${source.id}, audio=${audioFlag ?? 'n/a'})`);
        }

        if (sources.length === 0) {
          writeLog('ERROR スクリーンソースが見つかりません');
          callback({});
          return;
        }

        const target = sources[0];
        writeLog(`ディスプレイメディア応答: ${target.name} / audio=loopback`);
        callback({ video: target, audio: 'loopback' });
      })
      .catch((error) => {
        writeLog(`ERROR desktopCapturer: ${String(error)}`);
        callback({});
      });
  });

  // レンダラープロセスのコンソールログを監視
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const logMessage = `[Renderer Console ${level}] ${message} (${sourceId}:${line})`;
    writeLog(logMessage);
  });

  // レンダラープロセスでクラッシュした場合
  mainWindow.webContents.on('crashed', (event, killed) => {
    console.error('Renderer process crashed:', { killed });
  });

  // ウィンドウが閉じられたときの処理
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// アプリケーションの初期化
app.whenReady().then(async () => {
  createWindow();

  // Pythonサーバーの自動起動を試行（非ブロッキング・失敗してもアプリは継続）
  writeLog('Pythonサーバー自動起動を試行...');
  whisperServer.start()
    .then(success => writeLog(success ? 'Pythonサーバー自動起動成功' : 'Pythonサーバー自動起動失敗 - 手動起動を使用してください'))
    .catch(error => writeLog(`Pythonサーバー自動起動エラー: ${error} - 手動起動を使用してください`));

  app.on('activate', () => {
    // macOS対応: ドックアイコンがクリックされた際の処理
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// デスクトップキャプチャ・システム音声録音の設定
//
// 注意点: app.commandLine.appendSwitch は同名スイッチを1つしか持てない。
// 複数回呼ぶと後の値が前の値を上書きする（値は連結されない）。
// そのため enable-features / disable-features は
// 値を集めてから1回だけ append する。
const enabledFeatures: string[] = ['WebRTCPipeWireCapturer'];
const disabledFeatures: string[] = ['AudioServiceOutOfProcess'];

if (process.platform === 'darwin') {
  enabledFeatures.push('ScreenCaptureKitMac');
}

// バックグラウンドスロットリングを止め、録音中のタブの処理が止まるのを防ぐ
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

app.commandLine.appendSwitch('enable-features', enabledFeatures.join(','));
app.commandLine.appendSwitch('disable-features', disabledFeatures.join(','));

// すべてのウィンドウが閉じられたときの処理
app.on('window-all-closed', () => {
  // macOS以外では完全にアプリを終了（サーバー停止はbefore-quitで処理）
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// アプリケーション終了前の処理（graceful shutdownを待機するためasync）
let isQuitting = false;
app.on('before-quit', async (event) => {
  if (isQuitting) return;
  isQuitting = true;
  writeLog('アプリケーション終了処理開始');
  event.preventDefault();
  // サーバーの再起動を完全に禁止
  whisperServer.setQuitting(true);
  // isStoppingをリセットしてstopServer()が実際に実行されるようにする
  whisperServer.resetStopping();
  await whisperServer.stop().catch(e => writeLog(`before-quit stopServer error: ${e}`));
  app.exit();
});

// IPC通信ハンドラー
// フォルダ選択ダイアログ
handle('dialog:selectFolder', async (): Promise<string | null> => {
  if (!mainWindow) {
    return null;
  }
  
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '録音ファイルの保存フォルダを選択',
  });

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0];
});

// ファイル選択ダイアログ
handle('dialog:selectFile', async (event, filters?: Array<{ name: string; extensions: string[] }>): Promise<{ path: string; name: string } | null> => {
  if (!mainWindow) {
    return null;
  }

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: 'ファイルを選択',
    filters: filters || [
      { name: '音声ファイル', extensions: ['wav', 'mp3', 'webm', 'm4a', 'flac'] },
      { name: 'テキストファイル', extensions: ['txt', 'md', 'rtf'] },
      { name: 'すべてのファイル', extensions: ['*'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  const name = path.basename(filePath);
  return { path: filePath, name };
});

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

// 設定ファイルのパス
const settingsFilePath = path.join(app.getPath('userData'), 'settings.json');


/**
 * 許可ルート（作業フォルダ）
 *
 * すべての file / transcription ハンドラはこの配下でのみ動作する。
 * 設定の saveFolder を正とし、設定が読めていない場合は既定値を使う。
 */
function workspaceRoot(): string {
  try {
    if (fs.existsSync(settingsFilePath)) {
      const saved = JSON.parse(fs.readFileSync(settingsFilePath, 'utf-8'));
      if (saved?.saveFolder) {
        return path.resolve(saved.saveFolder);
      }
    }
  } catch {
    // 設定が読めない場合は既定値を使う
  }
  return path.resolve(getDefaultSettings().saveFolder);
}
// デフォルト設定
function getDefaultSettings() {
  return {
    saveFolder: path.join(app.getPath('desktop'), 'VoiceRecordings'),
    audioQuality: 'medium' as const,
    defaultVolume: 0.8,
    defaultInputDevice: '',
    mp3Bitrate: 192 as const,
    autoTranscribe: false,
  };
}

// 設定の保存・読み込み
handle('settings:load', async (): Promise<AppSettings> => {
  try {
    if (fs.existsSync(settingsFilePath)) {
      const data = fs.readFileSync(settingsFilePath, 'utf-8');
      const saved = JSON.parse(data);
      return { ...getDefaultSettings(), ...saved };
    }
  } catch (error) {
    writeLog(`設定読み込みエラー: ${error}`);
  }
  return getDefaultSettings();
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

// ウィンドウ操作
handle('window:minimize', async (): Promise<void> => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

handle('window:maximize', async (): Promise<void> => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

handle('window:close', async (): Promise<void> => {
  if (mainWindow) {
    mainWindow.close();
  }
});

handle('window:isMaximized', async (): Promise<boolean> => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

// ログ出力（rendererプロセスから）
handle('log:write', async (event, message: string): Promise<void> => {
  writeLog(message);
});

// === Kotoba-Whisper音声認識機能 ===

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

// モデル管理関連のIPCハンドラー
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

// モデル検証結果の型定義
interface ModelVerificationResult {
  valid: boolean;
  modelId: string;
  missingFiles: string[];
  corruptFiles: string[];
  totalFiles: number;
  checkedFiles: number;
  errors: string[];
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
function resolveSnapshotDir(modelsRoot: string, repo: string): string | null {
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
async function verifyModelInternal(modelId: string): Promise<ModelVerificationResult> {
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

// ファイルダウンロード関数
async function downloadFile(
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

// ダウンロードキャンセル
handle('models:cancelDownload', async (event, modelId: string): Promise<void> => {
  const handle = activeDownloads.get(modelId);
  if (handle) {
    handle.abort();
    activeDownloads.delete(modelId);
  }
  cancelledDownloads.add(modelId);
});

// 音声ファイル文字起こし
handle('speech:transcribe', async (event, filePath: string): Promise<any> => {
  try {
    writeLog(`音声認識開始: ${filePath}`);
    
    // ファイル存在確認
    if (!fs.existsSync(filePath)) {
      throw new Error('音声ファイルが見つかりません');
    }

    // WebSocketクライアントで音声認識リクエスト送信
    const WebSocket = require('ws');
    const ws = new WebSocket('ws://127.0.0.1:8770');

    return new Promise((resolve, reject) => {
      let isResolved = false;
      
      ws.on('open', () => {
        writeLog('WebSocket接続成功、音声認識リクエスト送信');
        
        const request = {
          type: 'transcribe_file',
          file_path: filePath,
          language: 'ja'
        };
        
        try {
          ws.send(JSON.stringify(request));
          writeLog('音声認識リクエスト送信完了');
        } catch (error) {
          writeLog(`リクエスト送信エラー: ${error}`);
          clearTimeout(timeoutId);
          if (!isResolved) {
            isResolved = true;
            reject(new Error('音声認識リクエストの送信に失敗しました'));
          }
        }
      });

      ws.on('message', (data: Buffer) => {
        try {
          const response = JSON.parse(data.toString());
          writeLog(`WebSocketメッセージ受信: ${response.type}, status: ${response.status}`);
          
          if (response.type === 'transcription_result') {
            if (response.status === 'completed') {
              writeLog(`音声認識完了: セグメント数 ${response.result.segment_count}`);
              clearTimeout(timeoutId);
              
              if (!isResolved) {
                isResolved = true;
                resolve(response.result);
              }
            } else if (response.status === 'failed') {
              writeLog(`音声認識失敗: ${response.message}`);
              clearTimeout(timeoutId);
              
              if (!isResolved) {
                isResolved = true;
                reject(new Error(response.message || '音声認識に失敗しました'));
              }
            }
          } else if (response.type === 'transcription_progress') {
            writeLog(`音声認識進捗: ${response.status}`);
          } else if (response.type === 'connection') {
            writeLog(`サーバー接続確認: ${response.message}`);
          } else if (response.type === 'error') {
            writeLog(`サーバーエラー: ${response.message}`);
            if (!isResolved) {
              isResolved = true;
              reject(new Error(response.message || 'サーバーエラーが発生しました'));
            }
          } else {
            writeLog(`未知のメッセージタイプ: ${response.type}`);
          }
        } catch (parseError) {
          writeLog(`WebSocketレスポンス解析エラー: ${parseError}`);
        }
      });

      ws.on('error', (error: Error) => {
        writeLog(`WebSocketエラー: ${error.message}`);
        clearTimeout(timeoutId);
        
        if (!isResolved) {
          isResolved = true;
          // より詳細なエラーメッセージを提供
          if (error.message.includes('ECONNREFUSED') || error.message.includes('connect')) {
            reject(new Error('音声認識サーバーが起動していません。「サーバー起動」ボタンを押してサーバーを起動してください。'));
          } else {
            reject(new Error(`音声認識サーバーとの通信に失敗しました: ${error.message}`));
          }
        }
      });

      ws.on('close', () => {
        writeLog('WebSocket接続終了');
        clearTimeout(timeoutId);
        
        if (!isResolved) {
          isResolved = true;
          reject(new Error('音声認識サーバーとの接続が切断されました'));
        }
      });

      // タイムアウト設定（120秒）- Kotoba-Whisperの処理時間を考慮し延長
      const timeoutId = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          writeLog('音声認識タイムアウト (120秒)');
          try {
            ws.close();
          } catch (closeError) {
            writeLog(`WebSocket close error: ${closeError}`);
          }
          reject(new Error('音声認識がタイムアウトしました（120秒）'));
        }
      }, 120000);
      
    });

  } catch (error) {
    writeLog(`音声認識エラー: ${error}`);
    throw error;
  }
});

// モデル変更
handle('speech:changeModel', async (event, modelName: string): Promise<boolean> => {
  try {
    writeLog(`モデル変更リクエスト: ${modelName}`);
    
    // WebSocketクライアントでモデル変更リクエスト送信
    const WebSocket = require('ws');
    const ws = new WebSocket('ws://127.0.0.1:8770');

    return new Promise((resolve, reject) => {
      let isResolved = false;
      
      ws.on('open', () => {
        writeLog('WebSocket接続成功、モデル変更リクエスト送信');
        
        const request = {
          type: 'change_model',
          model_name: modelName
        };
        
        try {
          ws.send(JSON.stringify(request));
          writeLog(`モデル変更リクエスト送信完了: ${modelName}`);
        } catch (error) {
          writeLog(`モデル変更リクエスト送信エラー: ${error}`);
          clearTimeout(timeoutId);
          if (!isResolved) {
            isResolved = true;
            reject(new Error('モデル変更リクエストの送信に失敗しました'));
          }
        }
      });

      ws.on('message', (data: Buffer) => {
        try {
          const response = JSON.parse(data.toString());
          writeLog(`モデル変更レスポンス: ${response.type}, status: ${response.status}`);
          
          if (response.type === 'model_changed') {
            if (response.status === 'success') {
              writeLog(`モデル変更成功: ${response.model_name}`);
              clearTimeout(timeoutId);
              
              if (!isResolved) {
                isResolved = true;
                resolve(true);
              }
            } else if (response.status === 'already_loaded') {
              writeLog(`モデル既に読み込み済み: ${response.model_name}`);
              clearTimeout(timeoutId);
              
              if (!isResolved) {
                isResolved = true;
                resolve(true);
              }
            } else if (response.status === 'failed') {
              writeLog(`モデル変更失敗: ${response.message}`);
              clearTimeout(timeoutId);
              
              if (!isResolved) {
                isResolved = true;
                resolve(false);
              }
            }
          } else if (response.type === 'model_loading') {
            writeLog(`モデル読み込み中: ${response.model_name}`);
          } else if (response.type === 'error') {
            writeLog(`モデル変更エラー: ${response.message}`);
            clearTimeout(timeoutId);
            
            if (!isResolved) {
              isResolved = true;
              reject(new Error(response.message || 'モデル変更でエラーが発生しました'));
            }
          }
        } catch (parseError) {
          writeLog(`モデル変更レスポンス解析エラー: ${parseError}`);
        }
      });

      ws.on('error', (error: Error) => {
        writeLog(`モデル変更WebSocketエラー: ${error.message}`);
        clearTimeout(timeoutId);
        
        if (!isResolved) {
          isResolved = true;
          reject(new Error('モデル変更サーバーとの通信に失敗しました'));
        }
      });

      ws.on('close', () => {
        writeLog('モデル変更WebSocket接続終了');
        clearTimeout(timeoutId);
        
        if (!isResolved) {
          isResolved = true;
          reject(new Error('モデル変更サーバーとの接続が切断されました'));
        }
      });

      // タイムアウト設定（180秒）- 大型モデルのダウンロード時間を考慮
      const timeoutId = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          writeLog('モデル変更タイムアウト (180秒)');
          try {
            ws.close();
          } catch (closeError) {
            writeLog(`モデル変更WebSocket close error: ${closeError}`);
          }
          reject(new Error('モデル変更がタイムアウトしました（180秒）'));
        }
      }, 180000);
      
    });

  } catch (error) {
    writeLog(`モデル変更エラー: ${error}`);
    throw error;
  }
});

handle('transcription:load', async (event, transFilePath: string): Promise<any> => {
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

// ポート確認
async function isPortInUse(port: number, host: string = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1500);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      // ECONNREFUSED 等は未使用とみなす
      resolve(false);
    });
    socket.connect(port, host);
  });
}
function getTranscriptionPath(audioFilePath: string): string {
  const parsedPath = path.parse(audioFilePath);
  
  // 新形式のパスを優先し、存在しない場合は旧形式を返す
  const newFormatPath = path.join(parsedPath.dir, `${parsedPath.name}.trans.txt`);
  const oldFormatPath = path.join(parsedPath.dir, `${parsedPath.name}_transcription.txt`);
  
  try {
    // 新形式のファイルが存在するかチェック
    if (fs.existsSync(newFormatPath)) {
      return newFormatPath;
    }
    // 旧形式のファイルが存在するかチェック
    if (fs.existsSync(oldFormatPath)) {
      return oldFormatPath;
    }
    // どちらも存在しない場合は新形式をデフォルトとして返す
    return newFormatPath;
  } catch (error) {
    // エラーが発生した場合は新形式を返す
    return newFormatPath;
  }
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

function generateAIChatFileContent(chatFile: AIChatFile): string {
  const metadata = `---
source_file: ${chatFile.sourceFile}
created_at: ${chatFile.createdAt}
total_interactions: ${chatFile.clipboardHistory.length}
---

# クリップボードコピー履歴
`;
  
  const history = chatFile.clipboardHistory.map((record: ClipboardCopyRecord) => {
    const time = new Date(record.timestamp).toLocaleTimeString('ja-JP', { hour12: false });
    return `[${time}] コピー: "${record.selectedText}"`;
  }).join('\n');
  
  return metadata + history;
}

function parseAIChatFileContent(content: string): AIChatFile {
  const parts = content.split('---\n');
  if (parts.length < 3) {
    return {
      sourceFile: '',
      createdAt: new Date().toISOString(),
      clipboardHistory: []
    };
  }
  
  // YAMLメタデータの解析
  const yamlContent = parts[1];
  const metadata: Record<string, string> = {};
  
  yamlContent.split('\n').forEach(line => {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match) {
      const [, key, value] = match;
      metadata[key] = value;
    }
  });
  
  // クリップボード履歴の解析
  const historyContent = parts[2];
  const clipboardHistory = historyContent.split('\n')
    .filter(line => line.match(/^\[\d{2}:\d{2}:\d{2}\]/))
    .map(line => {
      const match = line.match(/^\[(\d{2}:\d{2}:\d{2})\] コピー: "(.+)"$/);
      if (match) {
        const [, time, text] = match;
        const today = new Date().toISOString().split('T')[0];
        return {
          timestamp: `${today}T${time}Z`,
          selectedText: text
        };
      }
      return null;
    })
    .filter(Boolean);
  
  return {
    sourceFile: metadata.source_file || '',
    createdAt: metadata.created_at || new Date().toISOString(),
    clipboardHistory: clipboardHistory as ClipboardCopyRecord[]
  };
}

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

// ファイルサイズの取得（重複削除済み - 上部の file:getSize ハンドラーを使用）










