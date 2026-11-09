import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";

test("migration and durable acknowledgement lifecycle", async t => {
  const task = {
    id: "migration-task",
    title: "Synthetic migration task",
    completed: false,
    deleted: false,
    updatedAt: "2026-01-01T00:00:00.000Z"
  };

  // Seed the original schema before importing the application database module.
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("eskelsen-fieldnote-lab", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("tasks", { keyPath: "id" });
      request.result.createObjectStore("outbox", { keyPath: "id" });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(["tasks", "outbox"], "readwrite");
      tx.objectStore("tasks").put(task);
      tx.objectStore("outbox").put({
        id: "legacy-operation",
        taskId: task.id,
        kind: "upsert",
        task,
        createdAt: task.updatedAt
      });
      tx.onabort = () => reject(tx.error);
      tx.oncomplete = () => { db.close(); resolve(); };
    };
  });

  const { openDatabase, readSnapshot, saveTask } = await import("../src/db.ts");
  const {
    prepareFlight, deliverFlight, acknowledgeFlight, readSyncState
  } = await import("../src/sync-storage.ts");

  await t.test("schema upgrade preserves legacy task and queued operation", async () => {
    const db = await openDatabase();
    assert.equal(db.version, 2);
    assert.equal(db.objectStoreNames.contains("sync"), true);
    const snapshot = await readSnapshot();
    assert.deepEqual(snapshot.tasks, [task]);
    assert.equal(snapshot.pending, 1);
  });

  await t.test("unconfirmed acknowledgement aborts and preserves queue", async () => {
    const flight = await prepareFlight();
    assert.ok(flight);
    await assert.rejects(acknowledgeFlight(flight.command.operationId));
    assert.equal((await readSnapshot()).pending, 1);
    assert.equal((await readSyncState()).flight?.command.operationId,
      flight.command.operationId);
  });

  await t.test("remote commit survives missing acknowledgement and retry", async () => {
    const first = await deliverFlight();
    assert.equal(first.status, "accepted");
    assert.equal((await readSnapshot()).pending, 1);

    const retry = await deliverFlight();
    assert.deepEqual(retry, first);
    const state = await readSyncState();
    assert.equal(state.server.records[task.id].revision, 1);
    assert.equal(Object.keys(state.server.receipts).length, 1);
  });

  await t.test("acknowledgement does not remove a newer local edit", async () => {
    const flight = await prepareFlight();
    assert.ok(flight);
    await saveTask({
      ...task,
      title: "Newer edit during acknowledgement delay",
      updatedAt: "2026-01-02T00:00:00.000Z"
    });
    assert.equal((await readSnapshot()).pending, 2);

    await acknowledgeFlight(flight.command.operationId);
    const snapshot = await readSnapshot();
    assert.equal(snapshot.pending, 1);
    assert.equal(snapshot.tasks[0].title,
      "Newer edit during acknowledgement delay");
    assert.equal((await readSyncState()).flight, null);
  });

  await t.test("next flight sends newer edit using acknowledged revision", async () => {
    const flight = await prepareFlight();
    assert.ok(flight);
    assert.equal(flight.command.baseRevision, 1);
    assert.equal(flight.coveredIds.length, 1);

    const reply = await deliverFlight();
    assert.equal(reply.status, "accepted");
    if (reply.status !== "accepted") throw new Error("Expected acceptance.");
    assert.equal(reply.record.revision, 2);

    await acknowledgeFlight(reply.operationId);
    assert.equal((await readSnapshot()).pending, 0);
    assert.equal(await prepareFlight(), null);
  });

  await t.test("multiple edits coalesce to latest snapshot without losing deletion", async () => {
    await saveTask({ ...task, completed: true });
    await saveTask({ ...task, completed: true, deleted: true });
    const flight = await prepareFlight();
    assert.ok(flight);
    assert.equal(flight.coveredIds.length, 2);
    assert.equal(flight.command.task.deleted, true);

    const reply = await deliverFlight();
    assert.equal(reply.status, "accepted");
    await acknowledgeFlight(reply.operationId);
    assert.equal((await readSnapshot()).tasks.length, 0);
    assert.equal((await readSnapshot()).pending, 0);
    assert.equal((await readSyncState()).server.records[task.id].task.deleted, true);
  });

  (await openDatabase()).close();
});