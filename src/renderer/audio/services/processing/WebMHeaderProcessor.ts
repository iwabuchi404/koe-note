/**
 * WebMHeaderProcessor - WebMファイルヘッダー処理システム
 * 
 * AudioChunkGeneratorから分離した専門的なWebMヘッダー処理クラス
 * 
 * 責務:
 * - WebMヘッダーの抽出と検証
 * - DocTypeの修正（matroska → webm）
 * - 最小限ヘッダーの生成
 * - チャンク用ヘッダーの作成
 */

import { LoggerFactory, LogCategories } from '../../../utils/LoggerFactory';
import { SimpleBlockAligner, AlignmentResult } from './SimpleBlockAligner';

export interface WebMHeaderInfo {
  fullHeader: Uint8Array;
  minimalHeader: Uint8Array;
  headerSize: number;
  isValid: boolean;
}

export interface WebMProcessingResult {
  success: boolean;
  data?: Uint8Array;
  error?: string;
}

export class WebMHeaderProcessor {
  private logger = LoggerFactory.getLogger(LogCategories.AUDIO_WEBM_PROCESSOR);
  private cachedHeaderInfo: WebMHeaderInfo | null = null;
  private simpleBlockAligner: SimpleBlockAligner;
  
  // 保守的アライメント設定（生音声データ対応版 - 実データ分析版）
  private readonly ENABLE_ALIGNMENT = true; // アライメント機能の有効化
  private readonly SAFE_TRIM_THRESHOLD = 300; // 実データ分析に基づく閾値（160-940バイト範囲の中央値）
  private readonly DETECTION_ONLY_MODE = false; // 検出のみモード（実際のトリミングを無効化）

  constructor() {
    console.log('🔧 WebMHeaderProcessor: コンストラクタ開始');
    this.simpleBlockAligner = new SimpleBlockAligner(true);
    console.log('🔧 WebMHeaderProcessor: SimpleBlockAligner作成完了');
    this.logger.info('WebMHeaderProcessor初期化完了 - 保守的アライメント統合', {
      enableAlignment: this.ENABLE_ALIGNMENT,
      safeTrimThreshold: this.SAFE_TRIM_THRESHOLD,
      detectionOnlyMode: this.DETECTION_ONLY_MODE
    });
    console.log('🔧 WebMHeaderProcessor: 初期化完了');
  }

  /**
   * 最初のチャンクからWebMヘッダーを抽出
   */
  async extractHeaderFromChunk(firstChunk: Blob): Promise<WebMHeaderInfo> {
    try {
      this.logger.info('WebMヘッダー抽出開始', { chunkSize: firstChunk.size });
      
      const arrayBuffer = await firstChunk.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // WebMヘッダーの検証
      if (!this.isValidWebMHeader(uint8Array)) {
        throw new Error('有効なWebMヘッダーが見つかりません');
      }
      
      // ヘッダーサイズを特定
      const headerSize = this.findHeaderEnd(uint8Array);
      
      if (headerSize <= 0) {
        throw new Error('WebMヘッダーの終端を特定できません');
      }
      
      // ヘッダーを抽出
      let fullHeader = uint8Array.slice(0, headerSize);
      
      // DocTypeをwebmに修正
      fullHeader = this.fixDocType(fullHeader);
      
      // 最小限ヘッダーを生成
      const minimalHeader = this.createMinimalHeader();
      
      const headerInfo: WebMHeaderInfo = {
        fullHeader,
        minimalHeader,
        headerSize: fullHeader.length,
        isValid: true
      };
      
      // キャッシュに保存
      this.cachedHeaderInfo = headerInfo;
      
      this.logger.info('WebMヘッダー抽出完了', {
        fullHeaderSize: fullHeader.length,
        minimalHeaderSize: minimalHeader.length
      });
      
      return headerInfo;
      
    } catch (error) {
      this.logger.error('WebMヘッダー抽出エラー', error instanceof Error ? error : undefined, error);
      
      // フォールバック: 最小限ヘッダーのみ提供
      const minimalHeader = this.createMinimalHeader();
      return {
        fullHeader: new Uint8Array(0),
        minimalHeader,
        headerSize: 0,
        isValid: false
      };
    }
  }

  /**
   * WebMヘッダーの妥当性を検証
   */
  private isValidWebMHeader(data: Uint8Array): boolean {
    if (data.length < 4) return false;
    
    // EBML magic number: 0x1A 0x45 0xDF 0xA3
    return data[0] === 0x1A && data[1] === 0x45 && 
           data[2] === 0xDF && data[3] === 0xA3;
  }

  /**
   * WebMヘッダーの終端を検出
   */
  private findHeaderEnd(data: Uint8Array): number {
    try {
      // Cluster要素 (0x1F43B675) を探してヘッダー終端を特定
      for (let i = 0; i < Math.min(data.length - 8, 4096); i++) {
        if (data[i] === 0x1F && data[i + 1] === 0x43 && 
            data[i + 2] === 0xB6 && data[i + 3] === 0x75) {
          this.logger.debug('Cluster要素検出 - ヘッダー終端', { position: i });
          return i;
        }
      }
      
      // フォールバック: 保守的なサイズを返す
      const fallbackSize = Math.min(2048, Math.floor(data.length * 0.1));
      this.logger.warn('ヘッダー終端検出失敗 - フォールバック使用', { fallbackSize });
      return fallbackSize;
      
    } catch (error) {
      this.logger.error('ヘッダー終端検出エラー', error instanceof Error ? error : undefined, error);
      return 0;
    }
  }

  /**
   * DocTypeをmatroskaからwebmに修正
   */
  private fixDocType(headerData: Uint8Array): Uint8Array {
    try {
      this.logger.debug('DocType修正開始', { headerSize: headerData.length });
      
      // DocType要素 (0x4282) を探す
      for (let i = 0; i < headerData.length - 12; i++) {
        if (headerData[i] === 0x42 && headerData[i + 1] === 0x82) {
          const result = this.processDocTypeElement(headerData, i);
          if (result.success && result.data) {
            this.logger.info('DocType修正完了');
            return result.data;
          }
        }
      }
      
      this.logger.debug('DocType要素が見つからない - 元データを返す');
      return headerData;
      
    } catch (error) {
      this.logger.error('DocType修正エラー', error instanceof Error ? error : undefined, error);
      return headerData;
    }
  }

  /**
   * DocType要素を処理
   */
  private processDocTypeElement(data: Uint8Array, pos: number): WebMProcessingResult {
    try {
      const sizePos = pos + 2;
      const dataPos = pos + 3;
      const sizeValue = data[sizePos];
      
      let docTypeLength = 0;
      
      // サイズ値からDocType長を特定
      if (sizeValue === 0x88) {
        docTypeLength = 8; // "matroska"
      } else if (sizeValue === 0x84) {
        docTypeLength = 4; // "webm"
      } else if ((sizeValue & 0x80) === 0x80) {
        docTypeLength = sizeValue & 0x7F;
      } else {
        return { success: false, error: '不明なサイズ形式' };
      }
      
      if (docTypeLength === 0 || dataPos + docTypeLength > data.length) {
        return { success: false, error: 'DocTypeデータが不正' };
      }
      
      // 現在のDocTypeを読み取り
      const currentDocType = Array.from(data.slice(dataPos, dataPos + docTypeLength))
        .map(b => String.fromCharCode(b)).join('');
      
      if (currentDocType === 'matroska') {
        // matroska → webm に変更
        return this.convertMatroskaToWebm(data, sizePos, dataPos);
      } else if (currentDocType === 'webm') {
        this.logger.debug('DocTypeは既にwebm');
        return { success: true, data };
      }
      
      return { success: false, error: '未対応のDocType' };
      
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  /**
   * matroskaをwebmに変換
   */
  private convertMatroskaToWebm(data: Uint8Array, sizePos: number, dataPos: number): WebMProcessingResult {
    try {
      // サイズを8から4に変更
      const newData = new Uint8Array(data.length - 4);
      
      // 修正前部分をコピー
      newData.set(data.slice(0, sizePos), 0);
      
      // サイズを4バイトに変更
      newData[sizePos] = 0x84;
      
      // "webm"を書き込み
      newData[dataPos] = 0x77; // 'w'
      newData[dataPos + 1] = 0x65; // 'e'
      newData[dataPos + 2] = 0x62; // 'b'
      newData[dataPos + 3] = 0x6D; // 'm'
      
      // 残りの部分をコピー（4バイト短縮）
      if (dataPos + 8 < data.length) {
        newData.set(data.slice(dataPos + 8), dataPos + 4);
      }
      
      this.logger.debug('matroska→webm変換完了', { 
        originalSize: data.length, 
        newSize: newData.length 
      });
      
      return { success: true, data: newData };
      
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }

  /**
   * 最小限のWebMヘッダーを作成
   */
  private createMinimalHeader(): Uint8Array {
    // Web標準準拠の最小限WebMヘッダー
    return new Uint8Array([
      // EBML Header
      0x1A, 0x45, 0xDF, 0xA3, // EBML
      0x9B, // Size
      0x42, 0x86, 0x81, 0x01, // EBMLVersion = 1
      0x42, 0xF7, 0x81, 0x01, // EBMLReadVersion = 1  
      0x42, 0xF2, 0x81, 0x04, // EBMLMaxIDLength = 4
      0x42, 0xF3, 0x81, 0x08, // EBMLMaxSizeLength = 8
      0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6D, // DocType = "webm"
      0x42, 0x87, 0x81, 0x02, // DocTypeVersion = 2
      0x42, 0x85, 0x81, 0x02, // DocTypeReadVersion = 2
      
      // Segment start
      0x18, 0x53, 0x80, 0x67, // Segment
      0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF // Unknown size
    ]);
  }

  /**
   * 生音声データのアライメント処理
   */
  async alignAudioData(rawAudioData: Uint8Array): Promise<Uint8Array> {
    if (!this.ENABLE_ALIGNMENT || rawAudioData.length === 0) {
      console.log('🎯 アライメントスキップ', { enableAlignment: this.ENABLE_ALIGNMENT, dataSize: rawAudioData.length });
      return rawAudioData;
    }

    try {
      console.log('🎯 生音声データアライメント開始', { dataSize: rawAudioData.length });
      const alignmentResult = this.simpleBlockAligner.alignChunkToSimpleBlock(rawAudioData);
      console.log('🎯 生音声データアライメント結果', {
        trimmedBytes: alignmentResult.trimmedBytes,
        confidence: alignmentResult.confidence,
        simpleBlockFound: alignmentResult.simpleBlockFound
      });

      // 保守的アライメント判定
      let useAlignedData = false;
      let reason = '';

      if (this.DETECTION_ONLY_MODE) {
        reason = '検出のみモード - 元データを使用';
      } else if (alignmentResult.trimmedBytes > this.SAFE_TRIM_THRESHOLD) {
        reason = `トリミング量が閾値超過 (${alignmentResult.trimmedBytes} > ${this.SAFE_TRIM_THRESHOLD}) - 元データを使用`;
      } else if (alignmentResult.confidence < 0.6) {
        reason = `信頼度が低い (${alignmentResult.confidence.toFixed(3)} < 0.6) - 元データを使用`;
      } else if (!alignmentResult.simpleBlockFound) {
        reason = 'SimpleBlock未検出 - 元データを使用';
      } else if (alignmentResult.diagnostics.recommendedAction === 'reject_chunk') {
        reason = 'チャンク品質不良 - 元データを使用';
      } else {
        useAlignedData = true;
        reason = '保守的アライメント適用';
      }

      console.log('🎯 生音声データアライメント判定結果', {
        useAlignedData,
        reason,
        alignmentApplied: useAlignedData
      });

      return useAlignedData ? alignmentResult.alignedData : rawAudioData;

    } catch (error) {
      this.logger.error('生音声データアライメントエラー - 元データを使用', error instanceof Error ? error : undefined, error);
      return rawAudioData;
    }
  }

  /**
   * 保守的アライメントを適用したヘッダー付きチャンク作成（非推奨）
   */
  createAlignedHeaderedChunk(chunkData: Uint8Array, useMinimal: boolean = false): Blob {
    console.log('🎯 createAlignedHeaderedChunk呼び出し', { dataSize: chunkData.length, useMinimal });
    
    if (!this.ENABLE_ALIGNMENT) {
      console.log('🎯 アライメント無効 - 通常処理に移行');
      return this.createHeaderedChunk(chunkData, useMinimal);
    }

    try {
      console.log('🎯 SimpleBlockAligner呼び出し開始', { dataSize: chunkData.length });
      const alignmentResult = this.simpleBlockAligner.alignChunkToSimpleBlock(chunkData);
      console.log('🎯 SimpleBlockAligner呼び出し完了', { 
        trimmedBytes: alignmentResult.trimmedBytes,
        confidence: alignmentResult.confidence,
        simpleBlockFound: alignmentResult.simpleBlockFound 
      });
      
      console.log('🎯 SimpleBlockアライメント詳細', {
        originalSize: chunkData.length,
        alignedSize: alignmentResult.alignedData.length,
        trimmedBytes: alignmentResult.trimmedBytes,
        confidence: alignmentResult.confidence.toFixed(3),
        simpleBlockFound: alignmentResult.simpleBlockFound,
        recommendedAction: alignmentResult.diagnostics.recommendedAction,
        alignmentApplied: false // 初期値、後で更新
      });
      this.logger.info('SimpleBlockアライメント詳細', {
        originalSize: chunkData.length,
        alignedSize: alignmentResult.alignedData.length,
        trimmedBytes: alignmentResult.trimmedBytes,
        confidence: alignmentResult.confidence.toFixed(3),
        simpleBlockFound: alignmentResult.simpleBlockFound,
        recommendedAction: alignmentResult.diagnostics.recommendedAction,
        alignmentApplied: false // 初期値、後で更新
      });

      // 保守的アライメント判定
      let useAlignedData = false;
      let reason = '';

      if (this.DETECTION_ONLY_MODE) {
        reason = '検出のみモード - 元データを使用';
      } else if (alignmentResult.trimmedBytes > this.SAFE_TRIM_THRESHOLD) {
        reason = `トリミング量が閾値超過 (${alignmentResult.trimmedBytes} > ${this.SAFE_TRIM_THRESHOLD}) - 元データを使用`;
      } else if (alignmentResult.confidence < 0.6) {
        reason = `信頼度が低い (${alignmentResult.confidence.toFixed(3)} < 0.6) - 元データを使用`;
      } else if (!alignmentResult.simpleBlockFound) {
        reason = 'SimpleBlock未検出 - 元データを使用';
      } else if (alignmentResult.diagnostics.recommendedAction === 'reject_chunk') {
        reason = 'チャンク品質不良 - 元データを使用';
      } else {
        useAlignedData = true;
        reason = '保守的アライメント適用';
      }

      // 判定結果をログに記録
      console.log('🎯 保守的アライメント判定結果', {
        useAlignedData,
        reason,
        alignmentApplied: useAlignedData
      });
      this.logger.info('保守的アライメント判定結果', {
        useAlignedData,
        reason,
        alignmentApplied: useAlignedData
      });

      const finalData = useAlignedData ? alignmentResult.alignedData : chunkData;
      return this.createHeaderedChunk(finalData, useMinimal);

    } catch (error) {
      this.logger.error('アライメント処理エラー - 元データを使用', error instanceof Error ? error : undefined, error);
      return this.createHeaderedChunk(chunkData, useMinimal);
    }
  }

  /**
   * チャンク用のヘッダー付きBlobを作成（従来版）
   */
  createHeaderedChunk(chunkData: Uint8Array, useMinimal: boolean = false): Blob {
    try {
      const headerInfo = this.cachedHeaderInfo;
      
      if (!headerInfo || !headerInfo.isValid) {
        this.logger.warn('ヘッダー情報が無効 - 最小限ヘッダーを使用');
        const minimalHeader = this.createMinimalHeader();
        const combined = new Uint8Array(minimalHeader.length + chunkData.length);
        combined.set(minimalHeader, 0);
        combined.set(chunkData, minimalHeader.length);
        return new Blob([combined], { type: 'audio/webm' });
      }
      
      const header = useMinimal ? headerInfo.minimalHeader : headerInfo.fullHeader;
      const combined = new Uint8Array(header.length + chunkData.length);
      combined.set(header, 0);
      combined.set(chunkData, header.length);
      
      this.logger.debug('ヘッダー付きチャンク作成', {
        headerType: useMinimal ? 'minimal' : 'full',
        headerSize: header.length,
        dataSize: chunkData.length,
        totalSize: combined.length
      });
      
      return new Blob([combined], { type: 'audio/webm' });
      
    } catch (error) {
      this.logger.error('ヘッダー付きチャンク作成エラー', error instanceof Error ? error : undefined, error);
      // フォールバック: データのみでBlobを作成
      return new Blob([chunkData], { type: 'audio/webm' });
    }
  }

  /**
   * 現在のヘッダー情報を取得
   */
  getHeaderInfo(): WebMHeaderInfo | null {
    return this.cachedHeaderInfo;
  }

  /**
   * ヘッダー情報をクリア
   */
  clearCache(): void {
    this.cachedHeaderInfo = null;
    this.logger.debug('ヘッダーキャッシュクリア');
  }

  /**
   * クリーンアップ
   */
  cleanup(): void {
    this.clearCache();
    this.logger.info('WebMHeaderProcessor クリーンアップ完了');
  }
}