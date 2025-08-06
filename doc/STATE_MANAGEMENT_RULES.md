# KoeNote 状態管理グランドルール

## 📋 概要
このドキュメントは、KoeNoteプロジェクトにおけるReact状態管理の**絶対的なルール**を定義します。全開発者は本ルールを厳格に遵守し、違反する実装は必ず修正されるものとします。

## 🎯 基本原則

### 1. **シンプルさ最優先**
- React標準機能（useState, useEffect, useContext）のみ使用
- 外部ライブラリ（Redux, Zustand, Recoil等）は**完全禁止**
- 複雑な状態管理パターンは避ける

### 2. **状態の所在を明確にする**
```
ローカル状態（useState）: コンポーネント内部でのみ使用
共有状態（useContext）: 2つ以上のコンポーネントで共有する場合のみ
グローバル状態: 作らない - 必要なら再設計する
```

### 3. **初期状態の確実な管理**
- すべての状態は**マウント時に確実に初期化**
- 初期値は必ず**定数**として定義
- undefined/nullは初期値として**禁止**

### 4. **命名規則の厳格適用**
```typescript
// ✅ 正しい例
const [isOpenState, setIsOpen] = useState(HEADER_INITIAL)
const [countState, setCount] = useState(COUNT_INITIAL)

// ❌ 誤った例
const [open, setOpen] = useState() // undefined禁止
const [data, setData] = useState(null) // null禁止
```

## 📏 具体的なルール

### ルール1: 状態の所在定義
- **ローカル状態**: 単一コンポーネントでのみ使用
- **共有状態**: 2つ以上のコンポーネントで共有する場合のみuseContext使用
- **グローバル状態**: 作らない（必要ならコンポーネント構造を再設計）

### ルール2: 初期状態管理
```typescript
// ✅ 正しい例
const HEADER_INITIAL = false
const [isHeaderOpenState, setIsHeaderOpen] = useState(HEADER_INITIAL)

// 確実な初期化
useEffect(() => {
  setIsHeaderOpen(HEADER_INITIAL)
}, [])

// ❌ 誤った例
const [isOpen, setIsOpen] = useState(false) // 初期値定数化不足
```

### ルール3: propsとの関係
```typescript
// ✅ 正しい例 - 明示的な初期化
const MyComponent = ({ data }) => {
  const [isOpenState, setIsOpen] = useState(false)
  
  useEffect(() => {
    // データ変更時に確実に初期化
    setIsOpen(false)
  }, [data])
}
```

### ルール4: 状態のライフサイクル
- **マウント時**: 必ず初期状態にリセット
- **アンマウント時**: 状態は自動的に破棄（手動クリア不要）
- **更新時**: 明示的な再初期化のみ許可

## 🛠️ 実装パターン

### パターンA: ローカル状態管理
```typescript
// src/components/ExampleComponent.tsx
const HEADER_INITIAL = false
const COUNT_INITIAL = 0

const ExampleComponent = ({ data }) => {
  const [isHeaderOpenState, setIsHeaderOpen] = useState(HEADER_INITIAL)
  const [countState, setCount] = useState(COUNT_INITIAL)
  
  // 確実な初期化
  useEffect(() => {
    setIsHeaderOpen(HEADER_INITIAL)
    setCount(COUNT_INITIAL)
  }, [])
  
  // props変更時の初期化
  useEffect(() => {
    if (data) {
      setIsHeaderOpen(false)
    }
  }, [data])
}
```

### パターンB: 共有状態管理
```typescript
// src/contexts/SimpleContext.tsx
import { createContext, useContext, useState } from 'react'

const SimpleContext = createContext(null)

export const SimpleProvider = ({ children }) => {
  const [sharedValueState, setSharedValue] = useState(INITIAL_VALUE)
  
  return (
    <SimpleContext.Provider value={{ sharedValueState, setSharedValue }}>
      {children}
    </SimpleContext.Provider>
  )
}
```

## 🔍 チェックリスト

### 状態作成時の必須チェック
- [ ] 初期値は定数として定義されているか
- [ ] undefined/nullは使用していないか
- [ ] マウント時に確実に初期化しているか
- [ ] 命名規則に従っているか
- [ ] グローバル状態になっていないか

### レビュー時の確認事項
- [ ] 全てのuseStateに初期値が設定されているか
- [ ] 全ての状態がマウント時に初期化されているか
- [ ] 不要なグローバル状態が存在しないか
- [ ] 命名規則に従っているか

## ⚠️ 違反時の対応

### 違反検出方法
```typescript
// チェック用ユーティリティ
const isValidState = (state: any, initialValue: any) => {
  return state !== undefined && state !== null && initialValue !== undefined
}
```

### 修正フロー
1. **検出**: レビュー時に違反を検出
2. **指摘**: 具体的なルール違反を指摘
3. **修正**: ルールに基づいて修正
4. **再レビュー**: 修正内容を再確認

## 📊 期待される成果

- **予測可能性**: 100%の確実な初期化
- **保守性**: シンプルで理解しやすいコード
- **デバッグ容易性**: 状態の追跡が容易
- **学習コスト**: React標準機能のみで十分

## 📝 更新履歴
- 2025-08-06: 初版作成
- 2025-08-06: グランドルール確立

---

**重要**: このドキュメントは設計書の一部です。違反する実装は必ず修正されます。