// global定義（webpack対応）
if (typeof (globalThis as any).global === 'undefined') {
  (globalThis as any).global = globalThis;
}

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// グローバルエラーハンドリング
window.addEventListener('error', (event) => {
  console.error('Global Error:', event.error);
  console.error('Error details:', {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    stack: event.error?.stack
  });
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled Promise Rejection:', event.reason);
});

// Electronの環境チェック
if (!window.electronAPI) {
  console.error('Electron API が利用できません。Electronアプリケーション内で実行してください。');
} else {
  console.log('Electron API が正常に読み込まれました');
}

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root要素が見つかりません');
}

const root = createRoot(container);
root.render(<App />);