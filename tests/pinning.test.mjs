import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { chromium } from 'playwright'
import { startPreview } from '../tools/preview.mjs'

const PIN_KEY = 'dsh-folding-windows:project-pins:v1'
let browser
let preview

before(async () => {
  preview = await startPreview()
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
})

after(async () => {
  await browser?.close()
  await preview?.close()
})

async function withPage(run, query = '', initialize) {
  const context = await browser.newContext()
  const page = await context.newPage()
  page.setDefaultTimeout(7000)
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    if (initialize) await initialize(context)
    await page.goto(preview.url + '?pins=1' + query)
    await page.waitForFunction(() => typeof window.foldingPlugin?.installProjectPinning === 'function')
    await run(page)
    assert.deepEqual(await page.evaluate(() => window.workspaceFixture.events.movedOwnedNodes), [], 'only the fixture renderer may replace project groups; the plugin must not move owned nodes')
    assert.deepEqual(errors, [], 'the browser must not report uncaught errors')
  } finally {
    await context.close()
  }
}

const pin = (page, id) => page.locator(`button[data-dsh-project-pin=${JSON.stringify(id)}]`)
const header = (page, id) => page.locator(`[data-row-key=${JSON.stringify('workspace:' + id)}]`)
const rowIds = page => page.locator('.workspace-tree [data-row-key^="workspace:"]').evaluateAll(rows => rows.map(row => row.getAttribute('data-row-key').slice('workspace:'.length)).filter(id => id !== '__ungrouped__'))

async function expectOrder(page, ids) {
  await page.waitForFunction(expected => {
    const actual = window.workspaceFixture.snapshot().items.map(item => item.workspaceId)
    return JSON.stringify(actual) === JSON.stringify(expected)
  }, ids)
  assert.deepEqual(await page.evaluate(() => window.workspaceFixture.snapshot().items.map(item => item.workspaceId)), ids)
}

async function expectPinned(page, id, value) {
  await page.waitForFunction(({ id, value }) => document.querySelector('button[data-dsh-project-pin="' + id + '"]')?.getAttribute('aria-pressed') === String(value), { id, value })
  assert.equal(await pin(page, id).getAttribute('aria-pressed'), String(value))
}

async function settled(page) {
  await page.waitForFunction(() => ![...document.querySelectorAll('button[data-dsh-project-pin]')].some(button => button.disabled || button.getAttribute('aria-busy') === 'true'))
  // Allow queued source notifications and MutationObserver callbacks to finish.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}

test('project pins use the native service and keep each complete project group together', async () => {
  await withPage(async page => {
    assert.deepEqual(await rowIds(page), ['alpha', 'beta', 'gamma'])
    assert.equal(await page.locator('button[data-dsh-project-pin]').count(), 3)
    assert.equal(await page.locator('[data-row-key^="session:"] button[data-dsh-project-pin]').count(), 0)
    assert.equal(await header(page, '__ungrouped__').locator('button[data-dsh-project-pin]').count(), 0)
    await pin(page, 'beta').click()
    await expectOrder(page, ['beta', 'alpha', 'gamma'])
    await expectPinned(page, 'beta', true)
    await settled(page)
    assert.deepEqual(await page.evaluate(() => window.workspaceFixture.calls[0]), ['beta', 'alpha'])
    assert.deepEqual(await rowIds(page), ['beta', 'alpha', 'gamma'])
    for (const id of ['alpha', 'beta', 'gamma']) {
      const section = page.locator(`[data-fixture-project-id="${id}"]`)
      assert.equal(await section.locator(`[data-row-key="session:${id}-session"]`).count(), 1)
    }
    assert.equal(await pin(page, 'beta').getAttribute('aria-label'), '取消置顶项目 文献阅读')
  })
})

test('unpin restores the saved ordinary order and multiple pins lead newest first', async () => {
  await withPage(async page => {
    await pin(page, 'beta').click()
    await expectPinned(page, 'beta', true)
    await settled(page)
    await pin(page, 'gamma').click()
    await expectPinned(page, 'gamma', true)
    await expectOrder(page, ['gamma', 'beta', 'alpha'])
    await settled(page)
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).pinnedIds, PIN_KEY), ['gamma', 'beta'])
    await pin(page, 'gamma').click()
    await expectPinned(page, 'gamma', false)
    await expectOrder(page, ['beta', 'alpha', 'gamma'])
    await settled(page)
    await pin(page, 'beta').click()
    await expectPinned(page, 'beta', false)
    await expectOrder(page, ['alpha', 'beta', 'gamma'])
  })
})

test('project pins persist through reload independently from both sidebar fold controls', async () => {
  await withPage(async page => {
    await pin(page, 'gamma').click()
    await expectOrder(page, ['gamma', 'alpha', 'beta'])
    await expectPinned(page, 'gamma', true)
    await settled(page)
    await page.locator('button[data-dsh-folding-section="workspaces"]').click()
    assert.equal(await page.locator('#workspace-region').isVisible(), false)
    await page.locator('button[aria-controls="global-panels"]').click()
    await page.reload()
    await page.waitForFunction(() => document.querySelector('button[data-dsh-project-pin="gamma"]')?.getAttribute('aria-pressed') === 'true')
    await expectOrder(page, ['gamma', 'alpha', 'beta'])
    assert.equal(await page.locator('#workspace-region').isVisible(), false)
    assert.equal(await page.locator('#global-panels').isVisible(), true)
    await page.locator('button[data-dsh-folding-section="workspaces"]').click()
    assert.equal(await pin(page, 'gamma').isVisible(), true)
    await pin(page, 'gamma').click()
    await expectOrder(page, ['alpha', 'beta', 'gamma'])
  })
})

test('pin actions do not collapse projects or intercept their original create/session actions', async () => {
  await withPage(async page => {
    await pin(page, 'beta').click()
    await expectPinned(page, 'beta', true)
    await settled(page)
    assert.equal(await header(page, 'beta').getAttribute('aria-expanded'), 'true')
    assert.deepEqual(await page.evaluate(() => window.workspaceFixture.events.toggles), [])
    await page.getByRole('button', { name: '在“文献阅读”中新建会话', exact: true }).click()
    assert.deepEqual(await page.evaluate(() => window.workspaceFixture.events.created), ['beta'])
    await page.locator('[data-session="beta-session"]').click()
    assert.deepEqual(await page.evaluate(() => window.clickedSessions), ['beta-session'])
    await header(page, 'beta').locator('.workspace-title').click()
    await page.waitForFunction(() => document.querySelector('[data-row-key="workspace:beta"]')?.getAttribute('aria-expanded') === 'false')
    assert.deepEqual(await page.evaluate(() => window.workspaceFixture.events.toggles), ['beta'])
    assert.equal(await page.locator('[data-session="beta-session"]').count(), 0)
    assert.equal(await pin(page, 'beta').getAttribute('aria-pressed'), 'true')
  })
})

test('same-name projects retain separate pins and rename updates the accessible label', async () => {
  await withPage(async page => {
    await page.evaluate(() => {
      window.workspaceFixture.rename('alpha', '重复项目')
      window.workspaceFixture.rename('beta', '重复项目')
    })
    await page.waitForFunction(() => document.querySelectorAll('button[data-dsh-project-pin][aria-label="置顶项目 重复项目"]').length === 2)
    await pin(page, 'beta').click()
    await expectPinned(page, 'beta', true)
    await settled(page)
    await expectPinned(page, 'alpha', false)
    await page.evaluate(() => window.workspaceFixture.rename('beta', '已重命名项目'))
    await page.waitForFunction(() => document.querySelector('button[data-dsh-project-pin="beta"]')?.getAttribute('aria-label') === '取消置顶项目 已重命名项目')
    await expectOrder(page, ['beta', 'alpha', 'gamma'])
    await pin(page, 'beta').click()
    await expectOrder(page, ['alpha', 'beta', 'gamma'])
  })
})

test('API rejection restores pin state and order, reports failure, and stops retrying', async () => {
  await withPage(async page => {
    await page.evaluate(() => window.workspaceFixture.rejectNext())
    await pin(page, 'beta').click()
    await page.locator('[data-dsh-project-pin-notice][role="status"]').waitFor({ state: 'visible' })
    await expectOrder(page, ['alpha', 'beta', 'gamma'])
    await expectPinned(page, 'beta', false)
    await settled(page)
    const calls = await page.evaluate(() => window.workspaceFixture.calls.length)
    assert.equal(calls, 1)
    assert.ok((await page.locator('[data-dsh-project-pin-notice]').textContent()).trim())
    await page.evaluate(() => window.workspaceFixture.redraw())
    await page.waitForTimeout(100)
    assert.equal(await page.evaluate(() => window.workspaceFixture.calls.length), calls, 'DOM redraw must not trigger infinite retries')
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{"pinnedIds":[]}').pinnedIds, PIN_KEY), [])
    await pin(page, 'beta').click()
    await expectPinned(page, 'beta', true)
    await expectOrder(page, ['beta', 'alpha', 'gamma'])
  })
})

test('pending hydration preserves remembered pins until the native baseline is ready', async () => {
  await withPage(async page => {
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).pinnedIds, PIN_KEY), ['beta'])
    assert.equal(await page.evaluate(() => window.workspaceFixture.calls.length), 0)
    await page.evaluate(() => window.workspaceFixture.setPhase('ready'))
    await expectOrder(page, ['beta', 'alpha', 'gamma'])
    await expectPinned(page, 'beta', true)
  }, '&pending=1', context => context.addInitScript(({ key }) => {
    localStorage.setItem(key, JSON.stringify({ pinnedIds: ['beta'], baseOrder: ['alpha', 'beta', 'gamma'] }))
  }, { key: PIN_KEY }))
})

test('a held native reorder exposes busy state and finishes without duplicate requests', async () => {
  await withPage(async page => {
    await page.evaluate(() => window.workspaceFixture.holdNext())
    await pin(page, 'beta').click()
    await page.waitForFunction(() => window.workspaceFixture.calls.length === 1)
    await page.waitForFunction(() => document.querySelector('button[data-dsh-project-pin="alpha"]')?.disabled === true)
    assert.equal(await page.evaluate(() => window.workspaceFixture.calls.length), 1)
    await page.evaluate(() => window.workspaceFixture.releaseNext())
    await expectOrder(page, ['beta', 'alpha', 'gamma'])
    await expectPinned(page, 'beta', true)
    await settled(page)
    assert.equal(await page.evaluate(() => window.workspaceFixture.calls.length), 1)
  })
})

test('new projects stay behind pins and deleting a pinned project cleans stale state', async () => {
  await withPage(async page => {
    await pin(page, 'beta').click()
    await expectPinned(page, 'beta', true)
    await settled(page)
    await page.evaluate(() => window.workspaceFixture.add({ workspaceId: 'delta', title: '新增项目' }))
    await expectOrder(page, ['beta', 'delta', 'alpha', 'gamma'])
    await expectPinned(page, 'delta', false)
    await settled(page)
    await page.evaluate(() => window.workspaceFixture.remove('beta'))
    await expectOrder(page, ['delta', 'alpha', 'gamma'])
    await page.waitForFunction(() => document.querySelector('button[data-dsh-project-pin="beta"]') === null)
    assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).pinnedIds, PIN_KEY), [])
    assert.equal(await page.locator('button[data-dsh-project-pin]').count(), 3)
  })
})

test('external non-pin reorders are retained while pins keep leading the list', async () => {
  await withPage(async page => {
    await pin(page, 'beta').click()
    await expectPinned(page, 'beta', true)
    await settled(page)
    await page.evaluate(() => window.workspaceFixture.reorder(['gamma', 'beta', 'alpha']))
    await expectOrder(page, ['beta', 'gamma', 'alpha'])
    await settled(page)
    await pin(page, 'beta').click()
    await expectPinned(page, 'beta', false)
    assert.deepEqual(await page.evaluate(() => window.workspaceFixture.snapshot().items.map(item => item.workspaceId).filter(id => id !== 'beta')), ['gamma', 'alpha'])
  })
})

test('native redraws and replacement installs preserve a single button per project', async () => {
  await withPage(async page => {
    await pin(page, 'beta').click()
    await expectPinned(page, 'beta', true)
    await settled(page)
    await page.evaluate(() => {
      window.workspaceFixture.redraw()
      window.oldDisposePins = window.disposePins
      window.disposePins = window.installPins()
      window.oldDisposePins()
    })
    await expectPinned(page, 'beta', true)
    assert.equal(await page.locator('button[data-dsh-project-pin]').count(), 3)
    assert.equal(await page.evaluate(() => window.workspaceFixture.listenerCount()), 1)
    await pin(page, 'gamma').click()
    await expectOrder(page, ['gamma', 'beta', 'alpha'])
    await settled(page)
    await page.evaluate(() => window.disposePins())
    assert.equal(await page.locator('button[data-dsh-project-pin]').count(), 0)
    assert.equal(await page.locator('[data-dsh-project-pin-notice]').count(), 0)
    assert.equal(await page.evaluate(() => window.workspaceFixture.listenerCount()), 0)
    await page.evaluate(() => window.workspaceFixture.redraw())
    assert.equal(await page.locator('button[data-dsh-project-pin]').count(), 0)
    assert.equal(await page.locator('button[data-dsh-folding-section="workspaces"]').count(), 1)
  })
})

test('nested workspaces retain their parent group when a sibling root is pinned', async () => {
  await withPage(async page => {
    assert.deepEqual(await rowIds(page), ['alpha', 'gamma', 'beta'])
    await pin(page, 'beta').click()
    await expectPinned(page, 'beta', true)
    await settled(page)
    assert.deepEqual(await rowIds(page), ['beta', 'alpha', 'gamma'])
    assert.equal(await header(page, 'gamma').evaluate(row => row.parentElement.parentElement.closest('[data-fixture-project-id]')?.getAttribute('data-fixture-project-id')), 'alpha')
    await header(page, 'alpha').locator('.workspace-title').click()
    await page.waitForFunction(() => document.querySelector('[data-row-key="workspace:gamma"]') === null)
    await header(page, 'alpha').locator('.workspace-title').click()
    await expectPinned(page, 'gamma', false)
    assert.equal(await page.locator('button[data-dsh-project-pin]').count(), 3)
  }, '&tree=1')
})

test('English pin controls provide accurate labels and keyboard actions', async () => {
  await withPage(async page => {
    await page.getByRole('button', { name: 'Pin project 文献阅读', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expectPinned(page, 'beta', true)
    await expectOrder(page, ['beta', 'alpha', 'gamma'])
    await settled(page)
    assert.equal(await pin(page, 'beta').getAttribute('aria-label'), 'Unpin project 文献阅读')
    assert.deepEqual(await page.evaluate(() => window.workspaceFixture.events.toggles), [])
    await pin(page, 'beta').focus()
    await page.keyboard.press('Space')
    await expectPinned(page, 'beta', false)
    await expectOrder(page, ['alpha', 'beta', 'gamma'])
  }, '&english=1')
})

test('project-like content outside the sidebar stays untouched', async () => {
  await withPage(async page => {
    await page.locator('main').evaluate(main => {
      const fake = document.createElement('div')
      fake.id = 'unrelated-project'
      fake.setAttribute('role', 'treeitem')
      fake.setAttribute('data-row-key', 'workspace:beta')
      fake.textContent = '文献阅读'
      main.append(fake)
    })
    await page.evaluate(() => window.workspaceFixture.redraw())
    await expectPinned(page, 'beta', false)
    assert.equal(await page.locator('#unrelated-project button').count(), 0)
    assert.equal(await page.locator('#unrelated-project').textContent(), '文献阅读')
  })
})

test('unavailable browser storage still permits native project pinning during this session', async () => {
  await withPage(async page => {
    await page.evaluate(() => {
      Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('Storage unavailable', 'SecurityError') } })
      window.disposePins = window.installPins()
    })
    await pin(page, 'beta').click()
    await expectPinned(page, 'beta', true)
    await expectOrder(page, ['beta', 'alpha', 'gamma'])
    await settled(page)
    await pin(page, 'beta').click()
    await expectPinned(page, 'beta', false)
    await expectOrder(page, ['alpha', 'beta', 'gamma'])
  }, '&no-auto=1')
})

test('DSH can load folding immediately and attach project pins when its service arrives later', async () => {
  await withPage(async page => {
    await page.evaluate(() => {
      const disposers = []
      function effect(factory) {
        const dispose = factory()
        if (typeof dispose === 'function') disposers.push(dispose)
        return dispose
      }
      window.foldingPlugin.apply({
        effect,
        inject(names, callback) {
          window.provideWorkspaceService = () => callback({
            effect,
            get(name) {
              if (name !== 'workspaces') throw new Error('Unexpected requested service')
              return window.fakeWorkspaces
            },
          })
          return () => {}
        },
      })
      window.disposeDshFixture = () => { for (const dispose of disposers.reverse()) dispose() }
    })
    assert.equal(await page.locator('button[data-dsh-project-pin]').count(), 0)
    assert.equal(await page.locator('button[data-dsh-folding-section="workspaces"]').count(), 1)
    await page.evaluate(() => window.provideWorkspaceService())
    await expectPinned(page, 'beta', false)
    await pin(page, 'beta').click()
    await expectOrder(page, ['beta', 'alpha', 'gamma'])
    await settled(page)
    await page.evaluate(() => window.disposeDshFixture())
    assert.equal(await page.locator('button[data-dsh-project-pin]').count(), 0)
    assert.equal(await page.locator('button[data-dsh-folding-control]').count(), 0)
    assert.equal(await page.evaluate(() => window.workspaceFixture.listenerCount()), 0)
  }, '&no-auto=1')
})
