/**
 * KoeNote メインプロセスのエントリポイント
 *
 * ここには「起動・ウィンドウ・ライフサイクル」のみを置く。
 * IPC ハンドラは ipc/* に、ビジネスロジックは services/* にある。
 */
import { app, BrowserWindow, desktopCapturer } from 'electron';
import path from 'path';
import {
  WhisperServerService,
  isPortInUse,
  resolveDevPython
} from './services/whisperServer';
import { resolveModelsRoot } from './services/modelStore';
import { writeLog } from './services/appLog';
import { setIpcContext } from './ipc/handle';
import { registerAllIpc } from './ipc/register';
import type { MainContext } from './ipc/context';
import type { SpeechServerStatusEvent } from '@shared/ipcContract';

writeLog('アプリケーション開始');

// IPC ハンドラがログを書き込めるようにする
setIpcContext({ log: writeLog });

// アプリケーション設定
const isDev = process.env.NODE_ENV === 'development';

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

// Kotoba-Whisper サーバー管理（Electron 非依存の実装は services/whisperServer.ts）
// ここでは合成ルートとして Electron 固有の依存を差し込む
const whisperServer = new WhisperServerService({
  log: writeLog,
  onStatus: (status, pid) => {
    writeLog(`Server status notification: ${status}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      const payload: SpeechServerStatusEvent = { status, pid };
      mainWindow.webContents.send('speech:serverStatus', payload);
    }
  },
  resolveModelsRoot,
  isPortInUse,
  resolvePython: () => resolveDevPython(__dirname, writeLog),
  paths: {
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    bundleDir: __dirname
  }
});

// IPC ハンドラを一括登録
const ipcContext: MainContext = {
  getMainWindow: () => mainWindow,
  whisperServer
};
registerAllIpc(ipcContext);

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
  // Electron 35 以降: console-message の引数はイベントオブジェクト形式
  mainWindow.webContents.on('console-message', (details) => {
    const logMessage = `[Renderer Console ${details.level}] ${details.message} (${details.sourceId}:${details.lineNumber})`;
    writeLog(logMessage);
  });

  // レンダラープロセスでクラッシュした場合
  // ('crashed' は Electron 33 で非推奨・後に削除。render-process-gone を使う)
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('Renderer process gone:', details);
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
