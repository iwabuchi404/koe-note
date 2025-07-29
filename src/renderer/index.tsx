// global定義（webpack対応）
if (typeof (globalThis as any).global === 'undefined') {
  (globalThis as any).global = globalThis;
}

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { setupMockElectronAPI } from './utils/MockElectronAPI';

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

// Electronの環境チェックとモックAPIの設定
if (!window.electronAPI) {
  console.error('Electron API が利用できません。Electronアプリケーション内で実行してください。');
  console.log('ブラウザ環境用のモックAPIを設定中...');
  setupMockElectronAPI();
} else {
  console.log('Electron API が正常に読み込まれました');
}

// V2サービステスト関数をシンプルに登録
setTimeout(() => {
  console.log('🧪 V2サービステスト関数を登録中...');
  
  // 基本的なElectron APIテスト関数
  (window as any).testBasicAPI = async () => {
    console.log('🚀 基本API動作確認テスト開始');
    console.log('===============================');
    
    try {
      if (!window.electronAPI) {
        console.error('❌ Electron API が利用できません');
        return;
      }
      
      console.log('✅ Electron API 利用可能');
      
      // 設定読み込みテスト
      const settings = await window.electronAPI.loadSettings();
      console.log('✅ 設定読み込み成功:', settings);
      
      // ファイル一覧取得テスト
      if (settings.saveFolder) {
        const fileList = await window.electronAPI.getFileList(settings.saveFolder);
        console.log('✅ ファイル一覧取得成功:', fileList.length + '件');
        
        // 音声ファイルのフィルタリング
        const audioFiles = fileList.filter((file: any) => {
          const ext = file.filename.toLowerCase();
          return ext.endsWith('.webm') || ext.endsWith('.wav') || 
                 ext.endsWith('.mp3') || ext.endsWith('.m4a');
        });
        
        console.log('📊 音声ファイル数:', audioFiles.length);
        
        if (audioFiles.length > 0) {
          console.log('📄 最初の音声ファイル:', {
            名前: audioFiles[0].filename,
            サイズ: Math.round(audioFiles[0].size / 1024) + 'KB'
          });
        }
      }
      
      console.log('✅ 基本APIテスト完了');
    } catch (error) {
      console.error('❌ 基本APIテスト失敗:', error);
    }
  };
  
  // エラーハンドリングテスト
  (window as any).testErrorCase = async () => {
    console.log('⚠️ エラーケーステスト開始');
    console.log('=======================');
    
    try {
      // 存在しないパスでのファイル一覧取得
      console.log('1. 存在しないパステスト');
      try {
        const result = await window.electronAPI.getFileList('C:\\nonexistent\\path');
        console.warn('⚠️ エラーが発生しませんでした:', result);
      } catch (error) {
        console.log('✅ 予期通りエラーが発生');
        console.log('📊 エラー詳細:', error instanceof Error ? error.message : String(error));
      }
      
      console.log('✅ エラーケーステスト完了');
    } catch (error) {
      console.error('❌ エラーケーステスト失敗:', error);
    }
  };
  
  console.log(`
🧪 KoeNote 基本テストコマンドが利用可能:

基本テスト:
  testBasicAPI()     - Electron API基本動作確認
  testErrorCase()    - エラーハンドリング確認

使用方法:
  開発者コンソールでテスト関数を実行してください
  `);
}, 3000);

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root要素が見つかりません');
}

const root = createRoot(container);
root.render(<App />);