/**
 * 文字起こし機能の設定ファイル
 * 
 * すべての文字起こし関連の設定を一元管理
 */

export const TRANSCRIPTION_CONFIG = {
  // チャンク分割設定
  CHUNK: {
    DEFAULT_SIZE: 20,           // デフォルトチャンクサイズ（秒）
    DEFAULT_OVERLAP: 3,         // デフォルトオーバーラップサイズ（秒）
    MIN_PROCESSING_TIME: 15,    // 最小処理時間（秒）
    MAX_CONCURRENCY: 2,         // 最大並列処理数
    ENABLE_AUTO_SCROLL: true,   // 自動スクロール有効
    QUALITY_MODE: 'accuracy' as const // 品質モード
  },

  // リアルタイム文字起こし設定
  REALTIME: {
    PROCESSING_INTERVAL: 5000,  // 処理間隔（ミリ秒）
    MIN_FILE_SIZE: 10000,      // 最小ファイルサイズ（バイト）
    BYTES_PER_SECOND: 16000,   // 1秒あたりのおおよそのバイト数
    MIN_PROCESSING_TIME: 20,   // 最小処理時間（秒）
    CLEANUP_DELAY: 1000,       // クリーンアップ遅延（ミリ秒）
    MAX_RETRY_COUNT: 2,        // 最大リトライ回数
    RETRY_DELAY: 3000,         // リトライ間隔（ミリ秒）
    ERROR_RECOVERY_DELAY: 15000 // エラー回復待機時間（ミリ秒）
  },

  // 音声認識設定
  SPEECH: {
    DEFAULT_LANGUAGE: 'ja',     // デフォルト言語
    CONFIDENCE_THRESHOLD: 0.7,  // 信頼度閾値 - 少し下げて情報を残す
    MAX_PROCESSING_TIME: 180000 // 最大処理時間（ミリ秒）- 180秒に延長
  },

  // 結果統合設定
  CONSOLIDATION: {
    OVERLAP_THRESHOLD: 1.0,     // 重複判定の閾値（秒）
    QUALITY_THRESHOLD: 0.6,     // 品質フィルタの閾値
    MAX_GAP_FILL: 3.0,         // 最大ギャップ埋め時間（秒）
    ENABLE_AGGRESSIVE_DEDUP: true // 積極的な重複除去
  },

  // UI設定
  UI: {
    NOTIFICATION_DURATION: 3000, // 通知表示時間（ミリ秒）
    MAX_DISPLAY_TEXT_LENGTH: 50, // 表示テキストの最大長
    CHUNK_DISPLAY_MAX_HEIGHT: 400 // チャンク表示の最大高さ
  },

  // ファイル処理設定
  FILE: {
    TEMP_FILE_PREFIX: 'realtime_',
    SUPPORTED_FORMATS: ['.webm', '.wav', '.mp3', '.mp4'],
    RECORDING_FILE_PREFIX: 'recording_'
  }
};

// 型定義
export type TranscriptionConfig = typeof TRANSCRIPTION_CONFIG;
export type ChunkConfig = typeof TRANSCRIPTION_CONFIG.CHUNK;
export type RealtimeConfig = typeof TRANSCRIPTION_CONFIG.REALTIME;
export type SpeechConfig = typeof TRANSCRIPTION_CONFIG.SPEECH;
export type ConsolidationConfig = typeof TRANSCRIPTION_CONFIG.CONSOLIDATION;
export type UIConfig = typeof TRANSCRIPTION_CONFIG.UI;
export type FileConfig = typeof TRANSCRIPTION_CONFIG.FILE;