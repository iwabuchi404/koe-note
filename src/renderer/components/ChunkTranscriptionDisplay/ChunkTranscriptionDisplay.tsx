import React, { useState, useEffect } from 'react';
import { TranscriptionSegment } from '../../../preload/preload';
import { useAppContext } from '../../App';

interface ChunkTranscriptionDisplayProps {
  audioFileName: string;
  chunkSize: number;
  overlapSize: number;
  autoScroll: boolean;
}

interface ChunkSegment {
  chunkId: string;
  sequenceNumber: number;
  status: 'waiting' | 'processing' | 'completed' | 'failed';
  startTime: number;
  endTime: number;
  segments: TranscriptionSegment[];
  processingTime?: number;
  error?: string;
}

/**
 * チャンク分割文字起こしのリアルタイム表示コンポーネント
 * 
 * 各チャンクの処理状況をリアルタイムで表示し、
 * 完了したチャンクから順次文字起こし結果を表示する
 */
const ChunkTranscriptionDisplay: React.FC<ChunkTranscriptionDisplayProps> = ({
  audioFileName,
  chunkSize,
  overlapSize,
  autoScroll
}) => {
  const { setTranscriptionDisplayData } = useAppContext();
  const [chunkSegments, setChunkSegments] = useState<ChunkSegment[]>([]);
  const [totalChunks, setTotalChunks] = useState(0);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [processingStats, setProcessingStats] = useState({
    averageTime: 0,
    estimatedRemaining: 0,
    failedCount: 0
  });

  // チャンク分割文字起こし開始イベントのリスナー
  useEffect(() => {
    const handleChunkTranscriptionStart = (event: any) => {
      const { totalChunks: total, chunkSize: size } = event.detail;
      console.log('チャンク分割文字起こし開始:', total, 'チャンク');
      
      setTotalChunks(total);
      setIsTranscribing(true);
      
      // 初期チャンクセグメントを作成
      const initialChunks: ChunkSegment[] = [];
      for (let i = 0; i < total; i++) {
        initialChunks.push({
          chunkId: `chunk_${i}`,
          sequenceNumber: i,
          status: 'waiting',
          startTime: i * (size - overlapSize),
          endTime: (i + 1) * (size - overlapSize) + overlapSize,
          segments: []
        });
      }
      
      setChunkSegments(initialChunks);
    };

    window.addEventListener('chunkTranscriptionStart', handleChunkTranscriptionStart);
    
    return () => {
      window.removeEventListener('chunkTranscriptionStart', handleChunkTranscriptionStart);
    };
  }, [chunkSize, overlapSize]);

  // チャンク完了イベントのリスナー
  useEffect(() => {
    const handleChunkCompleted = (event: any) => {
      const { chunkId, segments, status, error, processingTime } = event.detail;
      console.log('チャンク完了:', chunkId, status, segments?.length || 0, 'セグメント');
      
      setChunkSegments(prev => 
        prev.map(chunk => 
          chunk.chunkId === chunkId 
            ? { ...chunk, status: status || 'completed', segments: segments || [], processingTime, error }
            : chunk
        )
      );
      
      // 統計を更新
      setProcessingStats(prev => ({
        ...prev,
        failedCount: status === 'failed' ? prev.failedCount + 1 : prev.failedCount,
        averageTime: processingTime ? (prev.averageTime + processingTime) / 2 : prev.averageTime
      }));
      
      // 自動スクロール
      if (autoScroll) {
        setTimeout(() => {
          const element = document.getElementById(`chunk-${chunkId}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        }, 100);
      }
    };

    window.addEventListener('chunkTranscriptionCompleted', handleChunkCompleted);
    
    return () => {
      window.removeEventListener('chunkTranscriptionCompleted', handleChunkCompleted);
    };
  }, [autoScroll]);

  // チャンク分割文字起こし完了イベントのリスナー
  useEffect(() => {
    const handleChunkTranscriptionComplete = (event: any) => {
      const consolidatedResult = event.detail;
      console.log('チャンク分割文字起こし完了:', consolidatedResult);
      
      setIsTranscribing(false);
      
      // 統合結果をメイン表示に反映
      setTranscriptionDisplayData(consolidatedResult);
    };

    window.addEventListener('chunkTranscriptionComplete', handleChunkTranscriptionComplete);
    
    return () => {
      window.removeEventListener('chunkTranscriptionComplete', handleChunkTranscriptionComplete);
    };
  }, [setTranscriptionDisplayData]);

  // 時間フォーマット関数
  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // ファイル名短縮表示関数
  const truncateFileName = (fileName: string, maxLength: number = 50): string => {
    if (fileName.length <= maxLength) return fileName;
    
    // 拡張子を保持して短縮
    const lastDotIndex = fileName.lastIndexOf('.');
    if (lastDotIndex > 0) {
      const nameWithoutExt = fileName.substring(0, lastDotIndex);
      const extension = fileName.substring(lastDotIndex);
      const truncatedName = nameWithoutExt.substring(0, maxLength - extension.length - 3) + '...';
      return truncatedName + extension;
    }
    
    return fileName.substring(0, maxLength - 3) + '...';
  };

  if (!isTranscribing && chunkSegments.length === 0) {
    return null;
  }

  return (
    <div style={{
      padding: 'var(--spacing-md)',
      backgroundColor: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--border-radius)',
      marginTop: 'var(--spacing-md)'
    }}>
      {/* ヘッダー */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 'var(--spacing-md)',
        paddingBottom: 'var(--spacing-sm)',
        borderBottom: '1px solid var(--color-border)'
      }}>
        <div style={{
          fontSize: 'var(--font-size-md)',
          fontWeight: 'var(--font-weight-medium)',
          color: 'var(--color-text-primary)',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span>⚡ チャンク分割処理中</span>
            {audioFileName.includes('recording_') && (
              <span style={{ 
                fontSize: 'var(--font-size-xs)', 
                color: 'var(--color-warning)',
                backgroundColor: 'rgba(255, 204, 2, 0.1)',
                padding: '2px 6px',
                borderRadius: '4px',
                border: '1px solid var(--color-warning)'
              }}>
                録音中
              </span>
            )}
          </div>
          <div style={{
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-secondary)',
            fontWeight: 'normal',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}>
            ファイル: {truncateFileName(audioFileName, 45)}
          </div>
        </div>
        <div style={{
          fontSize: 'var(--font-size-sm)',
          color: 'var(--color-text-secondary)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '2px',
          minWidth: '120px'
        }}>
          <div style={{
            fontWeight: 'var(--font-weight-medium)',
            color: 'var(--color-text-primary)'
          }}>
            {chunkSegments.filter(c => c.status === 'completed').length} / {totalChunks} 完了
          </div>
          {processingStats.failedCount > 0 && (
            <div style={{ color: 'var(--color-error)', fontSize: 'var(--font-size-xs)' }}>
              失敗: {processingStats.failedCount}個
            </div>
          )}
          {processingStats.averageTime > 0 && (
            <div style={{ fontSize: 'var(--font-size-xs)' }}>
              平均: {(processingStats.averageTime / 1000).toFixed(1)}秒
            </div>
          )}
          {audioFileName.includes('recording_') && (
            <div style={{ 
              fontSize: 'var(--font-size-xs)', 
              color: 'var(--color-warning)',
              fontWeight: 'var(--font-weight-medium)'
            }}>
              リアルタイム処理中
            </div>
          )}
        </div>
      </div>

      {/* チャンク一覧 */}
      <div style={{
        maxHeight: '400px',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-sm)'
      }}>
        {chunkSegments.map((chunk) => (
          <div
            key={chunk.chunkId}
            id={`chunk-${chunk.chunkId}`}
            style={{
              padding: 'var(--spacing-sm)',
              backgroundColor: 'var(--color-bg-primary)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--border-radius)',
              opacity: chunk.status === 'waiting' ? 0.6 : 1,
              position: 'relative'
            }}
          >
            {/* チャンクヘッダー */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: chunk.segments.length > 0 ? 'var(--spacing-sm)' : 0
            }}>
              <div style={{
                fontSize: 'var(--font-size-sm)',
                fontWeight: 'var(--font-weight-medium)',
                color: 'var(--color-text-primary)'
              }}>
                チャンク {chunk.sequenceNumber + 1} ({formatTime(chunk.startTime)} - {formatTime(chunk.endTime)})
              </div>
              <div style={{
                fontSize: 'var(--font-size-xs)',
                color: chunk.status === 'completed' ? 'var(--color-success)' : 
                       chunk.status === 'processing' ? 'var(--color-warning)' : 
                       chunk.status === 'failed' ? 'var(--color-error)' : 'var(--color-text-secondary)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: '2px'
              }}>
                <div>
                  {chunk.status === 'waiting' && '⏳ 待機中'}
                  {chunk.status === 'processing' && '🔄 処理中'}
                  {chunk.status === 'completed' && '✅ 完了'}
                  {chunk.status === 'failed' && '❌ 失敗'}
                </div>
                {chunk.processingTime && chunk.status === 'completed' && (
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                    {(chunk.processingTime / 1000).toFixed(1)}秒
                  </div>
                )}
              </div>
            </div>

            {/* 処理中アニメーション */}
            {chunk.status === 'processing' && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '2px',
                backgroundColor: 'var(--color-warning)',
                animation: 'pulse 1.5s ease-in-out infinite'
              }} />
            )}

            {/* チャンク内容 */}
            {chunk.segments.length > 0 && (
              <div style={{
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-primary)',
                lineHeight: '1.5',
                padding: 'var(--spacing-sm)',
                backgroundColor: 'var(--color-bg-tertiary)',
                borderRadius: 'var(--border-radius)',
                border: '1px solid var(--color-border)'
              }}>
                {chunk.segments.map((segment, index) => (
                  <span key={index} style={{ marginRight: '4px' }}>
                    {segment.text}
                  </span>
                ))}
              </div>
            )}

            {/* エラー表示 */}
            {chunk.status === 'failed' && chunk.error && (
              <div style={{
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-error)',
                marginTop: 'var(--spacing-sm)',
                padding: 'var(--spacing-sm)',
                backgroundColor: 'rgba(244, 71, 71, 0.1)',
                borderRadius: 'var(--border-radius)',
                border: '1px solid var(--color-error)'
              }}>
                エラー: {chunk.error}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* フッター */}
      <div style={{
        marginTop: 'var(--spacing-md)',
        paddingTop: 'var(--spacing-sm)',
        borderTop: '1px solid var(--color-border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div style={{
          fontSize: 'var(--font-size-xs)',
          color: 'var(--color-text-secondary)'
        }}>
          チャンクサイズ: {chunkSize}秒, オーバーラップ: {overlapSize}秒
          {audioFileName.includes('recording_') && (
            <span style={{ 
              marginLeft: '8px', 
              color: 'var(--color-warning)',
              fontWeight: 'var(--font-weight-medium)'
            }}>
              (録音中のリアルタイム処理)
            </span>
          )}
        </div>
        <div style={{
          fontSize: 'var(--font-size-xs)',
          color: 'var(--color-text-secondary)'
        }}>
          {isTranscribing ? '処理中...' : '処理完了'}
        </div>
      </div>
    </div>
  );
};

export default ChunkTranscriptionDisplay;