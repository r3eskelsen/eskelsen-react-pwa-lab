import { openDatabase, type Task, type Operation } from "./db";
import {
  applyCommand, emptyServer,
  type Command, type DemoServer, type Reply
} from "./sync-engine";

interface Flight {
  command: Command;
  coveredIds: string[];
}
interface State {
  server: DemoServer;
  revisions: Record<string, number>;
  flight: Flight | null;
}
function initial(): State {
  return { server: emptyServer(), revisions: {}, flight: null };
}

// All callbacks remain synchronous inside the IndexedDB transaction.
async function transaction<T>(
  stores: string[],
  work: (tx: IDBTransaction, finish: (value: T) => void) => void
): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(stores, "readwrite");
    let result: T;
    let supplied = false;
    let failure: unknown;
    const finish = (value: T) => { result = value; supplied = true; };
    tx.oncomplete = () => supplied
      ? resolve(result)
      : reject(new Error("Transaction completed without a result."));
    tx.onabort = () => reject(failure ?? tx.error ?? new Error("Sync transaction aborted."));
    try {
      work(tx, finish);
    } catch (error) {
      failure = error;
      tx.abort();
    }
  });
}

// Coalesce queued edits for one task into its latest stored snapshot.
// Covered operation IDs are frozen, so later edits cannot be acknowledged early.
export async function prepareFlight(): Promise<Flight | null> {
  return transaction(["tasks", "outbox", "sync"], (tx, finish) => {
    const request = tx.objectStore("sync").get("state");
    request.onsuccess = () => {
      const state: State = request.result ?? initial();
      if (state.flight) { finish(state.flight); return; }

      const pending = tx.objectStore("outbox").getAll();
      pending.onsuccess = () => {
        const operations = pending.result as Operation[];
        operations.sort((a, b) =>
          a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
        const first = operations[0];
        if (!first) { finish(null); return; }

        const taskRequest = tx.objectStore("tasks").get(first.taskId);
        taskRequest.onsuccess = () => {
          const task = taskRequest.result as Task | undefined;
          if (!task) { tx.abort(); return; }

          const revision = Object.hasOwn(state.revisions, task.id)
            ? state.revisions[task.id] : 0;
          state.flight = {
            command: {
              operationId: crypto.randomUUID(),
              task,
              baseRevision: revision
            },
            coveredIds: operations
              .filter(operation => operation.taskId === task.id)
              .map(operation => operation.id)
          };
          tx.objectStore("sync").put(state, "state");
          finish(state.flight);
        };
      };
    };
  });
}

// Simulated remote commit is durable before acknowledgement is processed.
// Retrying the same flight reuses the operation ID and server receipt.
export async function deliverFlight(): Promise<Reply> {
  return transaction(["sync"], (tx, finish) => {
    const request = tx.objectStore("sync").get("state");
    request.onsuccess = () => {
      const state: State = request.result ?? initial();
      if (!state.flight) { tx.abort(); return; }
      try {
        const result = applyCommand(state.server, state.flight.command);
        state.server = result.server;
        tx.objectStore("sync").put(state, "state");
        finish(result.reply);
      } catch {
        tx.abort();
      }
    };
  });
}

export async function acknowledgeFlight(operationId: string): Promise<void> {
  return transaction(["outbox", "sync"], (tx, finish) => {
    const request = tx.objectStore("sync").get("state");
    request.onsuccess = () => {
      const state: State = request.result ?? initial();
      const flight = state.flight;
      if (!flight || flight.command.operationId !== operationId ||
          !Object.hasOwn(state.server.receipts, operationId)) {
        tx.abort();
        return;
      }

      const receipt = state.server.receipts[operationId];
      if (receipt.reply.status !== "accepted") { tx.abort(); return; }
      const taskId = flight.command.task.id;
      Object.defineProperty(state.revisions, taskId, {
        value: receipt.reply.record.revision,
        enumerable: true, writable: true, configurable: true
      });
      for (const id of flight.coveredIds) {
        tx.objectStore("outbox").delete(id);
      }
      state.flight = null;
      tx.objectStore("sync").put(state, "state");
      finish(undefined);
    };
  });
}

export async function readSyncState(): Promise<State> {
  return transaction(["sync"], (tx, finish) => {
    const request = tx.objectStore("sync").get("state");
    request.onsuccess = () => finish(request.result ?? initial());
  });
}
// Synthetic competing writer. This modifies only the simulated remote state.
export async function simulateRemoteEdit(task: Task): Promise<void> {
  return transaction(["sync"], (tx, finish) => {
    const request = tx.objectStore("sync").get("state");
    request.onsuccess = () => {
      const state: State = request.result ?? initial();
      const current = Object.hasOwn(state.server.records, task.id)
        ? state.server.records[task.id] : undefined;
      try {
        const result = applyCommand(state.server, {
          operationId: crypto.randomUUID(),
          baseRevision: current?.revision ?? 0,
          task: {
            ...(current?.task ?? task),
            title: ("Remote demo: " + task.title).slice(0, 120),
            updatedAt: new Date().toISOString()
          }
        });
        state.server = result.server;
        tx.objectStore("sync").put(state, "state");
        finish(undefined);
      } catch {
        tx.abort();
      }
    };
  });
}

// Remote acceptance is permitted only if the local snapshot has not changed.
// Local resolution preserves all currently queued edits for that task.
export async function resolveFlight(choice: "local" | "remote"): Promise<void> {
  return transaction(["tasks", "outbox", "sync"], (tx, finish) => {
    const request = tx.objectStore("sync").get("state");
    request.onsuccess = () => {
      const state: State & { resolutionHistory?: unknown[] } =
        request.result ?? initial();
      const flight = state.flight;
      if (!flight) { tx.abort(); return; }

      const taskId = flight.command.task.id;
      const remote = Object.hasOwn(state.server.records, taskId)
        ? state.server.records[taskId] : undefined;
      if ((remote?.revision ?? 0) === flight.command.baseRevision ||
          Object.hasOwn(state.server.receipts, flight.command.operationId)) {
        tx.abort();
        return;
      }

      const taskRequest = tx.objectStore("tasks").get(taskId);
      taskRequest.onsuccess = () => {
        const local = taskRequest.result as Task | undefined;
        if (!local) { tx.abort(); return; }

        const pendingRequest = tx.objectStore("outbox").getAll();
        pendingRequest.onsuccess = () => {
          const pending = (pendingRequest.result as Operation[])
            .filter(operation => operation.taskId === taskId);
          if (choice === "remote") {
            const snapshot = flight.command.task;
            const unchanged = local.title === snapshot.title &&
              local.completed === snapshot.completed &&
              local.deleted === snapshot.deleted &&
              local.updatedAt === snapshot.updatedAt &&
              pending.length === flight.coveredIds.length &&
              pending.every(operation => flight.coveredIds.includes(operation.id));
            if (!unchanged || !remote) { tx.abort(); return; }

            // Preserve both versions and the discarded operations for audit.
            state.resolutionHistory ??= [];
            state.resolutionHistory.push({
              at: new Date().toISOString(), choice,
              local, remote, operations: pending
            });
            tx.objectStore("tasks").put(remote.task);
            pending.forEach(operation => tx.objectStore("outbox").delete(operation.id));
            Object.defineProperty(state.revisions, taskId, {
              value: remote.revision, enumerable: true,
              writable: true, configurable: true
            });
            state.flight = null;
          } else {
            state.resolutionHistory ??= [];
            state.resolutionHistory.push({
              at: new Date().toISOString(), choice, local, remote: remote ?? null
            });
            state.flight = {
              command: {
                operationId: crypto.randomUUID(),
                task: local,
                baseRevision: remote?.revision ?? 0
              },
              coveredIds: pending.map(operation => operation.id)
            };
          }
          tx.objectStore("sync").put(state, "state");
          finish(undefined);
        };
      };
    };
  });
}