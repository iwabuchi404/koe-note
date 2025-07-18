import React, { useState, useEffect } from 'react';
import { 
  TranscriptionResult, 
  SpeechProgress, 
  AudioFile,
  TranscriptionFile,
  TranscriptionMetadata
} from '../../../preload/preload';
import { useAppContext } from '../../App';

interface SpeechRecognitionProps {
  selectedFile: AudioFile | null;
  onTranscriptionComplete?: (result: TranscriptionResult) => void;
}

const SpeechRecognition: React.FC<SpeechRecognitionProps> = ({ 
  selectedFile, 
  onTranscriptionComplete 
}) => {
  const { transcriptionDisplayData } = useAppContext();
  const [serverStatus, setServerStatus] = useState<{ isRunning: boolean; pid?: number }>({ isRunning: false });
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionProgress, setTranscriptionProgress] = useState<string>('');
  const [transcriptionResult, setTranscriptionResult] = useState<TranscriptionResult | null>(null);
  const [error, setError] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>('small');
  const [isChangingModel, setIsChangingModel] = useState(false);
  const [currentModel, setCurrentModel] = useState<string>('small');

  // 完全テキスト取得関数
  const getFullText = (result: TranscriptionResult) => {
    return result.segments.map(segment => segment.text).join(' ').trim();
  };

  // 文字起こしデータをレンダリング
  const renderTranscriptionData = () => {
    const data = transcriptionDisplayData || transcriptionResult;
    if (!data) return null;

    // 新しい文字起こしファイル形式の場合
    if (data.metadata && data.content) {
      const segments = data.content.segments || [];
      const fullText = segments.map((segment: any) => segment.text || '').join(' ').trim();

      return (
        <>
          <div style={{ 
            marginBottom: 'var(--spacing-md)', 
            fontSize: 'var(--font-size-sm)', 
            color: 'var(--color-text-secondary)'
          }}>
            <p style={{ margin: 'var(--spacing-xs) 0' }}>
              モデル: {data.metadata.model} | 
              言語: {data.content.language} | 
              時間: {data.metadata.duration ? data.metadata.duration.toFixed(1) : '不明'}秒 | 
              セグメント: {data.metadata.segmentCount || 0}個 | 
              カバレッジ: {data.metadata.coverage ? data.metadata.coverage.toFixed(1) : '不明'}%
            </p>
          </div>

          <div style={{
            backgroundColor: 'var(--color-bg-primary)',
            padding: 'var(--spacing-md)',
            borderRadius: 'var(--border-radius)',
            marginBottom: 'var(--spacing-md)',
            border: '1px solid var(--color-border)'
          }}>
            <h5 style={{ 
              margin: '0 0 var(--spacing-sm) 0', 
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-secondary)',
              fontWeight: 'var(--font-weight-medium)'
            }}>完全テキスト:</h5>
            <p style={{ 
              margin: 0, 
              lineHeight: '1.5',
              fontSize: 'var(--font-size-md)',
              color: 'var(--color-text-primary)',
              fontFamily: 'var(--font-family-ui)'
            }}>
              {fullText}
            </p>
          </div>

          <details style={{ fontSize: 'var(--font-size-sm)' }}>
            <summary style={{ 
              cursor: 'pointer', 
              fontWeight: 'var(--font-weight-medium)',
              marginBottom: 'var(--spacing-sm)',
              color: 'var(--color-text-primary)'
            }}>
              詳細セグメント ({segments.length}個)
            </summary>
            
            <div style={{ 
              maxHeight: '200px', 
              overflowY: 'auto',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--border-radius)'
            }}>
              {segments.map((segment: any, index: number) => (
                <div 
                  key={index}
                  style={{
                    padding: 'var(--spacing-sm)',
                    borderBottom: index < segments.length - 1 
                      ? '1px solid var(--color-border)' : 'none',
                    backgroundColor: index % 2 === 0 
                      ? 'var(--color-bg-secondary)' 
                      : 'var(--color-bg-primary)'
                  }}
                >
                  <div style={{ 
                    fontSize: 'var(--font-size-sm)', 
                    color: 'var(--color-text-secondary)',
                    marginBottom: 'var(--spacing-xs)',
                    fontFamily: 'var(--font-family-mono)'
                  }}>
                    [{segment.start ? segment.start.toFixed(1) : '0.0'}s - {segment.end ? segment.end.toFixed(1) : '0.0'}s]
                  </div>
                  <div style={{ 
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-text-primary)'
                  }}>
                    {segment.text ? segment.text.trim() : ''}
                  </div>
                </div>
              ))}
            </div>
          </details>
        </>
      );
    }

    // 従来の音声認識結果形式の場合
    return (
      <>
        <div style={{ 
          marginBottom: 'var(--spacing-md)', 
          fontSize: 'var(--font-size-sm)', 
          color: 'var(--color-text-secondary)'
        }}>
          <p style={{ margin: 'var(--spacing-xs) 0' }}>
            言語: {data.language} | 
            時間: {data.duration ? data.duration.toFixed(1) : '不明'}秒 | 
            セグメント: {data.segment_count || 0}個
          </p>
        </div>

        <div style={{
          backgroundColor: 'var(--color-bg-primary)',
          padding: 'var(--spacing-md)',
          borderRadius: 'var(--border-radius)',
          marginBottom: 'var(--spacing-md)',
          border: '1px solid var(--color-border)'
        }}>
          <h5 style={{ 
            margin: '0 0 var(--spacing-sm) 0', 
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-secondary)',
            fontWeight: 'var(--font-weight-medium)'
          }}>完全テキスト:</h5>
          <p style={{ 
            margin: 0, 
            lineHeight: '1.5',
            fontSize: 'var(--font-size-md)',
            color: 'var(--color-text-primary)',
            fontFamily: 'var(--font-family-ui)'
          }}>
            {getFullTextFromResult(data)}
          </p>
        </div>

        <details style={{ fontSize: 'var(--font-size-sm)' }}>
          <summary style={{ 
            cursor: 'pointer', 
            fontWeight: 'var(--font-weight-medium)',
            marginBottom: 'var(--spacing-sm)',
            color: 'var(--color-text-primary)'
          }}>
            詳細セグメント ({data.segments ? data.segments.length : 0}個)
          </summary>
          
          <div style={{ 
            maxHeight: '200px', 
            overflowY: 'auto',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--border-radius)'
          }}>
            {(data.segments || []).map((segment: any, index: number) => (
              <div 
                key={index}
                style={{
                  padding: 'var(--spacing-sm)',
                  borderBottom: index < (data.segments || []).length - 1 
                    ? '1px solid var(--color-border)' : 'none',
                  backgroundColor: index % 2 === 0 
                    ? 'var(--color-bg-secondary)' 
                    : 'var(--color-bg-primary)'
                }}
              >
                <div style={{ 
                  fontSize: 'var(--font-size-sm)', 
                  color: 'var(--color-text-secondary)',
                  marginBottom: 'var(--spacing-xs)',
                  fontFamily: 'var(--font-family-mono)'
                }}>
                  [{segment.start ? segment.start.toFixed(1) : '0.0'}s - {segment.end ? segment.end.toFixed(1) : '0.0'}s]
                </div>
                <div style={{ 
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--color-text-primary)'
                }}>
                  {segment.text ? segment.text.trim() : ''}
                </div>
              </div>
            ))}
          </div>
        </details>
      </>
    );
  };

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
    console.log('🔴 handleStartServer called'); // デバッグログ追加
    try {
      setError('');
      console.log('🔴 Calling speechStartServer()'); // デバッグログ追加
      const success = await window.electronAPI.speechStartServer();
      
      if (success) {
        // 状態更新のため少し待ってからステータスをチェック
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
    console.log('🔴 handleStopServer called'); // デバッグログ追加
    try {
      setError('');
      console.log('🔴 Calling speechStopServer()'); // デバッグログ追加
      await window.electronAPI.speechStopServer();
      
      // 状態更新
      setTimeout(async () => {
        const status = await window.electronAPI.speechGetServerStatus();
        setServerStatus(status);
      }, 1000);
    } catch (error) {
      setError('サーバー停止エラー: ' + String(error));
    }
  };

  // モデル変更
  const handleModelChange = async (modelName: string) => {
    if (!serverStatus.isRunning) {
      setError('サーバーが起動していません');
      return;
    }
    
    if (isChangingModel || isTranscribing) {
      return; // 処理中は変更不可
    }
    
    try {
      setIsChangingModel(true);
      setError('');
      const modelSizes = {
        'small': '244MB',
        'kotoba-tech/kotoba-whisper-v2.0-faster': '769MB',
        'large-v2': '3.1GB'
      };
      const size = modelSizes[modelName as keyof typeof modelSizes] || '';
      setTranscriptionProgress(`モデルを${modelName}に変更中... (${size}${modelName === 'large-v2' ? ' - 初回は3分程度かかります' : ''})`);
      
      // WebSocket経由でモデル変更を要求
      const success = await window.electronAPI.speechChangeModel(modelName);
      
      if (success) {
        setCurrentModel(modelName);
        setSelectedModel(modelName);
        setTranscriptionProgress('');
      } else {
        setError('モデルの変更に失敗しました');
      }
    } catch (error) {
      setError('モデル変更エラー: ' + String(error));
    } finally {
      setIsChangingModel(false);
      setTranscriptionProgress('');
    }
  };

  // 音声認識実行
  const handleTranscribe = async () => {
    if (!selectedFile) {
      setError('音声ファイルが選択されていません');
      return;
    }

    if (!serverStatus.isRunning) {
      setError('音声認識サーバーが起動していません');
      return;
    }

    try {
      setError('');
      setIsTranscribing(true);
      setTranscriptionProgress(`音声認識を開始しています... (${currentModel}モデル使用)`);
      setTranscriptionResult(null);

      console.log(`🎤 音声認識開始: ファイル=${selectedFile.filename}, モデル=${currentModel}`);
      const startTime = Date.now();

      const result = await window.electronAPI.speechTranscribe(selectedFile.filepath);
      
      const processingTime = (Date.now() - startTime) / 1000;
      const coverage = result.segments.length > 0 ? 
        (Math.max(...result.segments.map(s => s.end)) / result.duration * 100).toFixed(1) : '0';
      console.log(`🎤 音声認識完了: ${processingTime.toFixed(1)}秒, セグメント数=${result.segment_count}`);
      console.log(`🎤 カバレッジ: ${coverage}% (${result.duration.toFixed(1)}秒中)`);
      
      setTranscriptionResult(result);
      setTranscriptionProgress('文字起こしファイルを保存中...');
      
      // 文字起こしファイルの自動保存
      try {
        const transcriptionFile = createTranscriptionFile(selectedFile, result, currentModel, parseFloat(coverage));
        const savedPath = await window.electronAPI.saveTranscriptionFile(selectedFile.filepath, transcriptionFile);
        console.log(`📄 文字起こしファイル保存完了: ${savedPath}`);
        setTranscriptionProgress('');
      } catch (saveError) {
        console.error('文字起こしファイル保存エラー:', saveError);
        setTranscriptionProgress('');
        // 保存エラーでも認識結果は表示継続
      }
      
      // 結果をコールバックで通知
      if (onTranscriptionComplete) {
        onTranscriptionComplete(result);
      }

    } catch (error) {
      console.error(`🎤 音声認識エラー (${currentModel}モデル):`, error);
      setError(`音声認識エラー (${currentModel}): ` + String(error));
      setTranscriptionProgress('');
    } finally {
      setIsTranscribing(false);
    }
  };

  // セグメントテキストを結合
  const getFullTextFromResult = (result: TranscriptionResult): string => {
    return result.segments.map(segment => segment.text.trim()).join(' ');
  };

  // TranscriptionFileオブジェクトを作成
  const createTranscriptionFile = (
    audioFile: AudioFile, 
    result: TranscriptionResult, 
    modelName: string, 
    coverage: number
  ): TranscriptionFile => {
    const metadata: TranscriptionMetadata = {
      audioFile: audioFile.filename,
      model: modelName,
      transcribedAt: new Date().toISOString(),
      duration: result.duration,
      segmentCount: result.segment_count,
      language: result.language,
      speakers: [], // 初期は空配列
      coverage: coverage
    };

    const segments = result.segments.map(segment => ({
      start: segment.start,
      end: segment.end,
      text: segment.text,
      speaker: undefined,
      isEdited: false
    }));

    return {
      metadata,
      segments,
      filePath: '', // main プロセスで設定される
      isModified: false
    };
  };

  return (
    <div style={{ 
      padding: 'var(--spacing-lg)', 
      backgroundColor: 'var(--color-bg-secondary)', 
      borderRadius: 'var(--border-radius)',
      border: '1px solid var(--color-border)'
    }}>
      <h3 style={{ 
        margin: '0 0 var(--spacing-lg) 0', 
        fontSize: 'var(--font-size-lg)', 
        fontWeight: 'var(--font-weight-medium)',
        color: 'var(--color-text-primary)'
      }}>
        🎤 音声認識 ({currentModel})
      </h3>

      {/* サーバー状態 */}
      <div style={{ marginBottom: 'var(--spacing-lg)' }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          padding: 'var(--spacing-md)',
          backgroundColor: serverStatus.isRunning 
            ? 'rgba(79, 193, 255, 0.1)' 
            : 'rgba(244, 71, 71, 0.1)',
          border: `1px solid ${serverStatus.isRunning 
            ? 'var(--color-success)' 
            : 'var(--color-error)'}`,
          borderRadius: 'var(--border-radius)',
          marginBottom: 'var(--spacing-sm)'
        }}>
          <span style={{ 
            fontWeight: 'var(--font-weight-medium)',
            color: 'var(--color-text-primary)',
            fontSize: 'var(--font-size-md)'
          }}>
            サーバー状態: {serverStatus.isRunning ? '起動中' : '停止中'}
            {serverStatus.pid && serverStatus.pid !== -1 && ` (PID: ${serverStatus.pid})`}
            {serverStatus.pid === -1 && ' (外部サーバー)'}
          </span>
          
          {serverStatus.isRunning ? (
            <button
              onClick={() => {
                console.log('🔴 Stop button clicked');
                handleStopServer();
              }}
              className="btn btn--error"
              style={{
                padding: 'var(--spacing-xs) var(--spacing-md)',
                fontSize: 'var(--font-size-sm)'
              }}
            >
              停止
            </button>
          ) : (
            <button
              onClick={() => {
                console.log('🔴 Start button clicked');
                handleStartServer();
              }}
              className="btn btn--success"
              style={{
                padding: 'var(--spacing-xs) var(--spacing-md)',
                fontSize: 'var(--font-size-sm)'
              }}
            >
              起動
            </button>
          )}
        </div>
      </div>

      {/* モデル選択 */}
      {serverStatus.isRunning && (
        <div style={{ marginBottom: 'var(--spacing-lg)' }}>
          <label style={{
            display: 'block',
            marginBottom: 'var(--spacing-sm)',
            fontSize: 'var(--font-size-md)',
            fontWeight: 'var(--font-weight-medium)',
            color: 'var(--color-text-primary)'
          }}>
            🎯 モデル選択:
          </label>
          <select
            value={selectedModel}
            onChange={(e) => {
              const newModel = e.target.value;
              setSelectedModel(newModel);
              handleModelChange(newModel);
            }}
            disabled={isChangingModel || isTranscribing}
            className="select"
            style={{
              width: '100%',
              padding: 'var(--spacing-sm)',
              fontSize: 'var(--font-size-md)',
              opacity: (isChangingModel || isTranscribing) ? 0.5 : 1
            }}
          >
            <option value="small">kotoba-whisper-small (軽量・高速 - 244MB)</option>
            <option value="kotoba-tech/kotoba-whisper-v2.0-faster">kotoba-whisper-medium (バランス - 769MB)</option>
            <option value="large-v2">kotoba-whisper-large-v2 (高精度 - 3.1GB)</option>
          </select>
          {selectedModel === 'large-v2' && (
            <p style={{
              margin: 'var(--spacing-xs) 0 0 0',
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-warning)',
              fontStyle: 'italic'
            }}>
              ⚠️ large-v2モデルは3.1GBです。初回ダウンロード時は3分程度かかります。
            </p>
          )}
        </div>
      )}

      {/* 音声認識実行 */}
      <div style={{ marginBottom: 'var(--spacing-lg)' }}>
        <button
          onClick={handleTranscribe}
          disabled={!selectedFile || !serverStatus.isRunning || isTranscribing || isChangingModel}
          className="btn btn--primary"
          style={{
            width: '100%',
            padding: 'var(--spacing-md)',
            fontSize: 'var(--font-size-md)',
            fontWeight: 'var(--font-weight-medium)',
            opacity: (!selectedFile || !serverStatus.isRunning || isTranscribing || isChangingModel) ? 0.5 : 1
          }}
        >
          {isTranscribing ? 
            `処理中... (${currentModel}モデル${currentModel === 'kotoba-tech/kotoba-whisper-v2.0-faster' ? ' - 最大2分程度' : ''})` : 
            isChangingModel ? 'モデル変更中...' : 
            '音声認識を実行'}
        </button>

        {!selectedFile && (
          <p style={{ 
            margin: 'var(--spacing-sm) 0 0 0', 
            fontSize: 'var(--font-size-sm)', 
            color: 'var(--color-text-secondary)' 
          }}>
            音声ファイルを選択してください
          </p>
        )}
      </div>

      {/* 進捗表示 */}
      {transcriptionProgress && (
        <div style={{
          padding: 'var(--spacing-md)',
          backgroundColor: 'rgba(255, 204, 2, 0.1)',
          border: '1px solid var(--color-warning)',
          borderRadius: 'var(--border-radius)',
          marginBottom: 'var(--spacing-lg)'
        }}>
          <p style={{ 
            margin: 0, 
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-primary)'
          }}>
            {transcriptionProgress}
          </p>
        </div>
      )}

      {/* エラー表示 */}
      {error && (
        <div style={{
          padding: 'var(--spacing-md)',
          backgroundColor: 'rgba(244, 71, 71, 0.1)',
          border: '1px solid var(--color-error)',
          borderRadius: 'var(--border-radius)',
          marginBottom: 'var(--spacing-lg)'
        }}>
          <p style={{ 
            margin: 0, 
            fontSize: 'var(--font-size-sm)', 
            color: 'var(--color-error)'
          }}>
            {error}
          </p>
        </div>
      )}

      {/* 音声認識結果 */}
      {(transcriptionResult || transcriptionDisplayData) && (
        <div style={{
          backgroundColor: 'var(--color-bg-tertiary)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--border-radius)',
          padding: 'var(--spacing-lg)'
        }}>
          <h4 style={{ 
            margin: '0 0 var(--spacing-md) 0', 
            fontSize: 'var(--font-size-md)', 
            fontWeight: 'var(--font-weight-medium)',
            color: 'var(--color-text-primary)'
          }}>
            {transcriptionDisplayData ? '文字起こし内容' : '認識結果'}
          </h4>

          {renderTranscriptionData()}
        </div>
      )}
    </div>
  );
};

export default SpeechRecognition;