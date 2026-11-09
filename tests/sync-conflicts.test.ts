import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { openDatabase, readSnapshot, saveTask } from "../src/db.ts";
import {
  prepareFlight, deliverFlight, acknowledgeFlight, readSyncState,
  simulateRemoteEdit, resolveFlight
} from "../src/sync-storage.ts";

async function flush() {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (!(await prepareFlight())) return;
    const reply = await deliverFlight();
    assert.equal(reply.status, "accepted");
    await acknowledgeFlight(reply.operationId);
  }
  throw new Error("Unexpected undrained queue.");
}

async function fixture() {
  const task = {
    id: crypto.randomUUID(),
    title: "Synthetic conflict task",
    completed: false,
    deleted: false,
    updatedAt: new Date().toISOString()
  };
  await saveTask(task);
  await flush();
  await simulateRemoteEdit(task);
  const local = { ...task, completed: true };
  await saveTask(local);
  const flight = await prepareFlight();
  assert.ok(flight);
  const reply = await deliverFlight();
  assert.equal(reply.status, "conflict");
  assert.equal((await readSnapshot()).pending, 1);
  return { task, local, flight };
}

test("persistent conflict resolution safeguards", async t => {
  await t.test("keep local resubmits with a new ID and archives the decision", async () => {
    const { task, flight } = await fixture();
    await resolveFlight("local");
    const replacement = await prepareFlight();
    assert.ok(replacement);
    assert.notEqual(replacement.command.operationId, flight.command.operationId);
    assert.equal(replacement.command.baseRevision, 2);
    await flush();

    const state = await readSyncState();
    assert.equal(state.server.records[task.id].revision, 3);
    assert.equal(state.server.records[task.id].task.completed, true);
    assert.equal((await readSnapshot()).pending, 0);
    const history = (state as any).resolutionHistory;
    assert.equal(history.at(-1).choice, "local");
    assert.equal(history.at(-1).remote.task.title, "Remote demo: Synthetic conflict task");
  });

  await t.test("use remote replaces only the conflicting task and archives discarded edits", async () => {
    const { task } = await fixture();
    const before = await readSyncState();
    const receiptCount = Object.keys(before.server.receipts).length;
    const unrelatedBefore = (await readSnapshot()).tasks.filter(item => item.id !== task.id);

    await resolveFlight("remote");

    const snapshot = await readSnapshot();
    const selected = snapshot.tasks.find(item => item.id === task.id);
    assert.equal(selected?.title, "Remote demo: Synthetic conflict task");
    assert.equal(selected?.completed, false);
    assert.deepEqual(snapshot.tasks.filter(item => item.id !== task.id), unrelatedBefore);
    assert.equal(snapshot.pending, 0);

    const state = await readSyncState();
    assert.equal(Object.keys(state.server.receipts).length, receiptCount);
    assert.equal(state.revisions[task.id], 2);
    assert.equal(state.flight, null);
    const archived = (state as any).resolutionHistory.at(-1);
    assert.equal(archived.choice, "remote");
    assert.equal(archived.local.completed, true);
    assert.equal(archived.operations.length, 1);
  });

  await t.test("remote choice rejects stale local snapshot and preserves newer edits", async () => {
    const { task, local } = await fixture();
    await saveTask({ ...local, title: "Newer unsent local edit" });

    await assert.rejects(resolveFlight("remote"));
    assert.equal((await readSnapshot()).pending, 2);
    assert.equal((await readSnapshot()).tasks.find(item => item.id === task.id)?.title,
      "Newer unsent local edit");

    await resolveFlight("local");
    await flush();
    assert.equal((await readSyncState()).server.records[task.id].task.title,
      "Newer unsent local edit");
    assert.equal((await readSnapshot()).pending, 0);
  });

  await t.test("remote changes again after local resolution produce another conflict", async () => {
    const { task } = await fixture();
    await resolveFlight("local");
    await simulateRemoteEdit(task);
    const reply = await deliverFlight();
    assert.equal(reply.status, "conflict");
    assert.equal((await readSnapshot()).pending, 1);

    await resolveFlight("local");
    await flush();
    assert.equal((await readSnapshot()).pending, 0);
    assert.equal((await readSyncState()).server.records[task.id].task.completed, true);
  });

  (await openDatabase()).close();
});