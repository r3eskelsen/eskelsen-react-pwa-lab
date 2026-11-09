import test from "node:test";
import assert from "node:assert/strict";
import { applyCommand, emptyServer } from "../src/sync-engine.ts";

const task = {
  id: "synthetic-task-1",
  title: "Synthetic checklist",
  completed: false,
  deleted: false,
  updatedAt: "2026-01-01T00:00:00.000Z"
};
const create = {
  operationId: "operation-1",
  task,
  baseRevision: 0
};

test("new task is accepted at revision one without mutating input", () => {
  const original = emptyServer();
  const result = applyCommand(original, create);
  assert.equal(result.reply.status, "accepted");
  assert.equal(result.server.records[task.id].revision, 1);
  assert.deepEqual(original, emptyServer());
});

test("retry after lost acknowledgement does not duplicate the write", () => {
  const first = applyCommand(emptyServer(), create);
  const retry = applyCommand(first.server, structuredClone(create));
  assert.deepEqual(retry.reply, first.reply);
  assert.equal(retry.server.records[task.id].revision, 1);
  assert.equal(Object.keys(retry.server.receipts).length, 1);
});

test("stale revision returns conflict and preserves remote data", () => {
  const first = applyCommand(emptyServer(), create);
  const stale = {
    operationId: "operation-2",
    task: { ...task, title: "Stale local edit" },
    baseRevision: 0
  };
  const result = applyCommand(first.server, stale);
  assert.equal(result.reply.status, "conflict");
  assert.equal(result.reply.record.revision, 1);
  assert.deepEqual(result.server, first.server);
  assert.equal(Object.hasOwn(result.server.receipts, "operation-2"), false);
});

test("explicit local resolution uses a new operation and current revision", () => {
  const first = applyCommand(emptyServer(), create);
  const result = applyCommand(first.server, {
    operationId: "resolution-1",
    task: { ...task, title: "Explicitly resolved local version" },
    baseRevision: 1
  });
  assert.equal(result.reply.status, "accepted");
  assert.equal(result.reply.record.revision, 2);
  assert.equal(result.reply.record.task.title, "Explicitly resolved local version");
});

test("deletion keeps a tombstone and rejects stale resurrection", () => {
  const first = applyCommand(emptyServer(), create);
  const deleted = applyCommand(first.server, {
    operationId: "delete-1",
    task: { ...task, deleted: true },
    baseRevision: 1
  });
  assert.equal(deleted.server.records[task.id].task.deleted, true);
  const stale = applyCommand(deleted.server, {
    operationId: "stale-1",
    task,
    baseRevision: 1
  });
  assert.equal(stale.reply.status, "conflict");
  assert.equal(stale.reply.record.task.deleted, true);
});

test("invalid commands and operation ID payload reuse are rejected", () => {
  assert.throws(() => applyCommand(emptyServer(), {
    ...create, task: { ...task, title: " " }
  }), /Invalid sync command/);
  assert.throws(() => applyCommand(emptyServer(), {
    ...create, baseRevision: -1
  }), /Invalid sync command/);
  const first = applyCommand(emptyServer(), create);
  assert.throws(() => applyCommand(first.server, {
    ...create, task: { ...task, title: "Different payload" }
  }), /different payload/);
});