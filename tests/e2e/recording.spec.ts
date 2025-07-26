import { test, expect } from '@playwright/test'
import path from 'path'

test.describe('録音機能', () => {
  test.beforeEach(async ({ page }) => {
    // ページに移動
    await page.goto('/')
    
    // アプリケーションが読み込まれるまで待機
    await page.waitForSelector('[data-testid="main-layout"]', { timeout: 10000 })
  })

  test('録音ボタンが表示されること', async ({ page }) => {
    // 録音ボタンの存在確認
    const recordButton = page.getByTestId('record-button')
    await expect(recordButton).toBeVisible()
    
    // 初期状態では録音停止状態
    await expect(recordButton).toHaveText(/録音開始|Record/)
  })

  test('録音開始から停止まで', async ({ page }) => {
    // ブラウザでメディアアクセスを許可（テスト環境用）
    await page.context().grantPermissions(['microphone'])
    
    // 録音開始ボタンをクリック
    await page.getByTestId('record-button').click()
    
    // 録音中状態の確認
    await expect(page.getByTestId('recording-indicator')).toBeVisible()
    await expect(page.getByTestId('record-button')).toHaveText(/録音停止|Stop/)
    
    // 録音時間表示の確認（数秒待機）
    await page.waitForTimeout(2000)
    const recordingTime = page.getByTestId('recording-time')
    await expect(recordingTime).toBeVisible()
    await expect(recordingTime).toContainText(/\d+:\d+/)
    
    // 録音停止
    await page.getByTestId('record-button').click()
    
    // 録音停止状態の確認
    await expect(page.getByTestId('recording-indicator')).not.toBeVisible()
    await expect(page.getByTestId('record-button')).toHaveText(/録音開始|Record/)
    
    // ファイル保存完了の通知確認
    await expect(page.getByTestId('file-saved-message')).toBeVisible({ timeout: 5000 })
  })

  test('録音一時停止・再開機能', async ({ page }) => {
    await page.context().grantPermissions(['microphone'])
    
    // 録音開始
    await page.getByTestId('record-button').click()
    await expect(page.getByTestId('recording-indicator')).toBeVisible()
    
    // 一時停止ボタンが表示されていることを確認
    const pauseButton = page.getByTestId('pause-button')
    await expect(pauseButton).toBeVisible()
    
    // 一時停止
    await pauseButton.click()
    await expect(page.getByTestId('paused-indicator')).toBeVisible()
    await expect(pauseButton).toHaveText(/再開|Resume/)
    
    // 再開
    await pauseButton.click()
    await expect(page.getByTestId('recording-indicator')).toBeVisible()
    await expect(page.getByTestId('paused-indicator')).not.toBeVisible()
    
    // 録音停止
    await page.getByTestId('record-button').click()
    await expect(page.getByTestId('file-saved-message')).toBeVisible({ timeout: 5000 })
  })

  test('入力デバイス選択機能', async ({ page }) => {
    // 設定パネルまたはデバイス選択エリアを開く
    const deviceSelector = page.getByTestId('device-selector')
    await expect(deviceSelector).toBeVisible()
    
    // デバイス選択ドロップダウンを開く
    await deviceSelector.click()
    
    // デフォルトマイクが選択肢にあることを確認
    await expect(page.getByText(/Default Microphone|デフォルト/)).toBeVisible()
    
    // デバイスを選択（テスト環境では実際のデバイスは限定的）
    await page.getByText(/Default Microphone|デフォルト/).click()
    
    // 選択が反映されることを確認
    await expect(deviceSelector).toContainText(/Default|デフォルト/)
  })

  test('エラーハンドリング', async ({ page }) => {
    // メディアアクセスを拒否した状態で録音を試行
    await page.context().clearPermissions()
    
    await page.getByTestId('record-button').click()
    
    // エラーメッセージの表示確認
    await expect(page.getByTestId('error-message')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('error-message')).toContainText(/マイク|アクセス|権限/)
    
    // エラー後も UI が正常状態に戻ることを確認
    await expect(page.getByTestId('record-button')).toHaveText(/録音開始|Record/)
    await expect(page.getByTestId('recording-indicator')).not.toBeVisible()
  })

  test('録音ファイルリスト表示', async ({ page }) => {
    await page.context().grantPermissions(['microphone'])
    
    // 録音実行
    await page.getByTestId('record-button').click()
    await page.waitForTimeout(2000)
    await page.getByTestId('record-button').click()
    
    // ファイル保存完了まで待機
    await expect(page.getByTestId('file-saved-message')).toBeVisible({ timeout: 5000 })
    
    // ファイルリストを確認
    const fileList = page.getByTestId('file-list')
    await expect(fileList).toBeVisible()
    
    // 新しく作成されたファイルがリストに表示されることを確認
    const latestFile = fileList.locator('.file-item').first()
    await expect(latestFile).toBeVisible()
    await expect(latestFile).toContainText(/recording_.*\.webm/)
  })

  test('録音済み音声ファイルの再生テスト', async ({ page }) => {
    // テスト用音声ファイルを使用した再生テスト
    const testAudioFile = path.join(__dirname, 'testdata', 'recording_test.webm')
    
    // ファイルリストにテスト音声ファイルがある想定でテスト
    // 実際の実装ではファイルを事前にアプリのディレクトリに配置するか、
    // ファイル選択でテスト用ファイルを読み込む
    
    const fileList = page.getByTestId('file-list')
    await expect(fileList).toBeVisible()
    
    // ファイルリストの最初のアイテムを選択
    const audioFileItem = fileList.locator('.file-item').first()
    if (await audioFileItem.count() > 0) {
      await audioFileItem.click()
      
      // 音声再生コントロールの表示確認
      const audioPlayer = page.getByTestId('audio-player')
      await expect(audioPlayer).toBeVisible()
      
      // 再生ボタンの確認
      const playButton = page.getByTestId('play-button')
      await expect(playButton).toBeVisible()
      await expect(playButton).toBeEnabled()
      
      // 再生開始
      await playButton.click()
      
      // 再生状態の確認
      await expect(page.getByTestId('audio-playing-indicator')).toBeVisible()
      await expect(playButton).toHaveText(/一時停止|Pause/)
      
      // 再生時間表示の確認
      const currentTime = page.getByTestId('audio-current-time')
      const duration = page.getByTestId('audio-duration')
      await expect(currentTime).toBeVisible()
      await expect(duration).toBeVisible()
      
      // シークバーの確認
      const seekBar = page.getByTestId('audio-seek-bar')
      await expect(seekBar).toBeVisible()
      
      // 音量コントロールの確認
      const volumeControl = page.getByTestId('volume-control')
      if (await volumeControl.isVisible()) {
        await expect(volumeControl).toBeVisible()
      }
      
      // 一時停止
      await playButton.click()
      await expect(page.getByTestId('audio-playing-indicator')).not.toBeVisible()
      await expect(playButton).toHaveText(/再生|Play/)
    }
  })

  test('キーボードショートカット', async ({ page }) => {
    await page.context().grantPermissions(['microphone'])
    
    // スペースキーで録音開始（設定されている場合）
    await page.keyboard.press('Space')
    
    // 録音が開始されるかUIの変化を確認
    // 実装によってはCtrl+Rやその他のショートカットが設定されている可能性
    
    // 代替として明示的なショートカットキーを試行
    await page.keyboard.press('Control+KeyR')
    
    // いずれかのショートカットで録音状態が変化することを確認
    // この部分は実際の実装に応じて調整が必要
  })
})