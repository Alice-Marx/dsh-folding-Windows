function createProjectPinController(service, win) {
  let disposed = false;
  let busy = false;
  let error = null;
  let pinnedIds = [];
  let baseOrder = [];
  const listeners = new Set();
  let sourceUnsubscribe = null;
  let failureLatch = false;
  let sourceChangedDuringBusy = false;
  let pendingStorageUpdate = null;
  let lastSnapshotPhase = service.list.getSnapshot().phase;
  let internalOrders = null;
  let storageRevision = 0;

  function validIds(value) {
    return Array.isArray(value) ? Array.from(new Set(value.filter(id => typeof id === 'string' && id.length > 0))) : [];
  }

  function loadPersistedState() {
    try {
      const stored = win.localStorage.getItem('dsh-folding-windows:project-pins:v1');
      if (!stored) return { pinnedIds: [], baseOrder: [] };
      const parsed = JSON.parse(stored);
      const pinnedIds = validIds(parsed?.pinnedIds);
      const baseOrder = validIds(parsed?.baseOrder);
      return { pinnedIds, baseOrder };
    } catch (e) {
      return { pinnedIds: [], baseOrder: [] };
    }
  }

  function savePersistedState() {
    if (disposed || pendingStorageUpdate) return;
    try {
      const data = { pinnedIds: [...pinnedIds], baseOrder: [...baseOrder] };
      const serialized = JSON.stringify(data);
      const existing = win.localStorage.getItem('dsh-folding-windows:project-pins:v1');
      if (existing === serialized) return;
      win.localStorage.setItem('dsh-folding-windows:project-pins:v1', serialized);
    } catch (e) {
      // Ignore storage errors
    }
  }

  function syncBaseOrderWithSource(snapshot = service.list.getSnapshot()) {
    if (snapshot.phase !== 'ready') return;
    const currentIds = snapshot.items.map(item => item.workspaceId);
    const currentIdSet = new Set(currentIds);
    const currentPinnedSet = new Set(pinnedIds);
    const filteredOldBase = baseOrder.filter(id => currentIdSet.has(id));
    const newIds = currentIds.filter(id => !baseOrder.includes(id));
    const skeleton = [...filteredOldBase, ...newIds];
    const unpinnedSequence = currentIds.filter(id => !currentPinnedSet.has(id));
    let unpinnedIdx = 0;
    const newBase = skeleton.map(id => currentPinnedSet.has(id) ? id : unpinnedSequence[unpinnedIdx++]);
    const newPinned = pinnedIds.filter(id => currentIdSet.has(id));
    const baseChanged = JSON.stringify(newBase) !== JSON.stringify(baseOrder);
    const pinnedChanged = JSON.stringify(newPinned) !== JSON.stringify(pinnedIds);
    if (baseChanged || pinnedChanged) {
      baseOrder = newBase;
      pinnedIds = newPinned;
      savePersistedState();
    }
  }

  function computeDesiredOrder(pinnedSet, base) {
    return [...Array.from(pinnedSet), ...base.filter(id => !pinnedSet.has(id))];
  }

  async function reconcileOrder(desired) {
    try {
      const snapshot = service.list.getSnapshot();
      if (snapshot.phase !== 'ready' || disposed) return false;
      const currentOrder = snapshot.items.map(item => item.workspaceId);
      if (currentOrder.length === desired.length && currentOrder.every((id, i) => id === desired[i])) return true;
      const maxMoves = snapshot.items.length;
      let moves = 0;
      while (moves < maxMoves) {
        if (disposed) return false;
        const snap = service.list.getSnapshot();
        if (snap.phase !== 'ready') return false;
        const current = snap.items.map(item => item.workspaceId);
        if (current.length === desired.length && current.every((id, i) => id === desired[i])) return true;
        let firstMismatch = -1;
        const minLen = Math.min(current.length, desired.length);
        for (let i = 0; i < minLen; i++) {
          if (current[i] !== desired[i]) {
            firstMismatch = i;
            break;
          }
        }
        if (firstMismatch === -1) return current.length === desired.length;
        const idToMove = desired[firstMismatch];
        const currentIndex = current.indexOf(idToMove);
        if (currentIndex === -1) return false;
        const beforeId = current[firstMismatch];
        const nextOrder = current.filter(id => id !== idToMove);
        nextOrder.splice(firstMismatch, 0, idToMove);
        internalOrders = new Set([JSON.stringify(current), JSON.stringify(nextOrder)]);
        try {
          await service.insertBefore(idToMove, beforeId);
          moves++;
        } catch (e) {
          throw e;
        }
        if (disposed) return false;
        if (sourceChangedDuringBusy || pendingStorageUpdate) return true;
      }
      const finalSnap = service.list.getSnapshot();
      const finalOrder = finalSnap.items.map(item => item.workspaceId);
      return finalOrder.length === desired.length && finalOrder.every((id, i) => id === desired[i]);
    } finally {
      internalOrders = null;
    }
  }

  function applyStoredState(update) {
    pinnedIds = [...update.newPinned];
    baseOrder = [...update.newBase];
    const snapshot = service.list.getSnapshot();
    if (snapshot.phase === 'ready') {
      const ids = snapshot.items.map(item => item.workspaceId);
      const current = new Set(ids);
      pinnedIds = pinnedIds.filter(id => current.has(id));
      baseOrder = [...baseOrder.filter(id => current.has(id)), ...ids.filter(id => !baseOrder.includes(id))];
    }
    failureLatch = false;
    error = null;
    savePersistedState();
  }

  async function runReconciliation(desired, rollback = null) {
    if (disposed || busy) return false;
    busy = true;
    error = null;
    sourceChangedDuringBusy = false;
    notifyListener();
    let success = true;
    try {
      try {
        if (!await reconcileOrder(desired)) throw new Error('Order convergence failed');
      } catch (e) {
        success = false;
        if (disposed) return false;
        error = 'reorder_failed';
        failureLatch = true;
        if (rollback && storageRevision === rollback.revision && !pendingStorageUpdate) {
          pinnedIds = rollback.pinnedIds;
          baseOrder = rollback.baseOrder;
          savePersistedState();
        }
      }
      if (disposed) return false;
      // At most one coalesced follow-up in this transaction. Own optimistic
      // snapshots are excluded in handleSourceUpdate, including failure rollback.
      if (pendingStorageUpdate || (sourceChangedDuringBusy && !failureLatch)) {
        if (pendingStorageUpdate) {
          const pending = pendingStorageUpdate;
          pendingStorageUpdate = null;
          applyStoredState(pending);
        }
        sourceChangedDuringBusy = false;
        try {
          if (!await reconcileOrder(computeDesiredOrder(new Set(pinnedIds), baseOrder))) {
            throw new Error('Order convergence failed');
          }
        } catch (e) {
          if (!disposed) {
            error = 'reorder_failed';
            failureLatch = true;
          }
          success = false;
        }
      }
      return success && !disposed;
    } finally {
      busy = false;
      notifyListener();
      if (!disposed && (pendingStorageUpdate || (sourceChangedDuringBusy && !failureLatch))) {
        queueMicrotask(() => {
          if (disposed || busy) return;
          if (pendingStorageUpdate) {
            const pending = pendingStorageUpdate;
            pendingStorageUpdate = null;
            applyStoredState(pending);
          }
          sourceChangedDuringBusy = false;
          runReconciliation(computeDesiredOrder(new Set(pinnedIds), baseOrder));
        });
      }
    }
  }

  function notifyListener() {
    if (disposed) return;
    for (const listener of [...listeners]) listener(getState());
  }

  function getState() {
    const snapshot = service.list.getSnapshot();
    return {
      items: snapshot.items,
      phase: snapshot.phase,
      pinnedIds: [...pinnedIds],
      busy: busy,
      error: error
    };
  }

  function subscribe(listener) {
    if (disposed) return () => {};
    listeners.add(listener);
    listener(getState());
    return () => listeners.delete(listener);
  }

  async function toggle(id) {
    if (disposed) return false;
    const snapshot = service.list.getSnapshot();
    if (snapshot.phase !== 'ready') return false;
    if (typeof id !== 'string' || id.trim() === '' || !snapshot.items.some(item => item.workspaceId === id)) return false;
    if (busy) return false;
    failureLatch = false;
    syncBaseOrderWithSource();
    const oldPinned = [...pinnedIds];
    const oldBase = [...baseOrder];
    const revision = storageRevision;
    const newPinned = [...oldPinned];
    const idx = newPinned.indexOf(id);
    if (idx === -1) newPinned.unshift(id);
    else newPinned.splice(idx, 1);
    const currentIdSet = new Set(snapshot.items.map(item => item.workspaceId));
    const validPinned = newPinned.filter(pid => currentIdSet.has(pid));
    const validPinnedSet = new Set(validPinned);
    pinnedIds = Array.from(validPinnedSet);
    const desired = computeDesiredOrder(validPinnedSet, baseOrder);
    savePersistedState();
    return runReconciliation(desired, { pinnedIds: oldPinned, baseOrder: oldBase, revision });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (sourceUnsubscribe) {
      sourceUnsubscribe();
      sourceUnsubscribe = null;
    }
    if (typeof win.removeEventListener === 'function') {
      win.removeEventListener('storage', handleStorageEvent);
    }
    listeners.clear();
    busy = false;
    error = null;
    failureLatch = false;
    sourceChangedDuringBusy = false;
    pendingStorageUpdate = null;
  }

  function handleSourceUpdate() {
    if (disposed) return;
    const snapshot = service.list.getSnapshot();
    const phaseChanged = snapshot.phase !== lastSnapshotPhase;
    if (phaseChanged) lastSnapshotPhase = snapshot.phase;
    // A native call we are awaiting republishes the order we asked for. Anything
    // else — including an edit landing while that call is in flight — is external
    // and must be adopted as the ordinary order instead of being overwritten.
    if (!phaseChanged && internalOrders !== null && internalOrders.has(JSON.stringify(snapshot.items.map(item => item.workspaceId)))) {
      notifyListener();
      return;
    }
    if (snapshot.phase === 'ready') {
      syncBaseOrderWithSource(snapshot);
      if (pinnedIds.length > 0 && !failureLatch) {
        if (busy) sourceChangedDuringBusy = true;
        else {
          const desired = computeDesiredOrder(new Set(pinnedIds), baseOrder);
          runReconciliation(desired).then(() => notifyListener()).catch(() => notifyListener());
        }
      }
    }
    notifyListener();
  }

  function handleStorageEvent(event) {
    if (disposed) return;
    if (event.storageArea !== win.localStorage) return;
    // A key of null means another tab cleared the whole storage area.
    if (event.key !== 'dsh-folding-windows:project-pins:v1' && event.key !== null) return;
    let newPinned;
    let newBase;
    if (event.newValue === null) {
      // Another tab cleared the preference: drop the pins, keep the ordinary
      // order this tab already knows, and hand that order back to DSH.
      newPinned = [];
      newBase = [...baseOrder];
    } else {
      try {
        const parsed = JSON.parse(event.newValue);
        newPinned = validIds(parsed?.pinnedIds);
        newBase = validIds(parsed?.baseOrder);
      } catch (e) {
        return;
      }
    }
    if (JSON.stringify({ pinnedIds: newPinned, baseOrder: newBase }) === JSON.stringify({ pinnedIds, baseOrder })) return;
    failureLatch = false;
    if (busy) {
      pendingStorageUpdate = { newPinned, newBase };
      return;
    }
    applyStoredState({ newPinned, newBase });
    runReconciliation(computeDesiredOrder(new Set(pinnedIds), baseOrder))
      .then(() => notifyListener()).catch(() => notifyListener());
  }

  const initialPersisted = loadPersistedState();
  pinnedIds = initialPersisted.pinnedIds;
  baseOrder = initialPersisted.baseOrder;
  sourceUnsubscribe = service.list.subscribe(handleSourceUpdate);
  win.addEventListener('storage', handleStorageEvent);
  if (lastSnapshotPhase === 'ready') {
    syncBaseOrderWithSource();
    if (pinnedIds.length > 0) {
      const pinnedSet = new Set(pinnedIds);
      const desired = computeDesiredOrder(pinnedSet, baseOrder);
      runReconciliation(desired).catch(() => {});
    }
  }

  return { getState, subscribe, toggle, dispose };
}
