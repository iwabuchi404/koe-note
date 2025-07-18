const fs = require('fs');

// EBML要素IDの定義
const EBML_ELEMENTS = {
  // EBML Header
  0x1A45DFA3: 'EBML',
  0x4286: 'EBMLVersion',
  0x42F7: 'EBMLReadVersion',
  0x42F2: 'EBMLMaxIDLength',
  0x42F3: 'EBMLMaxSizeLength',
  0x4282: 'DocType',
  0x4287: 'DocTypeVersion',
  0x4285: 'DocTypeReadVersion',
  
  // Segment
  0x18538067: 'Segment',
  
  // Meta Seek Information
  0x114D9B74: 'SeekHead',
  0x4DBB: 'Seek',
  0x53AB: 'SeekID',
  0x53AC: 'SeekPosition',
  
  // Segment Information
  0x1549A966: 'Info',
  0x73A4: 'SegmentUID',
  0x7384: 'SegmentFilename',
  0x3CB923: 'PrevUID',
  0x3C83AB: 'PrevFilename',
  0x3EB923: 'NextUID',
  0x3E83BB: 'NextFilename',
  0x4444: 'SegmentFamily',
  0x6924: 'ChapterTranslate',
  0x2AD7B1: 'TimecodeScale',
  0x4489: 'Duration',  // これが重要！
  0x4461: 'DateUTC',
  0x7BA9: 'Title',
  0x4D80: 'MuxingApp',
  0x5741: 'WritingApp',
  
  // Track
  0x1654AE6B: 'Tracks',
  0xAE: 'TrackEntry',
  0xD7: 'TrackNumber',
  0x73C5: 'TrackUID',
  0x83: 'TrackType',
  0xB9: 'FlagEnabled',
  0x88: 'FlagDefault',
  0x55AA: 'FlagForced',
  0x9C: 'FlagLacing',
  0x6DE7: 'MinCache',
  0x6DF8: 'MaxCache',
  0x23E383: 'DefaultDuration',
  0x23314F: 'TrackTimecodeScale',
  0x537F: 'TrackOffset',
  0x55EE: 'MaxBlockAdditionID',
  0x536E: 'Name',
  0x22B59C: 'Language',
  0x86: 'CodecID',
  0x63A2: 'CodecPrivate',
  0x258688: 'CodecName',
  
  // Cluster
  0x1F43B675: 'Cluster',
  0xE7: 'Timecode',
  0x5854: 'SilentTracks',
  0x58D7: 'SilentTrackNumber',
  0xA7: 'Position',
  0xAB: 'PrevSize',
  0xA3: 'SimpleBlock',
  0xA0: 'BlockGroup',
  0xA1: 'Block',
  0x9B: 'BlockDuration',
  0xFA: 'ReferencePriority',
  0xFB: 'ReferenceBlock',
  0xFD: 'ReferenceVirtual',
  0xA4: 'CodecState',
  0xA5: 'DiscardPadding',
  0x75A1: 'BlockAdditions',
  0xA6: 'BlockMore',
  0xEE: 'BlockAddID',
  0xA5: 'BlockAdditional'
};

// VINT (Variable-size integer) デコード
function readVINT(buffer, offset, removeVintMarker = false) {
  if (offset >= buffer.length) return null;
  
  const firstByte = buffer[offset];
  let length = 1;
  let mask = 0x80;
  
  // 最初のビットが1になるまでの長さを見つける
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

// Element ID用の特別な読み取り（VINTマーカーを保持）
function readElementID(buffer, offset) {
  return readVINT(buffer, offset, false); // VINTマーカーを保持
}

// Element Size用の読み取り（VINTマーカーを除去）
function readElementSize(buffer, offset) {
  const result = readVINT(buffer, offset, true); // VINTマーカーを除去
  if (result && result.value === Math.pow(2, result.length * 7) - 1) {
    // 不明なサイズ（全て1のパターン）
    return { value: -1, length: result.length };
  }
  return result;
}

// EBML要素を解析
function parseEBMLElement(buffer, offset) {
  if (offset >= buffer.length) return null;
  
  // Element ID を読み取り
  const idResult = readElementID(buffer, offset);
  if (!idResult) return null;
  
  const elementId = idResult.value;
  offset += idResult.length;
  
  // Element Size を読み取り
  const sizeResult = readElementSize(buffer, offset);
  if (!sizeResult) return null;
  
  const elementSize = sizeResult.value;
  offset += sizeResult.length;
  
  // データ部分
  const dataStart = offset;
  const dataEnd = offset + elementSize;
  
  if (dataEnd > buffer.length) {
    // データサイズが不明または無制限の場合
    return {
      id: elementId,
      name: EBML_ELEMENTS[elementId] || `Unknown_0x${elementId.toString(16)}`,
      size: elementSize,
      dataStart,
      dataEnd: buffer.length,
      nextOffset: buffer.length
    };
  }
  
  return {
    id: elementId,
    name: EBML_ELEMENTS[elementId] || `Unknown_0x${elementId.toString(16)}`,
    size: elementSize,
    dataStart,
    dataEnd,
    nextOffset: dataEnd
  };
}

// WebMファイルを解析
function analyzeWebMFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  console.log(`WebMファイル解析: ${filePath}`);
  console.log(`ファイルサイズ: ${buffer.length} bytes\n`);
  
  let offset = 0;
  let level = 0;
  let foundDuration = false;
  let segmentInfoFound = false;
  
  while (offset < buffer.length && offset < 2048) { // 最初の2KBのみ解析
    const element = parseEBMLElement(buffer, offset);
    if (!element) break;
    
    const indent = '  '.repeat(level);
    console.log(`${indent}${element.name} (ID: 0x${element.id.toString(16)}, Size: ${element.size})`);
    
    // 特定の要素をチェック
    if (element.name === 'Info') {
      segmentInfoFound = true;
      console.log(`${indent}  >>> Segment Info要素を発見！`);
    }
    
    if (element.name === 'Duration') {
      foundDuration = true;
      console.log(`${indent}  >>> Duration要素を発見！`);
      
      // Durationの値を読み取り（浮動小数点数として）
      if (element.size === 8) {
        const durationBuffer = buffer.slice(element.dataStart, element.dataEnd);
        const view = new DataView(durationBuffer.buffer, durationBuffer.byteOffset, durationBuffer.byteLength);
        const duration = view.getFloat64(0, false); // ビッグエンディアン
        console.log(`${indent}    Duration値: ${duration}`);
      }
    }
    
    // TimecodeScaleもチェック
    if (element.name === 'TimecodeScale') {
      console.log(`${indent}  >>> TimecodeScale要素を発見！`);
      if (element.size <= 8) {
        let timecodeScale = 0;
        for (let i = 0; i < element.size; i++) {
          timecodeScale = (timecodeScale << 8) | buffer[element.dataStart + i];
        }
        console.log(`${indent}    TimecodeScale値: ${timecodeScale} nanoseconds`);
      }
    }
    
    // コンテナ要素の場合、レベルを増やして内部を解析
    if (['EBML', 'Segment', 'Info', 'Tracks', 'TrackEntry'].includes(element.name)) {
      if (element.size < 0xFFFFFFFFFFFFFF) { // サイズが決まっている場合のみ
        level++;
        offset = element.dataStart;
        continue;
      }
    }
    
    offset = element.nextOffset;
    
    // レベル調整
    if (offset >= element.dataEnd && level > 0) {
      level--;
    }
  }
  
  console.log('\n=== 解析結果 ===');
  console.log(`Segment Info要素: ${segmentInfoFound ? '存在' : '未発見'}`);
  console.log(`Duration要素: ${foundDuration ? '存在' : '未発見'}`);
  
  if (!foundDuration) {
    console.log('\n❌ Duration要素が見つかりません！');
    console.log('これがHTMLAudioElement.duration = Infinityの原因です。');
  } else {
    console.log('\n✅ Duration要素は存在します。');
  }
}

// メイン実行
const webmFile = process.argv[2] || 'D:\\work\\voise-encoder\\rec\\recording_20250713_091606.webm';
analyzeWebMFile(webmFile);