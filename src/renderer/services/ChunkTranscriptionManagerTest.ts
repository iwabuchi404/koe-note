/**
 * ChunkTranscriptionManagerTest - テスト用ファイル
 * 
 * チャンク分割文字起こし機能の基本的な動作テストと確認
 */

import { ChunkTranscriptionManager } from './ChunkTranscriptionManager';

/**
 * 基本的な動作テストを実行
 */
export async function testChunkTranscriptionManager(): Promise<void> {
  console.log('=== ChunkTranscriptionManager テスト開始 ===');
  
  try {
    // マネージャーのインスタンスを作成
    const manager = new ChunkTranscriptionManager();
    console.log('✓ ChunkTranscriptionManager インスタンス作成成功');
    
    // 進捗リスナーの設定
    manager.onProgress((progress) => {
      console.log('進捗更新:', progress);
    });
    
    // チャンク完了リスナーの設定
    manager.onChunkTranscribed((chunk) => {
      console.log('チャンク完了:', chunk.chunkId, chunk.status);
    });
    
    // 初期進捗状態の確認
    const initialProgress = manager.getProgress();
    console.log('初期進捗状態:', initialProgress);
    
    // 設定の更新テスト
    manager.updateSettings({
      chunkSize: 15,
      overlapSize: 1,
      maxConcurrency: 1,
      enableAutoScroll: true,
      qualityMode: 'accuracy'
    });
    console.log('✓ 設定更新テスト完了');
    
    // クリーンアップ
    manager.removeAllListeners();
    console.log('✓ リスナークリーンアップ完了');
    
    console.log('=== ChunkTranscriptionManager テスト完了 ===');
    
  } catch (error) {
    console.error('テストエラー:', error);
    throw error;
  }
}

/**
 * 設定のテスト
 */
export function testChunkSettings(): void {
  console.log('=== ChunkSettings テスト開始 ===');
  
  try {
    const manager = new ChunkTranscriptionManager();
    
    // デフォルト設定のテスト
    const defaultProgress = manager.getProgress();
    console.log('デフォルト設定:', defaultProgress);
    
    // 各種設定パターンのテスト
    const testConfigs = [
      {
        name: '高速設定',
        config: {
          chunkSize: 10,
          overlapSize: 0.5,
          maxConcurrency: 3,
          enableAutoScroll: true,
          qualityMode: 'speed' as const
        }
      },
      {
        name: 'バランス設定',
        config: {
          chunkSize: 20,
          overlapSize: 2,
          maxConcurrency: 2,
          enableAutoScroll: true,
          qualityMode: 'balance' as const
        }
      },
      {
        name: '高精度設定',
        config: {
          chunkSize: 30,
          overlapSize: 3,
          maxConcurrency: 1,
          enableAutoScroll: false,
          qualityMode: 'accuracy' as const
        }
      }
    ];
    
    testConfigs.forEach(({ name, config }) => {
      manager.updateSettings(config);
      console.log(`✓ ${name} 設定テスト完了`);
    });
    
    console.log('=== ChunkSettings テスト完了 ===');
    
  } catch (error) {
    console.error('設定テストエラー:', error);
    throw error;
  }
}

/**
 * 実際の音声ファイルを使用した統合テスト
 * 注意: 実際の音声ファイルが必要
 */
export async function testWithRealAudioFile(audioFilePath: string): Promise<void> {
  console.log('=== 実音声ファイルテスト開始 ===');
  console.log('音声ファイル:', audioFilePath);
  
  try {
    const manager = new ChunkTranscriptionManager();
    
    // 進捗監視の設定
    manager.onProgress((progress) => {
      console.log(`進捗: ${progress.processedChunks}/${progress.totalChunks} チャンク完了`);
      console.log(`推定残り時間: ${progress.estimatedTimeRemaining.toFixed(1)}秒`);
    });
    
    // チャンク完了の監視
    manager.onChunkTranscribed((chunk) => {
      console.log(`チャンク ${chunk.sequenceNumber} 完了: ${chunk.segments.length} セグメント`);
    });
    
    // チャンク分割文字起こし実行
    console.log('チャンク分割文字起こし開始...');
    await manager.startChunkTranscription(audioFilePath);
    
    // 結果を統合
    const consolidatedResult = await manager.stopAndConsolidate();
    console.log('統合結果:', consolidatedResult);
    
    console.log('=== 実音声ファイルテスト完了 ===');
    
  } catch (error) {
    console.error('実音声ファイルテストエラー:', error);
    throw error;
  }
}

/**
 * 全テストの実行
 */
export async function runAllTests(): Promise<void> {
  console.log('=== 全テスト実行開始 ===');
  
  try {
    // 基本テスト
    await testChunkTranscriptionManager();
    
    // 設定テスト
    testChunkSettings();
    
    console.log('=== 全テスト実行完了 ===');
    console.log('✓ すべてのテストが成功しました');
    
  } catch (error) {
    console.error('テスト実行エラー:', error);
    throw error;
  }
}

// 開発環境でのテスト実行
if (typeof window !== 'undefined' && (window as any).runChunkTranscriptionTest) {
  runAllTests().catch(console.error);
}