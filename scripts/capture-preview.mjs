import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { startPreview } from '../tools/preview.mjs'

const preview = await startPreview()
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
try {
  await mkdir(new URL('../docs/', import.meta.url), { recursive: true })
  const page = await browser.newPage({ viewport: { width: 960, height: 640 }, deviceScaleFactor: 1 })
  await page.goto(preview.url)
  const control = page.locator('button[data-dsh-folding-control][aria-controls="global-panels"]')
  await control.waitFor()
  await page.screenshot({ path: fileURLToPath(new URL('../docs/folded.png', import.meta.url)) })
  await control.click()
  await page.screenshot({ path: fileURLToPath(new URL('../docs/expanded.png', import.meta.url)) })
  await control.click()
  await page.locator('button[data-dsh-folding-section="workspaces"]').click()
  await page.screenshot({ path: fileURLToPath(new URL('../docs/workspaces-folded.png', import.meta.url)) })
  const pinPage = await browser.newPage({ viewport: { width: 960, height: 640 }, deviceScaleFactor: 1 })
  await pinPage.goto(preview.url + '?pins=1')
  const pin = pinPage.locator('button[data-dsh-project-pin="gamma"]')
  await pin.waitFor()
  await pin.click()
  await pinPage.waitForFunction(() => {
    const first = document.querySelector('.workspace-tree [data-row-key^="workspace:"]')
    return first?.getAttribute('data-row-key') === 'workspace:gamma'
      && first.querySelector('button[data-dsh-project-pin]')?.getAttribute('aria-pressed') === 'true'
  })
  await pinPage.screenshot({ path: fileURLToPath(new URL('../docs/pinned.png', import.meta.url)) })
  console.log('Saved folding previews and docs/pinned.png')
} finally {
  await browser.close()
  await preview.close()
}
