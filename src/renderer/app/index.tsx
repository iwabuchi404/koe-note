// global定義（webpack対応）
if (typeof (globalThis as any).global === 'undefined') {
  (globalThis as any).global = globalThis;
}

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '@renderer/app/App';
import { setupMockElectronAPI } from '@renderer/shared/utils/MockElectronAPI';
import { LoggerFactory, LogCategories } from '@renderer/shared/utils/LoggerFactory';

const logger = LoggerFactory.getLogger(LogCategories.APP);

// グローバルエラーハンドリング
window.addEventListener('error', (event) => {
  logger.error('Global Error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  logger.error('Unhandled Promise Rejection:', event.reason);
});

// Electronの環境チェックとモックAPIの設定
if (!window.electronAPI) {
  logger.warn('Electron API が利用できません。Electronアプリケーション内で実行してください。');
  setupMockElectronAPI();
} else {
  logger.info('Electron API が正常に読み込まれました');
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root要素が見つかりません');
}

const root = createRoot(container);
root.render(<App />);