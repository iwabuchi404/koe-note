# KoeNote ビジネスロジック安定化・状態管理修正計画

## 🎯 **最優先目標**
1. **既存機能を壊さない** - 現在動作している機能の継続性保証
2. **ビジネスロジック分離** - UI層から独立したテスト可能な処理
3. **状態管理の安定化** - 予測可能で制御しやすい状態フロー
4. **繰り返し修正の撲滅** - 根本原因の解決

---

## 🔍 **現在の深刻な問題分析**

### **Problem 1: ビジネスロジック混在（最重要）**
```typescript
// BottomPanel.tsx L274-1219 の startRecording 関数
- デバイス検証・取得（UI依存）
- MediaRecorder制御（ブラウザAPI依存）  
- ファイル保存（Electron API依存）
- エラーハンドリング（UIアラート依存）
- 状態更新（複数のuseState・useRef混在）

→ 結果: テスト不可能、デバッグ困難、修正の影響範囲不明
```

### **Problem 2: 状態管理カオス（重要）**
```typescript
// 現在の状態依存関係
App.tsx (8個のグローバル状態) 
  ↓
BottomPanel.tsx (15個のローカル状態 + 10個のuseRef)
  ↓  
各サービス (AudioChunkGenerator, FileBasedRealtimeProcessor...)
  ↓
Electron IPC呼び出し

→ 結果: 状態の整合性が保証されない、同じ修正を何度も繰り返す
```

### **Problem 3: エラー伝播の不確実性**
```typescript
// 現在のエラーフロー
MediaRecorder エラー → console.error → ユーザーは気づかない
ファイル保存エラー → アラート表示 → 状態は不整合のまま
デバイスエラー → 部分的復旧 → 後続処理で予期しない動作

→ 結果: エラー後の状態が予測できない、復旧が困難
```

---

## 🛡️ **安全な解決アプローチ（段階的分離戦略）**

### **Step 1: テスト可能なサービス層作成** ⭐ 最優先・最安全
**期間**: 1日  
**リスク**: 極低（既存コードに影響なし）

```typescript
// 新規作成（既存コード変更なし）
src/renderer/services/core/

├── RecordingServiceV2.ts        // 録音ビジネスロジックのみ
│   ├── startRecording(config): Promise<RecordingSession>
│   ├── stopRecording(): Promise<AudioFile>  
│   └── pauseRecording(): Promise<void>
│   └── AudioChunkGenerator統合による自動リアルタイムチャンク生成

├── TranscriptionServiceV2.ts    // 文字起こしビジネスロジックのみ
│   ├── transcribeFile(file): Promise<TranscriptionResult>
│   ├── FileBasedRealtimeProcessor統合によるリアルタイム文字起こし
│   └── WebMHeaderProcessor統合による最適化されたWebM処理

└── FileServiceV2.ts             // ファイル操作ビジネスロジックのみ
    ├── saveAudioFile(buffer, filename): Promise<string>
    ├── loadAudioFile(path): Promise<ArrayBuffer>
    └── getFileMetadata(path): Promise<FileMetadata>
```

**実装内容**：
- ✅ **純粋関数** - UIに依存しない、入力→出力が明確
- ✅ **Promise/Observable** - 非同期処理の統一
- ✅ **エラー型定義** - 予測可能なエラーハンドリング
- ✅ **単体テスト可能** - モック・スタブで完全テスト

**効果**：
- 既存コードは一切変更しない（リスクゼロ）
- 新しいサービスは単体で動作確認可能
- 後続ステップの基盤完成

---

### **Step 2: 状態管理の型安全化** ⭐ 状態カオス解決の第一歩
**期間**: 0.5日  
**リスク**: 極低（型定義追加のみ）

```typescript
// 新規作成
src/renderer/types/

├── RecordingState.ts
│   interface RecordingState {
│     phase: 'idle' | 'preparing' | 'recording' | 'paused' | 'stopping'
│     currentSession: RecordingSession | null
│     error: RecordingError | null
│     device: DeviceConfig
│   }

├── TranscriptionState.ts  
│   interface TranscriptionState {
│     phase: 'idle' | 'processing' | 'completed' | 'error'
│     result: TranscriptionResult | null
│     progress: number
│     error: TranscriptionError | null
│   }

└── ApplicationState.ts
    // 各ドメイン状態の統合定義
```

**実装内容**：
- ✅ **状態フェーズの明確化** - 各状態がどの段階かを型で保証
- ✅ **エラー型の統一** - 各ドメインのエラーを型安全に
- ✅ **不正状態の排除** - TypeScriptで不整合を防止

**効果**：
- 状態の矛盾をコンパイル時に検出
- デバッグ時の状態確認が容易
- 今後の修正で同じミスを防止

---

### **Step 3: 状態管理統合クラス作成** ⭐ 制御可能な状態フロー
**期間**: 1日  
**リスク**: 低（新規作成、段階的移行可能）

```typescript
// 新規作成
src/renderer/state/

├── RecordingStateManager.ts     // 録音状態の一元管理
│   class RecordingStateManager {
│     private state: RecordingState
│     
│     startRecording(config): Promise<void>
│     stopRecording(): Promise<void>
│     handleError(error): void
│     
│     // 状態変更の監視可能
│     onStateChange(callback): () => void
│   }

├── TranscriptionStateManager.ts // 文字起こし状態の一元管理  
└── ApplicationStateManager.ts   // 全体状態の統合管理
```

**実装内容**：
- ✅ **単一責任** - 各Managerは1つのドメインのみ管理
- ✅ **状態変更の追跡** - すべての状態変更をログ・監視可能
- ✅ **ロールバック機能** - エラー時に前の安定状態に復旧
- ✅ **デバッグ支援** - 状態変更履歴を詳細ログ出力

**効果**：
- 状態変更が予測可能になる
- エラー時の復旧が確実
- デバッグが劇的に簡単になる

---

### **Step 4: 段階的統合（最重要）** ⭐ 既存機能を壊さずに移行
**期間**: 2日  
**リスク**: 中（慎重な段階移行で軽減）

#### **4-1: BottomPanel 録音機能の段階移行**
```typescript
// BottomPanel.tsx の修正（段階的）

// Phase A: 新サービス併用（既存処理は保持）
const handleStartRecording = async () => {
  try {
    // 🆕 AudioChunkGeneratorとWebMHeaderProcessorを統合した新サービスでビジネスロジック実行
    const result = await RecordingServiceV2.startRecording(config)
    
    // 🆕 FileBasedRealtimeProcessorによる自動リアルタイム文字起こし開始
    if (config.enableRealtimeTranscription) {
      await FileBasedRealtimeProcessor.start()
    }
    
    // 🔄 成功時のみ既存の状態更新処理を実行
    // 既存の setIsRecording(true) 等はそのまま保持
    
  } catch (error) {
    // 🆕 新エラーハンドリングでユーザー通知
    RecordingStateManager.handleError(error)
    
    // 🔄 既存のフォールバック処理も保持
  }
}
```

#### **4-2: 動作検証フェーズ**
```typescript
// 各段階で以下を確認
1. 既存機能がすべて動作することを確認
2. 新サービスが単体で正常動作することを確認  
3. エラーケース（デバイス接続失敗等）の動作を確認
4. 問題があれば即座に前段階にロールバック
```

**効果**：
- 既存機能を壊すリスクを最小化
- 問題発生時の即座な復旧が可能
- 新機能の動作を段階的に検証

---

### **Step 5: 不要コード削除・最適化** ⭐ 技術的負債の解消
**期間**: 1日  
**リスク**: 低（Step 4で安定化済み）

```typescript
// Step 4で新サービスが安定したら、既存の冗長コードを削除

BottomPanel.tsx:
- 重複するデバイス取得処理を削除（L102-195の重複）
- 重複するクリーンアップ処理を統合（L242-252, L1222-1327）
- 120行のonstop処理を新サービス呼び出しに置換（L697-816）

SpeechRecognition.tsx:
- 重複するイベントハンドラーを統合（L44-143, L291-376）
- 類似の保存処理を統合（L515-564, L567-602）
```

**効果**：
- コードサイズの大幅削減（1766行→800行以下）
- 保守性の向上
- バグ修正の影響範囲の明確化

---

## 🎯 **実装順序とマイルストーン**

### **Week 1: 基盤作成（リスクなし）**
- **Day 1**: Step 1 (サービス層作成) + Step 2 (型定義)
- **Day 2**: Step 3 (状態管理クラス) + 単体テスト作成

### **Week 2: 段階統合（慎重移行）**  
- **Day 3-4**: Step 4 (段階的統合) - 録音機能
- **Day 5**: Step 4 (段階的統合) - 文字起こし機能

### **Week 3: 最適化**
- **Day 6**: Step 5 (不要コード削除)
- **Day 7**: 全体テスト・性能検証

---

## ✅ **期待される根本解決**

### **1. 機能安定性**
- ✅ ビジネスロジックが単体でテスト可能
- ✅ エラー発生時の復旧が確実
- ✅ 新機能追加時の既存機能への影響なし

### **2. 状態管理制御**
- ✅ 状態変更が予測可能・追跡可能
- ✅ 不整合状態の発生防止
- ✅ デバッグ時の問題特定が容易

### **3. 開発効率**
- ✅ AudioChunkGeneratorとWebMHeaderProcessorの分離により保守性向上
- ✅ ファイルベースリアルタイム処理により同じ修正を繰り返す必要がなくなる
- ✅ バグ修正の影響範囲が明確
- ✅ 新メンバーも理解しやすいモジュラー設計

---

**この計画で進めてよろしいでしょうか？**  
**Step 1（サービス層作成）から開始することを提案します。**