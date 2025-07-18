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

// VINT デコード
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

// VINT エンコード
function encodeVINT(value, removeMarker = false) {
  if (value === 0) {
    return removeMarker ? Buffer.from([0]) : Buffer.from([0x80]);
  }
  
  // 必要なバイト数を計算
  let length = 1;
  let temp = value;
  while (temp >= (removeMarker ? Math.pow(2, length * 8) : Math.pow(2, (length * 7)))) {
    length++;
    if (length > 8) throw new Error('Value too large for VINT encoding');
  }
  
  const bytes = [];
  temp = value;
  
  // 値をバイト配列に変換
  for (let i = 0; i < length; i++) {
    bytes.unshift(temp & 0xFF);
    temp = Math.floor(temp / 256);
  }
  
  // VINTマーカーを追加
  if (!removeMarker) {
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

// 浮動小数点数をIEEE 754 double形式でエンコード
function encodeFloat64(value) {
  const buffer = Buffer.allocUnsafe(8);
  buffer.writeDoubleBE(value, 0);
  return buffer;
}

// WebMファイルの詳細解析
function analyzeWebMInDetail(buffer) {
  const result = {
    ebmlHeader: null,
    segment: null,
    info: null,
    infoElements: [],
    hasDuration: false,
    tracks: null,
    firstCluster: null
  };
  
  let offset = 0;
  
  // EBML Header
  const ebmlIdResult = readVINT(buffer, offset, false);
  if (!ebmlIdResult || ebmlIdResult.value !== EBML_ELEMENTS.EBML) {
    throw new Error('Invalid WebM: EBML header not found');
  }
  offset += ebmlIdResult.length;
  
  const ebmlSizeResult = readVINT(buffer, offset, true);
  if (!ebmlSizeResult) throw new Error('Invalid EBML header size');
  offset += ebmlSizeResult.length;
  
  result.ebmlHeader = {
    start: 0,
    headerLength: ebmlIdResult.length + ebmlSizeResult.length,
    dataSize: ebmlSizeResult.value,
    totalSize: ebmlIdResult.length + ebmlSizeResult.length + ebmlSizeResult.value
  };
  
  offset = result.ebmlHeader.totalSize;
  
  // Segment
  const segmentIdResult = readVINT(buffer, offset, false);
  if (!segmentIdResult || segmentIdResult.value !== EBML_ELEMENTS.Segment) {
    throw new Error('Invalid WebM: Segment not found');
  }
  offset += segmentIdResult.length;
  
  const segmentSizeResult = readVINT(buffer, offset, true);
  if (!segmentSizeResult) throw new Error('Invalid Segment size');
  offset += segmentSizeResult.length;
  
  result.segment = {
    start: result.ebmlHeader.totalSize,
    headerLength: segmentIdResult.length + segmentSizeResult.length,
    dataStart: offset,
    size: segmentSizeResult.value
  };
  
  // Segment内の要素を解析
  while (offset < buffer.length && offset < result.segment.dataStart + 2048) {
    const elementIdResult = readVINT(buffer, offset, false);
    if (!elementIdResult) break;
    
    const elementId = elementIdResult.value;
    offset += elementIdResult.length;
    
    const elementSizeResult = readVINT(buffer, offset, true);
    if (!elementSizeResult) break;
    
    const elementSize = elementSizeResult.value;
    offset += elementSizeResult.length;
    
    const element = {
      id: elementId,
      start: offset - elementIdResult.length - elementSizeResult.length,
      headerLength: elementIdResult.length + elementSizeResult.length,
      dataStart: offset,
      size: elementSize
    };
    
    if (elementId === EBML_ELEMENTS.Info) {
      result.info = element;
      
      // Info内の要素を解析
      let infoOffset = offset;
      const infoEnd = elementSize === -1 ? offset + 1024 : offset + elementSize;
      
      while (infoOffset < infoEnd && infoOffset < buffer.length) {
        const infoElementIdResult = readVINT(buffer, infoOffset, false);
        if (!infoElementIdResult) break;
        
        const infoElementId = infoElementIdResult.value;
        infoOffset += infoElementIdResult.length;
        
        const infoElementSizeResult = readVINT(buffer, infoOffset, true);
        if (!infoElementSizeResult) break;
        
        const infoElementSize = infoElementSizeResult.value;
        infoOffset += infoElementSizeResult.length;
        
        const infoElement = {
          id: infoElementId,
          start: infoOffset - infoElementIdResult.length - infoElementSizeResult.length,
          headerLength: infoElementIdResult.length + infoElementSizeResult.length,
          dataStart: infoOffset,
          size: infoElementSize,
          dataEnd: infoOffset + infoElementSize
        };
        
        result.infoElements.push(infoElement);
        
        if (infoElementId === EBML_ELEMENTS.Duration) {
          result.hasDuration = true;
        }
        
        if (infoElementSize !== -1) {
          infoOffset += infoElementSize;
        } else {
          break;
        }
      }
    } else if (elementId === EBML_ELEMENTS.Tracks) {
      result.tracks = element;
    } else if (elementId === EBML_ELEMENTS.Cluster) {
      result.firstCluster = element;
      break;
    }
    
    if (elementSize !== -1) {
      offset += elementSize;
    } else {
      break;
    }
  }
  
  return result;
}

// Duration要素をInfo要素内に正しく挿入
function addDurationToWebMv2(inputPath, outputPath, durationMs) {
  console.log(`WebM Duration修正開始 (v2)...`);
  console.log(`入力ファイル: ${inputPath}`);
  console.log(`出力ファイル: ${outputPath}`);
  console.log(`Duration: ${durationMs}ms`);
  
  const buffer = fs.readFileSync(inputPath);
  const analysis = analyzeWebMInDetail(buffer);
  
  console.log(`詳細解析結果:`);
  console.log(`- EBML Header: ${JSON.stringify(analysis.ebmlHeader)}`);
  console.log(`- Segment: ${JSON.stringify(analysis.segment)}`);
  console.log(`- Info: ${JSON.stringify(analysis.info)}`);
  console.log(`- Info内要素数: ${analysis.infoElements.length}`);
  console.log(`- Duration存在: ${analysis.hasDuration}`);
  
  if (analysis.hasDuration) {
    console.log('✅ Duration要素は既に存在します。');
    return false;
  }
  
  if (!analysis.info) {
    throw new Error('Info要素が見つかりません。');
  }
  
  // TimecodeScaleを取得（デフォルト: 1,000,000ナノ秒）
  let timecodeScale = 1000000;
  const timecodeScaleElement = analysis.infoElements.find(el => el.id === EBML_ELEMENTS.TimecodeScale);
  if (timecodeScaleElement) {
    timecodeScale = 0;
    for (let i = 0; i < timecodeScaleElement.size; i++) {
      timecodeScale = (timecodeScale << 8) | buffer[timecodeScaleElement.dataStart + i];
    }
  }
  
  console.log(`TimecodeScale: ${timecodeScale}`);\n  \n  // Duration値を計算（TimecodeScale単位）
  const durationValue = (durationMs * 1000000) / timecodeScale;
  console.log(`計算されたDuration値: ${durationValue}`);
  
  // Duration要素を作成
  const durationId = encodeElementID(EBML_ELEMENTS.Duration);
  const durationData = encodeFloat64(durationValue);
  const durationSize = encodeVINT(durationData.length, true);
  const durationElement = Buffer.concat([durationId, durationSize, durationData]);
  
  console.log(`Duration要素バイト: ${durationElement.toString('hex')}`);
  console.log(`Duration要素サイズ: ${durationElement.length} bytes`);
  
  // Info要素内の適切な位置にDuration要素を挿入
  // TimecodeScaleの後、MuxingAppの前に挿入
  let insertPosition;
  const muxingAppElement = analysis.infoElements.find(el => el.id === EBML_ELEMENTS.MuxingApp);
  
  if (muxingAppElement) {
    insertPosition = muxingAppElement.start;
  } else {
    // MuxingAppがない場合、Info要素の最後に追加
    insertPosition = analysis.info.dataStart + analysis.info.size;
  }
  
  console.log(`Duration挿入位置: ${insertPosition}`);\n  \n  // 新しいファイルを構築
  const beforeDuration = buffer.slice(0, insertPosition);
  const afterDuration = buffer.slice(insertPosition);
  const newBuffer = Buffer.concat([beforeDuration, durationElement, afterDuration]);
  
  // Info要素のサイズを更新する必要がある場合
  if (analysis.info.size !== -1) {
    console.log('⚠️ Info要素のサイズが固定されています。完全な修正にはサイズ更新が必要です。');
    
    // 新しいInfo要素サイズを計算
    const newInfoSize = analysis.info.size + durationElement.length;
    console.log(`新しいInfo要素サイズ: ${analysis.info.size} + ${durationElement.length} = ${newInfoSize}`);
    
    // Infoサイズを更新（簡易版：同じバイト長で表現できる場合のみ）
    const originalInfoSizeBytes = readVINT(buffer, analysis.info.start + 4, true);
    const newInfoSizeBytes = encodeVINT(newInfoSize, true);
    
    if (originalInfoSizeBytes.length === newInfoSizeBytes.length) {
      console.log('Info要素のサイズを更新します。');
      // Info要素サイズの位置を計算
      const infoSizeStart = analysis.info.start + 4; // Info ID (4 bytes) の後
      for (let i = 0; i < newInfoSizeBytes.length; i++) {
        newBuffer[infoSizeStart + i] = newInfoSizeBytes[i];
      }
    } else {
      console.log('⚠️ Info要素サイズのバイト長が変わるため、サイズ更新をスキップします。');
      console.log('ファイルが正しく再生されない可能性があります。');
    }
  }
  
  fs.writeFileSync(outputPath, newBuffer);
  console.log(`✅ Duration要素を追加したファイルを作成しました: ${outputPath}`);
  
  return true;
}

// メイン実行
if (require.main === module) {
  const inputFile = 'D:\\work\\voise-encoder\\rec\\recording_20250713_091606.webm';
  const outputFile = 'D:\\work\\voise-encoder\\rec\\recording_20250713_091606_fixed_v2.webm';
  
  try {
    // 継続時間を推定（実際は録音時間を記録すべき）
    const stats = fs.statSync(inputFile);
    const fileSizeBytes = stats.size;
    const estimatedBitrate = 64000; // bits per second
    const estimatedDurationMs = (fileSizeBytes * 8) / estimatedBitrate * 1000;
    
    console.log(`推定Duration: ${estimatedDurationMs.toFixed(0)}ms`);
    
    // Duration要素を追加
    const success = addDurationToWebMv2(inputFile, outputFile, estimatedDurationMs);
    
    if (success) {
      console.log('\n=== 修正完了 ===');
      console.log(`修正されたファイル: ${outputFile}`);
    }
  } catch (error) {
    console.error('エラー:', error.message);
    console.error(error.stack);
  }
}

module.exports = {
  addDurationToWebMv2,
  analyzeWebMInDetail
};