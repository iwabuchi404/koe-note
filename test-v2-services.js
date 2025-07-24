/**
 * V2サービス手動テスト用スクリプト
 * 
 * アプリが起動した後、開発者コンソールで以下をコピーペーストして実行：
 * 
 * 1. 基本的な機能確認
 * 2. ファイルサービステスト
 * 3. エラーハンドリングテスト
 */

// 基本テスト用関数
async function testCoreServicesV2Manual() {
  console.log('🚀 KoeNote CoreServicesV2 手動動作確認テスト開始');
  console.log('==========================================');
  
  try {
    // V2サービスを直接読み込み
    const { createCoreServices, testCoreServices } = await import('./dist/renderer/renderer.js');
    
    if (typeof createCoreServices === 'function') {
      console.log('✅ createCoreServices関数が利用可能');
      
      const services = createCoreServices();
      console.log('✅ サービス初期化成功:', services);
      
      // testCoreServices関数を実行
      if (typeof testCoreServices === 'function') {
        await testCoreServices();
        console.log('✅ 基本テスト完了');
      } else {
        console.warn('⚠️ testCoreServices関数が見つかりません');
      }
    } else {
      console.error('❌ createCoreServices関数が見つかりません');
    }
  } catch (error) {
    console.error('❌ テスト実行エラー:', error);
    
    // フォールバック：直接テスト
    console.log('🔄 フォールバックテストを実行...');
    await fallbackTest();
  }
}

// フォールバックテスト
async function fallbackTest() {
  try {
    console.log('📁 基本的なElectron APIテスト');
    
    if (window.electronAPI) {
      console.log('✅ Electron API利用可能');
      
      // 設定読み込みテスト
      const settings = await window.electronAPI.loadSettings();
      console.log('✅ 設定読み込み成功:', settings);
      
      // ファイル一覧取得テスト
      if (settings.saveFolder) {
        const fileList = await window.electronAPI.getFileList(settings.saveFolder);
        console.log('✅ ファイル一覧取得成功:', fileList.length + '件');
        
        // 音声ファイルのフィルタリング
        const audioFiles = fileList.filter(file => {
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
      
      console.log('✅ フォールバックテスト完了');
    } else {
      console.error('❌ Electron API が利用できません');
    }
  } catch (error) {
    console.error('❌ フォールバックテスト失敗:', error);
  }
}

// エラーハンドリングテスト
async function testErrorHandlingManual() {
  console.log('⚠️ エラーハンドリング手動テスト');
  console.log('---------------------------');
  
  try {
    // 存在しないファイルへのアクセステスト
    console.log('1. 存在しないファイルアクセステスト');
    
    try {
      const invalidResult = await window.electronAPI.getFileList('C:\\invalid\\nonexistent\\path');
      console.warn('⚠️ エラーが発生しませんでした（予期しない動作）');
      console.log('結果:', invalidResult);
    } catch (error) {
      console.log('✅ 予期通りエラーが発生');
      console.log('📊 エラー情報:', {
        メッセージ: error.message,
        タイプ: typeof error,
        詳細: error
      });
    }
    
    console.log('✅ エラーハンドリング テスト完了');
    
  } catch (error) {
    console.error('❌ エラーハンドリング テスト失敗:', error);
  }
}

// 使用方法の表示
console.log(`
🧪 KoeNote CoreServicesV2 手動テストスクリプト

使用方法:
開発者コンソールで以下の関数を実行してください：

基本テスト:
  testCoreServicesV2Manual()

エラーハンドリングテスト:
  testErrorHandlingManual()

注意:
- アプリケーションが完全に起動してから実行してください
- Electron APIが利用可能な状態で実行してください
`);

// グローバルに関数を登録
window.testCoreServicesV2Manual = testCoreServicesV2Manual;
window.testErrorHandlingManual = testErrorHandlingManual;
window.fallbackTest = fallbackTest;