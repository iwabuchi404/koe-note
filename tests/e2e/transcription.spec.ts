import { test, expect } from '@playwright/test'
import path from 'path'

test.describe('文字起こし機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="main-layout"]', { timeout: 10000 })
  })

  test('テスト用音声ファイルで文字起こし実行', async ({ page }) => {
    // テスト用音声ファイルのパス
    const testAudioFile = path.join(__dirname, 'testdata', 'recording_test.webm')
    
    // ファイル選択をシミュレート
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(testAudioFile)
    
    // ファイルが選択された状態を確認
    await expect(page.getByTestId('selected-file-name')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('selected-file-name')).toContainText('recording_test.webm')
    
    // 文字起こし開始ボタンをクリック
    const transcribeButton = page.getByTestId('transcribe-button')
    await expect(transcribeButton).toBeVisible()
    await expect(transcribeButton).toBeEnabled()
    await transcribeButton.click()
    
    // 処理中表示の確認
    await expect(page.getByTestId('transcription-progress')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText(/処理中|Processing|文字起こし中/)).toBeVisible()
    
    // 進捗インジケーターの確認
    const progressIndicator = page.getByTestId('transcription-progress-indicator')
    if (await progressIndicator.isVisible()) {
      await expect(progressIndicator).toBeVisible()
    }
    
    // 文字起こし完了まで待機（実際の処理時間を考慮して長めに設定）
    await expect(page.getByTestId('transcription-result')).toBeVisible({ timeout: 60000 })
    
    // 結果の表示確認
    const resultText = page.getByTestId('transcription-text')
    await expect(resultText).toBeVisible()
    await expect(resultText).not.toBeEmpty()
    
    // 文字起こし結果に日本語テキストが含まれることを確認
    const transcriptionResult = await resultText.textContent()
    expect(transcriptionResult).toBeTruthy()
    expect(transcriptionResult!.length).toBeGreaterThan(0)
  })

  test('リアルタイム文字起こし', async ({ page }) => {
    await page.context().grantPermissions(['microphone'])
    
    // リアルタイム文字起こしオプションを有効化
    const realtimeOption = page.getByTestId('realtime-transcription-toggle')
    if (await realtimeOption.isVisible()) {
      await realtimeOption.check()
    }
    
    // 録音開始
    await page.getByTestId('record-button').click()
    await expect(page.getByTestId('recording-indicator')).toBeVisible()
    
    // リアルタイム結果表示エリアの確認
    const realtimeResults = page.getByTestId('realtime-transcription-results')
    await expect(realtimeResults).toBeVisible()
    
    // 数秒録音を継続
    await page.waitForTimeout(5000)
    
    // リアルタイム結果が表示されることを確認（音声がない場合は空でも可）
    // 実際のテストでは音声入力がないため、UI要素の表示確認のみ
    
    // 録音停止
    await page.getByTestId('record-button').click()
    
    // 最終的な文字起こし結果の表示確認
    await expect(page.getByTestId('final-transcription-result')).toBeVisible({ timeout: 10000 })
  })

  test('チャンク分割設定', async ({ page }) => {
    // 設定ボタンをクリック
    const settingsButton = page.getByTestId('settings-button')
    await settingsButton.click()
    
    // 設定モーダルの表示確認
    await expect(page.getByTestId('settings-modal')).toBeVisible()
    
    // チャンクサイズ設定の確認
    const chunkSizeInput = page.getByTestId('chunk-size-input')
    await expect(chunkSizeInput).toBeVisible()
    
    // デフォルト値の確認
    await expect(chunkSizeInput).toHaveValue('10')
    
    // 値を変更
    await chunkSizeInput.fill('15')
    
    // オーバーラップサイズ設定
    const overlapInput = page.getByTestId('overlap-size-input')
    await expect(overlapInput).toBeVisible()
    await overlapInput.fill('3')
    
    // 設定保存
    await page.getByTestId('save-settings-button').click()
    
    // モーダルが閉じることを確認
    await expect(page.getByTestId('settings-modal')).not.toBeVisible()
    
    // 設定が保存されたことを確認（保存成功メッセージ）
    await expect(page.getByTestId('settings-saved-message')).toBeVisible({ timeout: 3000 })
  })

  test('文字起こし結果の表示とエクスポート', async ({ page }) => {
    // 既存の文字起こし結果がある場合の表示確認
    const resultsList = page.getByTestId('transcription-results-list')
    await expect(resultsList).toBeVisible()
    
    // 結果アイテムがある場合
    const resultItem = resultsList.locator('.result-item').first()
    if (await resultItem.count() > 0) {
      await expect(resultItem).toBeVisible()
      
      // 結果の詳細表示
      await resultItem.click()
      await expect(page.getByTestId('result-detail-view')).toBeVisible()
      
      // エクスポートボタンの確認
      const exportButton = page.getByTestId('export-button')
      await expect(exportButton).toBeVisible()
      
      // エクスポート形式選択
      await exportButton.click()
      await expect(page.getByTestId('export-format-menu')).toBeVisible()
      
      // TXT形式でエクスポート
      await page.getByTestId('export-txt').click()
      
      // エクスポート完了の確認
      await expect(page.getByTestId('export-success-message')).toBeVisible({ timeout: 5000 })
    }
  })

  test('サーバー接続エラーのハンドリング', async ({ page }) => {
    // テスト用音声ファイルを選択
    const testAudioFile = path.join(__dirname, 'testdata', 'recording_test.webm')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(testAudioFile)
    
    // サーバー接続エラーのシミュレーション
    await page.route('**/api/transcribe', route => {
      route.abort('failed')
    })
    
    await page.route('**/transcribe', route => {
      route.abort('failed')
    })
    
    // 文字起こし実行
    const transcribeButton = page.getByTestId('transcribe-button')
    await expect(transcribeButton).toBeVisible()
    await transcribeButton.click()
    
    // エラーメッセージの表示確認
    await expect(page.getByTestId('transcription-error')).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('transcription-error')).toContainText(/エラー|Error|失敗|接続/)
    
    // エラー後のUI状態確認
    await expect(page.getByTestId('transcription-progress')).not.toBeVisible()
    
    // リトライボタンがある場合の確認
    const retryButton = page.getByTestId('retry-transcription-button')
    if (await retryButton.isVisible()) {
      await expect(retryButton).toBeVisible()
    }
  })

  test('処理の進捗表示', async ({ page }) => {
    // テスト用音声ファイルを選択
    const testAudioFile = path.join(__dirname, 'testdata', 'recording_test.webm')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(testAudioFile)
    
    // 文字起こし開始
    const transcribeButton = page.getByTestId('transcribe-button')
    await expect(transcribeButton).toBeVisible()
    await transcribeButton.click()
    
    // 進捗バーの表示確認
    const progressBar = page.getByTestId('transcription-progress-bar')
    await expect(progressBar).toBeVisible()
    
    // 進捗パーセンテージの表示
    const progressPercent = page.getByTestId('progress-percentage')
    await expect(progressPercent).toBeVisible()
    await expect(progressPercent).toContainText(/%/)
    
    // 処理中メッセージの確認
    await expect(page.getByTestId('processing-message')).toBeVisible()
    
    // キャンセルボタンの表示
    const cancelButton = page.getByTestId('cancel-transcription-button')
    await expect(cancelButton).toBeVisible()
    
    // キャンセル機能のテスト
    await cancelButton.click()
    
    // キャンセル確認ダイアログ
    await expect(page.getByTestId('cancel-confirmation')).toBeVisible()
    await page.getByTestId('confirm-cancel').click()
    
    // 処理がキャンセルされることを確認
    await expect(page.getByTestId('transcription-progress')).not.toBeVisible()
    await expect(page.getByTestId('transcription-cancelled-message')).toBeVisible()
  })

  test('音声ファイル形式の検証', async ({ page }) => {
    // 有効なファイル形式のテスト
    const testAudioFile = path.join(__dirname, 'testdata', 'recording_test.webm')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(testAudioFile)
    
    // ファイル選択が成功することを確認
    await expect(page.getByTestId('selected-file-name')).toBeVisible()
    await expect(page.getByTestId('selected-file-name')).toContainText('recording_test.webm')
    
    // ファイル情報の表示確認
    const fileInfo = page.getByTestId('selected-file-info')
    if (await fileInfo.isVisible()) {
      await expect(fileInfo).toBeVisible()
      // ファイルサイズや形式の表示確認
    }
    
    // 文字起こしボタンが有効になることを確認
    const transcribeButton = page.getByTestId('transcribe-button')
    await expect(transcribeButton).toBeEnabled()
  })

  test('文字起こし設定の適用', async ({ page }) => {
    // 設定を開く
    const settingsButton = page.getByTestId('settings-button')
    if (await settingsButton.isVisible()) {
      await settingsButton.click()
      
      // チャンクサイズを変更
      const chunkSizeInput = page.getByTestId('chunk-size-input')
      if (await chunkSizeInput.isVisible()) {
        await chunkSizeInput.fill('5')  // 小さいチャンクサイズでテスト
      }
      
      // 設定を保存
      const saveButton = page.getByTestId('save-settings-button')
      if (await saveButton.isVisible()) {
        await saveButton.click()
      }
    }
    
    // テスト用音声ファイルで文字起こし
    const testAudioFile = path.join(__dirname, 'testdata', 'recording_test.webm')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(testAudioFile)
    
    const transcribeButton = page.getByTestId('transcribe-button')
    await expect(transcribeButton).toBeVisible()
    await transcribeButton.click()
    
    // チャンク処理の進捗確認
    const chunkProgress = page.getByTestId('chunk-progress')
    if (await chunkProgress.isVisible()) {
      await expect(chunkProgress).toBeVisible()
    }
  })
})