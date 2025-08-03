/**
 * AudioWorkletTest - AudioWorkletRecordingServiceのテスト用コンポーネント
 * 
 * AudioWorklet + lamejsによるリアルタイムMP3エンコード録音のテスト
 */

import React, { useState, useRef, useCallback } from 'react';
import { AudioWorkletRecordingService, AudioSourceConfig, ChunkReadyEvent, RecordingStats, TranscriptionConfig } from '../../audio/services/AudioWorkletRecordingService';
import { TranscriptionResult, TranscriptionProgress } from '../../audio/services/TranscriptionWebSocketService';
import styles from './AudioWorkletTest.module.css';

export const AudioWorkletTest: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [chunks, setChunks] = useState<ChunkReadyEvent[]>([]);
  const [stats, setStats] = useState<RecordingStats | null>(null);
  const [audioSource, setAudioSource] = useState<'microphone' | 'desktop' | 'mix'>('microphone');
  const [error, setError] = useState<string | null>(null);
  
  // 文字起こし関連の状態
  const [transcriptionEnabled, setTranscriptionEnabled] = useState(false);
  const [transcriptionResults, setTranscriptionResults] = useState<TranscriptionResult[]>([]);
  const [transcriptionProgress, setTranscriptionProgress] = useState<TranscriptionProgress[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<boolean>(false);
  
  const recorderRef = useRef<AudioWorkletRecordingService | null>(null);
  const allChunksRef = useRef<Blob[]>([]);

  // ログ追加
  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-20), `[${timestamp}] ${message}`]);
    console.log(`🎵 AudioWorkletTest: ${message}`);
  }, []);

  // チャンク準備完了コールバック
  const handleChunkReady = useCallback((event: ChunkReadyEvent) => {
    addLog(`チャンク#${event.chunkNumber}生成 (${(event.size / 1024).toFixed(1)}KB)`);
    setChunks(prev => [...prev, event]);
    allChunksRef.current.push(event.chunk);
  }, [addLog]);

  // エラーコールバック
  const handleError = useCallback((error: Error) => {
    addLog(`❌ エラー: ${error.message}`);
    setError(error.message);
  }, [addLog]);

  // 統計更新コールバック
  const handleStatsUpdate = useCallback((stats: RecordingStats) => {
    setStats(stats);
  }, []);

  // 文字起こし結果コールバック
  const handleTranscriptionResult = useCallback((result: TranscriptionResult) => {
    addLog(`📝 文字起こし結果 #${result.chunkNumber}: "${result.text}"`);
    setTranscriptionResults(prev => [...prev, result]);
  }, [addLog]);

  // 文字起こし進捗コールバック
  const handleTranscriptionProgress = useCallback((progress: TranscriptionProgress) => {
    addLog(`⏳ 文字起こし進捗 #${progress.chunkNumber}: ${progress.status}`);
    setTranscriptionProgress(prev => {
      const newProgress = [...prev];
      const existingIndex = newProgress.findIndex(p => p.chunkNumber === progress.chunkNumber);
      if (existingIndex >= 0) {
        newProgress[existingIndex] = progress;
      } else {
        newProgress.push(progress);
      }
      return newProgress;
    });
  }, [addLog]);

  // 録音開始
  const startRecording = useCallback(async () => {
    try {
      setError(null);
      addLog(`🎬 録音開始: ${audioSource}`);
      
      // AudioWorkletRecordingServiceインスタンス作成
      recorderRef.current = new AudioWorkletRecordingService(
        handleChunkReady,
        handleError,
        handleStatsUpdate,
        handleTranscriptionResult,
        handleTranscriptionProgress
      );

      // 文字起こし設定
      if (transcriptionEnabled) {
        const transcriptionConfig: TranscriptionConfig = {
          enabled: true,
          serverUrl: 'ws://localhost:8770',
          language: 'ja'
        };
        recorderRef.current.setTranscriptionConfig(transcriptionConfig);
        addLog('🔗 文字起こし機能を有効化');
      }

      // 音声ソース設定
      const config: AudioSourceConfig = {
        type: audioSource,
        deviceId: undefined, // デフォルトデバイス
        desktopSourceId: undefined
      };

      // 録音開始
      await recorderRef.current.startWithConfig(config);
      
      setIsRecording(true);
      setChunks([]);
      setStats(null);
      setTranscriptionResults([]);
      setTranscriptionProgress([]);
      allChunksRef.current = [];
      
      addLog('✅ 録音開始成功');
      
    } catch (error) {
      addLog(`❌ 録音開始失敗: ${error}`);
      setError(error instanceof Error ? error.message : String(error));
    }
  }, [audioSource, transcriptionEnabled, addLog, handleChunkReady, handleError, handleStatsUpdate, handleTranscriptionResult, handleTranscriptionProgress]);

  // 録音停止
  const stopRecording = useCallback(async () => {
    if (!recorderRef.current) return;

    try {
      addLog('🛑 録音停止中...');
      
      const finalBlob = await recorderRef.current.stop();
      setIsRecording(false);
      
      addLog(`✅ 録音停止完了 (最終ファイル: ${(finalBlob.size / 1024).toFixed(1)}KB)`);
      
      recorderRef.current = null;
      
    } catch (error) {
      addLog(`❌ 録音停止失敗: ${error}`);
      setError(error instanceof Error ? error.message : String(error));
    }
  }, [addLog]);

  // チャンクダウンロード
  const downloadChunk = useCallback((chunk: ChunkReadyEvent) => {
    const url = URL.createObjectURL(chunk.chunk);
    const a = document.createElement('a');
    a.href = url;
    
    // ファイル形式を判定してextensionを決定
    const extension = chunk.chunk.type.includes('mp3') ? 'mp3' : 'wav';
    a.download = `audioworklet_chunk_${chunk.chunkNumber}.${extension}`;
    
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    addLog(`📥 チャンク#${chunk.chunkNumber}をダウンロード (${extension.toUpperCase()})`);
  }, [addLog]);

  // 全チャンク統合ダウンロード
  const downloadAllChunks = useCallback(() => {
    if (allChunksRef.current.length === 0) {
      addLog('❌ ダウンロード可能なチャンクがありません');
      return;
    }

    // 最初のチャンクの形式を確認
    const firstChunkType = allChunksRef.current[0]?.type || 'audio/wav';
    const extension = firstChunkType.includes('mp3') ? 'mp3' : 'wav';
    
    const finalBlob = new Blob(allChunksRef.current, { type: firstChunkType });
    const url = URL.createObjectURL(finalBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audioworklet_recording_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    addLog(`📥 統合ファイルをダウンロード (${allChunksRef.current.length}チャンク, ${extension.toUpperCase()})`);
  }, [addLog]);

  // ログクリア
  const clearLogs = useCallback(() => {
    setLogs([]);
    setChunks([]);
    setStats(null);
    setError(null);
    setTranscriptionResults([]);
    setTranscriptionProgress([]);
    allChunksRef.current = [];
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>🎵 AudioWorklet + lamejs 録音テスト</h2>
        <p>MediaRecorder非依存のリアルタイムMP3エンコード録音システム (文字起こし連携対応)</p>
      </div>

      {/* 設定パネル */}
      <div className={styles.settingsPanel}>
        <div className={styles.sourceSelector}>
          <label>音声ソース:</label>
          <select 
            value={audioSource} 
            onChange={(e) => setAudioSource(e.target.value as any)}
            disabled={isRecording}
          >
            <option value="microphone">🎤 マイクロフォン</option>
            <option value="desktop">🖥️ デスクトップ音声</option>
            <option value="mix">🎧 マイク + デスクトップ</option>
          </select>
        </div>

        <div className={styles.transcriptionSelector}>
          <label>
            <input
              type="checkbox"
              checked={transcriptionEnabled}
              onChange={(e) => setTranscriptionEnabled(e.target.checked)}
              disabled={isRecording}
            />
            🔗 リアルタイム文字起こし (localhost:8770)
          </label>
        </div>
      </div>

      {/* 録音コントロール */}
      <div className={styles.controls}>
        <button 
          onClick={startRecording} 
          disabled={isRecording}
          className={styles.startButton}
        >
          🎬 録音開始
        </button>
        <button 
          onClick={stopRecording} 
          disabled={!isRecording}
          className={styles.stopButton}
        >
          🛑 録音停止
        </button>
        <button 
          onClick={clearLogs}
          disabled={isRecording}
          className={styles.clearButton}
        >
          🧹 ログクリア
        </button>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className={styles.errorPanel}>
          <h3>❌ エラー</h3>
          <p>{error}</p>
        </div>
      )}

      {/* 録音統計 */}
      {stats && (
        <div className={styles.statsPanel}>
          <h3>📊 録音統計</h3>
          <div className={styles.statsGrid}>
            <div>録音時間: {stats.duration.toFixed(1)}秒</div>
            <div>生成チャンク数: {stats.chunksGenerated}</div>
            <div>総データサイズ: {(stats.totalDataSize / 1024).toFixed(1)}KB</div>
            <div>現在のビットレート: {(stats.currentBitrate / 1000).toFixed(1)}kbps</div>
            <div>処理済みサンプル: {stats.processedSamples.toLocaleString()}</div>
          </div>
        </div>
      )}

      {/* チャンク一覧 */}
      {chunks.length > 0 && (
        <div className={styles.chunksPanel}>
          <div className={styles.chunkHeader}>
            <h3>🎯 生成チャンク ({chunks.length}個)</h3>
            <button 
              onClick={downloadAllChunks}
              className={styles.downloadAllButton}
            >
              📥 全チャンク統合ダウンロード
            </button>
          </div>
          <div className={styles.chunkList}>
            {chunks.map((chunk) => (
              <div key={chunk.chunkNumber} className={styles.chunkItem}>
                <div className={styles.chunkInfo}>
                  <span>チャンク #{chunk.chunkNumber}</span>
                  <span>{(chunk.size / 1024).toFixed(1)}KB</span>
                  <span>{new Date(chunk.timestamp).toLocaleTimeString()}</span>
                </div>
                <button 
                  onClick={() => downloadChunk(chunk)}
                  className={styles.downloadButton}
                >
                  📥 ダウンロード
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 文字起こし結果表示 */}
      {transcriptionEnabled && transcriptionResults.length > 0 && (
        <div className={styles.transcriptionPanel}>
          <h3>📝 文字起こし結果</h3>
          <div className={styles.transcriptionContent}>
            {transcriptionResults.map((result) => (
              <div key={result.chunkNumber} className={styles.transcriptionItem}>
                <div className={styles.transcriptionHeader}>
                  <span>チャンク #{result.chunkNumber}</span>
                  <span>{new Date(result.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className={styles.transcriptionText}>
                  {result.text}
                </div>
                {result.segments && result.segments.length > 0 && (
                  <div className={styles.transcriptionSegments}>
                    {result.segments.map((segment, index) => (
                      <div key={index} className={styles.segment}>
                        <span className={styles.segmentTime}>
                          {segment.start.toFixed(1)}s - {segment.end.toFixed(1)}s
                        </span>
                        <span className={styles.segmentText}>{segment.text}</span>
                        {segment.confidence && (
                          <span className={styles.segmentConfidence}>
                            ({(segment.confidence * 100).toFixed(1)}%)
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 文字起こし進捗表示 */}
      {transcriptionEnabled && transcriptionProgress.length > 0 && (
        <div className={styles.progressPanel}>
          <h3>⏳ 文字起こし進捗</h3>
          <div className={styles.progressContent}>
            {transcriptionProgress.map((progress) => (
              <div key={progress.chunkNumber} className={styles.progressItem}>
                <span>チャンク #{progress.chunkNumber}</span>
                <span className={`${styles.progressStatus} ${styles[progress.status]}`}>
                  {progress.status}
                </span>
                {progress.message && (
                  <span className={styles.progressMessage}>{progress.message}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ログ表示 */}
      <div className={styles.logPanel}>
        <h3>📋 実行ログ</h3>
        <div className={styles.logContent}>
          {logs.map((log, index) => (
            <div key={index} className={styles.logItem}>
              {log}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};