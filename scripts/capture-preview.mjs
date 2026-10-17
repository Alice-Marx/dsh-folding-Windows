import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { startPreview } from '../tools/preview.mjs'

const preview = await startPreview()
const browser = await chromium.launch({ headless: true })
try {
  await mkdir(new URL('../docs/', import.meta.url), { recursive: true })
  const page = await browser.newPage({ viewport: { width: 960, height: 640 }, deviceScaleFactor: 1 })
  await page.goto(preview.url)
  const control = page.locator('button[data-dsh-folding-control]')
  await control.waitFor()
  await page.screenshot({ path: fileURLToPath(new URL('../docs/folded.png', import.meta.url)) })
  await control.click()
  await page.screenshot({ path: fileURLToPath(new URL('../docs/expanded.png', import.meta.url)) })
  console.log('Saved docs/folded.png and docs/expanded.png')
} finally {
  await browser.close()
  await preview.close()
}
