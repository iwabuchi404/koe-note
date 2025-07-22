# デスクトップ音声キャプチャ問題 - 体系的解決プラン

## 概要
- **現象**: 以前は動作していたデスクトップ音声録音が、現在はマイク音声のみキャプチャされる
- **目標**: 設定パラメーターを体系的にテストし、動作する組み合わせを発見する
- **方法**: 優先度順に1つずつパラメーターを変更し、結果をログで確認

## 問題分析
### 確認済み事実
1. ✅ デスクトップソース取得は成功（screen:1:0, screen:0:0, screen:5:0）
2. ✅ getUserMedia呼び出しは成功
3. ❌ 音声トラックがマイク（HyperX QuadCast）になってしまう
4. ✅ 以前は同じコードで動作していた

### 推定原因領域
1. **Electronコマンドラインフラグ**（権限・音声関連）
2. **getUserMediaパラメーター**（chromeMediaSource設定）
3. **権限処理**（タイミング・設定）
4. **ソース選択ロジック**（IDの解釈）

---

## テスト計画

### 優先度1: Electronコマンドラインフラグ（基盤設定）
**理由**: システムレベルの設定変更が最も影響が大きい

#### Test 1.1: 音声キャプチャフラグの見直し
```javascript
// 現在の設定を1つずつ無効化してテスト
app.commandLine.appendSwitch('enable-usermedia-screen-capturing');
```
**テスト内容**: 他のフラグを無効化し、これのみでテスト

#### Test 1.2: セキュリティフラグの調整
```javascript
// disable-web-security の有無をテスト
app.commandLine.appendSwitch('disable-web-security');
```

#### Test 1.3: WebRTC関連フラグの調整
```javascript
// WebRTC関連の最小限設定
app.commandLine.appendSwitch('enable-webrtc-srtp-aes-gcm');
app.commandLine.appendSwitch('enable-webrtc-stun-origin');
```

#### Test 1.4: Windows特有フラグの検証
```javascript
// Windows音声キャプチャ関連
app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer');
app.commandLine.appendSwitch('use-angle', 'gl');
```

### 優先度2: getUserMediaパラメーター（直接的影響）
**理由**: 音声取得の直接的なパラメーター

#### Test 2.1: chromeMediaSourceIdの指定方法
```javascript
// 現在: chromeMediaSourceId: 'screen:1:0'
// テスト: 異なる指定方法
chromeMediaSourceId: selectedDesktopSource
chromeMediaSourceId: 'screen:0:0'  // 固定値
chromeMediaSourceId: undefined     // 指定なし
```

#### Test 2.2: 音声制約の最小化
```javascript
// 現在の制約を段階的に削除
audio: {
  chromeMediaSource: 'desktop',
  chromeMediaSourceId: sourceId
  // echoCancellation等を段階的に追加
}
```

#### Test 2.3: 古いAPI形式での試行
```javascript
// mandatory形式での指定
audio: {
  mandatory: {
    chromeMediaSource: 'desktop',
    chromeMediaSourceId: sourceId
  }
}
```

### 優先度3: 権限・タイミング処理（間接的影響）

#### Test 3.1: 権限要求ハンドラーの調整
```javascript
// 全権限許可 vs 特定権限のみ
setPermissionRequestHandler((webContents, permission, callback) => {
  callback(true); // vs 条件分岐
});
```

#### Test 3.2: 初期化タイミングの調整
```javascript
// ready後の遅延実行
app.whenReady().then(() => {
  setTimeout(createWindow, 1000); // 遅延テスト
});
```

### 優先度4: ソース取得・選択方法（ロジック問題）

#### Test 4.1: desktopCapturer.getSources()パラメーター
```javascript
// types指定の調整
desktopCapturer.getSources({
  types: ['screen'],           // screenのみ
  types: ['window'],           // windowのみ  
  types: ['screen', 'window'], // 両方（現在）
});
```

#### Test 4.2: ソース選択ロジックの単純化
```javascript
// 自動選択を廃止し、固定インデックス指定
const source = sources[0]; // 最初のソース
const source = sources.find(s => s.id === 'screen:0:0'); // 固定ID
```

---

## 実装方針

### 1. テスト実装構造
```javascript
class DesktopAudioTester {
  async testConfiguration(testId, description, configFn) {
    console.log(`🧪 TEST ${testId}: ${description}`);
    console.log(`📝 設定: ${JSON.stringify(config)}`);
    
    try {
      await configFn();
      const result = await this.attemptCapture();
      console.log(`✅ TEST ${testId}: 成功`);
      return { success: true, result };
    } catch (error) {
      console.log(`❌ TEST ${testId}: 失敗 - ${error.message}`);
      return { success: false, error };
    }
  }
}
```

### 2. ログ出力形式
```
🧪 TEST 1.1: enable-usermedia-screen-capturing のみ
📝 設定: {"flags": ["enable-usermedia-screen-capturing"]}
🎯 ソース: screen:1:0
🎵 音声トラック: Default - Microphone (HyperX QuadCast)
❌ TEST 1.1: 失敗 - マイク音声が返された

🧪 TEST 1.2: disable-web-security 追加
📝 設定: {"flags": ["enable-usermedia-screen-capturing", "disable-web-security"]}
...
```

### 3. 成功条件
```javascript
function isDesktopAudio(audioTrack) {
  const label = audioTrack.label.toLowerCase();
  return !label.includes('microphone') && 
         !label.includes('mic') && 
         !label.includes('hyperx');
}
```

---

## 実行手順

### Phase 1: フラグテスト（main.tsの変更）
1. 現在のフラグをすべてコメントアウト
2. 1.1から順番に1つずつ有効化
3. 各テストでビルド→起動→録音テスト
4. 成功するまで継続

### Phase 2: パラメーターテスト（BottomPanel.tsxの変更）
1. Phase 1で見つけた最適フラグを使用
2. getUserMediaパラメーターを2.1から順番にテスト
3. 動作する組み合わせを記録

### Phase 3: 最適化
1. 最小限の設定で動作することを確認
2. 不要な設定を削除
3. 安定性テスト

---

## 期待される成果

### 成功ケース
- デスクトップ音声が正常にキャプチャされる設定の発見
- 最小限の設定での安定動作
- 問題の根本原因の特定

### 失敗ケース対応
- 全テストが失敗した場合の代替案（getDisplayMedia等）
- 環境固有の問題の特定
- 外部ツール（Voicemeeter等）への案内

---

## 次のステップ

1. **このプランの承認確認**
2. **Phase 1の実装開始**（main.ts修正）
3. **テスト結果の逐次記録**
4. **動作する設定の文書化**

このプランに沿って、体系的にデスクトップ音声キャプチャ問題を解決していきます。