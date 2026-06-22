/**
 * モデル設定整合性チェックスクリプト
 * 
 * 以下の整合性を検証します：
 * 1. models.json に定義された全モデルが MODEL_CONFIGS に存在すること
 * 2. SettingsContext.tsx のデフォルトモデルが有効なモデルIDであること
 * 3. MODEL_CONFIGS の各モデルに必要なファイルが定義されていること
 */

const fs = require('fs');
const path = require('path');

// 色付きログ出力
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// エラーカウンター
let errorCount = 0;
let warningCount = 0;

// 1. models.json を読み込み
log('📋 models.json を読み込み中...', 'blue');
const modelsJsonPath = path.join(__dirname, '..', 'src', 'renderer', 'config', 'models.json');
const modelsJson = JSON.parse(fs.readFileSync(modelsJsonPath, 'utf8'));
const modelIdsFromJson = modelsJson.map((m) => m.id);
log(`  ✓ ${modelIdsFromJson.length} モデルが定義されています: ${modelIdsFromJson.join(', ')}`, 'green');

// 2. main.ts の MODEL_CONFIGS を解析
log('\n📋 main.ts の MODEL_CONFIGS を解析中...', 'blue');
const mainTsPath = path.join(__dirname, '..', 'src', 'main', 'main.ts');
const mainTsContent = fs.readFileSync(mainTsPath, 'utf8');

// MODEL_CONFIGS の定義を抽出（ブレースのネストを考慮）
const modelConfigsMatch = mainTsContent.match(/const MODEL_CONFIGS[\s\S]*?\{/);
if (!modelConfigsMatch) {
  log('  ✗ MODEL_CONFIGS の定義が見つかりません', 'red');
  errorCount++;
} else {
  // ブレースのネストを考慮してオブジェクトの範囲を特定
  const startIndex = mainTsContent.indexOf('const MODEL_CONFIGS');
  let braceCount = 0;
  let endIndex = startIndex;
  let foundFirstBrace = false;
  
  for (let i = startIndex; i < mainTsContent.length; i++) {
    if (mainTsContent[i] === '{') {
      braceCount++;
      foundFirstBrace = true;
    } else if (mainTsContent[i] === '}') {
      braceCount--;
      if (foundFirstBrace && braceCount === 0) {
        endIndex = i + 1;
        break;
      }
    }
  }
  
  const modelConfigsContent = mainTsContent.slice(startIndex, endIndex);
  
  // モデルIDを抽出（単純な方法で）
  const configIds = [];
  
  // MODEL_CONFIGSの中身を行ごとに解析
  const innerContent = modelConfigsContent.slice(
    modelConfigsContent.indexOf('{') + 1,
    modelConfigsContent.lastIndexOf('}')
  );
  
  const lines = innerContent.split('\n');
  
  for (const line of lines) {
    // トップレベルのモデルID行を検出
    // 例: "  tiny: {"
    const trimmedLine = line.trim();
    const topLevelMatch = trimmedLine.match(/^([\w-]+):\s*\{/);
    if (topLevelMatch) {
      const id = topLevelMatch[1];
      // プロパティ名ではなくモデルIDのみを抽出
      if (id !== 'id' && id !== 'repo' && id !== 'files') {
        configIds.push(id);
      }
    }
  }
  
  log(`  ✓ ${configIds.length} モデルが定義されています: ${configIds.join(', ')}`, 'green');

  // 3. 整合性チェック
  log('\n🔍 整合性チェック中...', 'blue');
  
  // models.json にあって MODEL_CONFIGS にないモデル
  const missingInConfigs = modelIdsFromJson.filter((id) => !configIds.includes(id));
  if (missingInConfigs.length > 0) {
    log(`  ✗ MODEL_CONFIGS に定義がないモデル: ${missingInConfigs.join(', ')}`, 'red');
    errorCount += missingInConfigs.length;
  } else {
    log('  ✓ 全モデルが MODEL_CONFIGS に定義されています', 'green');
  }

  // MODEL_CONFIGS にあって models.json にないモデル
  const missingInJson = configIds.filter(id => !modelIdsFromJson.includes(id));
  if (missingInJson.length > 0) {
    log(`  ⚠ models.json に定義がないモデル: ${missingInJson.join(', ')}`, 'yellow');
    warningCount += missingInJson.length;
  }
}

// 4. SettingsContext.tsx のデフォルトモデルをチェック
log('\n📋 SettingsContext.tsx のデフォルトモデルをチェック中...', 'blue');
const settingsContextPath = path.join(__dirname, '..', 'src', 'renderer', 'contexts', 'SettingsContext.tsx');
const settingsContent = fs.readFileSync(settingsContextPath, 'utf8');

const defaultModelMatch = settingsContent.match(/model:\s*['"]([^'"]+)['"]/);
if (!defaultModelMatch) {
  log('  ✗ デフォルトモデルの設定が見つかりません', 'red');
  errorCount++;
} else {
  const defaultModel = defaultModelMatch[1];
  log(`  デフォルトモデル: ${defaultModel}`, 'reset');
  
  if (modelIdsFromJson.includes(defaultModel)) {
    log(`  ✓ デフォルトモデルは有効なモデルIDです`, 'green');
  } else {
    log(`  ✗ デフォルトモデル '${defaultModel}' は models.json に定義されていません`, 'red');
    errorCount++;
    
    // 提案
    const similar = modelIdsFromJson.find((id) => 
      id.includes(defaultModel) || defaultModel.includes(id)
    );
    if (similar) {
      log(`  💡 '${similar}' が正しい可能性があります`, 'yellow');
    }
  }
}

// 5. 必要なファイル定義のチェック
log('\n📋 MODEL_CONFIGS のファイル定義をチェック中...', 'blue');
const requiredFiles = ['config.json', 'model.bin'];

// MODEL_CONFIGS の内容を再度取得（既に取得済みの場合は再利用）
const modelConfigsStartIndex = mainTsContent.indexOf('const MODEL_CONFIGS');
let braceCount2 = 0;
let modelConfigsEndIndex = modelConfigsStartIndex;
let foundFirstBrace2 = false;

for (let i = modelConfigsStartIndex; i < mainTsContent.length; i++) {
  if (mainTsContent[i] === '{') {
    braceCount2++;
    foundFirstBrace2 = true;
  } else if (mainTsContent[i] === '}') {
    braceCount2--;
    if (foundFirstBrace2 && braceCount2 === 0) {
      modelConfigsEndIndex = i + 1;
      break;
    }
  }
}

const fullModelConfigsContent = mainTsContent.slice(modelConfigsStartIndex, modelConfigsEndIndex);

for (const modelId of modelIdsFromJson) {
  // モデルIDに対応するセクションを抽出
  const modelSectionRegex = new RegExp(`['"]${modelId}['"]\\s*:\\s*\\{`, 'g');
  const modelSectionMatch = modelSectionRegex.exec(fullModelConfigsContent);
  
  if (!modelSectionMatch) {
    log(`  ✗ ${modelId}: MODEL_CONFIGS に定義が見つかりません`, 'red');
    errorCount++;
    continue;
  }
  
  // モデルセクションの範囲を特定（ネストされたブレースを考慮）
  const sectionStartIndex = modelSectionMatch.index + modelSectionMatch[0].length - 1;
  let sectionBraceCount = 1;
  let sectionEndIndex = sectionStartIndex;
  
  for (let i = sectionStartIndex + 1; i < fullModelConfigsContent.length; i++) {
    if (fullModelConfigsContent[i] === '{') {
      sectionBraceCount++;
    } else if (fullModelConfigsContent[i] === '}') {
      sectionBraceCount--;
      if (sectionBraceCount === 0) {
        sectionEndIndex = i;
        break;
      }
    }
  }
  
  const modelSection = fullModelConfigsContent.slice(sectionStartIndex, sectionEndIndex + 1);
  
  // files配列を抽出
  const filesMatch = modelSection.match(/files:\s*\[([^\]]+)\]/);
  if (!filesMatch) {
    log(`  ✗ ${modelId}: ファイルリストの解析に失敗`, 'red');
    errorCount++;
    continue;
  }
  
  const filesList = filesMatch[1];
  const fileMatches = filesList.match(/'[^']+'/g);
  const files = fileMatches ? fileMatches.map((f) => f.replace(/'/g, '')) : [];
  const missingFiles = requiredFiles.filter(f => !files.includes(f));
  
  if (missingFiles.length > 0) {
    log(`  ✗ ${modelId}: 必須ファイルが不足 (${missingFiles.join(', ')})`, 'red');
    errorCount++;
  } else {
    log(`  ✓ ${modelId}: ファイル定義OK`, 'green');
  }
}

// サマリー
log('\n' + '='.repeat(50), 'blue');
if (errorCount === 0 && warningCount === 0) {
  log('✅ 全てのチェックが通過しました！', 'green');
  process.exit(0);
} else {
  if (errorCount > 0) {
    log(`❌ ${errorCount}件のエラーが見つかりました`, 'red');
  }
  if (warningCount > 0) {
    log(`⚠️ ${warningCount}件の警告があります`, 'yellow');
  }
  process.exit(1);
}
