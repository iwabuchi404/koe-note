/**
 * TranscriptionExporter - 文字起こし結果のエクスポート機能コンポーネント
 * 
 * 責務:
 * - ファイル保存機能
 * - 各種フォーマットでのエクスポート
 * - 保存状態の管理
 */

import React, { useState } from 'react'
import { TranscriptionResult, AudioFile } from '../../../../preload/preload'
import FileFormatSelector from './FileFormatSelector'

interface TranscriptionExporterProps {
  transcriptionResult: TranscriptionResult | null
  selectedFile: AudioFile | null
  currentModel: string
}

export type ExportFormat = 'json' | 'txt' | 'csv' | 'srt'

const TranscriptionExporter: React.FC<TranscriptionExporterProps> = ({
  transcriptionResult,
  selectedFile,
  currentModel
}) => {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('json')
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')

  // 自動保存処理
  const handleAutoSave = async () => {
    if (!transcriptionResult || !selectedFile) return

    setIsSaving(true)
    setSaveStatus('idle')

    try {
      const coverage = transcriptionResult.segments.reduce((acc: number, segment: any) => 
        acc + (segment.text ? segment.text.length : 0), 0)
      const totalExpectedLength = transcriptionResult.duration * 10
      const calculatedCoverage = Math.min((coverage / totalExpectedLength) * 100, 100)
      
      const transcriptionFile = {
        metadata: {
          audioFile: selectedFile.filename || '',
          model: currentModel,
          transcribedAt: new Date().toISOString(),
          duration: transcriptionResult.duration,
          segmentCount: transcriptionResult.segments.length,
          language: transcriptionResult.language,
          speakers: [],
          coverage: calculatedCoverage
        },
        segments: transcriptionResult.segments.map((segment: any) => ({
          start: segment.start,
          end: segment.end,
          text: segment.text,
          speaker: undefined,
          isEdited: false
        })),
        filePath: '',
        isModified: false
      }
      
      await window.electronAPI.saveTranscriptionFile(selectedFile.filepath, transcriptionFile)
      setSaveStatus('success')
      
      // 成功メッセージを一定時間後にクリア
      setTimeout(() => setSaveStatus('idle'), 3000)
      
    } catch (error) {
      console.error('自動保存エラー:', error)
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 5000)
    } finally {
      setIsSaving(false)
    }
  }

  // 手動エクスポート処理
  const handleManualExport = async () => {
    if (!transcriptionResult || !selectedFile) return

    setIsSaving(true)
    setSaveStatus('idle')

    try {
      // フォーマット別のエクスポート処理
      switch (selectedFormat) {
        case 'json':
          await handleAutoSave() // JSONは標準の自動保存と同じ
          break
        case 'txt':
          await exportAsText()
          break
        case 'csv':
          await exportAsCSV()
          break
        case 'srt':
          await exportAsSRT()
          break
      }
      
      setSaveStatus('success')
      setTimeout(() => setSaveStatus('idle'), 3000)
      
    } catch (error) {
      console.error('エクスポートエラー:', error)
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 5000)
    } finally {
      setIsSaving(false)
    }
  }

  // テキストフォーマットでエクスポート
  const exportAsText = async () => {
    if (!transcriptionResult || !selectedFile) return

    const textContent = transcriptionResult.segments
      .map(segment => segment.text)
      .join('\n')
    
    const buffer = new TextEncoder().encode(textContent)
    const exportPath = selectedFile.filepath.replace(/\.[^/.]+$/, '.txt')
    await window.electronAPI.saveFile(buffer, exportPath)
  }

  // CSVフォーマットでエクスポート
  const exportAsCSV = async () => {
    if (!transcriptionResult || !selectedFile) return

    const csvContent = [
      'Start,End,Text',
      ...transcriptionResult.segments.map(segment => 
        `${segment.start},${segment.end},"${(segment.text || '').replace(/"/g, '""')}"`
      )
    ].join('\n')
    
    const buffer = new TextEncoder().encode(csvContent)
    const exportPath = selectedFile.filepath.replace(/\.[^/.]+$/, '.csv')
    await window.electronAPI.saveFile(buffer, exportPath)
  }

  // SRTフォーマットでエクスポート
  const exportAsSRT = async () => {
    if (!transcriptionResult || !selectedFile) return

    const srtContent = transcriptionResult.segments
      .map((segment, index) => {
        const formatTime = (seconds: number) => {
          const hours = Math.floor(seconds / 3600)
          const minutes = Math.floor((seconds % 3600) / 60)
          const secs = Math.floor(seconds % 60)
          const ms = Math.floor((seconds % 1) * 1000)
          return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`
        }

        return [
          index + 1,
          `${formatTime(segment.start)} --> ${formatTime(segment.end)}`,
          segment.text,
          ''
        ].join('\n')
      })
      .join('\n')
    
    const buffer = new TextEncoder().encode(srtContent)
    const exportPath = selectedFile.filepath.replace(/\.[^/.]+$/, '.srt')
    await window.electronAPI.saveFile(buffer, exportPath)
  }

  // 保存可能かどうかの判定
  const canSave = transcriptionResult && selectedFile && !isSaving

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--spacing-md)',
      padding: 'var(--spacing-sm) var(--spacing-md)',
      backgroundColor: 'var(--color-bg-secondary)',
      borderTop: '1px solid var(--color-border)'
    }}>
      {/* フォーマット選択 */}
      <FileFormatSelector
        selectedFormat={selectedFormat}
        onFormatChange={setSelectedFormat}
      />

      {/* エクスポートボタン */}
      <button
        onClick={handleManualExport}
        disabled={!canSave}
        style={{
          padding: '6px 12px',
          fontSize: 'var(--font-size-sm)',
          backgroundColor: canSave ? 'var(--color-accent)' : 'var(--color-bg-tertiary)',
          border: 'none',
          borderRadius: '4px',
          color: canSave ? 'white' : 'var(--color-text-secondary)',
          cursor: canSave ? 'pointer' : 'not-allowed',
          transition: 'all 0.2s ease'
        }}
        title={`${selectedFormat.toUpperCase()}形式でエクスポート`}
      >
        {isSaving ? '保存中...' : 'エクスポート'}
      </button>

      {/* 自動保存ボタン */}
      <button
        onClick={handleAutoSave}
        disabled={!canSave}
        style={{
          padding: '6px 12px',
          fontSize: 'var(--font-size-sm)',
          backgroundColor: 'transparent',
          border: '1px solid var(--color-border)',
          borderRadius: '4px',
          color: 'var(--color-text-primary)',
          cursor: canSave ? 'pointer' : 'not-allowed',
          transition: 'all 0.2s ease'
        }}
        title="JSON形式で自動保存"
      >
        自動保存
      </button>

      {/* 保存状態表示 */}
      {saveStatus !== 'idle' && (
        <div style={{
          fontSize: 'var(--font-size-sm)',
          color: saveStatus === 'success' ? 'var(--color-success)' : 'var(--color-error)',
          fontWeight: 'bold'
        }}>
          {saveStatus === 'success' ? '保存完了' : '保存エラー'}
        </div>
      )}
    </div>
  )
}

export default TranscriptionExporter