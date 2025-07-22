import React, { useState, useEffect } from 'react';
import { 
  TranscriptionResult, 
  AudioFile
} from '../../../preload/preload';
import { useAppContext } from '../../App';
import ChunkTranscriptionDisplay from '../ChunkTranscriptionDisplay/ChunkTranscriptionDisplay';
import { TRANSCRIPTION_CONFIG } from '../../config/transcriptionConfig';

interface SpeechRecognitionProps {
  selectedFile: AudioFile | null;
  onTranscriptionComplete?: (result: TranscriptionResult) => void;
}

/**
 * 文字起こし結果表示専用コンポーネント
 * 音声認識制御機能は SpeechRecognitionControl に移行
 */
const SpeechRecognition: React.FC<SpeechRecognitionProps> = ({ 
  selectedFile, 
  onTranscriptionComplete 
}) => {
  const { transcriptionDisplayData, setFileList, currentModel, setTranscriptionDisplayData } = useAppContext();
  const [transcriptionResult, setTranscriptionResult] = useState<TranscriptionResult | null>(null);
  
  // UI要素の参照
  const transcriptionContainerRef = React.useRef<HTMLDivElement>(null);
  
  // SpeechRecognition レンダリング (デバッグログ削除済み)
  const [editingSegmentId, setEditingSegmentId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState<string>('');
  const [modifiedSegments, setModifiedSegments] = useState<Set<number>>(new Set());
  const [editedSegmentTexts, setEditedSegmentTexts] = useState<Map<number, string>>(new Map());
  
  // チャンク分割文字起こし用の状態
  const [showChunkDisplay, setShowChunkDisplay] = useState(false);
  const [chunkSettings, setChunkSettings] = useState({
    chunkSize: TRANSCRIPTION_CONFIG.CHUNK.DEFAULT_SIZE,
    overlapSize: TRANSCRIPTION_CONFIG.CHUNK.DEFAULT_OVERLAP,
    autoScroll: TRANSCRIPTION_CONFIG.CHUNK.ENABLE_AUTO_SCROLL
  });

  // 新しい音声認識結果を受信するイベントリスナー
  useEffect(() => {
    const handleTranscriptionComplete = (event: any) => {
      const result = event.detail;
      console.log('新しい音声認識結果を受信:', result);
      setTranscriptionResult(result);
      
      // 自動保存機能
      const saveTranscriptionFile = async () => {
        try {
          const coverage = result.segments.reduce((acc: number, segment: any) => 
            acc + (segment.text ? segment.text.length : 0), 0);
          const totalExpectedLength = result.duration * 10;
          const calculatedCoverage = Math.min((coverage / totalExpectedLength) * 100, 100);
          
          const transcriptionFile = {
            metadata: {
              audioFile: selectedFile?.filename || '',
              model: currentModel,
              transcribedAt: new Date().toISOString(),
              duration: result.duration,
              segmentCount: result.segments.length,
              language: result.language,
              speakers: [],
              coverage: calculatedCoverage
            },
            segments: result.segments.map((segment: any) => ({
              start: segment.start,
              end: segment.end,
              text: segment.text,
              speaker: undefined,
              isEdited: false
            })),
            filePath: '',
            isModified: false
          };
          
          if (selectedFile) {
            await window.electronAPI.saveTranscriptionFile(selectedFile.filepath, transcriptionFile);
            console.log('文字起こしファイル自動保存完了');
            
            // ファイル一覧を更新（少し遅延を入れてファイルシステムの更新を待つ）
            setTimeout(async () => {
              try {
                const folderPath = selectedFile.filepath.substring(0, selectedFile.filepath.lastIndexOf('\\'));
                const files = await window.electronAPI.getFileList(folderPath);
                
                // 各音声ファイルに対して文字起こしファイルの存在をチェック
                const extendedFiles = await Promise.all(
                  files.map(async (file) => {
                    try {
                      const hasTranscriptionFile = await window.electronAPI.checkTranscriptionExists(file.filepath);
                      const transcriptionPath = hasTranscriptionFile 
                        ? await window.electronAPI.getTranscriptionPath(file.filepath)
                        : undefined;
                      
                      return {
                        ...file,
                        hasTranscriptionFile,
                        transcriptionPath,
                        isRecording: false // 文字起こし完了時は録音中ではない
                      };
                    } catch (error) {
                      console.error(`文字起こしファイル確認エラー (${file.filename}):`, error);
                      return {
                        ...file,
                        hasTranscriptionFile: false,
                        transcriptionPath: undefined,
                        isRecording: false // エラー時も録音中ではない
                      };
                    }
                  })
                );
                
                setFileList(extendedFiles);
                console.log('文字起こし完了後のファイル一覧更新が完了しました:', extendedFiles.length, 'ファイル');
                console.log('文字起こしファイル付き:', extendedFiles.filter(f => f.hasTranscriptionFile).length, '件');
              } catch (error) {
                console.error('ファイル一覧更新エラー:', error);
              }
            }, 500); // 500ms待機
          }
        } catch (error) {
          console.error('文字起こしファイル自動保存エラー:', error);
        }
      };
      
      saveTranscriptionFile();
      
      // 親コンポーネントに通知
      if (onTranscriptionComplete) {
        onTranscriptionComplete(result);
      }
    };

    window.addEventListener('transcriptionComplete', handleTranscriptionComplete);

    return () => {
      window.removeEventListener('transcriptionComplete', handleTranscriptionComplete);
    };
  }, [selectedFile, onTranscriptionComplete, setFileList]);

  // ファイルベースリアルタイム文字起こし結果監視
  useEffect(() => {
    console.log('ファイルベースリアルタイム文字起こし監視開始:', {
      selectedFile: selectedFile?.filename,
      isRecording: selectedFile?.isRecording
    });
    
    // FileBasedRealtimeProcessorからの統計更新を監視
    const handleRealtimeUpdate = (event: CustomEvent) => {
      const data = event.detail;
      // CustomEvent受信 (デバッグログ削除済み)
      
      if (data && data.textData) {
        // ファイルベースリアルタイム文字起こし更新 (デバッグログ削除済み)
        
        // リアルタイム結果をTranscriptionResult形式に変換
        // duration計算を修正（ミリ秒を秒に変換し、負の値を防ぐ）
        const elapsedMs = Math.max(0, data.textData.metadata.lastUpdateTime - data.textData.metadata.startTime);
        const durationSeconds = Math.max(0, elapsedMs / 1000);
        
        const realtimeResult: TranscriptionResult = {
          language: 'ja',
          duration: durationSeconds,
          segments: data.textData.segments.map((segment: any) => ({
            start: segment.start,
            end: segment.end,
            text: segment.text,
            words: []
          })),
          created_at: data.textData.metadata.lastUpdateTime,
          segment_count: data.textData.segments.length
        };
        
        // transcriptionResult更新 (デバッグログ削除済み)
        setTranscriptionResult(realtimeResult);
        
        // 新しいテキストが追加された場合、自動スクロール
        setTimeout(() => {
          if (transcriptionContainerRef.current) {
            transcriptionContainerRef.current.scrollTop = transcriptionContainerRef.current.scrollHeight;
          }
        }, 100);
      } else {
        // CustomEvent受信（textDataなし） (デバッグログ削除済み)
      }
    };
    
    // 自動スクロール処理
    const handleAutoScroll = (event: CustomEvent) => {
      const data = event.detail;
      if (data.type === 'autoScroll' && data.action === 'enable') {
        setTimeout(() => {
          if (transcriptionContainerRef.current) {
            transcriptionContainerRef.current.scrollTop = transcriptionContainerRef.current.scrollHeight;
          }
        }, 100);
      }
    };
    
    // グローバルイベントリスナーとして監視
    window.addEventListener('fileBasedRealtimeUpdate', handleRealtimeUpdate as EventListener);
    window.addEventListener('fileBasedRealtimeUpdate', handleAutoScroll as EventListener);
    
    return () => {
      console.log('ファイルベースリアルタイム文字起こし監視停止');
      window.removeEventListener('fileBasedRealtimeUpdate', handleRealtimeUpdate as EventListener);
      window.removeEventListener('fileBasedRealtimeUpdate', handleAutoScroll as EventListener);
    };
  }, []); // 依存配列を空にして、常にイベントリスナーを有効にする

  // リアルタイムチャンク完了イベントリスナー（従来のメモリベース）
  useEffect(() => {
    // selectedFileが存在しない場合は早期リターン
    if (!selectedFile) {
      console.log('🎆 SpeechRecognition - selectedFileが存在しないため、chunkTranscriptionCompletedイベントリスナーを登録しません');
      return;
    }
    
    const handleChunkTranscriptionCompleted = (event: any) => {
      const chunkData = event.detail;
      console.log('🎆 SpeechRecognition - リアルタイムチャンク完了イベント受信:', chunkData);
      console.log('🎆 現在の選択ファイル:', selectedFile ? {
        filename: selectedFile.filename,
        filepath: selectedFile.filepath
      } : 'null');
      
      // 選択されたファイルのチャンクかどうかを確認
      if (selectedFile) {
        console.log('✅ selectedFile存在確認OK');
        
        if (chunkData.segments && chunkData.segments.length > 0) {
          console.log('✅ セグメント存在確認OK:', chunkData.segments.length, 'セグメント');
          console.log('📝 リアルタイムチャンク結果を表示に追加:', chunkData.segments.length, 'セグメント');
          
          // チャンク結果を既存の結果に追加
          setTranscriptionResult(prevResult => {
            console.log('📊 setTranscriptionResult呼び出し - 前回の結果:', prevResult);
            
            const newSegments = [...(prevResult?.segments || []), ...chunkData.segments];
            const newResult = {
              language: prevResult?.language || 'ja',
              duration: Math.max(
                prevResult?.duration || 0,
                Math.max(...chunkData.segments.map((s: any) => s.end), 0)
              ),
              segments: newSegments,
              created_at: Date.now(),
              segment_count: newSegments.length
            };
            
            console.log('📊 更新後の文字起こし結果:', {
              totalSegments: newResult.segments.length,
              duration: newResult.duration,
              latestSegment: newResult.segments[newResult.segments.length - 1]?.text?.substring(0, 50) + '...'
            });
            
            // 文字起こし結果を設定
            
            return newResult;
          });
        } else {
          console.log('❌ セグメントが空か存在しない:', chunkData.segments);
        }
      } else {
        console.log('❌ selectedFileが存在しない - このイベントは無視');
        return; // selectedFileがnullの場合は早期リターン
      }
    };

    console.log('🎆 SpeechRecognition - chunkTranscriptionCompleted イベントリスナー登録 - selectedFile:', selectedFile?.filename);

    window.addEventListener('chunkTranscriptionCompleted', handleChunkTranscriptionCompleted);

    return () => {
      console.log('🎆 SpeechRecognition - chunkTranscriptionCompleted イベントリスナー削除 - selectedFile:', selectedFile?.filename);
      window.removeEventListener('chunkTranscriptionCompleted', handleChunkTranscriptionCompleted);
    };
  }, [selectedFile]);

  // transcriptionResultの状態変化を監視
  useEffect(() => {
    // transcriptionResult状態変化の監視 (デバッグログ削除済み)
  }, [transcriptionResult, selectedFile]);

  // 再文字起こし時のリフレッシュイベントリスナー
  useEffect(() => {
    const handleTranscriptionRefresh = async (event: any) => {
      const { audioFilePath, transcriptionResult } = event.detail;
      console.log('文字起こしリフレッシュイベント受信:', audioFilePath);
      
      try {
        // 編集状態をリセット
        setEditingSegmentId(null);
        setEditingText('');
        setModifiedSegments(new Set());
        setEditedSegmentTexts(new Map());
        
        // transcriptionDisplayDataをクリア（新しいデータを表示するため）
        // 録音中ファイルの場合は、グローバルステートをクリアしない
        if (!selectedFile?.filepath.includes('recording_')) {
          setTranscriptionDisplayData(null);
        }
        
        // 新しい文字起こし結果を設定
        setTranscriptionResult(transcriptionResult);
        
        // ファイル一覧を更新
        if (selectedFile) {
          const folderPath = selectedFile.filepath.substring(0, selectedFile.filepath.lastIndexOf('\\'));
          const files = await window.electronAPI.getFileList(folderPath);
          
          // 各音声ファイルに対して文字起こしファイルの存在をチェック
          const extendedFiles = await Promise.all(
            files.map(async (file) => {
              try {
                const hasTranscriptionFile = await window.electronAPI.checkTranscriptionExists(file.filepath);
                const transcriptionPath = hasTranscriptionFile 
                  ? await window.electronAPI.getTranscriptionPath(file.filepath)
                  : undefined;
                
                return {
                  ...file,
                  hasTranscriptionFile,
                  transcriptionPath,
                  isRecording: false // 文字起こし完了時は録音中ではない
                };
              } catch (error) {
                console.error(`文字起こしファイル確認エラー (${file.filename}):`, error);
                return {
                  ...file,
                  hasTranscriptionFile: false,
                  transcriptionPath: undefined,
                  isRecording: false // エラー時も録音中ではない
                };
              }
            })
          );
          
          setFileList(extendedFiles);
          console.log('再文字起こし後のファイル一覧更新完了:', extendedFiles.length, 'ファイル');
        }
        
        // 成功通知を表示
        const notification = document.createElement('div');
        notification.textContent = '文字起こしが更新されました';
        notification.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          background: var(--color-success);
          color: white;
          padding: 12px 20px;
          border-radius: 4px;
          z-index: 1000;
          font-size: 14px;
        `;
        document.body.appendChild(notification);
        setTimeout(() => {
          document.body.removeChild(notification);
        }, 3000);
        
      } catch (error) {
        console.error('文字起こしリフレッシュエラー:', error);
      }
    };

    window.addEventListener('transcriptionRefresh', handleTranscriptionRefresh);

    return () => {
      window.removeEventListener('transcriptionRefresh', handleTranscriptionRefresh);
    };
  }, [selectedFile, setFileList, setTranscriptionDisplayData]);

  // チャンク分割文字起こし開始イベントのリスナー
  useEffect(() => {
    const handleChunkTranscriptionStart = (event: any) => {
      const { totalChunks, chunkSize, overlapSize } = event.detail;
      console.log('チャンク分割文字起こし開始:', totalChunks, 'チャンク');
      
      setShowChunkDisplay(true);
      setChunkSettings({
        chunkSize: chunkSize || TRANSCRIPTION_CONFIG.CHUNK.DEFAULT_SIZE,
        overlapSize: overlapSize || TRANSCRIPTION_CONFIG.CHUNK.DEFAULT_OVERLAP,
        autoScroll: TRANSCRIPTION_CONFIG.CHUNK.ENABLE_AUTO_SCROLL
      });
    };

    window.addEventListener('chunkTranscriptionStart', handleChunkTranscriptionStart);
    
    return () => {
      window.removeEventListener('chunkTranscriptionStart', handleChunkTranscriptionStart);
    };
  }, []);

  // チャンク分割文字起こし完了イベントのリスナー
  useEffect(() => {
    const handleChunkTranscriptionComplete = (event: any) => {
      const consolidatedResult = event.detail;
      console.log('チャンク分割文字起こし完了:', consolidatedResult);
      
      // チャンク表示を非表示にする
      setShowChunkDisplay(false);
      
      // 統合結果を通常の表示に反映
      setTranscriptionDisplayData(consolidatedResult);
    };

    window.addEventListener('chunkTranscriptionComplete', handleChunkTranscriptionComplete);
    
    return () => {
      window.removeEventListener('chunkTranscriptionComplete', handleChunkTranscriptionComplete);
    };
  }, [setTranscriptionDisplayData]);

  // グローバルキーボードショートカット
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S で保存
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        if (modifiedSegments.size > 0) {
          handleSaveTranscription();
        }
      }
      // Escape で編集キャンセル
      if (e.key === 'Escape' && editingSegmentId !== null) {
        e.preventDefault();
        handleCancelEdit();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [modifiedSegments.size, editingSegmentId]);

  // セグメント編集ハンドラー
  const handleSegmentDoubleClick = (segmentIndex: number, text: string) => {
    setEditingSegmentId(segmentIndex);
    setEditingText(text);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditingText(e.target.value);
  };

  const handleSaveEdit = (segmentIndex: number) => {
    // 現在のセグメントデータを取得
    const data = transcriptionDisplayData || transcriptionResult;
    if (!data || !data.segments) return;
    
    const currentSegment = data.segments[segmentIndex];
    const originalText = currentSegment?.text?.trim() || '';
    const newText = editingText.trim();
    
    // テキストが変更されている場合のみ編集済みとしてマーク
    if (newText !== originalText) {
      setModifiedSegments(prev => new Set(prev).add(segmentIndex));
      setEditedSegmentTexts(prev => new Map(prev).set(segmentIndex, newText));
      
      // transcriptionResultが存在する場合は更新
      if (transcriptionResult) {
        const updatedSegments = [...transcriptionResult.segments];
        updatedSegments[segmentIndex] = {
          ...updatedSegments[segmentIndex],
          text: newText,
          isEdited: true
        };
        
        setTranscriptionResult({
          ...transcriptionResult,
          segments: updatedSegments
        });
      }
    } else {
      // 変更がない場合は編集済みマークを削除
      setModifiedSegments(prev => {
        const newSet = new Set(prev);
        newSet.delete(segmentIndex);
        return newSet;
      });
      setEditedSegmentTexts(prev => {
        const newMap = new Map(prev);
        newMap.delete(segmentIndex);
        return newMap;
      });
    }
    
    // 編集モードを終了
    setEditingSegmentId(null);
    setEditingText('');
  };

  const handleCancelEdit = () => {
    setEditingSegmentId(null);
    setEditingText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, segmentIndex: number) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit(segmentIndex);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEdit();
    }
  };

  // 編集済み文字起こしを保存
  const handleSaveTranscription = async () => {
    const data = transcriptionDisplayData || transcriptionResult;
    if (!data || !selectedFile) return;

    try {
      // 編集済みセグメントの情報を含む文字起こしファイルを作成
      const updatedSegments = data.segments.map((segment: any, index: number) => ({
        ...segment,
        text: getSegmentDisplayText(segment, index),
        isEdited: modifiedSegments.has(index) || segment.isEdited || false
      }));

      const transcriptionFile = {
        metadata: {
          ...data.metadata,
          lastModified: new Date().toISOString(),
          hasEdits: modifiedSegments.size > 0
        },
        segments: updatedSegments,
        filePath: '',
        isModified: modifiedSegments.size > 0
      };

      await window.electronAPI.saveTranscriptionFile(selectedFile.filepath, transcriptionFile);
      console.log('編集済み文字起こしファイル保存完了');
      
      // 成功メッセージを表示（簡易的な通知）
      const notification = document.createElement('div');
      notification.textContent = '文字起こしが保存されました';
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--color-success);
        color: white;
        padding: 12px 20px;
        border-radius: 4px;
        z-index: 1000;
        font-size: 14px;
      `;
      document.body.appendChild(notification);
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 3000);
      
    } catch (error) {
      console.error('文字起こしファイル保存エラー:', error);
      alert('文字起こしの保存に失敗しました');
    }
  };

  // 文字起こし内容をクリップボードにコピー
  const handleCopyToClipboard = async () => {
    const data = transcriptionDisplayData || transcriptionResult;
    if (!data) return;

    try {
      const textContent = data.segments
        .map((segment: any, index: number) => getSegmentDisplayText(segment, index))
        .filter((text: string) => text.length > 0)
        .join('\n');
      
      await navigator.clipboard.writeText(textContent);
      
      // 成功メッセージを表示
      const notification = document.createElement('div');
      notification.textContent = 'クリップボードにコピーしました';
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: var(--color-accent);
        color: white;
        padding: 12px 20px;
        border-radius: 4px;
        z-index: 1000;
        font-size: 14px;
      `;
      document.body.appendChild(notification);
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 2000);
      
    } catch (error) {
      console.error('クリップボードコピーエラー:', error);
      alert('クリップボードへのコピーに失敗しました');
    }
  };

  // セグメントの表示テキストを取得（編集済みテキストを優先）
  const getSegmentDisplayText = (segment: any, index: number) => {
    return editedSegmentTexts.get(index) || segment.text?.trim() || '';
  };

  // 文字起こしデータをレンダリング
  const renderTranscriptionData = () => {
    // データ選択ロジック：
    // 1. 録音中かつリアルタイム文字起こし結果がある場合、transcriptionResultを優先
    // 2. 通常の文字起こしファイルから読み込んだ場合、transcriptionDisplayDataを優先
    // 3. フォールバック
    const data = (() => {
      // ファイルベースリアルタイム文字起こし中の場合（セグメントが0でも表示する）
      // transcriptionResultが存在し、かつ録音中またはリアルタイム処理中の場合
      if (transcriptionResult && 
          (selectedFile?.filepath.includes('recording_') || selectedFile?.isRecording || 
           transcriptionResult.created_at > Date.now() - 300000)) { // 5分以内の結果
        return transcriptionResult;
      }
      
      // 通常の文字起こしファイルから読み込んだ場合
      if (transcriptionDisplayData && transcriptionDisplayData.segments?.length > 0) {
        return transcriptionDisplayData;
      }
      
      // フォールバック（新しい文字起こし結果）
      if (transcriptionResult && transcriptionResult.segments?.length > 0) {
        return transcriptionResult;
      }
      return null;
    })();
    
    // データ選択ロジック (デバッグログ削除済み)
    if (!data) return (
      <>
        {/* ファイル名表示 */}
        <div style={{
          padding: 'var(--spacing-sm) var(--spacing-md)',
          marginBottom: 'var(--spacing-sm)',
          backgroundColor: 'var(--color-bg-secondary)',
          borderRadius: 'var(--border-radius)',
          border: '1px solid var(--color-border)'
        }}>
          <div style={{ 
            fontSize: 'var(--font-size-md)', 
            fontWeight: 'var(--font-weight-medium)',
            color: 'var(--color-text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-sm)'
          }}>
            📄 {selectedFile?.filename || 'ファイル未選択'}
          </div>
        </div>

        <div style={{
          padding: 'var(--spacing-xl)',
          textAlign: 'center',
          color: 'var(--color-text-secondary)',
          fontSize: 'var(--font-size-md)',
          lineHeight: '1.6'
        }}>
          <div style={{ marginBottom: 'var(--spacing-md)' }}>
            {(selectedFile?.isRecording || (transcriptionResult && transcriptionResult.created_at > Date.now() - 300000)) 
              ? '🎙️ 録音中...' : '📝 文字起こし結果がありません'}
          </div>
          <div style={{ fontSize: 'var(--font-size-sm)' }}>
            {(selectedFile?.isRecording || (transcriptionResult && transcriptionResult.created_at > Date.now() - 300000)) 
              ? 'リアルタイム文字起こし処理中です' : '音声ファイルを選択して音声認識を実行してください'}
          </div>
        </div>
      </>
    );

    // 新しい文字起こしファイル形式またはTranscriptionResult形式の場合
    if ((data.metadata && (data.content || data.segments)) || (data.segments && Array.isArray(data.segments))) {
      const segments = data.segments || data.content?.segments || [];
      
      return (
        <>
          {/* ファイル名表示 */}
          <div style={{
            padding: 'var(--spacing-sm) var(--spacing-md)',
            marginBottom: 'var(--spacing-sm)',
            backgroundColor: 'var(--color-bg-secondary)',
            borderRadius: 'var(--border-radius)',
            border: '1px solid var(--color-border)'
          }}>
            <div style={{ 
              fontSize: 'var(--font-size-md)', 
              fontWeight: 'var(--font-weight-medium)',
              color: 'var(--color-text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacing-sm)'
            }}>
              📄 {selectedFile?.filename || 'ファイル未選択'}
            </div>
          </div>

          {/* ボタンとメタデータ */}
          <div style={{
            padding: 'var(--spacing-md)',
            marginBottom: 'var(--spacing-md)',
            backgroundColor: 'var(--color-bg-tertiary)',
            borderRadius: 'var(--border-radius)',
            border: '1px solid var(--color-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 'var(--spacing-md)'
          }}>
            <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
              <button 
                className="btn btn--secondary" 
                style={{ fontSize: 'var(--font-size-sm)', padding: '4px 8px' }}
                onClick={handleSaveTranscription}
                disabled={modifiedSegments.size === 0}
                title={modifiedSegments.size > 0 ? '編集内容を保存' : '編集された内容がありません'}
              >
                💾 保存
              </button>
              <button 
                className="btn btn--secondary" 
                style={{ fontSize: 'var(--font-size-sm)', padding: '4px 8px' }}
                onClick={handleCopyToClipboard}
              >
                📋 コピー
              </button>
              {modifiedSegments.size > 0 && (
                <span style={{ 
                  fontSize: 'var(--font-size-xs)', 
                  color: 'var(--color-warning)',
                  alignSelf: 'center',
                  fontWeight: 'var(--font-weight-medium)'
                }}>
                  {modifiedSegments.size}件編集済み
                </span>
              )}
            </div>
            
            <div style={{ 
              fontSize: 'var(--font-size-sm)', 
              color: 'var(--color-text-secondary)'
            }}>
              モデル: {data.metadata?.model || 'リアルタイム文字起こし'} | 
              言語: {data.language || data.content?.language || data.metadata?.language || '日本語'} | 
              時間: {data.duration ? (data.duration / 1000).toFixed(1) : (data.metadata?.duration ? data.metadata.duration.toFixed(1) : '不明')}秒 | 
              セグメント: {segments.length}個 | 
              カバレッジ: {data.metadata?.coverage ? data.metadata.coverage.toFixed(1) : '不明'}%
            </div>
          </div>

          <div style={{
            flex: 1,
            backgroundColor: 'var(--color-bg-primary)',
            borderRadius: 'var(--border-radius)',
            border: '1px solid var(--color-border)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div 
              ref={transcriptionContainerRef}
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '0'
              }}>
              {segments.length === 0 ? (
                <div style={{
                  padding: 'var(--spacing-xl)',
                  textAlign: 'center',
                  color: 'var(--color-text-secondary)',
                  fontSize: 'var(--font-size-md)',
                  lineHeight: '1.6'
                }}>
                  <div style={{ marginBottom: 'var(--spacing-md)' }}>
                    {(selectedFile?.isRecording || (transcriptionResult && transcriptionResult.created_at > Date.now() - 300000)) 
                      ? '🎙️ 録音中...' : '📝 文字起こし結果がありません'}
                  </div>
                  <div style={{ fontSize: 'var(--font-size-sm)' }}>
                    {(selectedFile?.isRecording || (transcriptionResult && transcriptionResult.created_at > Date.now() - 300000)) 
                      ? 'リアルタイム文字起こし処理中です' : '音声ファイルを選択して音声認識を実行してください'}
                  </div>
                </div>
              ) : segments.map((segment: any, index: number) => (
                <div 
                  key={index}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    padding: 'var(--spacing-sm) 0',
                    borderBottom: index < segments.length - 1 ? '1px solid var(--color-border)' : 'none',
                    backgroundColor: index % 2 === 0 
                      ? 'var(--color-bg-secondary)' 
                      : 'transparent'
                  }}
                >
                  {/* 時間表示エリア（エディターの行数表示風） */}
                  <div style={{ 
                    width: '120px',
                    minWidth: '120px',
                    padding: '0 var(--spacing-md)',
                    fontSize: 'var(--font-size-sm)', 
                    color: 'var(--color-text-secondary)',
                    fontFamily: 'var(--font-family-mono)',
                    textAlign: 'right',
                    backgroundColor: 'var(--color-bg-tertiary)',
                    borderRight: '1px solid var(--color-border)',
                    lineHeight: '1.6',
                    userSelect: 'none'
                  }}>
                    {segment.start ? segment.start.toFixed(1) : '0.0'}s
                  </div>
                  
                  {/* テキスト表示エリア */}
                  <div style={{ 
                    flex: 1,
                    padding: '0 var(--spacing-md)',
                    fontSize: 'var(--font-size-md)',
                    color: 'var(--color-text-primary)',
                    lineHeight: '1.6',
                    cursor: 'text',
                    position: 'relative'
                  }}>
                    {editingSegmentId === index ? (
                      <textarea
                        value={editingText}
                        onChange={handleTextChange}
                        onKeyDown={(e) => handleKeyDown(e, index)}
                        onBlur={() => handleSaveEdit(index)}
                        autoFocus
                        style={{
                          width: '100%',
                          minHeight: '40px',
                          padding: '4px',
                          border: '1px solid var(--color-accent)',
                          borderRadius: '4px',
                          fontSize: 'var(--font-size-md)',
                          fontFamily: 'inherit',
                          lineHeight: '1.6',
                          backgroundColor: 'var(--color-bg-primary)',
                          color: 'var(--color-text-primary)',
                          resize: 'vertical'
                        }}
                      />
                    ) : (
                      <div
                        onDoubleClick={() => handleSegmentDoubleClick(index, getSegmentDisplayText(segment, index))}
                        style={{
                          minHeight: '24px',
                          padding: '4px',
                          borderRadius: '4px',
                          backgroundColor: modifiedSegments.has(index) 
                            ? 'rgba(255, 193, 7, 0.1)' 
                            : 'transparent',
                          border: modifiedSegments.has(index) 
                            ? '1px solid rgba(255, 193, 7, 0.3)' 
                            : '1px solid transparent',
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          position: 'relative'
                        }}
                        onMouseEnter={(e) => {
                          if (!modifiedSegments.has(index)) {
                            e.currentTarget.style.backgroundColor = 'rgba(0, 123, 255, 0.05)';
                            e.currentTarget.style.border = '1px solid rgba(0, 123, 255, 0.2)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!modifiedSegments.has(index)) {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.border = '1px solid transparent';
                          }
                        }}
                        title="ダブルクリックで編集"
                      >
                        {getSegmentDisplayText(segment, index)}
                        {modifiedSegments.has(index) && (
                          <span style={{
                            position: 'absolute',
                            top: '-2px',
                            right: '-2px',
                            fontSize: '10px',
                            backgroundColor: 'var(--color-warning)',
                            color: 'white',
                            borderRadius: '50%',
                            width: '16px',
                            height: '16px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 'bold'
                          }}>
                            ✎
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      );
    }

    // 従来の音声認識結果形式の場合
    return (
      <>
        {/* ファイル名表示 */}
        <div style={{
          padding: 'var(--spacing-sm) var(--spacing-md)',
          marginBottom: 'var(--spacing-sm)',
          backgroundColor: 'var(--color-bg-secondary)',
          borderRadius: 'var(--border-radius)',
          border: '1px solid var(--color-border)'
        }}>
          <div style={{ 
            fontSize: 'var(--font-size-md)', 
            fontWeight: 'var(--font-weight-medium)',
            color: 'var(--color-text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-sm)'
          }}>
            📄 {selectedFile?.filename || 'ファイル未選択'}
          </div>
        </div>

        {/* ボタンとメタデータ */}
        <div style={{
          padding: 'var(--spacing-md)',
          marginBottom: 'var(--spacing-md)',
          backgroundColor: 'var(--color-bg-tertiary)',
          borderRadius: 'var(--border-radius)',
          border: '1px solid var(--color-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--spacing-md)'
        }}>
          <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
            <button 
              className="btn btn--secondary" 
              style={{ fontSize: 'var(--font-size-sm)', padding: '4px 8px' }}
              onClick={handleSaveTranscription}
              disabled={modifiedSegments.size === 0}
              title={modifiedSegments.size > 0 ? '編集内容を保存' : '編集された内容がありません'}
            >
              💾 保存
            </button>
            <button 
              className="btn btn--secondary" 
              style={{ fontSize: 'var(--font-size-sm)', padding: '4px 8px' }}
              onClick={handleCopyToClipboard}
            >
              📋 コピー
            </button>
            {modifiedSegments.size > 0 && (
              <span style={{ 
                fontSize: 'var(--font-size-xs)', 
                color: 'var(--color-warning)',
                alignSelf: 'center',
                fontWeight: 'var(--font-weight-medium)'
              }}>
                {modifiedSegments.size}件編集済み
              </span>
            )}
          </div>
          
          <div style={{ 
            fontSize: 'var(--font-size-sm)', 
            color: 'var(--color-text-secondary)'
          }}>
            言語: {data.language} | 
            時間: {data.duration ? data.duration.toFixed(1) : '不明'}秒 | 
            セグメント: {data.segment_count || 0}個
          </div>
        </div>

        <div style={{
          flex: 1,
          backgroundColor: 'var(--color-bg-primary)',
          borderRadius: 'var(--border-radius)',
          border: '1px solid var(--color-border)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div 
            ref={transcriptionContainerRef}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '0'
            }}>
            {(data.segments || []).map((segment: any, index: number) => (
              <div 
                key={index}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  padding: 'var(--spacing-sm) 0',
                  borderBottom: index < (data.segments || []).length - 1 ? '1px solid var(--color-border)' : 'none',
                  backgroundColor: index % 2 === 0 
                    ? 'var(--color-bg-secondary)' 
                    : 'transparent'
                }}
              >
                {/* 時間表示エリア（エディターの行数表示風） */}
                <div style={{ 
                  width: '120px',
                  minWidth: '120px',
                  padding: '0 var(--spacing-md)',
                  fontSize: 'var(--font-size-sm)', 
                  color: 'var(--color-text-secondary)',
                  fontFamily: 'var(--font-family-mono)',
                  textAlign: 'right',
                  backgroundColor: 'var(--color-bg-tertiary)',
                  borderRight: '1px solid var(--color-border)',
                  lineHeight: '1.6',
                  userSelect: 'none'
                }}>
                  {segment.start ? segment.start.toFixed(1) : '0.0'}s
                </div>
                
                {/* テキスト表示エリア */}
                <div style={{ 
                  flex: 1,
                  padding: '0 var(--spacing-md)',
                  fontSize: 'var(--font-size-md)',
                  color: 'var(--color-text-primary)',
                  lineHeight: '1.6',
                  cursor: 'text',
                  position: 'relative'
                }}>
                  {editingSegmentId === index ? (
                    <textarea
                      value={editingText}
                      onChange={handleTextChange}
                      onKeyDown={(e) => handleKeyDown(e, index)}
                      onBlur={() => handleSaveEdit(index)}
                      autoFocus
                      style={{
                        width: '100%',
                        minHeight: '40px',
                        padding: '4px',
                        border: '1px solid var(--color-accent)',
                        borderRadius: '4px',
                        fontSize: 'var(--font-size-md)',
                        fontFamily: 'inherit',
                        lineHeight: '1.6',
                        backgroundColor: 'var(--color-bg-primary)',
                        color: 'var(--color-text-primary)',
                        resize: 'vertical'
                      }}
                    />
                  ) : (
                    <div
                      onDoubleClick={() => handleSegmentDoubleClick(index, getSegmentDisplayText(segment, index))}
                      style={{
                        minHeight: '24px',
                        padding: '4px',
                        borderRadius: '4px',
                        backgroundColor: modifiedSegments.has(index) 
                          ? 'rgba(255, 193, 7, 0.1)' 
                          : 'transparent',
                        border: modifiedSegments.has(index) 
                          ? '1px solid rgba(255, 193, 7, 0.3)' 
                          : '1px solid transparent',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        position: 'relative'
                      }}
                      onMouseEnter={(e) => {
                        if (!modifiedSegments.has(index)) {
                          e.currentTarget.style.backgroundColor = 'rgba(0, 123, 255, 0.05)';
                          e.currentTarget.style.border = '1px solid rgba(0, 123, 255, 0.2)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!modifiedSegments.has(index)) {
                          e.currentTarget.style.backgroundColor = 'transparent';
                          e.currentTarget.style.border = '1px solid transparent';
                        }
                      }}
                      title="ダブルクリックで編集"
                    >
                      {getSegmentDisplayText(segment, index)}
                      {modifiedSegments.has(index) && (
                        <span style={{
                          position: 'absolute',
                          top: '-2px',
                          right: '-2px',
                          fontSize: '10px',
                          backgroundColor: 'var(--color-warning)',
                          color: 'white',
                          borderRadius: '50%',
                          width: '16px',
                          height: '16px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 'bold'
                        }}>
                          ✎
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </>
    );
  };

  // コンポーネントレンダリング (デバッグログ削除済み)
  
  return (
    <div style={{ 
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* チャンク分割文字起こし表示 */}
      {showChunkDisplay && !selectedFile?.filepath.includes('recording_') && (
        <ChunkTranscriptionDisplay
          audioFileName={selectedFile?.filename || ''}
          chunkSize={chunkSettings.chunkSize}
          overlapSize={chunkSettings.overlapSize}
          autoScroll={chunkSettings.autoScroll}
        />
      )}
      
      {/* 通常の文字起こし表示（録音中ファイルの場合は常に表示） */}
      {(!showChunkDisplay || selectedFile?.filepath.includes('recording_')) && renderTranscriptionData()}
    </div>
  );
};

export default SpeechRecognition;