import { app, BrowserWindow, ipcMain, dialog, desktopCapturer } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, exec, ChildProcess } from 'child_process';

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

// アプリケーション設定
const isDev = process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;

// Pythonサブプロセス管理クラス
class KotobaWhisperManager {
  private pythonProcess: ChildProcess | null = null;
  private isRunning: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 3;

  constructor() {
    writeLog('KotobaWhisperManager初期化');
  }

  // Pythonサーバー起動
  async startServer(): Promise<boolean> {
    if (this.isRunning) {
      writeLog('Pythonサーバーは既に起動中です');
      return true;
    }
  
    // ★★★★★ 開発環境専用デバッグコード（コメントアウト） ★★★★★
    // try {
    //   const workDirContent = fs.readdirSync('D:/work/');
    //   writeLog(`[DEBUG] Content of D:/work/ -> [${workDirContent.join(', ')}]`);
    //   if (workDirContent.includes('whisper-server')) {
    //       writeLog('[DEBUG] "whisper-server" directory IS FOUND in D:/work/ by readdirSync.');
    //   } else {
    //       writeLog('[DEBUG] "whisper-server" directory NOT FOUND in D:/work/ by readdirSync.');
    //   }
    // } catch (e) {
    //   writeLog(`[DEBUG] Failed to read D:/work/ directory. Error: ${e}`);
    // }
    // ★★★★★ デバッグコードここまで ★★★★★

    try {
      writeLog('Kotoba-Whisper Pythonサーバー起動中...');
      
      // whisper-serverディレクトリのパス（相対パス解決）
      writeLog(`Current __dirname: ${__dirname}`);
      writeLog(`Process cwd: ${process.cwd()}`);
      
      // Electronアプリのベースディレクトリを特定
      const appPath = app.getAppPath();
      writeLog(`App path: ${appPath}`);
      
      // whisper-serverへのパス（環境非依存の相対パス）
      let whisperServerPath: string;
      
      // 開発環境かパッケージ化環境かを判定
      const isDevelopment = process.env.NODE_ENV !== 'production' || appPath.includes('node_modules');
      writeLog(`Environment: ${isDevelopment ? 'Development' : 'Production'}`);
      
      if (isDevelopment) {
        // 開発環境: アプリルートの whisper-server
        whisperServerPath = path.join(appPath, 'whisper-server');
      } else {
        // パッケージ化環境: resources/app.asar の隣の whisper-server
        // 通常は resources/app.asar/dist から ../../whisper-server
        whisperServerPath = path.join(path.dirname(appPath), 'whisper-server');
      }
      
      writeLog(`Whisper server path: ${whisperServerPath}`);
      
      // パス存在確認（フォールバック付き）
      const pathCandidates = [
        whisperServerPath,
        path.join(appPath, 'whisper-server'),           // 基本パス
        path.join(path.dirname(appPath), 'whisper-server'), // 親ディレクトリ
        path.join(process.cwd(), 'whisper-server'),     // 実行ディレクトリ
        path.resolve(__dirname, '..', 'whisper-server'), // 相対パス
      ];
      
      let validPath: string | null = null;
      for (const candidatePath of pathCandidates) {
        writeLog(`Checking path candidate: ${candidatePath}`);
        if (fs.existsSync(candidatePath)) {
          validPath = candidatePath;
          writeLog(`Found valid whisper-server path: ${validPath}`);
          break;
        }
      }
      
      if (!validPath) {
        const errorMessage = `Whisper server directory not found in any of these locations:\n${pathCandidates.join('\n')}`;
        writeLog(errorMessage);
        throw new Error(errorMessage);
      }
      
      whisperServerPath = validPath;
      
      // main.pyの存在確認
      const mainPyPath = path.join(whisperServerPath, 'main.py');
      if (!fs.existsSync(mainPyPath)) {
        const errorMessage = `main.py not found: ${mainPyPath}`;
        writeLog(errorMessage);
        throw new Error(errorMessage);
      }
      
      writeLog(`Found main.py at: ${mainPyPath}`);
      
      // Windows環境でのuvコマンド実行を修正
      const isWindows = process.platform === 'win32';
      let uvCommand: string;
      
      if (isWindows) {
        // Windows環境でのUVコマンド解決
        try {
          const userHome = process.env.USERPROFILE || '';
          const fullPath = path.join(userHome, '.local', 'bin', 'uv.exe');
          
          if (fs.existsSync(fullPath)) {
            uvCommand = fullPath;
            writeLog(`Found UV at: ${fullPath}`);
          } else {
            // フォールバック: PATHからuv.exeを探す
            uvCommand = 'uv.exe';
            writeLog(`Using UV from PATH: uv.exe`);
          }
        } catch (error) {
          writeLog(`UV path resolution error: ${error}`);
          uvCommand = 'uv.exe';
        }
      } else {
        uvCommand = 'uv';
      }
      
      writeLog(`Using UV command: ${uvCommand}`);
      
      // UVコマンドの存在確認
      if (!fs.existsSync(uvCommand) && !uvCommand.includes('.exe')) {
        // フルパスでない場合のエラーハンドリング
        writeLog(`UV command not found at: ${uvCommand}`);
        throw new Error(`UV command not found: ${uvCommand}`);
      }
      
      // shellを使わずに直接UVを実行
      const spawnOptions: any = {
        cwd: whisperServerPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          // UVのパスを明示的に追加
          PATH: process.env.PATH + (isWindows ? `;${path.dirname(uvCommand)}` : `:${path.dirname(uvCommand)}`)
        }
      };
      
      // Windows固有の設定（shellを使わない）
      if (isWindows) {
        spawnOptions.windowsHide = true;
      }
      
      writeLog(`Spawn options: ${JSON.stringify(spawnOptions, null, 2)}`);
      
      // Windowsバッチファイル経由でUV実行（spawn問題回避）
      if (isWindows) {
        // 一時バッチファイルを作成
        const batchContent = `@echo off\ncd /d "${whisperServerPath}"\n"${uvCommand}" run python main.py\npause`;
        const batchPath = path.join(whisperServerPath, 'start_whisper.bat');
        
        try {
          fs.writeFileSync(batchPath, batchContent);
          writeLog(`Created batch file: ${batchPath}`);
          writeLog(`Batch content: ${batchContent}`);
          
          // バッチファイルを実行
          this.pythonProcess = spawn('cmd.exe', ['/c', batchPath], {
            cwd: whisperServerPath,
            stdio: ['ignore', 'pipe', 'pipe'],
            env: spawnOptions.env,
            windowsHide: false // デバッグのためfalse
          });
        } catch (error) {
          writeLog(`Batch file creation error: ${error}`);
          throw error;
        }
      } else {
        // Linux/Mac用
        this.pythonProcess = spawn(uvCommand, ['run', 'python', 'main.py'], spawnOptions);
      }

      // 標準出力の監視
      if (this.pythonProcess.stdout) {
        this.pythonProcess.stdout.on('data', (data) => {
          const output = data.toString().trim();
          if (output) {
            writeLog(`[Python Server] ${output}`);
          }
        });
      }

      // エラー出力の監視
      if (this.pythonProcess.stderr) {
        this.pythonProcess.stderr.on('data', (data) => {
          const errorOutput = data.toString().trim();
          if (errorOutput) {
            writeLog(`[Python Server Error] ${errorOutput}`);
          }
        });
      }

      // プロセス終了時の処理
      this.pythonProcess.on('exit', (code, signal) => {
        writeLog(`Python server exited with code ${code}, signal ${signal}`);
        this.isRunning = false;
        this.pythonProcess = null;
        
        // 予期しない終了の場合は再起動を試行
        if (code !== 0 && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          writeLog(`Pythonサーバー再起動試行 ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
          setTimeout(() => this.startServer(), 5000);
        }
      });

      // エラーハンドリング
      this.pythonProcess.on('error', (error) => {
        writeLog(`Python server spawn error: ${error.message}`);
        writeLog(`UV command used: ${uvCommand}`);
        writeLog(`Working directory: ${whisperServerPath}`);
        writeLog(`Environment PATH: ${process.env.PATH}`);
        this.isRunning = false;
      });

      this.isRunning = true;
      this.reconnectAttempts = 0;
      
      // サーバー起動完了まで少し待機
      await new Promise(resolve => setTimeout(resolve, 8000));
      
      writeLog('Kotoba-Whisper Pythonサーバー起動完了');
      return true;

    } catch (error) {
      writeLog(`Pythonサーバー起動エラー: ${error}`);
      this.isRunning = false;
      return false;
    }
  }

  // Pythonサーバー停止
  stopServer(): void {
    if (this.pythonProcess) {
      writeLog('Kotoba-Whisper Pythonサーバー停止中...');
      
      // Windowsの場合はtaskkillを使用
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', this.pythonProcess.pid!.toString(), '/f', '/t'], {
          stdio: 'ignore'
        });
      } else {
        this.pythonProcess.kill('SIGTERM');
      }
      
      this.pythonProcess = null;
      this.isRunning = false;
      writeLog('Kotoba-Whisper Pythonサーバー停止完了');
    }
  }

  // サーバー状態確認
  getStatus(): { isRunning: boolean; pid?: number } {
    return {
      isRunning: this.isRunning,
      pid: this.pythonProcess?.pid
    };
  }

  // 外部サーバー状態チェック（WebSocket接続テスト）
  async checkExternalServer(): Promise<boolean> {
    try {
      writeLog('外部サーバーチェック開始: ws://127.0.0.1:8770');
      const WebSocket = require('ws');
      const ws = new WebSocket('ws://127.0.0.1:8770');

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          writeLog('外部サーバーチェック: タイムアウト (3秒)');
          ws.close();
          resolve(false);
        }, 3000);

        ws.on('open', () => {
          writeLog('外部サーバーチェック: 接続成功');
          clearTimeout(timeout);
          ws.close();
          writeLog('外部Pythonサーバーが動作中です');
          resolve(true);
        });

        ws.on('error', (error: any) => {
          writeLog(`外部サーバーチェック: 接続エラー - ${error.message || error}`);
          clearTimeout(timeout);
          resolve(false);
        });

        ws.on('close', () => {
          writeLog('外部サーバーチェック: 接続終了');
        });
      });
    } catch (error) {
      writeLog(`外部サーバーチェックエラー: ${error}`);
      return false;
    }
  }
}

// Kotoba-Whisper管理インスタンス
const whisperManager = new KotobaWhisperManager();

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
    // 開発環境ではDevToolsを開く
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));
    // 本番環境でもテスト用にDevToolsを開く
    mainWindow.webContents.openDevTools();
  }

  // メディア権限要求ハンドラー（音声録音・映像キャプチャ・デスクトップキャプチャ）
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    writeLog(`権限要求: ${permission}`);
    // 全てのメディア関連権限を許可
    callback(true);
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

  // Pythonサーバーの自動起動は無効化（手動管理）
  writeLog('Pythonサーバーは手動管理モードです。UIから起動してください。');

  app.on('activate', () => {
    // macOS対応: ドックアイコンがクリックされた際の処理
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// デスクトップキャプチャ・音声録音・映像キャプチャの権限設定
app.commandLine.appendSwitch('enable-usermedia-screen-capturing');
app.commandLine.appendSwitch('allow-http-screen-capture');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('allow-loopback-in-peer-connection');
app.commandLine.appendSwitch('enable-media-stream');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');

// システムの権限設定
if (process.platform === 'darwin') {
  app.commandLine.appendSwitch('enable-features', 'ScreenCaptureKitMac');
} else if (process.platform === 'win32') {
  // Windows用のデスクトップキャプチャ設定
  app.commandLine.appendSwitch('disable-web-security');
  app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors');
  app.commandLine.appendSwitch('allow-running-insecure-content');
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('enable-features', 'VizDisplayCompositor,UseSkiaRenderer');
}

// すべてのウィンドウが閉じられたときの処理
app.on('window-all-closed', () => {
  // Pythonサーバーを停止
  whisperManager.stopServer();
  
  // macOS以外では完全にアプリを終了
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// アプリケーション終了前の処理
app.on('before-quit', () => {
  writeLog('アプリケーション終了処理開始');
  whisperManager.stopServer();
});

// IPC通信ハンドラー
// フォルダ選択ダイアログ
ipcMain.handle('dialog:selectFolder', async (): Promise<string | null> => {
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

// ファイル保存
ipcMain.handle('file:save', async (event, buffer: Buffer, filename: string, subfolder?: string): Promise<string> => {
  try {
    // デフォルトの保存フォルダ（デスクトップのVoiceRecordingsフォルダ）
    const baseFolder = path.join(app.getPath('desktop'), 'VoiceRecordings');
    
    // サブフォルダが指定されている場合は追加
    const targetFolder = subfolder ? path.join(baseFolder, subfolder) : baseFolder;
    
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
    
    // ファイル保存完了をレンダラープロセスに通知
    if (mainWindow) {
      mainWindow.webContents.send('file:saved', {
        filePath,
        filename,
        folder: targetFolder
      });
    }
    
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

// ディスク容量取得
ipcMain.handle('file:getDiskSpace', async (event, dirPath: string): Promise<{ free: number; total: number }> => {
  try {
    // Windows環境でのディスク容量取得
    if (process.platform === 'win32') {
      return new Promise((resolve, reject) => {
        exec(`dir /-c "${dirPath}"`, (error, stdout) => {
          if (error) {
            reject(error);
            return;
          }
          
          // dir コマンドの出力から空き容量を抽出
          const lines = stdout.split('\n');
          const lastLine = lines[lines.length - 2] || '';
          const match = lastLine.match(/(\d+)\s+bytes\s+free/i);
          
          if (match) {
            const free = parseInt(match[1]);
            resolve({ free, total: free * 2 }); // 概算total
          } else {
            resolve({ free: 1024 * 1024 * 1024, total: 10 * 1024 * 1024 * 1024 }); // デフォルト値
          }
        });
      });
    } else {
      // Unix系での容量取得
      return new Promise((resolve, reject) => {
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
      });
    }
  } catch (error) {
    writeLog(`ディスク容量取得エラー: ${error}`);
    return { free: 1024 * 1024 * 1024, total: 10 * 1024 * 1024 * 1024 };
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

// ファイルサイズ取得
ipcMain.handle('file:getSize', async (event, filePath: string): Promise<number> => {
  try {
    const stats = fs.statSync(filePath);
    return stats.size;
  } catch (error) {
    console.error('ファイルサイズ取得エラー:', error);
    return 0;
  }
});

// ファイル読み込み
ipcMain.handle('file:read', async (event, filePath: string): Promise<Buffer> => {
  try {
    return fs.readFileSync(filePath);
  } catch (error) {
    writeLog(`ファイル読み込みエラー: ${filePath} - ${error}`);
    throw error;
  }
});

// メタデータファイル保存
ipcMain.handle('file:saveMetadata', async (event, filename: string, metadata: any): Promise<void> => {
  try {
    // デフォルトの保存フォルダ（デスクトップのVoiceRecordingsフォルダ）
    const saveFolder = path.join(app.getPath('desktop'), 'VoiceRecordings');
    const metadataPath = path.join(saveFolder, filename + '.meta.json');
    const metadataContent = JSON.stringify(metadata, null, 2);
    
    fs.writeFileSync(metadataPath, metadataContent);
    writeLog(`Metadata saved: ${metadataPath}`);
  } catch (error) {
    writeLog(`Metadata save error: ${error}`);
    console.error('Metadata save error:', error);
    throw error;
  }
});

// ファイル一覧取得
ipcMain.handle('file:getList', async (event, folderPath: string): Promise<any[]> => {
  try {
    if (!fs.existsSync(folderPath)) {
      return [];
    }

    const files = fs.readdirSync(folderPath);
    const audioFiles = files
      .filter(file => file.endsWith('.webm') || file.endsWith('.wav') || file.endsWith('.mp3') || file.endsWith('.rt.txt'))
      .map(file => {
        const filePath = path.join(folderPath, file);
        const stats = fs.statSync(filePath);
        const fileExtension = path.extname(file).slice(1);
        
        // .rt.txt ファイルの場合の特別な処理
        if (file.endsWith('.rt.txt')) {
          return {
            id: file,
            filename: file,
            filepath: filePath,
            format: 'rt.txt' as any,
            size: stats.size,
            createdAt: stats.birthtime,
            duration: 0, // リアルタイム文字起こしファイルは再生時間なし
            isRealtimeTranscription: true, // リアルタイム文字起こしファイルであることを示すフラグ
          };
        }
        
        // 音声ファイルの場合の処理
        const format = fileExtension as 'webm' | 'wav' | 'mp3';
        
        // メタデータファイルから正確なduration情報を取得
        let actualDuration = 0;
        const metadataPath = path.join(folderPath, file + '.meta.json');
        
        if (fs.existsSync(metadataPath)) {
          try {
            const metadataContent = fs.readFileSync(metadataPath, 'utf8');
            const metadata = JSON.parse(metadataContent);
            actualDuration = metadata.duration || 0;
            writeLog(`Loaded duration from metadata: ${actualDuration}s for ${file}`);
          } catch (error) {
            writeLog(`Failed to read metadata for ${file}: ${error}`);
            actualDuration = 0;
          }
        } else {
          // メタデータファイルがない場合は0（再生時にHTMLAudioElementで取得）
          actualDuration = 0;
          writeLog(`No metadata file found for ${file}`);
        }
        
        return {
          id: file,
          filename: file,
          filepath: filePath,
          format: format,
          size: stats.size,
          createdAt: stats.birthtime,
          duration: actualDuration, // 正確なduration（秒）
          isRealtimeTranscription: false, // 音声ファイルはリアルタイム文字起こしファイルではない
        };
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()); // 新しい順

    return audioFiles;
  } catch (error) {
    console.error('ファイル一覧取得エラー:', error);
    return [];
  }
});

// ファイル削除
ipcMain.handle('file:delete', async (event, filePath: string): Promise<boolean> => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('ファイル削除エラー:', error);
    return false;
  }
});

// 設定の保存・読み込み（今後実装予定）
ipcMain.handle('settings:load', async (): Promise<any> => {
  // デフォルトの保存フォルダ（デスクトップのVoiceRecordingsフォルダ）
  const defaultFolder = path.join(app.getPath('desktop'), 'VoiceRecordings');
  
  // TODO: 設定ファイルから読み込み
  return {
    saveFolder: defaultFolder,
    audioQuality: 'medium',
    defaultVolume: 0.8,
    defaultInputDevice: '',
    mp3Bitrate: 192,
    autoTranscribe: false,
  };
});

ipcMain.handle('settings:save', async (event, settings: any): Promise<void> => {
  // TODO: 設定ファイルへ保存
  console.log('設定保存:', settings);
});

// 入力デバイス一覧取得（レンダラープロセスで実装）
ipcMain.handle('audio:getInputDevices', async (): Promise<any[]> => {
  // レンダラープロセスでnavigator.mediaDevicesを使用するため、
  // ここでは空配列を返す
  return [];
});

// デスクトップキャプチャソース取得
ipcMain.handle('desktop:getSources', async (): Promise<any[]> => {
  try {
    writeLog('デスクトップキャプチャソースを取得中...');
    
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 150, height: 100 }
    });
    
    const result = sources.map(source => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL()
    }));
    
    writeLog(`デスクトップキャプチャソース ${result.length}個を取得しました`);
    
    return result;
  } catch (error) {
    writeLog(`デスクトップキャプチャソース取得エラー: ${error}`);
    console.error('デスクトップキャプチャソース取得エラー:', error);
    return [];
  }
});

// 音声ファイル読み込み（再生用）
ipcMain.handle('file:loadAudio', async (event, filePath: string): Promise<string | null> => {
  try {
    writeLog(`Audio File Loading Started: ${filePath}`);
    
    // ファイルの存在確認
    if (!fs.existsSync(filePath)) {
      writeLog(`File not found: ${filePath}`);
      throw new Error('File not found');
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
    writeLog(`Audio File Loading Error: ${error}`);
    console.error('Audio File Loading Error:', error);
    return null;
  }
});

// ウィンドウ操作
ipcMain.handle('window:minimize', async (): Promise<void> => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.handle('window:maximize', async (): Promise<void> => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('window:close', async (): Promise<void> => {
  if (mainWindow) {
    mainWindow.close();
  }
});

ipcMain.handle('window:isMaximized', async (): Promise<boolean> => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

// ログ表示
ipcMain.handle('debug:getLogs', async (): Promise<string> => {
  try {
    if (fs.existsSync(logFilePath)) {
      return fs.readFileSync(logFilePath, 'utf-8');
    }
    return 'ログファイルが見つかりません';
  } catch (error) {
    return `ログ読み込みエラー: ${error}`;
  }
});

ipcMain.handle('debug:clearLogs', async (): Promise<void> => {
  try {
    if (fs.existsSync(logFilePath)) {
      fs.unlinkSync(logFilePath);
    }
    writeLog('ログファイルをクリアしました');
  } catch (error) {
    writeLog(`ログクリアエラー: ${error}`);
  }
});

// === Kotoba-Whisper音声認識機能 ===

// Pythonサーバー状態確認
ipcMain.handle('speech:getServerStatus', async (): Promise<{ isRunning: boolean; pid?: number }> => {
  writeLog('サーバー状態確認要求');
  const internalStatus = whisperManager.getStatus();
  writeLog(`内部プロセス状態: isRunning=${internalStatus.isRunning}, pid=${internalStatus.pid}`);
  
  // 内部プロセスが動作していない場合、外部サーバーをチェック
  if (!internalStatus.isRunning) {
    writeLog('内部プロセスが動作していないため、外部サーバーをチェック');
    const externalRunning = await whisperManager.checkExternalServer();
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
ipcMain.handle('speech:startServer', async (): Promise<boolean> => {
  try {
    writeLog('手動サーバー起動要求');
    
    // まず外部サーバーをチェック
    const externalRunning = await whisperManager.checkExternalServer();
    if (externalRunning) {
      writeLog('外部サーバーが既に動作中のため、内部起動をスキップ');
      return true;
    }
    
    // 外部サーバーがない場合のみ内部起動を試行
    writeLog('外部サーバーが見つからないため、内部起動を試行');
    return await whisperManager.startServer();
  } catch (error) {
    writeLog(`Pythonサーバー手動起動エラー: ${error}`);
    return false;
  }
});

// Pythonサーバー停止
ipcMain.handle('speech:stopServer', async (): Promise<void> => {
  whisperManager.stopServer();
});

// 音声ファイル文字起こし
ipcMain.handle('speech:transcribe', async (event, filePath: string): Promise<any> => {
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
            
            // 進捗をレンダラープロセスに通知
            if (mainWindow) {
              mainWindow.webContents.send('speech:progress', response);
            }
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
          reject(new Error('音声認識サーバーとの通信に失敗しました'));
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
ipcMain.handle('speech:changeModel', async (event, modelName: string): Promise<boolean> => {
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

// 文字起こしファイル操作
ipcMain.handle('transcription:save', async (event, audioFilePath: string, transcription: any): Promise<string> => {
  try {
    writeLog(`文字起こしファイル保存: ${audioFilePath}`);
    
    const transFilePath = getTranscriptionPath(audioFilePath);
    const content = generateTranscriptionFileContent(transcription);
    
    fs.writeFileSync(transFilePath, content, 'utf8');
    writeLog(`文字起こしファイル保存完了: ${transFilePath}`);
    
    return transFilePath;
  } catch (error) {
    writeLog(`文字起こしファイル保存エラー: ${error}`);
    throw error;
  }
});

ipcMain.handle('transcription:load', async (event, transFilePath: string): Promise<any> => {
  try {
    writeLog(`文字起こしファイル読み込み: ${transFilePath}`);
    
    if (!fs.existsSync(transFilePath)) {
      throw new Error('文字起こしファイルが見つかりません');
    }
    
    const content = fs.readFileSync(transFilePath, 'utf8');
    const transcription = parseTranscriptionFileContent(content);
    
    writeLog(`文字起こしファイル読み込み完了: ${transFilePath}`);
    return transcription;
  } catch (error) {
    writeLog(`文字起こしファイル読み込みエラー: ${error}`);
    throw error;
  }
});

ipcMain.handle('transcription:exists', async (event, audioFilePath: string): Promise<boolean> => {
  try {
    const transFilePath = getTranscriptionPath(audioFilePath);
    return fs.existsSync(transFilePath);
  } catch (error) {
    writeLog(`文字起こしファイル存在確認エラー: ${error}`);
    return false;
  }
});

ipcMain.handle('transcription:getPath', async (event, audioFilePath: string): Promise<string> => {
  return getTranscriptionPath(audioFilePath);
});

ipcMain.handle('transcription:delete', async (event, transFilePath: string): Promise<boolean> => {
  try {
    if (fs.existsSync(transFilePath)) {
      fs.unlinkSync(transFilePath);
      writeLog(`文字起こしファイル削除: ${transFilePath}`);
      return true;
    }
    return false;
  } catch (error) {
    writeLog(`文字起こしファイル削除エラー: ${error}`);
    return false;
  }
});

// AI対話記録操作
ipcMain.handle('aichat:saveClipboard', async (event, audioFilePath: string, copyRecord: any): Promise<void> => {
  try {
    writeLog(`クリップボード履歴保存: ${audioFilePath}`);
    
    const chatFilePath = getAIChatPath(audioFilePath);
    let chatFile: any;
    
    // 既存ファイルがあれば読み込み、なければ新規作成
    if (fs.existsSync(chatFilePath)) {
      const content = fs.readFileSync(chatFilePath, 'utf8');
      chatFile = parseAIChatFileContent(content);
    } else {
      chatFile = {
        sourceFile: path.basename(getTranscriptionPath(audioFilePath)),
        createdAt: new Date().toISOString(),
        clipboardHistory: []
      };
    }
    
    // 新しいコピー記録を追加
    chatFile.clipboardHistory.push(copyRecord);
    
    // ファイルに保存
    const content = generateAIChatFileContent(chatFile);
    fs.writeFileSync(chatFilePath, content, 'utf8');
    
    writeLog(`クリップボード履歴保存完了: ${chatFilePath}`);
  } catch (error) {
    writeLog(`クリップボード履歴保存エラー: ${error}`);
    throw error;
  }
});

ipcMain.handle('aichat:load', async (event, chatFilePath: string): Promise<any> => {
  try {
    if (!fs.existsSync(chatFilePath)) {
      throw new Error('AI対話ファイルが見つかりません');
    }
    
    const content = fs.readFileSync(chatFilePath, 'utf8');
    return parseAIChatFileContent(content);
  } catch (error) {
    writeLog(`AI対話ファイル読み込みエラー: ${error}`);
    throw error;
  }
});

ipcMain.handle('aichat:getPath', async (event, audioFilePath: string): Promise<string> => {
  return getAIChatPath(audioFilePath);
});

// ヘルパー関数
function getTranscriptionPath(audioFilePath: string): string {
  const parsedPath = path.parse(audioFilePath);
  return path.join(parsedPath.dir, `${parsedPath.name}.trans.txt`);
}

function getAIChatPath(audioFilePath: string): string {
  const parsedPath = path.parse(audioFilePath);
  return path.join(parsedPath.dir, `${parsedPath.name}.ai-chat.txt`);
}

function generateTranscriptionFileContent(transcription: any): string {
  // メタデータセクション（YAML形式）
  const metadata = `---
audio_file: ${transcription.metadata.audioFile}
model: ${transcription.metadata.model}
transcribed_at: ${transcription.metadata.transcribedAt}
duration: ${transcription.metadata.duration}
segment_count: ${transcription.metadata.segmentCount}
language: ${transcription.metadata.language}
speakers: [${transcription.metadata.speakers.map((s: string) => `"${s}"`).join(', ')}]
coverage: ${transcription.metadata.coverage}
---

`;
  
  // 文字起こし内容セクション
  const segments = transcription.segments.map((segment: any) => {
    const timestamp = formatTimestamp(segment.start);
    const speaker = segment.speaker ? `${segment.speaker}: ` : '';
    return `[${timestamp}] ${speaker}${segment.text}`;
  }).join('\n');
  
  return metadata + segments;
}

function parseTranscriptionFileContent(content: string): any {
  const parts = content.split('---\n');
  if (parts.length < 3) {
    throw new Error('無効な文字起こしファイル形式');
  }
  
  // YAMLメタデータの解析（簡易版）
  const yamlContent = parts[1];
  const metadata: any = {};
  
  yamlContent.split('\n').forEach(line => {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match) {
      const [, key, value] = match;
      if (key === 'speakers') {
        metadata[key] = value.match(/"([^"]*)"/g)?.map(s => s.slice(1, -1)) || [];
      } else if (['duration', 'segment_count', 'coverage'].includes(key)) {
        metadata[key] = parseFloat(value);
      } else {
        metadata[key] = value;
      }
    }
  });
  
  // セグメントの解析
  const segmentContent = parts[2];
  const segments = segmentContent.split('\n')
    .filter(line => line.trim())
    .map(line => {
      const match = line.match(/^\[(\d{2}:\d{2}:\d{2}\.\d)\]\s*(?:([^:]+):\s*)?(.+)$/);
      if (match) {
        const [, timestamp, speaker, text] = match;
        return {
          start: parseTimestamp(timestamp),
          end: parseTimestamp(timestamp) + 5, // 仮の終了時刻
          text: text.trim(),
          speaker: speaker || undefined
        };
      }
      return null;
    })
    .filter(Boolean);
  
  return {
    metadata: {
      audioFile: metadata.audio_file,
      model: metadata.model,
      transcribedAt: metadata.transcribed_at,
      duration: metadata.duration,
      segmentCount: metadata.segment_count,
      language: metadata.language,
      speakers: metadata.speakers,
      coverage: metadata.coverage
    },
    segments,
    filePath: '',
    isModified: false
  };
}

function generateAIChatFileContent(chatFile: any): string {
  const metadata = `---
source_file: ${chatFile.sourceFile}
created_at: ${chatFile.createdAt}
total_interactions: ${chatFile.clipboardHistory.length}
---

# クリップボードコピー履歴
`;
  
  const history = chatFile.clipboardHistory.map((record: any) => {
    const time = new Date(record.timestamp).toLocaleTimeString('ja-JP', { hour12: false });
    return `[${time}] コピー: "${record.selectedText}"`;
  }).join('\n');
  
  return metadata + history;
}

function parseAIChatFileContent(content: string): any {
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
  const metadata: any = {};
  
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
    clipboardHistory
  };
}

function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toFixed(1).padStart(4, '0')}`;
}

function parseTimestamp(timestamp: string): number {
  const [hours, minutes, seconds] = timestamp.split(':');
  return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds);
}

// === チャンク分割文字起こし機能 ===

// チャンク分割文字起こし開始
ipcMain.handle('chunk:startTranscription', async (event, audioFilePath: string, settings: any): Promise<string> => {
  try {
    writeLog(`チャンク分割文字起こし開始: ${audioFilePath}`);
    
    // ファイル存在確認
    if (!fs.existsSync(audioFilePath)) {
      throw new Error('音声ファイルが見つかりません');
    }

    // 一意のセッションIDを生成
    const sessionId = `chunk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // チャンク分割文字起こしの詳細はレンダラープロセスのマネージャーで処理
    // ここでは基本的な準備作業のみ実行
    
    writeLog(`チャンク分割文字起こしセッション開始: ${sessionId}`);
    return sessionId;
  } catch (error) {
    writeLog(`チャンク分割文字起こし開始エラー: ${error}`);
    throw error;
  }
});

// チャンク分割文字起こし停止
ipcMain.handle('chunk:stopTranscription', async (event, sessionId: string): Promise<void> => {
  try {
    writeLog(`チャンク分割文字起こし停止: ${sessionId}`);
    
    // 実際の停止処理はレンダラープロセスのマネージャーで処理
    // ここでは基本的なクリーンアップのみ実行
    
    writeLog(`チャンク分割文字起こしセッション停止: ${sessionId}`);
  } catch (error) {
    writeLog(`チャンク分割文字起こし停止エラー: ${error}`);
    throw error;
  }
});

// チャンク分割文字起こし進捗取得
ipcMain.handle('chunk:getProgress', async (event, sessionId: string): Promise<any> => {
  try {
    // 実際の進捗はレンダラープロセスのマネージャーで管理
    // ここでは基本的なプレースホルダーを返す
    return {
      isTranscribing: false,
      totalChunks: 0,
      processedChunks: 0,
      failedChunks: 0,
      currentProcessingChunk: 0,
      averageProcessingTime: 0,
      estimatedTimeRemaining: 0
    };
  } catch (error) {
    writeLog(`チャンク分割文字起こし進捗取得エラー: ${error}`);
    throw error;
  }
});

// チャンク分割文字起こし設定更新
ipcMain.handle('chunk:updateSettings', async (event, settings: any): Promise<void> => {
  try {
    writeLog(`チャンク分割文字起こし設定更新: ${JSON.stringify(settings)}`);
    
    // 設定の保存（実際はファイルに保存する）
    // 現在は簡易的にログのみ出力
    
  } catch (error) {
    writeLog(`チャンク分割文字起こし設定更新エラー: ${error}`);
    throw error;
  }
});

// チャンク分割文字起こし結果の統合保存
ipcMain.handle('chunk:saveConsolidatedResult', async (event, audioFilePath: string, consolidatedResult: any): Promise<string> => {
  try {
    writeLog(`チャンク分割文字起こし結果統合保存: ${audioFilePath}`);
    
    // 通常の文字起こしファイルと同じ形式で保存
    const transFilePath = getTranscriptionPath(audioFilePath);
    const content = generateTranscriptionFileContent(consolidatedResult);
    
    fs.writeFileSync(transFilePath, content, 'utf8');
    writeLog(`チャンク分割文字起こし結果保存完了: ${transFilePath}`);
    
    return transFilePath;
  } catch (error) {
    writeLog(`チャンク分割文字起こし結果保存エラー: ${error}`);
    throw error;
  }
});

// 録音中ファイルの部分的な読み込み
ipcMain.handle('audio:loadPartialFile', async (event, audioFilePath: string): Promise<string | null> => {
  try {
    writeLog(`録音中ファイルの部分的な読み込み: ${audioFilePath}`);
    
    // ファイルが存在するかチェック
    if (!fs.existsSync(audioFilePath)) {
      writeLog(`ファイルが存在しません: ${audioFilePath}`);
      return null;
    }
    
    // ファイルサイズをチェック
    const stats = fs.statSync(audioFilePath);
    if (stats.size === 0) {
      writeLog(`ファイルサイズが0です: ${audioFilePath}`);
      return null;
    }
    
    // 録音中のWebMファイルでも部分的に読み込み可能かテスト
    const fileBuffer = fs.readFileSync(audioFilePath);
    const dataUrl = `data:audio/webm;base64,${fileBuffer.toString('base64')}`;
    
    writeLog(`録音中ファイルの部分的な読み込み完了: ${audioFilePath} (${stats.size} bytes)`);
    return dataUrl;
    
  } catch (error) {
    writeLog(`録音中ファイルの部分的な読み込みエラー: ${error}`);
    return null;
  }
});

// ファイルサイズの取得（重複削除済み - 上部の file:getSize ハンドラーを使用）