import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useAppContext } from '../../App'
import { MicrophoneMonitor, MicrophoneStatus, MicrophoneAlert } from '../../services/MicrophoneMonitor'
import { AudioMixingService, MixingConfig, AudioLevels } from '../../services/AudioMixingService'
import { TrueDifferentialChunkGenerator, TrueDifferentialResult } from '../../services/TrueDifferentialChunkGenerator'
import { FileBasedRealtimeProcessor } from '../../services/FileBasedRealtimeProcessor' 
/**
 * 下部パネル - コントロールパネル
 * 録音・再生・文字起こし等の主要操作を提供
 */

// テスト用: リアルタイム文字起こし強制有効化フラグ
const FORCE_ENABLE_REALTIME_TRANSCRIPTION = true;

const BottomPanel: React.FC = () => {
  // ファイルリストを更新するための関数を取得
  const { setFileList, setIsRecording: setGlobalIsRecording, setRecordingFile, setSelectedFile } = useAppContext()
  // 録音関連状態
  const [isRecording, setIsRecording] = useState<boolean>(false)
  const [isPaused, setIsPaused] = useState<boolean>(false)
  const [recordingTime, setRecordingTime] = useState<number>(0)
  
  // デバイス関連状態
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedDevice, setSelectedDevice] = useState<string>('')
  const [inputType, setInputType] = useState<'microphone' | 'desktop' | 'stereo-mix' | 'mixing'>('microphone')
  
  // デスクトップキャプチャ関連状態
  const [desktopSources, setDesktopSources] = useState<any[]>([])
  const [selectedDesktopSource, setSelectedDesktopSource] = useState<string>('')
  
  // ステレオミックス関連状態
  const [systemAudioDevices, setSystemAudioDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedSystemDevice, setSelectedSystemDevice] = useState<string>('')
  
  
  // マイク監視状態
  const [micStatus, setMicStatus] = useState<MicrophoneStatus | null>(null)
  const [micAlerts, setMicAlerts] = useState<MicrophoneAlert[]>([])
  
  // ミキシング関連状態
  const [mixingConfig, setMixingConfig] = useState<MixingConfig>({
    enableMicrophone: true,
    enableDesktop: true,
    microphoneGain: 0.7,
    desktopGain: 0.8
  })
  const [audioLevels, setAudioLevels] = useState<AudioLevels>({
    microphoneLevel: 0,
    desktopLevel: 0,
    mixedLevel: 0
  })
  
  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioMixingServiceRef = useRef<AudioMixingService | null>(null)
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null)
  const recordingStartTimeRef = useRef<number>(0)
  const pausedTimeRef = useRef<number>(0) // 一時停止時間の累計
  const micMonitorRef = useRef<MicrophoneMonitor | null>(null)
  // const realtimeProcessingIntervalRef = useRef<number | null>(null)
  const realtimeProcessingIntervalRef = useRef<number | null>(null); 
  const trueDiffGeneratorRef = useRef<TrueDifferentialChunkGenerator | null>(null)
  const realtimeProcessorRef = useRef<FileBasedRealtimeProcessor | null>(null)
  
  // HTMLAudioElementを使って正確なdurationを取得する関数
  const getAccurateDuration = (blob: Blob): Promise<number> => {
    return new Promise((resolve, reject) => {
      const audio = new Audio()
      const url = URL.createObjectURL(blob)
      
      const cleanup = () => {
        URL.revokeObjectURL(url)
        audio.remove()
      }

      audio.src = url
      audio.addEventListener('loadedmetadata', () => {
        const duration = audio.duration
        if (isFinite(duration)) {
          cleanup()
          resolve(duration)
        } else {
          // durationがInfinityの場合のフォールバック処理
          audio.currentTime = 1e101 // 末尾にシークして強制的に読み込ませる
          const onTimeUpdate = () => {
            audio.removeEventListener('timeupdate', onTimeUpdate)
            cleanup()
            resolve(audio.duration)
          }
          audio.addEventListener('timeupdate', onTimeUpdate)
        }
      })
      audio.onerror = (e) => {
        cleanup()
        reject(new Error('音声メタデータの読み込みに失敗しました'))
      }
    })
  }
  
  // デバイス一覧を取得
  useEffect(() => {
    const getDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const audioInputs = devices.filter(device => device.kind === 'audioinput')
        setAvailableDevices(audioInputs)
        
        // システム音声・仮想音声デバイスを分離して取得
        const systemDevices = audioInputs.filter(device => 
          device.label.toLowerCase().includes('stereo mix') ||
          device.label.toLowerCase().includes('what you hear') ||
          device.label.toLowerCase().includes('system audio') ||
          device.label.toLowerCase().includes('ステレオミックス') ||
          device.label.toLowerCase().includes('voicemeeter') ||
          device.label.toLowerCase().includes('virtual audio') ||
          device.label.toLowerCase().includes('vac') ||
          device.label.toLowerCase().includes('virtual cable')
        )
        setSystemAudioDevices(systemDevices)
        
        console.log('🎵 検出された仮想音声デバイス:', systemDevices.map(d => d.label))
        
        if (audioInputs.length > 0 && !selectedDevice) {
          setSelectedDevice(audioInputs[0].deviceId)
        }
        
        if (systemDevices.length > 0 && !selectedSystemDevice) {
          setSelectedSystemDevice(systemDevices[0].deviceId)
        }
      } catch (error) {
        console.error('デバイス取得エラー:', error)
      }
    }
    getDevices()
  }, [selectedDevice, selectedSystemDevice])
  
  // デスクトップキャプチャソース一覧を取得
  useEffect(() => {
    if (inputType === 'desktop' || inputType === 'mixing') {
      const getDesktopSources = async () => {
        try {
          const sources = await window.electronAPI.getDesktopSources()
          setDesktopSources(sources)
          
          // Step 7: デスクトップソース詳細ログと改善された選択ロジック
          console.log('🔍 デスクトップソース詳細分析:');
          sources.forEach((source, index) => {
            console.log(`  ${index}: ID="${source.id}", Name="${source.name}"`);
          });
          
          // スクリーンソース優先選択（screen: で始まるもの）
          const screenSources = sources.filter(source => source.id.startsWith('screen:'));
          console.log('🖥️ スクリーンソース候補:', screenSources.map(s => ({ id: s.id, name: s.name })));
          
          // 最優先: メインスクリーンを特定（英語・日本語両対応）
          let selectedSource = screenSources.find(source => {
            const name = source.name.toLowerCase();
            return name.includes('entire screen') || 
                   name.includes('全画面');
          });
          
          // フォールバック: プライマリディスプレイを選択（通常はscreen:0:0）
          if (!selectedSource) {
            selectedSource = screenSources.find(source => source.id === 'screen:0:0');
          }
          
          // フォールバック: 任意のスクリーンソース
          if (!selectedSource && screenSources.length > 0) {
            selectedSource = screenSources[0];
          }
          
          // 最終フォールバック: Screen名や画面名を含むソース（日本語・英語両対応）
          if (!selectedSource) {
            selectedSource = sources.find(source => {
              const name = source.name.toLowerCase();
              return (name.includes('screen') || source.name.includes('画面')) && 
                     !source.id.startsWith('window:');
            });
          }
          
          if (selectedSource && selectedSource.id !== selectedDesktopSource) {
            console.log('✅ 選択されたデスクトップソース:', selectedSource);
            setSelectedDesktopSource(selectedSource.id);
          } else if (!selectedSource) {
            console.warn('⚠️ 適切なスクリーンソースが見つかりません');
            console.warn('利用可能なソース:', sources.map(s => s.name));
          }
        } catch (error) {
          console.error('デスクトップソース取得エラー:', error)
        }
      }
      getDesktopSources()
    }
  }, [inputType]) // selectedDesktopSourceを依存から除去して無限ループを防ぐ
  
  
  // 録音時間を更新（display:noneでも動作するように修正）
  useEffect(() => {
    if (isRecording && !isPaused) {
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1)
      }, 1000)
    } else {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
        recordingTimerRef.current = null
      }
    }
    
    return () => {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current)
        recordingTimerRef.current = null
      }
    }
  }, [isRecording, isPaused])
  
  // 時間をフォーマット
  const formatTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }, [])

  // コンポーネントアンマウント時のクリーンアップ
  // 入力タイプが変更された際のクリーンアップ
  useEffect(() => {
    // 入力タイプが変更された場合、既存のマイクモニタリングを停止
    if (inputType !== 'microphone' && micMonitorRef.current) {
      console.log('🎤 入力タイプ変更によりマイクモニタリングを停止:', inputType)
      try {
        micMonitorRef.current.stopMonitoring()
        micMonitorRef.current = null
        setMicStatus(null)
        setMicAlerts([])
      } catch (error) {
        console.error('マイクモニタリング停止エラー:', error)
      }
    }
  }, [inputType])

  // コンポーネントアンマウント時のクリーンアップ
  useEffect(() => {
    return () => {
      // マイク監視のクリーンアップ
      if (micMonitorRef.current) {
        micMonitorRef.current.cleanup()
        micMonitorRef.current = null
      }
      
    }
  }, [])

  
  // 録音開始ハンドラー
  const handleStartRecordingWithTranscription = useCallback(async () => {
    await startRecording(true);
  }, [inputType, selectedDevice, selectedDesktopSource, selectedSystemDevice]);

  const handleStartRecordingOnly = useCallback(async () => {
    await startRecording(false);
  }, [inputType, selectedDevice, selectedDesktopSource, selectedSystemDevice]);

  // 録音状態リセット共通関数
  const resetRecordingState = useCallback(() => {
    setIsRecording(false)
    setGlobalIsRecording(false)
    setIsPaused(false)
    setRecordingTime(0)
  }, [setGlobalIsRecording]);

  // 録音処理の共通関数
  const startRecording = useCallback(async (enableTranscription: boolean) => {
    console.log(`🚨🚨🚨 startRecording関数開始 - enableTranscription=${enableTranscription} 🚨🚨🚨`)
    try {
      let stream: MediaStream
      
      if (inputType === 'mixing') {
        // ミキシングモード
        console.log('🎛️ ミキシングモード録音開始', mixingConfig);
        
        if (!audioMixingServiceRef.current) {
          audioMixingServiceRef.current = new AudioMixingService();
        }
        
        // 音声レベル更新コールバック設定
        audioMixingServiceRef.current.setLevelsUpdateCallback((levels: AudioLevels) => {
          setAudioLevels(levels);
        });
        
        // ミキシング設定更新
        const config: MixingConfig = {
          ...mixingConfig,
          microphoneDeviceId: selectedDevice || undefined,
          desktopSourceId: selectedDesktopSource || undefined
        };
        
        // ミキシングストリーム作成
        stream = await audioMixingServiceRef.current.createMixedStream(config);
        console.log('✅ ミキシングストリーム作成完了');
      } else if (inputType === 'desktop') {
        if (!selectedDesktopSource) {
          throw new Error('デスクトップソースが選択されていません');
        }
        
        try {
          console.log('🎬 Windowsデスクトップ音声録音開始（getDisplayMedia使用）');
          
          // 最優先: getDisplayMedia API + WASAPIロープバック
          console.log('🆕 getDisplayMedia API試行（Windows WASAPIロープバック対応）');
          
          try {
            // @ts-ignore
            stream = await navigator.mediaDevices.getDisplayMedia({
              audio: true,
              video: {
                width: { ideal: 1 },
                height: { ideal: 1 }
              }
            });
            
            console.log('✅ getDisplayMedia成功 - Windows WASAPIロープバック使用');
            
            // 取得結果の詳細ログ
            console.log('🔍 getDisplayMedia結果詳細:');
            console.log('  音声トラック数:', stream.getAudioTracks().length);
            console.log('  映像トラック数:', stream.getVideoTracks().length);
            
            const audioTracks = stream.getAudioTracks();
            if (audioTracks.length > 0) {
              const audioTrack = audioTracks[0];
              console.log('🎵 getDisplayMedia音声トラック:', {
                label: audioTrack.label,
                id: audioTrack.id,
                kind: audioTrack.kind,
                enabled: audioTrack.enabled,
                readyState: audioTrack.readyState,
                settings: audioTrack.getSettings()
              });
            }
            
            // MediaRecorder対応チェック
            console.log('🔍 MediaRecorder対応チェック:');
            console.log('  - ストリーム有効:', !!stream);
            console.log('  - 音声トラック数:', stream.getAudioTracks().length);
            console.log('  - 映像トラック数:', stream.getVideoTracks().length);
            
            // サポートされているMIMEタイプをチェック
            const supportedTypes = [
              'audio/webm',
              'audio/webm;codecs=opus',
              'audio/webm;codecs=vorbis',
              'video/webm',
              'video/webm;codecs=vp8',
              'video/webm;codecs=vp9'
            ];
            
            console.log('🔍 サポートされているMIMEタイプ:');
            supportedTypes.forEach(type => {
              const isSupported = MediaRecorder.isTypeSupported(type);
              console.log(`  - ${type}: ${isSupported}`);
            });
            
            // 映像トラックがある場合は削除して音声のみにする
            const videoTracks = stream.getVideoTracks();
            if (videoTracks.length > 0) {
              console.log('🎥 映像トラックを停止して音声のみに変更');
              videoTracks.forEach(track => {
                track.stop();
                stream.removeTrack(track);
              });
              console.log('✅ 映像トラック削除完了、音声のみのストリーム作成');
            }
            
          } catch (getDisplayMediaError) {
            console.warn('❌ getDisplayMedia失敗、従来方式にフォールバック:', getDisplayMediaError);
            
            // フォールバック: 従来のgetUserMedia方式
            const availableScreenSources = desktopSources.filter(s => s.id.startsWith('screen:'));
            if (availableScreenSources.length === 0) {
              throw new Error('スクリーンソースが見つかりません');
            }
            
            const forcedSource = availableScreenSources[0];
            console.log('🔄 フォールバック: getUserMedia使用', forcedSource.id);
            
            stream = await navigator.mediaDevices.getUserMedia({
              audio: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: forcedSource.id,
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
              } as any,
              video: false
            });
            console.log('✅ フォールバック成功');
          }
          
          // 音声トラックをチェック
          const audioTracks = stream.getAudioTracks();
          console.log(`🎵 音声トラック数: ${audioTracks.length}`);
          
          if (audioTracks.length === 0) {
            throw new Error('デスクトップからの音声トラックが取得できませんでした');
          }
          
          // 音声トラック詳細をログ出力
          audioTracks.forEach((track, index) => {
            console.log(`🎤 音声トラック${index}:`, {
              id: track.id,
              label: track.label,
              enabled: track.enabled,
              muted: track.muted,
              readyState: track.readyState
            });
          });

          // Step 6: 音声トラックの正当性チェック強化
          const firstTrack = audioTracks[0];
          console.log('🔍 音声トラック検証:');
          console.log('  - ラベル:', firstTrack.label);
          console.log('  - ID:', firstTrack.id);

          // Step 17: 音声トラック検証を復活させて問題を特定
          const trackLabel = firstTrack.label.toLowerCase();
          const isMicrophoneTrack = trackLabel.includes('microphone') ||
                                  trackLabel.includes('mic') ||
                                  trackLabel.includes('hyperx') ||
                                  trackLabel.includes('headset');
          
          if (isMicrophoneTrack) {
            console.error('❌ マイクトラックが検出されました:', firstTrack.label);
            console.error('❌ 選択されたソース:', selectedDesktopSource);
            console.error('🔄 ステレオミックス方式にフォールバック中...');
            
            // ストリームを停止
            stream.getTracks().forEach(track => track.stop());
            
            // ステレオミックス方式を試行
            try {
              const audioDevices = await navigator.mediaDevices.enumerateDevices();
              const stereoMixDevice = audioDevices.find(device => 
                device.kind === 'audioinput' && 
                (device.label.toLowerCase().includes('stereo mix') ||
                 device.label.toLowerCase().includes('ステレオ ミックス') ||
                 device.label.toLowerCase().includes('what u hear') ||
                 device.label.toLowerCase().includes('loopback'))
              );
              
              if (stereoMixDevice) {
                console.log('🎵 ステレオミックスデバイス発見:', stereoMixDevice.label);
                stream = await navigator.mediaDevices.getUserMedia({
                  audio: {
                    deviceId: stereoMixDevice.deviceId,
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                  }
                });
                console.log('✅ ステレオミックスでの音声キャプチャ成功');
                
                // 新しいストリームの音声トラックをチェック
                const newAudioTracks = stream.getAudioTracks();
                if (newAudioTracks.length > 0) {
                  console.log('🎵 ステレオミックス音声トラック:', newAudioTracks[0].label);
                }
              } else {
                throw new Error('ステレオミックスデバイスが見つかりません');
              }
            } catch (stereoMixError) {
              console.error('❌ ステレオミックスも失敗:', stereoMixError);
              
              // 最終的な解決方法を提示
              console.log('💡 Windows環境でのデスクトップ音声録音方法:');
              console.log('1. Voicemeeter Bananaを使用 (検出済み)');
              console.log('2. Virtual Audio Cable (VAC)');
              console.log('3. OBS Virtual Audio Filter');
              console.log('4. Windows設定でステレオミックスを有効化');
              
              throw new Error(
                `Windows環境でのデスクトップ音声キャプチャ制限\n\n` +
                `解決方法:\n` +
                `1. Voicemeeter Banana (推奨)\n` +
                `   - 既にインストール済みです\n` +
                `   - A1: デスクトップスピーカー\n` +
                `   - B1: Virtual Input (録音用)\n` +
                `   - アプリでB1を選択\n\n` +
                `2. Windows設定 > サウンド > 録音\n` +
                `   - ステレオミックス有効化\n` +
                `   - 既定のデバイスに設定\n\n` +
                `3. マイク入力タイプに変更して\n` +
                `   仮想音声デバイスを選択\n\n` +
                `現在の技術的制約により、デスクトップ音声の\n` +
                `直接キャプチャができません。`
              );
            }
          }
          
          console.log('✅ 音声トラック検証完了: デスクトップ音声と判定');
          
          console.log('✅ 音声ストリーム取得完了');
          
        } catch (desktopError) {
          console.error('❌ Desktop capturer failed:', desktopError);
          console.error('❌ エラー詳細:', {
            name: desktopError instanceof Error ? desktopError.name : 'Unknown',
            message: desktopError instanceof Error ? desktopError.message : String(desktopError),
            selectedDesktopSource,
            availableSources: desktopSources.length
          });
          throw new Error(`デスクトップ音声キャプチャに失敗しました: ${desktopError instanceof Error ? desktopError.message : String(desktopError)}`);
        }
        
      } else if (inputType === 'stereo-mix') {
        if (!selectedSystemDevice) {
          throw new Error('システム音声デバイスが選択されていません');
        }
        
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { 
            deviceId: selectedSystemDevice,
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          }
        });
        
      } else {
        // マイク音声
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: selectedDevice }
        })
      }
      
      // MediaRecorder設定
      console.log('🎬 MediaRecorder初期化開始');
      console.log('  - ストリーム状態:', {
        active: stream.active,
        audioTracks: stream.getAudioTracks().length,
        videoTracks: stream.getVideoTracks().length
      });
      
      let mediaRecorder: MediaRecorder
      let selectedMimeType: string
      
      const recorderOptions: MediaRecorderOptions = {
        audioBitsPerSecond: 128000
      };
      
      try {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          selectedMimeType = 'audio/webm;codecs=opus'
          recorderOptions.mimeType = selectedMimeType
          console.log('🎵 MediaRecorder初期化:', selectedMimeType);
          mediaRecorder = new MediaRecorder(stream, recorderOptions)
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          selectedMimeType = 'audio/webm'
          recorderOptions.mimeType = selectedMimeType
          console.log('🎵 MediaRecorder初期化:', selectedMimeType);
          mediaRecorder = new MediaRecorder(stream, recorderOptions)
        } else {
          console.log('🎵 MediaRecorder初期化: デフォルトオプション');
          mediaRecorder = new MediaRecorder(stream, recorderOptions)
          selectedMimeType = mediaRecorder.mimeType
        }
        
        console.log('✅ MediaRecorder作成成功:', {
          mimeType: selectedMimeType,
          state: mediaRecorder.state,
          audioBitsPerSecond: recorderOptions.audioBitsPerSecond
        });
        
      } catch (mediaRecorderError) {
        console.error('❌ MediaRecorder作成エラー:', mediaRecorderError);
        
        // より安全なデフォルト設定で再試行
        console.log('🔄 デフォルト設定でMediaRecorder再試行');
        try {
          mediaRecorder = new MediaRecorder(stream);
          selectedMimeType = mediaRecorder.mimeType;
          console.log('✅ デフォルト設定でMediaRecorder作成成功:', selectedMimeType);
        } catch (fallbackError) {
          console.error('❌ デフォルト設定でも失敗:', fallbackError);
          throw new Error(`MediaRecorderの初期化に失敗しました: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
        }
      }
      
      mediaRecorderRef.current = mediaRecorder

      // MediaRecorderイベントリスナー
      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorderエラー:', event.error)
        try {
          if (mediaRecorder.state === 'recording') {
            mediaRecorder.stop()
          }
          stream.getTracks().forEach(track => track.stop())
        } catch (cleanupError) {
          console.error('エラー時のクリーンアップ失敗:', cleanupError)
        }
        
        // TrueDifferentialChunkGeneratorのクリーンアップ
        if (trueDiffGeneratorRef.current) {
          trueDiffGeneratorRef.current.cleanup()
        }
      }
      
      // 差分チャンク生成アプローチ用の変数
      let recordingFilePath: string | null = null
      let recordingFilename: string | null = null
      let tempFolderPath: string | null = null
      
      // チャンクファイル保存機能をテストするため常に有効化
      tempFolderPath = 'chunks' // チャンクファイル保存用のsubfolder指定
      console.log(`🔧 チャンクファイル保存機能テスト有効 - 保存先: ${tempFolderPath}`)
      
      // テスト用: リアルタイム文字起こしを強制的に有効化
      console.log(`🧪 テスト用リアルタイム文字起こし強制有効化: ${FORCE_ENABLE_REALTIME_TRANSCRIPTION}`)
      
      // リアルタイム文字起こし用の追加設定
      if (enableTranscription || FORCE_ENABLE_REALTIME_TRANSCRIPTION) {
        console.log(`📝 リアルタイム文字起こしも有効 - FileBasedRealtimeProcessorを初期化`)
        
        // FileBasedRealtimeProcessorを初期化
        if (!realtimeProcessorRef.current) {
          realtimeProcessorRef.current = new FileBasedRealtimeProcessor({
            fileCheckInterval: 2000, // 2秒間隔でチェック
            maxRetryCount: 2,
            processingTimeout: 180000,
            enableAutoRetry: true,
            textWriteInterval: 5000,
            enableAutoSave: true,
            textFormat: 'detailed'
          })
          
          console.log(`🎯 FileBasedRealtimeProcessor初期化完了`)
        }
      }
      
      // TrueDifferentialChunkGeneratorを初期化（ファイル保存機能付き）
      if (!trueDiffGeneratorRef.current) {
        trueDiffGeneratorRef.current = new TrueDifferentialChunkGenerator(20, {
          intervalSeconds: 20,
          enableFileGeneration: !!tempFolderPath, // tempFolderPathがある場合のみファイル保存有効
          tempFolderPath: tempFolderPath || undefined,
          enableAutoGeneration: true // 自動生成モードに変更
        })
        
        // コールバック設定
        trueDiffGeneratorRef.current.onChunkGenerated((result) => {
          console.log(`✅ チャンク生成完了: #${result.chunkNumber}, ${result.dataSize}bytes, ${result.duration.toFixed(1)}s`)
          if (result.filePath) {
            console.log(`💾 チャンクファイル保存: ${result.filePath}`)
          }
        })
        
        trueDiffGeneratorRef.current.onChunkSaved((fileInfo) => {
          console.log(`📁 ファイル保存完了: ${fileInfo.filename} (${fileInfo.sizeBytes}bytes)`)
          
          // リアルタイム文字起こしが有効な場合、FileBasedRealtimeProcessorに通知
          if ((enableTranscription || FORCE_ENABLE_REALTIME_TRANSCRIPTION) && realtimeProcessorRef.current) {
            console.log(`🔗 FileBasedRealtimeProcessorにファイル監視開始を通知: ${fileInfo.filepath}`)
            // ここでチャンクファイル監視を開始する統合処理を後で実装
          }
        })
        
        trueDiffGeneratorRef.current.onError((error) => {
          console.error(`❌ チャンク生成エラー:`, error)
        })
      } else {
        // 既存インスタンスの設定更新
        trueDiffGeneratorRef.current.updateConfig({
          intervalSeconds: 20,
          enableFileGeneration: !!tempFolderPath,
          tempFolderPath: tempFolderPath || undefined,
          enableAutoGeneration: true
        })
        trueDiffGeneratorRef.current.reset()
      }
      
      // 録音開始
      trueDiffGeneratorRef.current.startRecording()
      
      // 録音データをTrueDifferentialChunkGeneratorに追加
      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0 && trueDiffGeneratorRef.current) {
          const currentTime = trueDiffGeneratorRef.current.getCurrentRecordingTime()
          trueDiffGeneratorRef.current.addRecordingData(event.data)
          console.log(`📝 チャンク受信: ${event.data.size} bytes (録音時間: ${currentTime.toFixed(1)}s)`)
          console.log(`📊 メモリ使用量:`, trueDiffGeneratorRef.current.getMemoryUsage())
          
        }
      }
        
      mediaRecorder.onstop = async () => {
        // リアルタイム処理のタイマーをクリア
        if (realtimeProcessingIntervalRef.current) {
          window.clearInterval(realtimeProcessingIntervalRef.current)
          realtimeProcessingIntervalRef.current = null
        }
        
        // 正確な録音時間を計算（ミリ秒単位、一時停止時間を除外）
        const recordingEndTime = Date.now()
        const actualDurationMs = recordingEndTime - recordingStartTimeRef.current - pausedTimeRef.current
        const actualDurationSeconds = Math.round(actualDurationMs / 1000)
        
        // WebM形式でBlobを作成
        let originalBlob: Blob
        
        // 録音データを取得
        if (trueDiffGeneratorRef.current) {
          const memoryUsage = trueDiffGeneratorRef.current.getMemoryUsage()
          console.log(`📝 最終録音ファイル作成: ${memoryUsage.totalBytes} bytes (${memoryUsage.chunkCount}個のチャンクから作成)`)
          originalBlob = new Blob(trueDiffGeneratorRef.current.getAllChunks(), { type: selectedMimeType })
        } else {
          console.warn('⚠️ システム未初期化 - 空のBlobを作成')
          originalBlob = new Blob([], { type: selectedMimeType })
        }
        
        try {
          // HTMLAudioElementで正確なdurationを取得
          let accurateDuration: number
          
          try {
            accurateDuration = await getAccurateDuration(originalBlob)
          } catch (durationError) {
            // フォールバック：録音時間から推定durationを計算
            accurateDuration = actualDurationSeconds
          }
          
          // 元のWebMファイルをそのまま使用
          const finalBuffer = await originalBlob.arrayBuffer()
          
          // 録音停止時は必ず新しい完全なファイルを作成
          // 録音開始時に決定されたファイル名を使用（一貫性を保つ）
          const filename = recordingFilename || 'recording.webm'
          console.log('録音開始時に決定されたファイル名で最終保存:', filename)
          
          console.log('Saving WebM file with duration metadata:', filename)
          
          try {
            // 最終的なファイルを保存（録音中に書き込んだファイルを完全版で上書き）
            console.log('録音停止時の最終ファイル保存:', {
              filename: filename,
              bufferSize: finalBuffer.byteLength,
              duration: accurateDuration,
              recordingPath: recordingFilePath
            })
            
            await window.electronAPI.saveFile(finalBuffer, filename)
            
            // メタデータファイルに正確なdurationを保存
            const metadata = {
              duration: accurateDuration, // HTMLAudioElementで取得した正確な値
              format: 'webm',
              size: finalBuffer.byteLength,
              recordedAt: new Date().toISOString(),
              mimeType: selectedMimeType
            }
            await window.electronAPI.saveMetadata(filename, metadata)
            
            console.log('📁 録音ファイルを保存しました:', filename)
            console.log('⏱️ Accurate Duration:', accurateDuration, 'seconds')
            console.log('📋 メタデータファイルも保存しました')
            console.log('✅ WebMファイルと正確なdurationメタデータ保存完了')
          } catch (error) {
            console.error('ファイル保存エラー:', error)
          }
          
        } catch (durationError) {
          console.error('Duration取得エラー:', durationError)
          console.log('フォールバック: 元のWebMファイルを保存します（Duration情報なし）')
          
          // フォールバック: 元のファイルを保存
          const fallbackBuffer = await originalBlob.arrayBuffer()
          
          const now = new Date()
          const timestamp = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`
          const filename = `recording_${timestamp}.webm`
          
          try {
            await window.electronAPI.saveFile(fallbackBuffer, filename)
            console.log('⚠️ 録音ファイルを保存しました（Duration無し）:', filename)
          } catch (error) {
            console.error('フォールバックファイル保存エラー:', error)
          }
        }
        
        // 録音状態をリセット
        resetRecordingState()
        
        // 録音完了後にrecordingFileをクリア（ファイルリスト更新は LeftPanel に任せる）
        const cleanupRecordingState = () => {
          setRecordingFile(null)
          console.log('🎯 録音中ファイルのグローバル状態をクリア')
        }
        
        // 少し遅延を入れてグローバル状態をクリア
        setTimeout(cleanupRecordingState, 500)
      }
      
      // 録音開始時にファイルエントリを即座に作成（左ペインに表示するため）
      const createInitialFileEntry = async () => {
        try {
          const now = new Date()
          const timestamp = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`
          const filename = `recording_${timestamp}.webm`
          
          // 録音中のファイルパスとファイル名を初期化（ondataavailableで使用）
          recordingFilePath = null
          recordingFilename = filename  // ファイル名を共有変数に設定
          
          // デフォルトフォルダを取得
          const settings = await window.electronAPI.loadSettings()
          const defaultFolder = settings.saveFolder
          
          // 一時的なファイルエントリを作成
          const tempFileEntry = {
            id: filename,
            filename: filename,
            filepath: `${defaultFolder}\\${filename}`,
            format: 'webm' as const,
            size: 0,
            createdAt: now,
            duration: 0,
            hasTranscriptionFile: false,
            transcriptionPath: undefined,
            isRecording: true // 録音中フラグを追加
          }
          
          // 既存のファイルリストに録音中ファイルを追加
          // ファイル一覧の再取得を避けて、現在のリストに追加のみ行う
          setFileList(prevList => {
            // 同じファイル名がすでに存在する場合は置き換え、そうでなければ先頭に追加
            const existingIndex = prevList.findIndex(file => file.filename === filename)
            if (existingIndex >= 0) {
              const newList = [...prevList]
              newList[existingIndex] = tempFileEntry
              return newList
            } else {
              return [tempFileEntry, ...prevList]
            }
          })
          
          // グローバル状態に録音中ファイルを設定
          setRecordingFile(tempFileEntry)
          
          // 録音中ファイルを自動的に選択
          setSelectedFile(tempFileEntry)
          
          console.log('📁 録音中ファイルを左ペインに追加:', filename)
          console.log('🎯 グローバル状態に録音中ファイルを設定:', tempFileEntry.filename)
          console.log('🎯 録音中ファイルを自動選択:', tempFileEntry.filename)
          console.log('🎯 録音中ファイルの詳細:', {
            id: tempFileEntry.id,
            filename: tempFileEntry.filename,
            isRecording: tempFileEntry.isRecording,
            filepath: tempFileEntry.filepath
          })
          
          // ファイル名を戻り値として返す
          return { filename }
          
        } catch (error) {
          console.error('録音中ファイルエントリ作成エラー:', error)
          throw error
        }
      }
      
      // createInitialFileEntry を実行してからMediaRecorderを開始
      const { filename } = await createInitialFileEntry()
      recordingFilename = filename // 共有変数に設定
      
      // recordingFilenameが決まったらチャンクフォルダ名を更新
      const baseFilename = filename.replace('.webm', '') // 拡張子を除去
      tempFolderPath = `${baseFilename}_chunks` // 録音ファイル名ベースのchunksフォルダ
      console.log(`📁 チャンクフォルダ更新: ${tempFolderPath}`)
      
      // TrueDifferentialChunkGeneratorの設定を更新
      if (trueDiffGeneratorRef.current) {
        trueDiffGeneratorRef.current.updateConfig({
          enableFileGeneration: true,
          tempFolderPath: tempFolderPath
        })
        console.log(`🔧 TrueDifferentialChunkGenerator設定更新: ${tempFolderPath}`)
      }
      
      // FileBasedRealtimeProcessorを開始（リアルタイム文字起こし有効時）
      if ((enableTranscription || FORCE_ENABLE_REALTIME_TRANSCRIPTION) && realtimeProcessorRef.current && tempFolderPath && recordingFilename) {
        try {
          // Kotoba-Whisperサーバー状態確認
          const serverStatus = await window.electronAPI.speechGetServerStatus()
          console.log(`🔍 Kotoba-Whisperサーバー状態:`, serverStatus)
          
          if (!serverStatus.isRunning) {
            console.log(`🚀 Kotoba-Whisperサーバー起動中...`)
            const startResult = await window.electronAPI.speechStartServer()
            console.log(`🚀 サーバー起動結果:`, startResult)
            
            if (!startResult) {
              console.error(`❌ Kotoba-Whisperサーバー起動失敗`)
              throw new Error('文字起こしサーバーの起動に失敗しました')
            }
          }
          
          // 出力ファイルパス設定（録音ファイル名ベース）
          const settings = await window.electronAPI.loadSettings()
          const outputFilePath = `${settings.saveFolder}/${baseFilename}_realtime.txt`
          const watchFolderPath = `${settings.saveFolder}/${tempFolderPath}`
          
          console.log(`🎬 FileBasedRealtimeProcessor開始`)
          console.log(`📂 監視フォルダ: ${watchFolderPath}`)
          console.log(`📄 出力ファイル: ${outputFilePath}`)
          
          await realtimeProcessorRef.current.start(watchFolderPath, outputFilePath)
          console.log(`✅ FileBasedRealtimeProcessor開始完了`)
          
        } catch (error) {
          console.error(`❌ FileBasedRealtimeProcessor開始エラー:`, error)
        }
      }
      
      // マイク監視を開始（マイク録音の場合のみ） - 完全に無効化してクラッシュ問題を切り分け
      const ENABLE_MIC_MONITORING = false // 完全に無効化
      
      if (inputType === 'microphone' && ENABLE_MIC_MONITORING) {
        try {
          console.log('🎤 マイク監視を開始します...')
          micMonitorRef.current = new MicrophoneMonitor()
          
          // マイクステータスコールバック
          micMonitorRef.current.onStatusUpdate((status: MicrophoneStatus) => {
            setMicStatus(status)
          })
          
          // マイクアラートコールバック
          micMonitorRef.current.onAlert((alert: MicrophoneAlert) => {
            setMicAlerts(prev => [...prev.slice(-4), alert]) // 最新5件まで保持
            
            // 重要なアラートをコンソールに出力
            if (alert.severity === 'error' || alert.severity === 'warning') {
              console.warn(`🎤 マイクアラート: ${alert.message}`)
              if (alert.recommendation) {
                console.warn(`   推奨対策: ${alert.recommendation}`)
              }
            }
          })
          
          // 録音ストリームを使用してマイク監視開始（競合を回避）
          const micMonitoringStarted = await micMonitorRef.current.startMonitoring(stream, selectedDevice)
          if (micMonitoringStarted) {
            console.log('✅ マイク監視開始成功（録音ストリーム使用）')
          } else {
            console.warn('⚠️ マイク監視開始に失敗しましたが、録音は続行します')
          }
        } catch (micError) {
          console.error('❌ マイク監視開始エラー:', micError)
          console.warn('⚠️ マイク監視なしで録音を続行します')
        }
      } else if (inputType === 'microphone') {
        console.log('🎤 マイク監視は一時的に無効化されています（録音のトラブルシューティング中）')
      }
      
      // 新しいアプローチ：timesliceなしで録音開始
      console.log('🎬 MediaRecorder開始中（timesliceなし）...', { state: mediaRecorder.state })
      console.log('🔍 開始前最終チェック:', {
        streamActive: stream.active,
        audioTracks: stream.getAudioTracks().map(t => ({
          label: t.label,
          enabled: t.enabled,
          readyState: t.readyState
        })),
        recorderState: mediaRecorder.state,
        mimeType: selectedMimeType
      });
      
      // 録音準備完了
      console.log('✅ 録音準備完了')

      console.log(`🎬🎬🎬 MediaRecorder.start()を呼び出し直前 🎬🎬🎬`)
      
      try {
        mediaRecorder.start() // timesliceなしで連続録音（手動チャンク分割を使用）
        console.log('✅ MediaRecorder.start()呼び出し完了, 新しいstate:', mediaRecorder.state)
        if (true) { // 手動requestData()処理を有効化
          console.log('📝 手動データ要求ループを開始します (20秒間隔)');
          
          const generator = trueDiffGeneratorRef.current!;
          const recorder = mediaRecorderRef.current!;
          
          // 非同期ループ処理の定義
          const processingLoop = async () => {
            try {
              // 録音が継続しているかチェック
              if (recorder.state !== 'recording') {
                console.log('📝 録音が停止したため、リアルタイム処理ループを終了します。');
                return;
              }

              // 1. requestData()で最新のデータを要求
              console.log('📡 requestData()でデータ要求中...')
              recorder.requestData();
              
              // 2. ondataavailableが実行され、データがジェネレータに追加されるのを少し待つ
              await new Promise(resolve => setTimeout(resolve, 500));
              
              console.log('📡 requestData()完了、自動チャンク生成開始をトリガー')

            } catch (error) {
              console.error(`❌ リアルタイム処理ループ内でエラーが発生しました:`, error);
            } finally {
              // 4. 次のループを20秒後にスケジュールする
              if (mediaRecorderRef.current?.state === 'recording') {
                realtimeProcessingIntervalRef.current = window.setTimeout(processingLoop, 20000);
              }
            }
          };

          // 最初のループを20秒後に開始
          realtimeProcessingIntervalRef.current = window.setTimeout(processingLoop, 20000);
        }
      } catch (startError) {
        console.error('❌ MediaRecorder.start()エラー:', startError);
        console.error('❌ エラー時の状態:', {
          streamActive: stream.active,
          audioTracksCount: stream.getAudioTracks().length,
          recorderState: mediaRecorder.state,
          errorName: startError instanceof Error ? startError.name : 'Unknown',
          errorMessage: startError instanceof Error ? startError.message : String(startError)
        });
        throw new Error(`録音開始に失敗しました: ${startError instanceof Error ? startError.message : String(startError)}`);
      }
      setIsRecording(true)
      setGlobalIsRecording(true)
      setRecordingTime(0)
      console.log('📱 UI状態更新完了: isRecording = true')
      
      // 録音開始時刻を記録（正確なDuration計算のため）
      recordingStartTimeRef.current = Date.now()
      pausedTimeRef.current = 0 // 一時停止時間をリセット
      console.log('Recording started at:', new Date(recordingStartTimeRef.current).toISOString())
      
      console.log('📝 新しい単一ファイル成長モデルを開始')
      
      // テンポラリフォルダパスは統合システム準備時に既に設定済み
      
      // 新しいアプローチ：リアルタイム処理のための定期実行タイマー
      console.log('🔍 リアルタイム処理開始チェック:', {
        enableTranscription,
        tempFolderPath,
        recordingFilename,
        realtimeProcessor: false
      })
      
      // 重複削除：上で既に処理済み
      
      // 従来のアプローチは保持（フォールバック用）
      if (enableTranscription && tempFolderPath && recordingFilename && false) { // 無効化
        try {
          console.log('📝 従来リアルタイム処理開始: 20秒間隔でファイル更新')
          
          // 保存フォルダから録音ファイルの絶対パスを構築
          const settings = await window.electronAPI.loadSettings()
          const saveFolder = settings.saveFolder
          const fullRecordingPath = `${saveFolder}\\${recordingFilename}`
          const absoluteTempPath = `${saveFolder}\\${tempFolderPath}`
          
          console.log(`監視フォルダ: ${absoluteTempPath}`)
          console.log(`出力ファイル: ${fullRecordingPath}`)
          
          let chunkCounter = 1
          
          // 20秒ごとに真の差分チャンクを生成してファイルに保存
          realtimeProcessingIntervalRef.current = window.setInterval(async () => {
            if (mediaRecorderRef.current?.state === 'recording' && trueDiffGeneratorRef.current) {
              try {
                // requestData()を呼び出してondataavailableを能動的にトリガー
                mediaRecorderRef.current.requestData()
                
                // ondataavailableが実行されるのを少し待つ
                await new Promise(resolve => setTimeout(resolve, 300))
                
                // 真の差分チャンクを生成（オーバーラップなし）
                if (trueDiffGeneratorRef.current.isReady()) {
                  const chunkResult = await trueDiffGeneratorRef.current.generateTrueDifferentialChunk()
                  
                  if (chunkResult && chunkResult.isNewData) {
                    console.log(`✅ 差分チャンク生成完了: ${chunkResult.chunkNumber} (${chunkResult.dataSize} bytes)`)
                    console.log(`📊 実時間: 開始${chunkResult.startTime.toFixed(1)}s, 長さ${chunkResult.duration.toFixed(1)}s`)
                    if (chunkResult.filePath) {
                      console.log(`📁 自動保存済み: ${chunkResult.filePath}`)
                      
                      // ファイル監視システムが正常に動作しているかチェック  
                      try {
                        const fileSize = await window.electronAPI.getFileSize(chunkResult.filePath)
                        console.log(`📝 保存確認: ファイルサイズ ${fileSize} bytes`)
                      } catch (error) {
                        console.error(`❌ ファイル保存確認エラー:`, error)
                      }
                    }
                  } else {
                    console.log(`📝 新しい差分データなし - スキップ`)
                  }
                } else {
                  console.log(`📝 TrueDifferentialGenerator未初期化 - スキップ`)
                }
              } catch (error) {
                console.error(`❌ 真の差分チャンク生成エラー:`, error)
              }
            } else {
              if (realtimeProcessingIntervalRef.current) {
                window.clearInterval(realtimeProcessingIntervalRef.current)
                realtimeProcessingIntervalRef.current = null
              }
            }
          }, 20000) // 20秒ごと
          
          console.log('📝 リアルタイム処理は無効化されています')
        } catch (realtimeError) {
          console.error('ファイルベースリアルタイム文字起こし開始エラー:', realtimeError)
        }
      } else {
        if (enableTranscription) {
          console.warn('❌ ファイルベースリアルタイム文字起こし開始条件が満たされていません:', {
            enableTranscription,
            tempFolderPath,
            recordingFilename: recordingFilename || 'undefined',
            realtimeProcessor: false
          })
        } else {
          console.log('📝 録音のみモード: リアルタイム文字起こしをスキップ')
        }
      }
      
    } catch (error) {
      console.error('🚨🚨🚨 startRecording関数内でエラー発生！🚨🚨🚨')
      console.error('❌ 録音開始エラー:', error)
      console.error('❌ エラー詳細:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : 'No stack trace',
        inputType,
        selectedDevice,
        enableTranscription
      })
      
      const detailMessage = error instanceof Error ? error.message : String(error);
      
      const errorMessage = inputType === 'desktop' 
        ? `デスクトップ音声へのアクセスが拒否されました。\n${detailMessage}`
        : `マイクへのアクセスが拒否されました。\n${detailMessage}`
      
      alert(errorMessage)
      console.error('録音開始エラー (full):', error)
      
      // エラー時も録音状態をリセット
      resetRecordingState()
      
      // エラー時にも録音中のファイルエントリを削除
      const removeRecordingFileEntry = async () => {
        try {
          const settings = await window.electronAPI.loadSettings()
          const defaultFolder = settings.saveFolder
          
          // 最新のファイルリストを取得して録音フラグをfalseに更新
          const currentFiles = await window.electronAPI.getFileList(defaultFolder)
          const extendedFiles = await Promise.all(
            currentFiles.map(async (file) => {
              try {
                const hasTranscriptionFile = await window.electronAPI.checkTranscriptionExists(file.filepath)
                const transcriptionPath = hasTranscriptionFile 
                  ? await window.electronAPI.getTranscriptionPath(file.filepath)
                  : undefined
                
                return {
                  ...file,
                  hasTranscriptionFile,
                  transcriptionPath,
                  isRecording: false // エラー時もすべてのファイルの録音フラグをfalseに設定
                }
              } catch (error) {
                console.error(`文字起こしファイル確認エラー (${file.filename}):`, error)
                return {
                  ...file,
                  hasTranscriptionFile: false,
                  transcriptionPath: undefined,
                  isRecording: false
                }
              }
            })
          )
          
          setFileList(extendedFiles)
          console.log('📁 録音エラー時のファイルリスト更新完了')
          
        } catch (error) {
          console.error('録音エラー時のファイルリスト更新エラー:', error)
        }
      }
      
      removeRecordingFileEntry()
    }
  }, [inputType, selectedDevice, selectedDesktopSource, selectedSystemDevice, resetRecordingState])
  
  // 録音停止
  const handleStopRecording = useCallback(async () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop())
      
      // マイク監視停止
      if (micMonitorRef.current) {
        try {
          console.log('🎤 マイク監視を停止します...')
          micMonitorRef.current.stopMonitoring()
          micMonitorRef.current = null
          setMicStatus(null)
          setMicAlerts([])  // マイクアラートもクリア
          console.log('✅ マイク監視停止完了')
        } catch (micError) {
          console.error('❌ マイク監視停止エラー:', micError)
        }
      }
      
      // リアルタイム処理のタイマーをクリア
      if (realtimeProcessingIntervalRef.current) {
          clearTimeout(realtimeProcessingIntervalRef.current); // clearTimeoutに変更
          realtimeProcessingIntervalRef.current = null;
        }
      // if (realtimeProcessingIntervalRef.current) {
      //   window.clearInterval(realtimeProcessingIntervalRef.current)
      //   realtimeProcessingIntervalRef.current = null
      // }
      
      // FileBasedRealtimeProcessorを停止
      if (realtimeProcessorRef.current) {
        try {
          console.log('🎬 FileBasedRealtimeProcessor停止中...')
          
          // 停止前に最終ファイル保存を実行
          console.log('💾 最終リアルタイムテキスト保存中...')
          await realtimeProcessorRef.current.saveToFile()
          console.log('✅ 最終リアルタイムテキスト保存完了')
          
          await realtimeProcessorRef.current.stop()
          console.log('✅ FileBasedRealtimeProcessor停止完了')
        } catch (realtimeError) {
          console.error('❌ FileBasedRealtimeProcessor停止エラー:', realtimeError)
        }
      }
      
      // TrueDifferentialChunkGeneratorを停止 & チャンクファイル結合
      if (trueDiffGeneratorRef.current) {
        try {
          console.log('🔧 TrueDifferentialChunkGenerator停止中...')
          trueDiffGeneratorRef.current.stopRecording()
          console.log('✅ TrueDifferentialChunkGenerator停止完了')
          
          // Phase 3: チャンクファイル結合処理
          const combinationStats = trueDiffGeneratorRef.current.getCombinationStats()
          console.log('📊 チャンクファイル結合統計:', combinationStats)
          
          if (combinationStats.totalChunks > 0) {
            console.log('🔗 チャンクファイル結合開始...')
            
            try {
              const combinedBlob = await trueDiffGeneratorRef.current.generateCombinedWebMFile()
              
              if (combinedBlob) {
                // 結合されたファイルを保存
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
                const combinedFilename = `combined_${timestamp}.webm`
                
                const combinedBuffer = await combinedBlob.arrayBuffer()
                await window.electronAPI.saveFile(combinedBuffer, combinedFilename)
                
                console.log(`✅ チャンクファイル結合完了: ${combinedFilename}`)
                console.log(`📊 結合統計: ${combinationStats.totalChunks}個のチャンク, 総時間${combinationStats.totalDuration.toFixed(1)}秒, サイズ${combinedBlob.size}bytes`)
              } else {
                console.warn('⚠️ チャンクファイル結合でファイルが生成されませんでした')
              }
              
            } catch (combineError) {
              console.error('❌ チャンクファイル結合エラー:', combineError)
            }
          } else {
            console.log('📝 結合可能なチャンクファイルがありません')
          }
          
        } catch (chunkError) {
          console.error('❌ TrueDifferentialChunkGenerator停止エラー:', chunkError)
        }
      }
      
      // リアルタイム処理は無効化されています
      console.log('📝 リアルタイム処理は無効化されています')
      
      // ミキシングサービス停止
      if (audioMixingServiceRef.current) {
        try {
          console.log('🎛️ ミキシングサービス停止...')
          await audioMixingServiceRef.current.cleanup()
          audioMixingServiceRef.current = null
          setAudioLevels({ microphoneLevel: 0, desktopLevel: 0, mixedLevel: 0 })
          console.log('✅ ミキシングサービス停止完了')
        } catch (mixingError) {
          console.error('❌ ミキシングサービス停止エラー:', mixingError)
        }
      }
    }
  }, [isRecording])
  
  // 録音一時停止・再開
  const handlePauseRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      if (isPaused) {
        // 再開時：現在の時刻を記録
        const resumeTime = Date.now()
        mediaRecorderRef.current.resume()
        setIsPaused(false)
        console.log('Recording resumed at:', new Date(resumeTime).toISOString())
      } else {
        // 一時停止時：一時停止時間を計算して累計に追加
        const pauseStartTime = Date.now()
        mediaRecorderRef.current.pause()
        setIsPaused(true)
        console.log('Recording paused at:', new Date(pauseStartTime).toISOString())
        
        // 一時停止時間を記録（再開時に計算される）
        setTimeout(() => {
          if (isPaused) {
            const pauseEndTime = Date.now()
            pausedTimeRef.current += pauseEndTime - pauseStartTime
            console.log('Paused duration so far:', pausedTimeRef.current, 'ms')
          }
        }, 100)
      }
    }
  }, [isPaused])
  
  // 削除: handleTranscribe, handleConvertToMP3 は不要

  

  return (
    <div className="bottom-panel">
      <div className="bottom-panel__content">
        {/* 入力タイプ選択 */}
        <div className="flex items-center gap-md">
          <label className="text-secondary" style={{ minWidth: '100px' }}>入力タイプ:</label>
          <select 
            className="select"
            value={inputType}
            onChange={(e) => setInputType(e.target.value as 'microphone' | 'desktop' | 'stereo-mix' | 'mixing')}
            disabled={isRecording}
            style={{ 
              width: '200px',
              opacity: isRecording ? 0.5 : 1
            }}
          >
            <option value="microphone">🎤 マイク音声</option>
            <option value="desktop">🖥️ デスクトップ音声</option>
            <option value="stereo-mix">🔊 ステレオミックス</option>
            <option value="mixing">🎛️ ミキシング</option>
          </select>
          {inputType === 'desktop' && (
            <div className="text-secondary" style={{ fontSize: '11px' }}>
              ※画面共有で「システム音声を共有」を有効にしてください
              <br />
              ⚠️ マイク音声も混入する場合は、Windows音声設定でマイクの「聞く」を無効にしてください
            </div>
          )}
          {inputType === 'stereo-mix' && (
            <div className="text-secondary" style={{ fontSize: '11px' }}>
              ※システム音声のみを録音します。マイク音声も含む場合があります。
            </div>
          )}
          {inputType === 'mixing' && (
            <div className="text-secondary" style={{ fontSize: '11px' }}>
              ※マイク音声とデスクトップ音声を同時に録音します。
            </div>
          )}
        </div>

        {/* 入力デバイス選択（マイクの場合のみ） */}
        {inputType === 'microphone' && (
          <div className="flex items-center gap-md">
            <label className="text-secondary" style={{ minWidth: '100px' }}>入力デバイス:</label>
            <select 
              className="select flex-1"
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
              disabled={isRecording}
              style={{ opacity: isRecording ? 0.5 : 1 }}
            >
              {availableDevices.map(device => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `マイク ${device.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* マイクレベル表示（録音中のマイクの場合のみ） */}
        {inputType === 'microphone' && isRecording && micStatus && (
          <div className="flex items-center gap-md">
            <label className="text-secondary" style={{ minWidth: '100px' }}>音声レベル:</label>
            <div className="flex items-center gap-sm flex-1">
              {/* 音声レベルバー */}
              <div 
                style={{
                  width: '200px',
                  height: '20px',
                  backgroundColor: '#333',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  border: '1px solid #555',
                  position: 'relative'
                }}
              >
                {/* 音声レベル（緑～黄～赤のグラデーション） */}
                <div
                  style={{
                    width: `${micStatus.inputLevel}%`,
                    height: '100%',
                    backgroundColor: micStatus.inputLevel < 30 ? '#4CAF50' : 
                                     micStatus.inputLevel < 70 ? '#FF9800' : '#F44336',
                    transition: 'width 0.1s ease-out'
                  }}
                />
                {/* ピークレベルライン */}
                <div
                  style={{
                    position: 'absolute',
                    left: `${micStatus.peakLevel}%`,
                    top: 0,
                    width: '2px',
                    height: '100%',
                    backgroundColor: '#fff',
                    transition: 'left 0.1s ease-out'
                  }}
                />
              </div>
              
              {/* 数値表示 */}
              <div style={{ 
                fontSize: '12px', 
                minWidth: '60px',
                color: micStatus.inputLevel < 5 ? '#F44336' : 
                       micStatus.inputLevel < 15 ? '#FF9800' : '#4CAF50'
              }}>
                {micStatus.inputLevel}%
              </div>
              
              {/* ステータスアイコン */}
              <div style={{ fontSize: '14px' }}>
                {micStatus.isSilent ? '🔇' : 
                 micStatus.inputLevel < 15 ? '🔉' : 
                 micStatus.inputLevel < 50 ? '🔊' : '📢'}
              </div>
            </div>
          </div>
        )}

        {/* マイクアラート表示 */}
        {micAlerts.length > 0 && micAlerts.slice(-1).map((alert, index) => (
          <div key={index} className="flex items-center gap-md">
            <label className="text-secondary" style={{ minWidth: '100px' }}>⚠️ 音声診断:</label>
            <div style={{ 
              fontSize: '12px',
              color: alert.severity === 'error' ? '#F44336' : 
                     alert.severity === 'warning' ? '#FF9800' : '#2196F3',
              flex: 1
            }}>
              {alert.message}
              {alert.recommendation && (
                <div style={{ fontSize: '11px', color: '#888', marginTop: '2px' }}>
                  💡 {alert.recommendation}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* デスクトップソース選択（デスクトップの場合のみ） */}
        {inputType === 'desktop' && (
          <>
            <div className="flex items-center gap-md">
              <label className="text-secondary" style={{ minWidth: '100px' }}>キャプチャ対象:</label>
              <select 
                className="select flex-1"
                value={selectedDesktopSource}
                onChange={(e) => setSelectedDesktopSource(e.target.value)}
                disabled={isRecording}
              style={{ opacity: isRecording ? 0.5 : 1 }}
            >
              <option value="">選択してください</option>
              {desktopSources.map(source => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
            {desktopSources.length === 0 && (
              <div className="text-secondary" style={{ fontSize: '11px' }}>
                デスクトップソースを読み込み中...
              </div>
            )}
          </div>
        </>
        )}
        
        {/* システム音声デバイス選択（ステレオミックスの場合のみ） */}
        {inputType === 'stereo-mix' && (
          <div className="flex items-center gap-md">
            <label className="text-secondary" style={{ minWidth: '100px' }}>システム音声デバイス:</label>
            <select 
              className="select flex-1"
              value={selectedSystemDevice}
              onChange={(e) => setSelectedSystemDevice(e.target.value)}
              disabled={isRecording}
              style={{ opacity: isRecording ? 0.5 : 1 }}
            >
              <option value="">選択してください</option>
              {systemAudioDevices.map(device => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `システムデバイス ${device.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
            {systemAudioDevices.length === 0 && (
              <div className="text-secondary" style={{ fontSize: '11px' }}>
                システム音声デバイスが見つかりません。Windows設定でステレオミックスを有効化してください。
              </div>
            )}
          </div>
        )}
        
        {/* ミキシング設定（ミキシングモードの場合のみ） */}
        {inputType === 'mixing' && (
          <div className="mixing-panel">
            <h4 className="mixing-panel__title">🎛️ ミキシング設定</h4>
            
            {/* マイク音声設定 */}
            <div className="mixing-panel__row">
              <label className="mixing-panel__checkbox-group">
                <input 
                  type="checkbox" 
                  checked={mixingConfig.enableMicrophone}
                  onChange={(e) => setMixingConfig(prev => ({ ...prev, enableMicrophone: e.target.checked }))}
                  disabled={isRecording}
                />
                <span className="text-secondary">🎤 マイク音声を含める</span>
              </label>
              {mixingConfig.enableMicrophone && (
                <select 
                  className="select mixing-panel__device-select"
                  value={selectedDevice}
                  onChange={(e) => setSelectedDevice(e.target.value)}
                  disabled={isRecording}
                  style={{ opacity: isRecording ? 0.5 : 1 }}
                >
                  {availableDevices.map(device => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `マイク ${device.deviceId.slice(0, 8)}`}
                    </option>
                  ))}
                </select>
              )}
            </div>
            
            {/* デスクトップ音声設定 */}
            <div className="mixing-panel__row">
              <label className="mixing-panel__checkbox-group">
                <input 
                  type="checkbox" 
                  checked={mixingConfig.enableDesktop}
                  onChange={(e) => setMixingConfig(prev => ({ ...prev, enableDesktop: e.target.checked }))}
                  disabled={isRecording}
                />
                <span className="text-secondary">🖥️ デスクトップ音声を含める</span>
              </label>
              {mixingConfig.enableDesktop && (
                <select 
                  className="select mixing-panel__device-select"
                  value={selectedDesktopSource}
                  onChange={(e) => setSelectedDesktopSource(e.target.value)}
                  disabled={isRecording}
                  style={{ opacity: isRecording ? 0.5 : 1 }}
                >
                  <option value="">選択してください</option>
                  {desktopSources.map(source => (
                    <option key={source.id} value={source.id}>
                      {source.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            
            {/* 音声レベル調整 */}
            {!isRecording && (
              <div className="mixing-panel__gain-controls">
                <div className="mixing-panel__gain-group">
                  <label className="mixing-panel__gain-label">マイク:</label>
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.1"
                    value={mixingConfig.microphoneGain}
                    onChange={(e) => setMixingConfig(prev => ({ ...prev, microphoneGain: parseFloat(e.target.value) }))}
                    className="mixing-panel__gain-slider"
                  />
                  <span className="mixing-panel__gain-value">
                    {Math.round(mixingConfig.microphoneGain * 100)}%
                  </span>
                </div>
                <div className="mixing-panel__gain-group">
                  <label className="mixing-panel__gain-label">デスクトップ:</label>
                  <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.1"
                    value={mixingConfig.desktopGain}
                    onChange={(e) => setMixingConfig(prev => ({ ...prev, desktopGain: parseFloat(e.target.value) }))}
                    className="mixing-panel__gain-slider"
                  />
                  <span className="mixing-panel__gain-value">
                    {Math.round(mixingConfig.desktopGain * 100)}%
                  </span>
                </div>
              </div>
            )}
            
            {/* リアルタイム音声レベル表示（録音中のみ） */}
            {isRecording && (
              <div className="mixing-panel__levels">
                <div className="mixing-panel__levels-title">リアルタイム音声レベル:</div>
                <div className="mixing-panel__level-row">
                  <div className="mixing-panel__level-group">
                    <span className="mixing-panel__level-label">マイク:</span>
                    <div className="mixing-panel__level-bar">
                      <div 
                        className={`mixing-panel__level-fill ${
                          audioLevels.microphoneLevel > 0.8 ? 'mixing-panel__level-fill--high' : 
                          audioLevels.microphoneLevel > 0.5 ? 'mixing-panel__level-fill--medium' : 
                          'mixing-panel__level-fill--low'
                        }`}
                        style={{ width: `${audioLevels.microphoneLevel * 100}%` }}
                      />
                    </div>
                    <span className="mixing-panel__level-value">
                      {Math.round(audioLevels.microphoneLevel * 100)}%
                    </span>
                  </div>
                  <div className="mixing-panel__level-group">
                    <span className="mixing-panel__level-label">デスクトップ:</span>
                    <div className="mixing-panel__level-bar">
                      <div 
                        className={`mixing-panel__level-fill ${
                          audioLevels.desktopLevel > 0.8 ? 'mixing-panel__level-fill--high' : 
                          audioLevels.desktopLevel > 0.5 ? 'mixing-panel__level-fill--medium' : 
                          'mixing-panel__level-fill--low'
                        }`}
                        style={{ width: `${audioLevels.desktopLevel * 100}%` }}
                      />
                    </div>
                    <span className="mixing-panel__level-value">
                      {Math.round(audioLevels.desktopLevel * 100)}%
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* 録音コントロール */}
        <div className="flex items-center gap-md">
          <div className="flex gap-sm">
            {!isRecording ? (
              <>
                <button 
                  className="btn btn--success"
                  onClick={handleStartRecordingWithTranscription}
                  disabled={
                    (inputType === 'microphone' && !selectedDevice) ||
                    (inputType === 'desktop' && !selectedDesktopSource) ||
                    (inputType === 'stereo-mix' && !selectedSystemDevice) ||
                    (inputType === 'mixing' && !mixingConfig.enableMicrophone && !mixingConfig.enableDesktop) ||
                    (inputType === 'mixing' && mixingConfig.enableMicrophone && !selectedDevice) ||
                    (inputType === 'mixing' && mixingConfig.enableDesktop && !selectedDesktopSource)
                  }
                >
                  ● 録音・文字起こし
                </button>
                <button 
                  className="btn btn--secondary"
                  onClick={handleStartRecordingOnly}
                  disabled={
                    (inputType === 'microphone' && !selectedDevice) ||
                    (inputType === 'desktop' && !selectedDesktopSource) ||
                    (inputType === 'stereo-mix' && !selectedSystemDevice) ||
                    (inputType === 'mixing' && !mixingConfig.enableMicrophone && !mixingConfig.enableDesktop) ||
                    (inputType === 'mixing' && mixingConfig.enableMicrophone && !selectedDevice) ||
                    (inputType === 'mixing' && mixingConfig.enableDesktop && !selectedDesktopSource)
                  }
                >
                  ● 録音のみ
                </button>
              </>
            ) : (
              <>
                <button 
                  className="btn btn--error"
                  onClick={handleStopRecording}
                >
                  ■ 停止
                </button>
                <button 
                  className="btn"
                  onClick={handlePauseRecording}
                >
                  {isPaused ? '▶ 再開' : '⏸ 一時停止'}
                </button>
              </>
            )}
          </div>
          
          <div className="text-secondary">
            録音時間: <span className="text-primary">{formatTime(recordingTime)}</span>
          </div>
          
          {isRecording && (
            <div className="text-success">
              {isPaused ? '⏸ 一時停止中' : '● 録音中'}
            </div>
          )}
        </div>
        
      </div>
    </div>
  )
}

export default BottomPanel

