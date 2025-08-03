/**
 * ToneRecorderTest - Tone.js + lamejs テストコンポーネント
 * 
 * 機能：
 * - Tone.js UserMedia + Recorder使用
 * - lamejsでMP3エンコード
 * - AudioWorkletNode対応（ScriptProcessorNode不使用）
 * - ファイル保存のみ（文字起こし・チャンク分割なし）
 */

import React, { useState, useRef, useEffect } from 'react';
import { AudioWorkletRecordingService, AudioSourceConfig, ChunkReadyEvent, RecordingStats } from '../../audio/services/AudioWorkletRecordingService';
import styles from './ToneRecorderTest.module.css';

export const ToneRecorderTest: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [chunks, setChunks] = useState<ChunkReadyEvent[]>([]);
  const [stats, setStats] = useState<RecordingStats | null>(null);
  const [audioSource, setAudioSource] = useState<AudioSourceConfig['type']>('microphone');
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<AudioWorkletRecordingService | null>(null);
  const allChunksRef = useRef<Blob[]>([]);

  // ログ追加関数
  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    setLogs(prev => [...prev, logMessage]);
  };

  // チャンク準備完了コールバック
  const handleChunkReady = (event: ChunkReadyEvent) => {
    addLog(`チャンク#${event.chunkNumber}生成 (${(event.size / 1024).toFixed(1)}KB)`);
    setChunks(prev => [...prev, event]);
    allChunksRef.current.push(event.chunk);
  };

  // エラーコールバック
  const handleError = (error: Error) => {
    addLog(`❌ エラー: ${error.message}`);
    setError(error.message);
  };

  // 統計更新コールバック
  const handleStatsUpdate = (stats: RecordingStats) => {
    setStats(stats);
  };


  // 録音開始
  const startRecording = async () => {
    try {
      setError(null);
      addLog(`🎵 AudioWorklet ${audioSource}録音テスト開始`);
      
      // AudioWorkletRecordingServiceインスタンス作成
      recorderRef.current = new AudioWorkletRecordingService(
        handleChunkReady,
        handleError,
        handleStatsUpdate
      );
      
      // 音声ソース設定
      const config: AudioSourceConfig = {
        type: audioSource,
        deviceId: undefined,
        desktopSourceId: undefined
      };
      
      addLog(`🎵 音声ソース設定: ${JSON.stringify(config)}`);
      
      // 録音開始
      await recorderRef.current.startWithConfig(config);
      
      setIsRecording(true);
      setChunks([]);
      setStats(null);
      allChunksRef.current = [];
      
      addLog('🎵 AudioWorklet録音開始成功（WAVチャンク生成）');
      
    } catch (error) {
      addLog(`🎵 録音開始エラー: ${error instanceof Error ? error.message : String(error)}`);
      setError(error instanceof Error ? error.message : String(error));
      console.error('ToneRecorderTest: 録音開始エラー', error);
    }
  };

  // 録音停止＋ファイル保存
  const stopRecording = async () => {
    try {
      if (!recorderRef.current) {
        addLog('🎵 レコーダーが初期化されていません');
        return;
      }

      addLog('🎵 録音停止処理開始');
      
      // 録音停止してファイルを取得
      const finalBlob = await recorderRef.current.stop();
      
      addLog(`🎵 録音停止完了: ${finalBlob.size} bytes, ${chunks.length} chunks`);
      
      // ファイル保存（Electron API使用）
      const fileName = generateFileName();
      const arrayBuffer = await finalBlob.arrayBuffer();
      
      addLog(`🎵 WAVファイル保存開始: ${fileName}`);
      if ((window as any).electronAPI?.saveFile) {
        await (window as any).electronAPI.saveFile(arrayBuffer, fileName);
        addLog(`🎵 WAVファイル保存完了: ${fileName}`);
      } else {
        // ブラウザ環境でのダウンロード
        const url = URL.createObjectURL(finalBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        addLog(`🎵 WAVファイルダウンロード完了: ${fileName}`);
      }
      
      setIsRecording(false);
      recorderRef.current = null;
      
    } catch (error) {
      addLog(`🎵 録音停止エラー: ${error instanceof Error ? error.message : String(error)}`);
      console.error('ToneRecorderTest: 録音停止エラー', error);
    }
  };

  // ファイル名生成
  const generateFileName = (): string => {
    const now = new Date();
    const timestamp = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
    return `audioworklet_wav_${timestamp}.wav`;
  };

  // ログクリア
  const clearLogs = () => {
    setLogs([]);
    setChunks([]);
    setStats(null);
    setError(null);
    allChunksRef.current = [];
  };

  // 時間フォーマット関数
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h3>🎵 AudioWorklet WAV録音テスト</h3>
        <p className={styles.description}>
          AudioWorkletNode使用、WAV形式、録音→保存のみ
        </p>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className={styles.error}>
          <span>❌ エラー: {error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className={styles.status}>
        <div className={styles.statusItem}>
          <span className={styles.label}>状態:</span>
          <span className={`${styles.value} ${isRecording ? styles.recording : styles.idle}`}>
            {isRecording ? '録音中' : 'アイドル'}
          </span>
        </div>
        <div className={styles.statusItem}>
          <span className={styles.label}>録音時間:</span>
          <span className={styles.value}>{stats ? formatDuration(stats.duration) : '00:00'}</span>
        </div>
        <div className={styles.statusItem}>
          <span className={styles.label}>チャンク数:</span>
          <span className={styles.value}>{chunks.length}</span>
        </div>
        <div className={styles.statusItem}>
          <span className={styles.label}>総サイズ:</span>
          <span className={styles.value}>{stats ? stats.totalDataSize.toLocaleString() : '0'} bytes</span>
        </div>
      </div>

      {/* 音声ソース選択 */}
      <div className={styles.sourceSelection}>
        <h4>音声ソース選択</h4>
        <div className={styles.sourceOptions}>
          <label className={styles.sourceOption}>
            <input
              type="radio"
              name="audioSource"
              value="microphone"
              checked={audioSource === 'microphone'}
              onChange={(e) => setAudioSource(e.target.value as AudioSourceConfig['type'])}
              disabled={isRecording}
            />
            <span>🎙️ マイクロフォン</span>
          </label>
          
          <label className={styles.sourceOption}>
            <input
              type="radio"
              name="audioSource"
              value="desktop"
              checked={audioSource === 'desktop'}
              onChange={(e) => setAudioSource(e.target.value as AudioSourceConfig['type'])}
              disabled={isRecording}
            />
            <span>🖥️ デスクトップ音声</span>
          </label>
          
          <label className={styles.sourceOption}>
            <input
              type="radio"
              name="audioSource"
              value="mix"
              checked={audioSource === 'mix'}
              onChange={(e) => setAudioSource(e.target.value as AudioSourceConfig['type'])}
              disabled={isRecording}
            />
            <span>🎧 ミックス（マイク+デスクトップ）</span>
          </label>
        </div>
        
        {/* デスクトップ音声の説明 */}
        {(audioSource === 'desktop' || audioSource === 'mix') && (
          <div className={styles.desktopSourceInfo}>
            <p className={styles.infoText}>
              📝 デスクトップ音声録音時は、録音開始後に表示されるダイアログで音声を含む画面/ウィンドウを選択してください
            </p>
          </div>
        )}
      </div>

      <div className={styles.controls}>
        <button 
          className={`${styles.button} ${styles.startButton}`}
          onClick={startRecording}
          disabled={isRecording}
        >
          🎙️ 録音開始
        </button>
        <button 
          className={`${styles.button} ${styles.stopButton}`}
          onClick={stopRecording}
          disabled={!isRecording}
        >
          ⏹️ 録音停止
        </button>
        <button 
          className={`${styles.button} ${styles.clearButton}`}
          onClick={clearLogs}
          disabled={isRecording}
        >
          🗑️ ログクリア
        </button>
      </div>

      <div className={styles.logContainer}>
        <h4>テストログ</h4>
        <div className={styles.logArea}>
          {logs.map((log, index) => (
            <div key={index} className={styles.logEntry}>
              {log}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};