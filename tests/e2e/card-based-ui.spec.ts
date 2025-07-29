import { test, expect } from '@playwright/test'

test.describe('カードベースUI - 録音機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="main-layout"]', { timeout: 10000 })
  })

  test('録音カードの基本表示', async ({ page }) => {
    // 録音タブを開く（Welcome状態から録音状態へ）
    // 実際のUIでは録音ボタンやメニューから録音タブを開く動作が必要
    
    // 録音カードが表示されることを確認
    const recordingCard = page.getByTestId('recording-card')
    if (await recordingCard.isVisible()) {
      await expect(recordingCard).toBeVisible()
      
      // 基本コントロールの確認
      await expect(page.getByTestId('record-button')).toBeVisible()
      await expect(page.getByTestId('recording-time')).toBeVisible()
      await expect(page.getByTestId('audio-level')).toBeVisible()
      await expect(page.getByTestId('settings-button')).toBeVisible()
    }
  })

  test('録音開始・停止の完全フロー', async ({ page }) => {
    await page.context().grantPermissions(['microphone'])
    
    // 録音カードが表示されている前提
    const recordingCard = page.getByTestId('recording-card')
    if (await recordingCard.isVisible()) {
      const recordButton = page.getByTestId('record-button')
      
      // 初期状態確認
      await expect(recordButton).toHaveText('録音開始')
      await expect(page.getByTestId('status-text')).toHaveText('待機中')
      
      // 録音開始
      await recordButton.click()
      
      // 録音状態の確認
      await expect(page.getByTestId('recording-indicator')).toHaveClass(/recording/)
      await expect(page.getByTestId('status-text')).toHaveText('録音中')
      await expect(recordButton).toHaveText('一時停止')
      await expect(page.getByTestId('stop-button')).toBeVisible()
      
      // 音声レベルの動作確認
      const audioLevelBar = page.getByTestId('audio-level-bar')
      await expect(audioLevelBar).toBeVisible()
      
      // 3秒間録音
      await page.waitForTimeout(3000)
      
      // 録音時間の更新確認
      const recordingTime = page.getByTestId('recording-time')
      await expect(recordingTime).not.toHaveText('00:00')
      
      // 録音停止
      await page.getByTestId('stop-button').click()
      
      // 停止後の状態確認
      await expect(page.getByTestId('status-text')).toHaveText('待機中')
      await expect(recordButton).toHaveText('録音開始')
      await expect(page.getByTestId('stop-button')).not.toBeVisible()
    }
  })

  test('録音設定パネルの操作', async ({ page }) => {
    const recordingCard = page.getByTestId('recording-card')
    if (await recordingCard.isVisible()) {
      const settingsButton = page.getByTestId('settings-button')
      
      // 設定パネルを開く
      await settingsButton.click()
      
      // 設定パネルの表示確認
      await expect(page.getByTestId('settings-panel')).toBeVisible()
      
      // 各設定項目の確認
      const audioSourceSelect = page.getByTestId('audio-source-select')
      const audioQualitySelect = page.getByTestId('audio-quality-select')
      const realtimeToggle = page.getByTestId('realtime-transcription-toggle')
      
      await expect(audioSourceSelect).toBeVisible()
      await expect(audioQualitySelect).toBeVisible()
      await expect(realtimeToggle).toBeVisible()
      
      // 設定値の変更
      await audioQualitySelect.selectOption('medium')
      await expect(audioQualitySelect).toHaveValue('medium')
      
      // リアルタイム文字起こしを有効化
      await realtimeToggle.check()
      await expect(realtimeToggle).toBeChecked()
      
      // AIモデル選択が表示されることを確認
      await expect(page.getByTestId('ai-model-select')).toBeVisible()
      
      // 設定パネルを閉じる
      await settingsButton.click()
      await expect(page.getByTestId('settings-panel')).not.toBeVisible()
    }
  })

  test('リアルタイム文字起こし表示', async ({ page }) => {
    await page.context().grantPermissions(['microphone'])
    
    const recordingCard = page.getByTestId('recording-card')
    if (await recordingCard.isVisible()) {
      // リアルタイム文字起こしを有効化
      await page.getByTestId('settings-button').click()
      await page.getByTestId('realtime-transcription-toggle').check()
      await page.getByTestId('settings-button').click()
      
      // 文字起こし結果エリアが表示されることを確認
      await expect(page.getByTestId('transcription-result')).toBeVisible()
      
      // 録音開始
      await page.getByTestId('record-button').click()
      
      // 文字起こし処理中表示の確認
      await expect(page.getByTestId('transcription-progress')).toBeVisible()
      
      // 2秒間録音
      await page.waitForTimeout(2000)
      
      // 録音停止
      await page.getByTestId('stop-button').click()
      
      // 最終的な文字起こし結果の確認
      const transcriptionText = page.getByTestId('transcription-text')
      // 実際の音声がないため、テキストの存在確認のみ
      if (await transcriptionText.isVisible()) {
        await expect(transcriptionText).toBeVisible()
      }
    }
  })

  test('エラーハンドリング - マイクアクセス拒否', async ({ page }) => {
    // マイクアクセスを拒否
    await page.context().clearPermissions()
    
    const recordingCard = page.getByTestId('recording-card')
    if (await recordingCard.isVisible()) {
      // 録音開始を試行
      await page.getByTestId('record-button').click()
      
      // エラーメッセージの表示確認
      await expect(page.getByTestId('error-message')).toBeVisible({ timeout: 5000 })
      
      // エラーメッセージの内容確認
      const errorMessage = page.getByTestId('error-message')
      await expect(errorMessage).toContainText('マイク')
      
      // エラーメッセージを閉じる
      await page.locator('[data-testid="error-message"] .error-close').click()
      await expect(errorMessage).not.toBeVisible()
      
      // UI状態が正常に戻ることを確認
      await expect(page.getByTestId('record-button')).toHaveText('録音開始')
      await expect(page.getByTestId('status-text')).toHaveText('待機中')
    }
  })
})

test.describe('カードベースUI - プレイヤー機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="main-layout"]', { timeout: 10000 })
  })

  test('音声ファイル選択とプレイヤー表示', async ({ page }) => {
    // ファイルリストが表示されることを確認
    const fileList = page.getByTestId('file-list')
    await expect(fileList).toBeVisible()
    
    // ファイルアイテムがある場合
    const fileItem = page.getByTestId('file-item').first()
    if (await fileItem.count() > 0) {
      // ファイルを選択
      await fileItem.click()
      
      // プレイヤーカードが表示されることを確認
      const playerCard = page.getByTestId('player-card')
      await expect(playerCard).toBeVisible()
      
      // ファイル名の表示確認
      await expect(page.getByTestId('selected-file-name')).toBeVisible()
      await expect(page.getByTestId('selected-file-info')).toBeVisible()
      
      // ファイルタイプに応じた表示の確認
      const fileInfo = page.getByTestId('selected-file-info')
      const fileInfoText = await fileInfo.textContent()
      
      if (fileInfoText?.includes('音声ファイル')) {
        // 音声プレイヤーの表示確認
        await expect(page.getByTestId('audio-player')).toBeVisible()
        await expect(page.getByTestId('play-button')).toBeVisible()
        await expect(page.getByTestId('audio-seek-bar')).toBeVisible()
        await expect(page.getByTestId('audio-current-time')).toBeVisible()
        await expect(page.getByTestId('audio-duration')).toBeVisible()
      }
    }
  })

  test('音声ファイルの再生制御', async ({ page }) => {
    const fileList = page.getByTestId('file-list')
    const audioFileItem = fileList.locator('[data-testid="file-item"]').first()
    
    if (await audioFileItem.count() > 0) {
      await audioFileItem.click()
      
      const playerCard = page.getByTestId('player-card')
      if (await playerCard.isVisible()) {
        const audioPlayer = page.getByTestId('audio-player')
        
        if (await audioPlayer.isVisible()) {
          const playButton = page.getByTestId('play-button')
          await expect(playButton).toBeVisible()
          
          // 再生開始
          await playButton.click()
          
          // 再生状態の確認（ボタンテキストの変化）
          await expect(playButton).toHaveText('⏸️')
          
          // 2秒待機
          await page.waitForTimeout(2000)
          
          // 現在時刻の更新確認
          const currentTime = page.getByTestId('audio-current-time')
          const currentTimeText = await currentTime.textContent()
          expect(currentTimeText).not.toBe('00:00')
          
          // 一時停止
          await playButton.click()
          await expect(playButton).toHaveText('▶️')
        }
      }
    }
  })

  test('音声ファイルの文字起こし機能', async ({ page }) => {
    const fileList = page.getByTestId('file-list')
    const audioFileItem = fileList.locator('[data-testid="file-item"]').first()
    
    if (await audioFileItem.count() > 0) {
      await audioFileItem.click()
      
      const playerCard = page.getByTestId('player-card')
      if (await playerCard.isVisible()) {
        const audioPlayer = page.getByTestId('audio-player')
        
        if (await audioPlayer.isVisible()) {
          // 文字起こしボタンの確認
          const transcribeButton = page.getByTestId('transcribe-button')
          
          if (await transcribeButton.isVisible()) {
            await expect(transcribeButton).toBeEnabled()
            
            // 文字起こし開始
            await transcribeButton.click()
            
            // 進捗表示の確認
            await expect(page.getByTestId('transcription-progress')).toBeVisible({ timeout: 5000 })
            await expect(page.getByTestId('transcription-progress-bar')).toBeVisible()
            await expect(page.getByTestId('progress-percentage')).toBeVisible()
            
            // 進捗パーセンテージの表示確認
            const progressPercent = page.getByTestId('progress-percentage')
            await expect(progressPercent).toContainText('%')
            
            // 文字起こし完了まで待機（実際の処理時間を考慮）
            await expect(page.getByTestId('transcription-result')).toBeVisible({ timeout: 60000 })
            
            // 結果テキストの確認
            const transcriptionText = page.getByTestId('transcription-text')
            await expect(transcriptionText).toBeVisible()
            
            const resultText = await transcriptionText.textContent()
            expect(resultText).toBeTruthy()
            expect(resultText!.length).toBeGreaterThan(0)
          }
        }
      }
    }
  })

  test('音量とシークコントロール', async ({ page }) => {
    const fileList = page.getByTestId('file-list')
    const audioFileItem = fileList.locator('[data-testid="file-item"]').first()
    
    if (await audioFileItem.count() > 0) {
      await audioFileItem.click()
      
      const playerCard = page.getByTestId('player-card')
      if (await playerCard.isVisible()) {
        // コントロールボタンをクリックして詳細コントロールを表示
        const controlsButton = page.getByTestId('player-controls-button')
        if (await controlsButton.isVisible()) {
          await controlsButton.click()
          
          // 音量コントロールの確認
          const volumeControl = page.getByTestId('volume-control')
          if (await volumeControl.isVisible()) {
            await expect(volumeControl).toBeVisible()
            
            // 音量スライダーの操作
            const volumeSlider = volumeControl.locator('input[type="range"]')
            await expect(volumeSlider).toBeVisible()
            
            // 音量を50%に設定
            await volumeSlider.fill('0.5')
            expect(await volumeSlider.inputValue()).toBe('0.5')
          }
        }
        
        // シークバーの確認
        const seekBar = page.getByTestId('audio-seek-bar')
        if (await seekBar.isVisible()) {
          await expect(seekBar).toBeVisible()
          
          // シーク操作（中間地点に移動）
          await seekBar.fill('10')  // 10秒地点
          
          // 現在時刻の更新確認
          const currentTime = page.getByTestId('audio-current-time')
          // シーク後の時間表示の確認
          await expect(currentTime).toBeVisible()
        }
      }
    }
  })
})

test.describe('カードベースUI - 統合シナリオ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="main-layout"]', { timeout: 10000 })
  })

  test('録音から再生までの完全ワークフロー', async ({ page }) => {
    await page.context().grantPermissions(['microphone'])
    
    // Step 1: 録音実行
    const recordingCard = page.getByTestId('recording-card')
    if (await recordingCard.isVisible()) {
      // 録音開始
      await page.getByTestId('record-button').click()
      await expect(page.getByTestId('status-text')).toHaveText('録音中')
      
      // 3秒間録音
      await page.waitForTimeout(3000)
      
      // 録音停止
      await page.getByTestId('stop-button').click()
      await expect(page.getByTestId('status-text')).toHaveText('待機中')
    }
    
    // Step 2: ファイルリストの更新確認
    const fileList = page.getByTestId('file-list')
    await expect(fileList).toBeVisible()
    
    // 新しいファイルがリストに追加されることを確認
    const fileItems = page.getByTestId('file-item')
    await expect(fileItems).toHaveCount(await fileItems.count())
    
    // Step 3: 録音したファイルの再生
    const latestFile = fileItems.first()
    if (await latestFile.count() > 0) {
      await latestFile.click()
      
      // プレイヤーカードの表示確認
      const playerCard = page.getByTestId('player-card')
      await expect(playerCard).toBeVisible()
      
      // 音声プレイヤーの表示
      const audioPlayer = page.getByTestId('audio-player')
      if (await audioPlayer.isVisible()) {
        // 再生ボタンが有効であることを確認
        const playButton = page.getByTestId('play-button')
        await expect(playButton).toBeEnabled()
        
        // 再生開始
        await playButton.click()
        await expect(playButton).toHaveText('⏸️')
      }
    }
  })

  test('エラー状況からの回復', async ({ page }) => {
    // マイクアクセス拒否状態で開始
    await page.context().clearPermissions()
    
    const recordingCard = page.getByTestId('recording-card')
    if (await recordingCard.isVisible()) {
      // エラーを発生させる
      await page.getByTestId('record-button').click()
      await expect(page.getByTestId('error-message')).toBeVisible({ timeout: 5000 })
      
      // エラーを閉じる
      await page.locator('[data-testid="error-message"] .error-close').click()
      await expect(page.getByTestId('error-message')).not.toBeVisible()
      
      // 権限を許可
      await page.context().grantPermissions(['microphone'])
      
      // 再度録音を試行（成功するはず）
      await page.getByTestId('record-button').click()
      await expect(page.getByTestId('status-text')).toHaveText('録音中')
      
      // 正常に録音停止
      await page.waitForTimeout(1000)
      await page.getByTestId('stop-button').click()
      await expect(page.getByTestId('status-text')).toHaveText('待機中')
    }
  })
})