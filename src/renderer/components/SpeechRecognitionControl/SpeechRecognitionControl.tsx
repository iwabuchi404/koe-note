import React, { useState, useEffect } from 'react';
import { 
  SpeechProgress, 
  AudioFile,
  ChunkSettings,
  ChunkProgress
} from '../../../preload/preload';
import { useAppContext } from '../../App';
import { ChunkTranscriptionManager } from '../../services/ChunkTranscriptionManager';
import { TRANSCRIPTION_CONFIG } from '../../config/transcriptionConfig';
import ServerControlSection from '../Transcription/ServerControl/ServerControlSection';
import ChunkSettingsPanel from '../Transcription/ChunkSettings/ChunkSettingsPanel';
import TranscriptionProgressPanel from '../Transcription/TranscriptionProgress/TranscriptionProgressPanel';

interface SpeechRecognitionControlProps {
  selectedFile: AudioFile | null;
}

/**
 * 音声認識制御コンポーネント
 * サーバー起動/停止、モデル選択、認識実行を管理
 */
const SpeechRecognitionControl: React.FC<SpeechRecognitionControlProps> = ({ 
  selectedFile
}) => {
  const { currentModel, setCurrentModel, isTranscribing, setIsTranscribing } = useAppContext();
  const [serverStatus, setServerStatus] = useState<{ isRunning: boolean; pid?: number }>({ isRunning: false });
  const [transcriptionProgress, setTranscriptionProgress] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>(currentModel);
  const [isChangingModel, setIsChangingModel] = useState(false);
  const [showOverwriteModal, setShowOverwriteModal] = useState(false);
  
  // チャンク分割文字起こし状態
  const [chunkTranscriptionManager, setChunkTranscriptionManager] = useState<ChunkTranscriptionManager | null>(null);
  const [chunkProgress, setChunkProgress] = useState<ChunkProgress>({
    isTranscribing: false,
    totalChunks: 0,
    processedChunks: 0,
    failedChunks: 0,
    currentProcessingChunk: 0,
    averageProcessingTime: 0,
    estimatedTimeRemaining: 0
  });
  const [chunkSettings, setChunkSettings] = useState<ChunkSettings>({
    chunkSize: TRANSCRIPTION_CONFIG.CHUNK.DEFAULT_SIZE,
    overlapSize: TRANSCRIPTION_CONFIG.CHUNK.DEFAULT_OVERLAP,
    maxConcurrency: TRANSCRIPTION_CONFIG.CHUNK.MAX_CONCURRENCY,
    enableAutoScroll: TRANSCRIPTION_CONFIG.CHUNK.ENABLE_AUTO_SCROLL,
    qualityMode: TRANSCRIPTION_CONFIG.CHUNK.QUALITY_MODE
  });

  // selectedModelをcurrentModelと同期
  useEffect(() => {
    setSelectedModel(currentModel);
  }, [currentModel]);

  // サーバー状態を定期的にチェック
  useEffect(() => {
    const checkServerStatus = async () => {
      try {
        const status = await window.electronAPI.speechGetServerStatus();
        setServerStatus(status);
      } catch (error) {
        console.error('サーバー状態取得エラー:', error);
      }
    };

    checkServerStatus();
    const interval = setInterval(checkServerStatus, 5000);

    return () => clearInterval(interval);
  }, []);

  // 音声認識進捗リスナー
  useEffect(() => {
    const handleProgress = (progress: SpeechProgress) => {
      console.log('音声認識進捗:', progress);
      
      if (progress.type === 'transcription_progress') {
        setTranscriptionProgress(`処理中: ${progress.status}`);
      }
    };

    window.electronAPI.onSpeechProgress(handleProgress);

    return () => {
      window.electronAPI.removeAllListeners('speech:progress');
    };
  }, []);

  // サーバー起動
  const handleStartServer = async () => {
    console.log('🔴 handleStartServer called');
    try {
      setError('');
      console.log('🔴 Calling speechStartServer()');
      const success = await window.electronAPI.speechStartServer();
      
      if (success) {
        setTimeout(async () => {
          const status = await window.electronAPI.speechGetServerStatus();
          setServerStatus(status);
        }, 2000);
      } else {
        setError('サーバーの起動に失敗しました');
      }
    } catch (error) {
      setError('サーバー起動エラー: ' + String(error));
    }
  };

  // サーバー停止
  const handleStopServer = async () => {
    console.log('🔴 handleStopServer called');
    try {
      setError('');
      console.log('🔴 Calling speechStopServer()');
      await window.electronAPI.speechStopServer();
      
      setTimeout(async () => {
        const status = await window.electronAPI.speechGetServerStatus();
        setServerStatus(status);
      }, 1000);
    } catch (error) {
      setError('サーバー停止エラー: ' + String(error));
    }
  };

  // モデル変更
  const handleModelChange = async (newModel: string) => {
    if (newModel === currentModel) return;
    
    setIsChangingModel(true);
    setSelectedModel(newModel);
    
    try {
      const success = await window.electronAPI.speechChangeModel(newModel);
      if (success) {
        setCurrentModel(newModel); // AppContextのcurrentModelを更新
        console.log('モデル変更成功:', newModel);
      } else {
        setError('モデル変更に失敗しました');
        setSelectedModel(currentModel);
      }
    } catch (error) {
      setError('モデル変更エラー: ' + String(error));
      setSelectedModel(currentModel);
    } finally {
      setIsChangingModel(false);
    }
  };

  // 音声認識実行前の確認
  const handleTranscribe = async () => {
    console.log('🎤 handleTranscribe called', {
      selectedFile: selectedFile ? {
        filename: selectedFile.filename,
        size: selectedFile.size,
        isRecording: selectedFile.isRecording
      } : null,
      serverRunning: serverStatus.isRunning,
      isTranscribing,
      isChangingModel
    });
    
    if (!selectedFile) {
      console.log('❌ selectedFile is null');
      return;
    }
    
    // 既に文字起こしファイルが存在する場合は警告を表示
    if (selectedFile.hasTranscriptionFile) {
      console.log('⚠️ Transcription file already exists, showing overwrite modal');
      setShowOverwriteModal(true);
      return;
    }
    
    // 文字起こし実行
    console.log('✅ Starting transcription');
    await executeTranscription();
  };

  // 実際の文字起こし実行
  const executeTranscription = async () => {
    if (!selectedFile) return;
    
    setIsTranscribing(true);
    setTranscriptionProgress('');
    setError('');
    
    try {
      console.log('音声認識開始:', selectedFile.filename);
      const result = await window.electronAPI.speechTranscribe(selectedFile.filepath);
      
      if (result) {
        console.log('音声認識完了:', result);
        // 親コンポーネントにイベントを通知（録音中ファイルは除外）
        if (!selectedFile.filepath.includes('recording_')) {
          window.dispatchEvent(new CustomEvent('transcriptionComplete', { detail: result }));
        }
        
        // 再文字起こしの場合はリフレッシュイベントも発火
        // ただし、録音中ファイルの場合は除外（リアルタイム処理中）
        if (selectedFile.hasTranscriptionFile && !selectedFile.filepath.includes('recording_')) {
          window.dispatchEvent(new CustomEvent('transcriptionRefresh', { 
            detail: { 
              audioFilePath: selectedFile.filepath,
              transcriptionResult: result 
            } 
          }));
        }
      }
    } catch (error) {
      console.error('音声認識エラー:', error);
      setError('音声認識エラー: ' + String(error));
    } finally {
      setIsTranscribing(false);
      setTranscriptionProgress('');
    }
  };

  // 上書き確認後の処理
  const handleConfirmOverwrite = () => {
    setShowOverwriteModal(false);
    executeTranscription();
  };

  // 上書きキャンセル
  const handleCancelOverwrite = () => {
    setShowOverwriteModal(false);
  };

  // チャンク分割文字起こし開始
  const handleChunkTranscribe = async () => {
    console.log('⚡ handleChunkTranscribe called');
    console.log('⚡ Current state:', {
      selectedFile: selectedFile ? {
        filename: selectedFile.filename,
        filepath: selectedFile.filepath,
        isRecording: selectedFile.isRecording,
        size: selectedFile.size
      } : null,
      serverRunning: serverStatus.isRunning,
      isTranscribing,
      isChangingModel,
      chunkTranscribing: chunkProgress.isTranscribing
    });
    
    if (!selectedFile) {
      console.log('❌ selectedFileがnullのため処理を停止');
      return;
    }
    
    if (!serverStatus.isRunning) {
      console.log('❌ サーバーが動作していないため処理を停止');
      return;
    }
    
    try {
      setError('');
      
      // 録音中ファイルのチャンク分割文字起こしを再度有効化
      if (selectedFile.filepath.includes('recording_') && selectedFile.filepath.includes('.webm')) {
        console.log('🎆 録音中WebMファイルのチャンク分割文字起こしを安全モードで実行');
        // エラーを返さずに続行し、安全な処理を行う
      }
      
      // ファイル情報をログ出力してデバッグ
      console.log('チャンク分割文字起こし開始 - ファイル情報:', {
        filename: selectedFile.filename,
        filepath: selectedFile.filepath,
        size: selectedFile.size,
        isRecording: selectedFile.isRecording
      });
      
      // 録音中ファイルの場合の詳細ログ出力
      if (selectedFile.isRecording || selectedFile.size === 0) {
        console.log('録音中ファイルのチャンク分割文字起こしを開始します。');
      }
      
      // 録音中のファイルを自動検出する機能を追加
      let targetFile = selectedFile;
      
      // 選択されたファイルが録音中でない場合、録音中のファイルを探す
      if (!selectedFile.isRecording && selectedFile.size === 0) {
        console.log('選択されたファイルが録音中ではありません。録音中のファイルを検索します。');
        
        // 最新のファイルリストを取得して録音中のファイルを探す
        try {
          const settings = await window.electronAPI.loadSettings();
          const currentFiles = await window.electronAPI.getFileList(settings.saveFolder);
          
          // 録音中のファイル（isRecording=true または サイズが大きくて新しいファイル）を探す
          const recordingFile = currentFiles
            .filter(file => file.isRecording || (file.size > 0 && file.createdAt))
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
          
          if (recordingFile && recordingFile.size > 0) {
            console.log('録音中のファイルを発見:', {
              filename: recordingFile.filename,
              size: recordingFile.size,
              isRecording: recordingFile.isRecording
            });
            targetFile = recordingFile;
          } else {
            console.warn('録音中のファイルが見つかりませんでした。選択されたファイルで続行します。');
          }
        } catch (error) {
          console.error('録音中ファイル検索エラー:', error);
        }
      }
      
      // 録音中のファイルの場合の特別な処理
      // isRecordingフラグを優先し、サイズを副次的な条件として使用
      if (targetFile.isRecording || (targetFile.size === 0 && targetFile.isRecording !== false)) {
        console.log('録音中またはサイズ0のファイルを検出:', targetFile.filename);
        console.log('録音中のファイルのため、部分的なチャンク分割文字起こしを開始します。');
      } else {
        console.log('録音完了後のファイルに対してチャンク分割文字起こしを開始:', targetFile.filename);
      }
      
      // 既存のマネージャーがある場合は停止
      if (chunkTranscriptionManager) {
        await chunkTranscriptionManager.stopAndConsolidate();
      }
      
      // 新しいマネージャーを作成
      const manager = new ChunkTranscriptionManager();
      setChunkTranscriptionManager(manager);
      
      // 進捗リスナーを設定
      manager.onProgress((progress) => {
        setChunkProgress(progress);
      });
      
      // チャンク完了リスナーを設定
      manager.onChunkTranscribed((chunk) => {
        console.log('チャンク完了:', chunk.chunkId, chunk.status);
        console.log('チャンク完了:', chunk.chunkId, chunk.status, chunk.segments?.length, 'セグメント');
        
        // チャンク結果をリアルタイムで表示に反映（成功・失敗問わず）
        const eventDetail = { 
          chunkId: chunk.chunkId, 
          segments: chunk.segments || [], 
          status: chunk.status,
          error: chunk.error,
          processingTime: chunk.processingTime
        };
        
        console.log('🚀 chunkTranscriptionCompleted イベントを発火:', eventDetail);
        
        window.dispatchEvent(new CustomEvent('chunkTranscriptionCompleted', { 
          detail: eventDetail
        }));
        
        console.log('✅ chunkTranscriptionCompleted イベント発火完了');
      });
      
      // 設定を更新
      manager.updateSettings(chunkSettings);
      
      // チャンク分割文字起こし開始イベントを発火
      window.dispatchEvent(new CustomEvent('chunkTranscriptionStart', { 
        detail: { 
          totalChunks: 0,  // 実際のチャンク数は後で更新
          chunkSize: chunkSettings.chunkSize,
          overlapSize: chunkSettings.overlapSize
        } 
      }));
      
      // チャンク分割文字起こし開始（検出されたtargetFileを使用）
      console.log('実際に処理するファイル:', targetFile.filepath);
      await manager.startChunkTranscription(targetFile.filepath);
      
      // 録音中ファイルの場合はリアルタイム処理継続のため、すぐには停止しない
      if (targetFile.filepath.includes('recording_') && targetFile.filepath.includes('.webm')) {
        console.log('🎆 録音中ファイル - リアルタイム処理を継続中、手動停止まで待機');
        
        // リアルタイムモードでは即座に停止せず、マネージャーを保存して継続
        setChunkTranscriptionManager(manager);
        
        // チャンク完了通知のみ設定（リアルタイム結果表示のため）
        console.log('リアルタイム文字起こしが開始されました。録音を停止するか、手動で停止するまで継続します。');
        return; // ここで処理終了、リアルタイム処理は継続
      }
      
      // 通常の録音完了ファイルの場合のみ、従来の処理を実行
      console.log('📁 録音完了ファイル - 通常のチャンク分割処理を実行');
      
      // 統合結果を取得
      const consolidatedResult = await manager.stopAndConsolidate();
      
      // 結果を保存（targetFileを使用）
      await window.electronAPI.chunkSaveConsolidatedResult(targetFile.filepath, consolidatedResult);
      
      // 完了通知
      window.dispatchEvent(new CustomEvent('chunkTranscriptionComplete', { 
        detail: consolidatedResult 
      }));
      
      // 通常の文字起こし完了イベントも発火（互換性のため）
      window.dispatchEvent(new CustomEvent('transcriptionComplete', { 
        detail: {
          language: consolidatedResult.metadata.language,
          duration: consolidatedResult.metadata.duration,
          segments: consolidatedResult.segments.map(seg => ({
            start: seg.start,
            end: seg.end,
            text: seg.text
          })),
          created_at: Date.now(),
          segment_count: consolidatedResult.metadata.segmentCount
        }
      }));
      
      // 再文字起こしの場合はリフレッシュイベントも発火（targetFileを使用）
      // ただし、録音中ファイルの場合は除外（リアルタイム処理中）
      if (targetFile.hasTranscriptionFile && !targetFile.filepath.includes('recording_')) {
        window.dispatchEvent(new CustomEvent('transcriptionRefresh', { 
          detail: { 
            audioFilePath: targetFile.filepath,
            transcriptionResult: consolidatedResult 
          } 
        }));
      }
      
    } catch (error) {
      console.error('チャンク分割文字起こしエラー:', error);
      
      // エラーメッセージを分かりやすく表示
      let errorMessage = '';
      if (error instanceof Error) {
        if (error.message.includes('音声ファイルからチャンクを生成できませんでした')) {
          errorMessage = '音声ファイルからチャンクを生成できませんでした。ファイルが短すぎるか、音声データが不足している可能性があります。';
        } else if (error.message.includes('ファイルの読み込みに失敗')) {
          errorMessage = '音声ファイルの読み込みに失敗しました。ファイルが破損している可能性があります。';
        } else {
          errorMessage = `チャンク分割文字起こしエラー: ${error.message}`;
        }
      } else {
        errorMessage = 'チャンク分割文字起こしで予期しないエラーが発生しました。';
      }
      
      setError(errorMessage);
    }
  };

  // チャンク分割文字起こし停止
  const handleStopChunkTranscription = async () => {
    if (!chunkTranscriptionManager) return;
    
    try {
      await chunkTranscriptionManager.stopAndConsolidate();
      setChunkTranscriptionManager(null);
      setChunkProgress({
        isTranscribing: false,
        totalChunks: 0,
        processedChunks: 0,
        failedChunks: 0,
        currentProcessingChunk: 0,
        averageProcessingTime: 0,
        estimatedTimeRemaining: 0
      });
    } catch (error) {
      console.error('チャンク分割文字起こし停止エラー:', error);
    }
  };

  // チャンク設定更新
  const updateChunkSettings = (newSettings: Partial<ChunkSettings>) => {
    const updatedSettings = { ...chunkSettings, ...newSettings };
    setChunkSettings(updatedSettings);
    
    if (chunkTranscriptionManager) {
      chunkTranscriptionManager.updateSettings(updatedSettings);
    }
  };

  // コンポーネント終了時のクリーンアップ
  useEffect(() => {
    return () => {
      if (chunkTranscriptionManager) {
        chunkTranscriptionManager.removeAllListeners();
      }
    };
  }, [chunkTranscriptionManager]);

  return (
    <div style={{ 
      padding: 'var(--spacing-md)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--spacing-md)',
      background: 'var(--color-bg-primary)'
    }}>
      {/* サーバー制御とモデル選択 */}
      <ServerControlSection
        currentModel={selectedModel}
        onModelChange={handleModelChange}
        isChangingModel={isChangingModel}
        onServerStart={handleStartServer}
        onServerStop={handleStopServer}
      />

      {/* 音声認識実行 */}
      <div>
        {/* デバッグ情報表示 */}
        {process.env.NODE_ENV === 'development' && (
          <div style={{
            padding: 'var(--spacing-sm)',
            backgroundColor: 'rgba(255, 255, 0, 0.1)',
            border: '1px solid #ffcc02',
            borderRadius: 'var(--border-radius)',
            marginBottom: 'var(--spacing-sm)',
            fontSize: 'var(--font-size-sm)',
            fontFamily: 'monospace'
          }}>
            <div>🔍 Debug Info:</div>
            <div>selectedFile: {selectedFile ? selectedFile.filename : 'null'}</div>
            <div>serverRunning: {serverStatus.isRunning ? 'Yes' : 'No'}</div>
            <div>isTranscribing: {isTranscribing ? 'Yes' : 'No'}</div>
            <div>isChangingModel: {isChangingModel ? 'Yes' : 'No'}</div>
            <div>chunkTranscribing: {chunkProgress.isTranscribing ? 'Yes' : 'No'}</div>
            {selectedFile && (
              <>
                <div>fileSize: {selectedFile.size}</div>
                <div>isRecording: {selectedFile.isRecording ? 'Yes' : 'No'}</div>
              </>
            )}
          </div>
        )}
        
        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-sm)' }}>
          <button
            onClick={handleTranscribe}
            disabled={!selectedFile || !serverStatus.isRunning || isTranscribing || isChangingModel || chunkProgress.isTranscribing || (selectedFile && (selectedFile.isRecording || selectedFile.size === 0))}
            className="btn btn--primary"
            style={{
              flex: 1,
              padding: 'var(--spacing-md)',
              fontSize: 'var(--font-size-md)',
              fontWeight: 'var(--font-weight-medium)',
              opacity: (!selectedFile || !serverStatus.isRunning || isTranscribing || isChangingModel || chunkProgress.isTranscribing) ? 0.5 : 1
            }}
          >
            {isTranscribing ? 
              `🎤 処理中... (${currentModel}モデル)` : 
              isChangingModel ? 'モデル変更中...' : 
              '🎤 通常文字起こし'}
          </button>
          
          <button
            onClick={chunkProgress.isTranscribing ? handleStopChunkTranscription : handleChunkTranscribe}
            disabled={!selectedFile || !serverStatus.isRunning || isTranscribing || isChangingModel}
            className={chunkProgress.isTranscribing ? "btn btn--error" : "btn btn--accent"}
            style={{
              flex: 1,
              padding: 'var(--spacing-md)',
              fontSize: 'var(--font-size-md)',
              fontWeight: 'var(--font-weight-medium)',
              opacity: (!selectedFile || !serverStatus.isRunning || isTranscribing || isChangingModel) ? 0.5 : 1
            }}
          >
            {chunkProgress.isTranscribing ? 
              `⚡ 停止 (${chunkProgress.processedChunks}/${chunkProgress.totalChunks})` : 
              '⚡ チャンク分割文字起こし'}
          </button>
        </div>

        {!selectedFile && (
          <p style={{ 
            margin: 'var(--spacing-sm) 0 0 0', 
            fontSize: 'var(--font-size-sm)', 
            color: 'var(--color-text-secondary)' 
          }}>
            音声ファイルを選択してください
          </p>
        )}
        
        {selectedFile && selectedFile.size === 0 && (
          <div style={{ 
            margin: 'var(--spacing-sm) 0 0 0', 
            fontSize: 'var(--font-size-sm)', 
            color: 'var(--color-warning)' 
          }}>
            <p style={{ margin: '0 0 4px 0' }}>
              🎤 通常文字起こし：録音完了後に実行してください
            </p>
            <p style={{ margin: '0', color: 'var(--color-accent)' }}>
              ⚡ チャンク分割文字起こし：録音中でも実行可能（リアルタイム処理）
            </p>
          </div>
        )}
        
        {selectedFile && !selectedFile.isRecording && selectedFile.size > 0 && (
          <div style={{ 
            margin: 'var(--spacing-sm) 0 0 0', 
            fontSize: 'var(--font-size-sm)', 
            color: 'var(--color-success)' 
          }}>
            <p style={{ margin: '0' }}>
              ✓ 録音完了ファイルが選択されています。文字起こしを開始できます。
            </p>
          </div>
        )}
      </div>

      {/* 文字起こし進捗表示 */}
      <TranscriptionProgressPanel
        progress={chunkProgress}
        transcriptionProgress={transcriptionProgress}
        error={error}
        isTranscribing={isTranscribing || chunkProgress.isTranscribing}
      />

      {/* チャンク分割設定パネル */}
      <ChunkSettingsPanel
        settings={chunkSettings}
        onSettingsChange={updateChunkSettings}
        disabled={chunkProgress.isTranscribing}
      />


      {/* 上書き確認モーダル */}
      {showOverwriteModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'var(--color-bg-primary)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--border-radius)',
            padding: 'var(--spacing-lg)',
            maxWidth: '400px',
            width: '90%',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
          }}>
            <h3 style={{
              margin: '0 0 var(--spacing-md) 0',
              fontSize: 'var(--font-size-lg)',
              color: 'var(--color-text-primary)',
              fontWeight: 'var(--font-weight-medium)'
            }}>
              ⚠️ 文字起こしデータの上書き
            </h3>
            
            <p style={{
              margin: '0 0 var(--spacing-lg) 0',
              fontSize: 'var(--font-size-md)',
              color: 'var(--color-text-secondary)',
              lineHeight: '1.5'
            }}>
              このファイルには既に文字起こしデータが存在します。<br />
              再度文字起こしを実行すると、既存のデータが上書きされます。<br />
              <strong>編集済みの内容も失われます。</strong>
            </p>
            
            <div style={{
              display: 'flex',
              gap: 'var(--spacing-sm)',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={handleCancelOverwrite}
                className="btn btn--secondary"
                style={{
                  fontSize: 'var(--font-size-sm)',
                  padding: '8px 16px'
                }}
              >
                キャンセル
              </button>
              <button
                onClick={handleConfirmOverwrite}
                className="btn btn--error"
                style={{
                  fontSize: 'var(--font-size-sm)',
                  padding: '8px 16px'
                }}
              >
                上書きして実行
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpeechRecognitionControl;