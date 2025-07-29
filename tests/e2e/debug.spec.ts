import { test, expect } from '@playwright/test'

test.describe('デバッグ用テスト', () => {
  test('ページが正しく読み込まれるか確認', async ({ page }) => {
    // コンソールエラーを監視
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('Browser console error:', msg.text())
      }
    })
    
    // JavaScript エラーを監視
    page.on('pageerror', error => {
      console.log('Page error:', error.message)
    })
    
    await page.goto('/')
    
    // ページタイトルの確認
    await expect(page).toHaveTitle(/KoeNote|Voice|Encoder/)
    
    // 5秒待機してからHTML構造を確認
    await page.waitForTimeout(5000)
    
    // HTMLの内容をログ出力
    const html = await page.content()
    console.log('Page HTML length:', html.length)
    console.log('HTML content:', html.substring(0, 2000))
    
    // 基本的なReactアプリケーションの要素を確認
    const rootElement = page.locator('#root')
    await expect(rootElement).toBeVisible()
    
    // main-layoutクラスの存在確認
    const mainLayoutByClass = page.locator('.main-layout')
    if (await mainLayoutByClass.count() > 0) {
      console.log('Found main-layout by class')
      await expect(mainLayoutByClass).toBeVisible()
    }
    
    // data-testid属性の確認
    const mainLayoutByTestId = page.locator('[data-testid="main-layout"]')
    if (await mainLayoutByTestId.count() > 0) {
      console.log('Found main-layout by test-id')
      await expect(mainLayoutByTestId).toBeVisible()
    } else {
      console.log('main-layout test-id not found')
    }
    
    // すべての要素を取得してdata-testid属性があるものを確認
    const elementsWithTestId = await page.locator('[data-testid]').all()
    console.log('Elements with data-testid:', elementsWithTestId.length)
    
    for (const element of elementsWithTestId) {
      const testId = await element.getAttribute('data-testid')
      console.log('Found test-id:', testId)
    }
    
    // クラス名でmain-layoutを探す
    const mainLayoutElements = await page.locator('.main-layout').all()
    console.log('Found main-layout elements by class:', mainLayoutElements.length)
    
    // 実際にレンダリングされているコンポーネント構造を確認
    const bodyInnerHTML = await page.locator('body').innerHTML()
    console.log('Body content includes main-layout class:', bodyInnerHTML.includes('main-layout'))
    console.log('Body content includes data-testid:', bodyInnerHTML.includes('data-testid'))
  })
})