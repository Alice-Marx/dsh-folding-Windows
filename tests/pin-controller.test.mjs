import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const STORAGE_KEY = 'dsh-folding-windows:project-pins:v1'
const source = await readFile(new URL('../src/pin-controller.js', import.meta.url), 'utf8')
const createController = vm.runInNewContext(`${source}\ncreateProjectPinController`, {
  setTimeout, clearTimeout, queueMicrotask,
})

function project(workspaceId, title = workspaceId.toUpperCase()) {
  return Object.freeze({
    workspaceId, title, path: `C:/projects/${workspaceId}`,
    sessionIds: Object.freeze([`session-${workspaceId}`]),
    createdAt: 1, updatedAt: 1,
  })
}

function makeWindow(initial = null, storageMode = 'normal') {
  const values = new Map(initial === null ? [] : [[STORAGE_KEY, initial]])
  const listeners = new Set()
  const storage = {
    getItem(key) {
      if (storageMode === 'methods-throw') throw new Error('Storage unavailable')
      return values.get(key) ?? null
    },
    setItem(key, value) {
      if (storageMode === 'methods-throw') throw new Error('Storage unavailable')
      values.set(key, String(value))
    },
    removeItem(key) { values.delete(key) },
  }
  const win = {
    addEventListener(type, listener) { if (type === 'storage') listeners.add(listener) },
    removeEventListener(type, listener) { if (type === 'storage') listeners.delete(listener) },
  }
  Object.defineProperty(win, 'localStorage', {
    get() {
      if (storageMode === 'getter-throws') throw new Error('Storage access denied')
      return storageMode === 'absent' ? undefined : storage
    },
  })
  return {
    win, listeners,
    read() { return JSON.parse(values.get(STORAGE_KEY) ?? 'null') },
    external(value, { key = STORAGE_KEY, area = storage } = {}) {
      const oldValue = values.get(STORAGE_KEY) ?? null
      if (key === null) values.clear()
      else if (area === storage && key === STORAGE_KEY) {
        if (value === null) values.delete(key)
        else values.set(key, value)
      }
      for (const listener of [...listeners]) listener({
        key, oldValue, newValue: value, storageArea: area,
      })
    },
  }
}

function makeService(initial = ['a', 'b', 'c', 'd'], phase = 'ready') {
  let snapshot = {
    items: initial.map(value => typeof value === 'string' ? project(value) : value),
    phase, state: 'idle', error: null, pinnedSessionIds: [], archivedSessionIds: [],
  }
  const listeners = new Set()
  const calls = []
  let active = 0
  let maxActive = 0
  let behavior = async () => {}
  const publish = (items, nextPhase = snapshot.phase) => {
    snapshot = { ...snapshot, items, phase: nextPhase }
    for (const listener of [...listeners]) listener()
  }
  const service = {
    list: {
      getSnapshot: () => snapshot,
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    },
    async insertBefore(id, beforeId) {
      const before = snapshot.items
      const item = before.find(item => item.workspaceId === id)
      assert.ok(item, `insertBefore must use an existing ID: ${id}`)
      assert.notEqual(id, beforeId, 'a project cannot be inserted before itself')
      const reordered = before.filter(item => item.workspaceId !== id)
      const targetIndex = beforeId === undefined ? reordered.length : reordered.findIndex(item => item.workspaceId === beforeId)
      assert.ok(targetIndex >= 0, `insertBefore must use an existing target: ${beforeId}`)
      reordered.splice(targetIndex, 0, item)
      const call = { id, beforeId, number: calls.length + 1 }
      calls.push(call)
      active += 1
      maxActive = Math.max(active, maxActive)
      publish(reordered)
      try {
        await behavior(call)
        publish(snapshot.items)
      } catch (error) {
        publish(before)
        throw error
      } finally {
        active -= 1
      }
    },
  }
  return {
    service, calls, listeners,
    get snapshot() { return snapshot },
    get maxActive() { return maxActive },
    ids() { return snapshot.items.map(item => item.workspaceId) },
    behavior(next) { behavior = next },
    external(items, nextPhase = snapshot.phase) {
      const known = new Map(snapshot.items.map(item => [item.workspaceId, item]))
      publish(items.map(value => typeof value === 'string' ? known.get(value) ?? project(value) : value), nextPhase)
    },
  }
}

function pins(controller) { return Array.from(controller.getState().pinnedIds) }
function prefs(pinnedIds, baseOrder = ['a', 'b', 'c', 'd']) { return JSON.stringify({ pinnedIds, baseOrder }) }
const pause = () => new Promise(resolve => setTimeout(resolve, 2))
async function eventually(check, message) {
  const deadline = Date.now() + 1000
  while (!check() && Date.now() < deadline) await pause()
  assert.ok(check(), message)
}
async function quiet() {
  for (let index = 0; index < 4; index += 1) await pause()
}
function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

test('several pins have newest-first priority and unpin restores ordinary positions', { timeout: 3000 }, async t => {
  const native = makeService()
  const storage = makeWindow()
  const controller = createController(native.service, storage.win)
  t.after(() => controller.dispose())
  assert.equal(await controller.toggle('b'), true)
  assert.deepEqual(native.ids(), ['b', 'a', 'c', 'd'])
  assert.equal(await controller.toggle('d'), true)
  assert.deepEqual(pins(controller), ['d', 'b'])
  assert.deepEqual(native.ids(), ['d', 'b', 'a', 'c'])
  assert.equal(await controller.toggle('b'), true)
  assert.deepEqual(native.ids(), ['d', 'a', 'b', 'c'])
  assert.equal(await controller.toggle('d'), true)
  assert.deepEqual(native.ids(), ['a', 'b', 'c', 'd'])
  assert.deepEqual(storage.read().pinnedIds, [])
  assert.deepEqual(storage.read().baseOrder, ['a', 'b', 'c', 'd'])
  assert.equal(native.maxActive, 1, 'native order writes must be awaited serially')
  assert.strictEqual(controller.getState().items, native.snapshot.items)
  assert.deepEqual(native.snapshot.items.map(item => [...item.sessionIds]), [['session-a'], ['session-b'], ['session-c'], ['session-d']])
})

test('pending startup retains saved pins until the first ready snapshot', { timeout: 3000 }, async t => {
  const native = makeService([], 'pending')
  const storage = makeWindow(prefs(['d', 'b']))
  const controller = createController(native.service, storage.win)
  t.after(() => controller.dispose())
  await quiet()
  assert.deepEqual(pins(controller), ['d', 'b'])
  assert.equal(await controller.toggle('b'), false)
  assert.equal(native.calls.length, 0)
  assert.deepEqual(storage.read().pinnedIds, ['d', 'b'])
  native.external(['a', 'b', 'c', 'd'], 'ready')
  await eventually(() => !controller.getState().busy && native.ids().join() === 'd,b,a,c', 'ready transition should apply saved pins')
  assert.equal(await controller.toggle('missing'), false)
  assert.equal(native.maxActive, 1)
})

test('external reordering of ordinary projects is retained when pins are enforced and removed', { timeout: 3000 }, async t => {
  const native = makeService()
  const controller = createController(native.service, makeWindow().win)
  t.after(() => controller.dispose())
  assert.equal(await controller.toggle('b'), true)
  native.external(['d', 'b', 'c', 'a'])
  await eventually(() => !controller.getState().busy && native.ids().join() === 'b,d,c,a', 'pin should stay first without sorting ordinary projects')
  assert.equal(await controller.toggle('b'), true)
  assert.deepEqual(native.ids(), ['d', 'b', 'c', 'a'])
})

test('IDs preserve pins through duplicate titles and renames, and handle additions and deletions', { timeout: 3000 }, async t => {
  const native = makeService([project('a', 'Same'), project('b', 'Same'), project('c')])
  const controller = createController(native.service, makeWindow().win)
  t.after(() => controller.dispose())
  assert.equal(await controller.toggle('b'), true)
  native.external([project('e', 'Same'), project('b', 'Renamed'), project('a', 'Same'), project('c')])
  await eventually(() => !controller.getState().busy && native.ids().join() === 'b,e,a,c', 'new projects should join the ordinary order')
  assert.deepEqual(pins(controller), ['b'])
  assert.equal(controller.getState().items[0].title, 'Renamed')
  native.external(['e', 'a', 'c'])
  await eventually(() => !controller.getState().busy && pins(controller).length === 0, 'deleted pinned IDs should be pruned')
  assert.deepEqual(native.ids(), ['e', 'a', 'c'])
})

test('without pins, external native order is adopted without a reorder call', { timeout: 3000 }, async t => {
  const native = makeService(['b', 'a', 'c'])
  const controller = createController(native.service, makeWindow().win)
  t.after(() => controller.dispose())
  native.external(['c', 'b', 'a'])
  await quiet()
  assert.deepEqual(native.ids(), ['c', 'b', 'a'])
  assert.equal(native.calls.length, 0)
  assert.deepEqual(Array.from(controller.getState().items, item => item.workspaceId), ['c', 'b', 'a'])
})

test('a rejected native move rolls back preferences and stops until explicit retry', { timeout: 3000 }, async t => {
  const native = makeService()
  const storage = makeWindow()
  const controller = createController(native.service, storage.win)
  t.after(() => controller.dispose())
  let fail = true
  native.behavior(async () => { if (fail) { fail = false; throw new Error('simulated native rejection') } })
  assert.equal(await controller.toggle('d'), false)
  assert.deepEqual(pins(controller), [])
  assert.deepEqual(native.ids(), ['a', 'b', 'c', 'd'])
  assert.equal(controller.getState().error, 'reorder_failed')
  assert.equal(controller.getState().busy, false)
  assert.deepEqual(storage.read().pinnedIds, [])
  const callCount = native.calls.length
  native.external(native.snapshot.items)
  await quiet()
  assert.equal(native.calls.length, callCount, 'rollback notifications must not retry a failed reorder')
  assert.equal(await controller.toggle('d'), true)
  assert.deepEqual(pins(controller), ['d'])
  assert.deepEqual(native.ids(), ['d', 'a', 'b', 'c'])
  assert.equal(controller.getState().error, null)
})

test('a partly applied reorder reports failure, restores pin preference, and remains retryable', { timeout: 3000 }, async t => {
  const native = makeService()
  const controller = createController(native.service, makeWindow().win)
  t.after(() => controller.dispose())
  assert.equal(await controller.toggle('d'), true)
  native.behavior(async () => { throw new Error('establish the failure latch') })
  assert.equal(await controller.toggle('b'), false)
  assert.deepEqual(pins(controller), ['d'])
  // A failed action suppresses automatic retries. A later external permutation
  // makes the next explicit toggle require more than one move for any strategy.
  native.external(['b', 'd', 'c', 'a'])
  await quiet()
  const firstActionCalls = native.calls.length
  let actionCalls = 0
  native.behavior(async () => {
    actionCalls += 1
    if (actionCalls === 2) throw new Error('second move rejected')
  })
  assert.equal(await controller.toggle('a'), false)
  assert.ok(actionCalls >= 2, 'the failure must occur after at least one accepted move')
  assert.deepEqual(pins(controller), ['d'])
  assert.equal(controller.getState().error, 'reorder_failed')
  assert.equal(controller.getState().busy, false)
  const afterFailure = native.calls.length
  assert.ok(afterFailure - firstActionCalls <= 8, 'failure recovery must be bounded by project count')
  native.external(native.snapshot.items)
  await quiet()
  assert.equal(native.calls.length, afterFailure, 'partial failure must not create a subscription retry loop')
  native.behavior(async () => {})
  assert.equal(await controller.toggle('a'), true)
  assert.deepEqual(native.ids(), ['a', 'd', 'b', 'c'])
  assert.equal(native.maxActive, 1)
})

test('missing, inaccessible, and corrupt persistence still permit in-memory pinning', { timeout: 3000 }, async () => {
  for (const mode of ['absent', 'getter-throws', 'methods-throw', 'normal']) {
    const native = makeService()
    const storage = makeWindow('{invalid json', mode)
    const controller = createController(native.service, storage.win)
    try {
      assert.equal(await controller.toggle('c'), true, mode)
      assert.deepEqual(native.ids(), ['c', 'a', 'b', 'd'], mode)
      assert.deepEqual(pins(controller), ['c'], mode)
      assert.equal(await controller.toggle('c'), true, mode)
      assert.deepEqual(native.ids(), ['a', 'b', 'c', 'd'], mode)
    } finally { controller.dispose() }
  }
})

test('cross-tab pin preference and storage clear reconcile, unrelated storage does not', { timeout: 3000 }, async t => {
  const native = makeService()
  const storage = makeWindow()
  const controller = createController(native.service, storage.win)
  t.after(() => controller.dispose())
  storage.external(prefs(['c']), { area: {} })
  storage.external(prefs(['c']), { key: 'some-other-plugin' })
  await quiet()
  assert.equal(native.calls.length, 0)
  assert.deepEqual(pins(controller), [])
  storage.external(prefs(['c']))
  await eventually(() => !controller.getState().busy && native.ids().join() === 'c,a,b,d', 'new cross-tab preference should be applied')
  assert.deepEqual(pins(controller), ['c'])
  storage.external(null, { key: null })
  await eventually(() => !controller.getState().busy && pins(controller).length === 0, 'storage clear should reset pin preference')
  assert.deepEqual(native.ids(), ['a', 'b', 'c', 'd'])
})

test('a newer cross-tab preference received while busy is not overwritten by the older toggle', { timeout: 3000 }, async t => {
  const native = makeService()
  const storage = makeWindow()
  const gate = deferred()
  native.behavior(call => call.number === 1 ? gate.promise : Promise.resolve())
  const controller = createController(native.service, storage.win)
  t.after(() => controller.dispose())
  const action = controller.toggle('d')
  await eventually(() => native.calls.length === 1 && controller.getState().busy, 'first move should be in flight')
  assert.equal(await controller.toggle('a'), false, 'a second local toggle must not run concurrently')
  storage.external(prefs(['b']))
  gate.resolve()
  await action
  await eventually(() => !controller.getState().busy && native.ids().join() === 'b,a,c,d', 'latest cross-tab preference should win after the in-flight action')
  assert.deepEqual(pins(controller), ['b'])
  assert.deepEqual(storage.read().pinnedIds, ['b'])
  assert.equal(native.maxActive, 1)
})

test('an external ordinary order change during a move is coalesced and kept on unpin', { timeout: 3000 }, async t => {
  const native = makeService()
  const gate = deferred()
  native.behavior(call => call.number === 1 ? gate.promise : Promise.resolve())
  const controller = createController(native.service, makeWindow().win)
  t.after(() => controller.dispose())
  const action = controller.toggle('d')
  await eventually(() => native.calls.length === 1 && controller.getState().busy, 'move should be in flight')
  native.external(['c', 'd', 'b', 'a'])
  gate.resolve()
  assert.equal(await action, true)
  await eventually(() => !controller.getState().busy && native.ids().join() === 'd,c,b,a', 'ordinary external order should survive follow-up reconciliation')
  assert.equal(await controller.toggle('d'), true)
  assert.deepEqual(native.ids(), ['c', 'b', 'a', 'd'])
  assert.equal(native.maxActive, 1)
})

test('dispose during an in-flight action detaches listeners and starts no more native calls', { timeout: 3000 }, async () => {
  const native = makeService()
  const storage = makeWindow()
  const gate = deferred()
  native.behavior(() => gate.promise)
  const controller = createController(native.service, storage.win)
  const action = controller.toggle('d')
  try {
    await eventually(() => native.calls.length === 1 && controller.getState().busy, 'move should be in flight')
    controller.dispose()
    assert.equal(native.listeners.size, 0)
    assert.equal(storage.listeners.size, 0)
    storage.external(prefs(['b']))
    native.external(['c', 'd', 'b', 'a'])
    gate.resolve()
    await action
    await quiet()
    assert.equal(native.calls.length, 1, 'dispose must prevent follow-up and restoration calls')
    assert.deepEqual(native.ids(), ['c', 'd', 'b', 'a'], 'dispose must not undo native order')
    assert.equal(await controller.toggle('a'), false)
  } finally {
    gate.resolve()
    controller.dispose()
  }
})
