const fs = require('fs');

// EBML要素IDの定義
const EBML_ELEMENTS = {
  EBML: 0x1A45DFA3,
  Segment: 0x18538067,
  Info: 0x1549A966,
  TimecodeScale: 0x2AD7B1,
  Duration: 0x4489,
  MuxingApp: 0x4D80,
  WritingApp: 0x5741,
  Tracks: 0x1654AE6B,
  Cluster: 0x1F43B675
};

// VINT エンコード
function encodeVINT(value, length = null, removeMarker = false) {
  // 値をバイト配列に変換
  const bytes = [];
  let temp = value;
  
  if (temp === 0) {
    bytes.push(0);
  } else {
    while (temp > 0) {
      bytes.unshift(temp & 0xFF);
      temp = Math.floor(temp / 256);
    }
  }
  
  // 長さが指定されていない場合、必要最小限の長さを計算
  if (!length) {
    length = bytes.length;
    // VINTマーカー用に1ビット確保が必要
    const maxValue = Math.pow(2, length * 7) - 1;
    if (value >= maxValue) {
      length++;
    }
  }
  
  // バイト配列を指定長に調整
  while (bytes.length < length) {
    bytes.unshift(0);
  }
  
  if (!removeMarker) {
    // 最初のバイトにVINTマーカーを追加
    const marker = 0x80 >>> (length - 1);
    bytes[0] |= marker;
  }
  
  return Buffer.from(bytes);
}

// Element IDをエンコード
function encodeElementID(id) {
  const bytes = [];
  let temp = id;
  
  while (temp > 0) {
    bytes.unshift(temp & 0xFF);
    temp = Math.floor(temp / 256);
  }
  
  return Buffer.from(bytes);
}

// Element Sizeをエンコード
function encodeElementSize(size) {
  return encodeVINT(size, null, true);
}

// 浮動小数点数をIEEE 754 double形式でエンコード
function encodeFloat64(value) {
  const buffer = Buffer.allocUnsafe(8);
  buffer.writeDoubleBE(value, 0);
  return buffer;
}

// VINT デコード（解析用）
function readVINT(buffer, offset, removeVintMarker = false) {
  if (offset >= buffer.length) return null;
  
  const firstByte = buffer[offset];
  let length = 1;
  let mask = 0x80;
  
  while (!(firstByte & mask) && length <= 8) {
    mask >>= 1;
    length++;
  }
  
  if (length > 8) return null;
  
  let value = removeVintMarker ? (firstByte & (mask - 1)) : firstByte;
  for (let i = 1; i < length; i++) {
    if (offset + i >= buffer.length) return null;
    value = (value << 8) | buffer[offset + i];
  }
  
  return { value, length };
}

// WebMファイルの解析結果
function analyzeWebMStructure(buffer) {
  const structure = {
    ebmlHeaderEnd: 0,
    segmentStart: 0,
    infoElement: null,
    hasDuration: false,
    timecodeScale: 1000000, // デフォルト値
    firstClusterOffset: 0
  };
  
  let offset = 0;
  
  // EBML Header をスキップ
  const ebmlResult = readVINT(buffer, offset, false);
  if (!ebmlResult || ebmlResult.value !== EBML_ELEMENTS.EBML) {
    throw new Error('Invalid WebM file: EBML header not found');
  }
  offset += ebmlResult.length;
  
  const ebmlSizeResult = readVINT(buffer, offset, true);
  if (!ebmlSizeResult) {
    throw new Error('Invalid EBML header size');
  }
  offset += ebmlSizeResult.length;
  offset += ebmlSizeResult.value; // EBML data をスキップ
  
  structure.ebmlHeaderEnd = offset;
  
  // Segment 要素を見つける
  const segmentResult = readVINT(buffer, offset, false);
  if (!segmentResult || segmentResult.value !== EBML_ELEMENTS.Segment) {
    throw new Error('Invalid WebM file: Segment not found');
  }
  structure.segmentStart = offset;
  offset += segmentResult.length;
  
  const segmentSizeResult = readVINT(buffer, offset, true);
  if (!segmentSizeResult) {
    throw new Error('Invalid Segment size');
  }
  offset += segmentSizeResult.length;
  
  // Segment内の要素を解析
  while (offset < buffer.length && offset < structure.segmentStart + 2048) {
    const elementResult = readVINT(buffer, offset, false);
    if (!elementResult) break;
    
    const elementId = elementResult.value;
    offset += elementResult.length;
    
    const sizeResult = readVINT(buffer, offset, true);
    if (!sizeResult) break;
    
    const elementSize = sizeResult.value;
    offset += sizeResult.length;
    
    if (elementId === EBML_ELEMENTS.Info) {
      structure.infoElement = {
        start: offset - elementResult.length - sizeResult.length,
        dataStart: offset,
        dataEnd: elementSize === -1 ? -1 : offset + elementSize,
        size: elementSize
      };
      
      // Info内のDurationをチェック
      const infoEnd = elementSize === -1 ? offset + 1024 : offset + elementSize;
      let infoOffset = offset;
      
      while (infoOffset < infoEnd && infoOffset < buffer.length) {
        const infoElementResult = readVINT(buffer, infoOffset, false);
        if (!infoElementResult) break;
        
        const infoElementId = infoElementResult.value;
        infoOffset += infoElementResult.length;
        
        const infoSizeResult = readVINT(buffer, infoOffset, true);
        if (!infoSizeResult) break;
        
        const infoElementSize = infoSizeResult.value;
        infoOffset += infoSizeResult.length;
        
        if (infoElementId === EBML_ELEMENTS.Duration) {
          structure.hasDuration = true;
        } else if (infoElementId === EBML_ELEMENTS.TimecodeScale) {
          let timecodeScale = 0;
          for (let i = 0; i < infoElementSize; i++) {
            timecodeScale = (timecodeScale << 8) | buffer[infoOffset + i];
          }
          structure.timecodeScale = timecodeScale;
        }
        
        if (infoElementSize !== -1) {
          infoOffset += infoElementSize;
        } else {
          break;
        }
      }
    } else if (elementId === EBML_ELEMENTS.Cluster) {
      structure.firstClusterOffset = offset - elementResult.length - sizeResult.length;
      break;
    }
    
    if (elementSize !== -1) {
      offset += elementSize;
    } else {
      break;
    }
  }
  
  return structure;
}

// Duration要素を作成
function createDurationElement(durationMs, timecodeScale) {
  // Duration値を計算（TimecodeScaleの単位で）
  const durationValue = (durationMs * 1000000) / timecodeScale; // ミリ秒からナノ秒、その後TimecodeScale単位に変換
  
  const durationId = encodeElementID(EBML_ELEMENTS.Duration);
  const durationData = encodeFloat64(durationValue);
  const durationSize = encodeElementSize(durationData.length);
  
  return Buffer.concat([durationId, durationSize, durationData]);
}

// WebMファイルにDuration要素を追加
function addDurationToWebM(inputPath, outputPath, durationMs) {
  console.log(`WebM Duration修正開始...`);
  console.log(`入力ファイル: ${inputPath}`);
  console.log(`出力ファイル: ${outputPath}`);
  console.log(`Duration: ${durationMs}ms`);
  
  const buffer = fs.readFileSync(inputPath);
  const structure = analyzeWebMStructure(buffer);
  
  console.log(`WebM構造解析結果:`);
  console.log(`- EBML Header終了位置: ${structure.ebmlHeaderEnd}`);
  console.log(`- Segment開始位置: ${structure.segmentStart}`);
  console.log(`- Info要素: ${structure.infoElement ? '存在' : '未発見'}`);
  console.log(`- Duration要素: ${structure.hasDuration ? '存在' : '未発見'}`);
  console.log(`- TimecodeScale: ${structure.timecodeScale}`);
  console.log(`- 最初のCluster位置: ${structure.firstClusterOffset}`);
  
  if (structure.hasDuration) {
    console.log('✅ Duration要素は既に存在します。修正の必要はありません。');
    return false;
  }
  
  if (!structure.infoElement) {
    throw new Error('Info要素が見つかりません。このファイルは修正できません。');
  }
  
  // Duration要素を作成
  const durationElement = createDurationElement(durationMs, structure.timecodeScale);
  console.log(`作成されたDuration要素サイズ: ${durationElement.length} bytes`);
  
  // 新しいファイルを構築
  const parts = [];
  
  // EBML Header + Segment Header + Info要素の開始まで
  parts.push(buffer.slice(0, structure.infoElement.dataEnd));
  
  // Duration要素を追加
  parts.push(durationElement);
  
  // 残りの部分
  parts.push(buffer.slice(structure.infoElement.dataEnd));
  
  const newBuffer = Buffer.concat(parts);
  
  // Info要素のサイズを更新する必要があるかチェック
  // (簡略化のため、今回は元のサイズが不明(-1)の場合のみ対応)
  if (structure.infoElement.size === -1) {
    console.log('Info要素のサイズが不明のため、そのまま追加します。');
  } else {
    console.log('⚠️ Info要素のサイズが固定されています。サイズ更新は未実装です。');
    console.log('ファイルが正しく再生されない可能性があります。');
  }
  
  fs.writeFileSync(outputPath, newBuffer);
  console.log(`✅ Duration要素を追加した新しいファイルを作成しました: ${outputPath}`);
  
  return true;
}

// 音声ファイルの継続時間を推定（簡易版）
function estimateAudioDuration(filePath) {
  const stats = fs.statSync(filePath);
  const fileSizeBytes = stats.size;
  
  // 簡易推定: Opus音声の平均ビットレート64kbpsと仮定
  const estimatedBitrate = 64000; // bits per second
  const estimatedDurationSeconds = (fileSizeBytes * 8) / estimatedBitrate;
  const estimatedDurationMs = estimatedDurationSeconds * 1000;
  
  console.log(`ファイルサイズベース推定Duration: ${estimatedDurationMs.toFixed(0)}ms (${(estimatedDurationMs/1000).toFixed(1)}秒)`);
  return estimatedDurationMs;
}

// メイン実行
if (require.main === module) {
  const inputFile = 'D:\\work\\voise-encoder\\rec\\recording_20250713_091606.webm';
  const outputFile = 'D:\\work\\voise-encoder\\rec\\recording_20250713_091606_fixed.webm';
  
  try {
    // 継続時間を推定（実際のアプリケーションでは録音時間を記録すべき）
    const estimatedDuration = estimateAudioDuration(inputFile);
    
    // Duration要素を追加
    const success = addDurationToWebM(inputFile, outputFile, estimatedDuration);
    
    if (success) {
      console.log('\n=== 修正完了 ===');
      console.log(`修正されたファイル: ${outputFile}`);
      console.log('HTMLAudioElementでdurationが正常に取得できるはずです。');
    }
  } catch (error) {
    console.error('エラー:', error.message);
  }
}

module.exports = {
  addDurationToWebM,
  analyzeWebMStructure,
  createDurationElement,
  estimateAudioDuration
};