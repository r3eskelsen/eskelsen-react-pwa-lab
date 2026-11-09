export interface SyncTask {
  id: string;
  title: string;
  completed: boolean;
  deleted: boolean;
  updatedAt: string;
}

export interface RemoteRecord {
  task: SyncTask;
  revision: number;
}

export interface Command {
  operationId: string;
  task: SyncTask;
  baseRevision: number;
}

export type Reply =
  | { status: "accepted"; operationId: string; record: RemoteRecord }
  | { status: "conflict"; operationId: string; record: RemoteRecord | null };

export interface DemoServer {
  records: Record<string, RemoteRecord>;
  receipts: Record<string, { command: Command; reply: Reply }>;
}

export function emptyServer(): DemoServer {
  return { records: {}, receipts: {} };
}

function validCommand(command: Command): boolean {
  const task = command.task;
  return typeof command.operationId === "string" &&
    /^[a-zA-Z0-9-]{1,100}$/.test(command.operationId) &&
    typeof task?.id === "string" &&
    /^[a-zA-Z0-9-]{1,100}$/.test(task.id) &&
    typeof task.title === "string" &&
    task.title.trim().length > 0 &&
    task.title.length <= 120 &&
    typeof task.completed === "boolean" &&
    typeof task.deleted === "boolean" &&
    typeof task.updatedAt === "string" &&
    Number.isFinite(Date.parse(task.updatedAt)) &&
    Number.isSafeInteger(command.baseRevision) &&
    command.baseRevision >= 0;
}

function sameCommand(a: Command, b: Command): boolean {
  return a.operationId === b.operationId &&
    a.baseRevision === b.baseRevision &&
    a.task.id === b.task.id &&
    a.task.title === b.task.title &&
    a.task.completed === b.task.completed &&
    a.task.deleted === b.task.deleted &&
    a.task.updatedAt === b.task.updatedAt;
}

// Pure simulated server transition. No network or browser storage is used here.
// Callers must persist the returned server before treating the reply as delivered.
export function applyCommand(
  server: DemoServer,
  command: Command
): { server: DemoServer; reply: Reply } {
  if (!validCommand(command)) throw new Error("Invalid sync command.");

  if (Object.hasOwn(server.receipts, command.operationId)) {
    const receipt = server.receipts[command.operationId];
    if (!sameCommand(receipt.command, command)) {
      throw new Error("Operation ID reused with a different payload.");
    }
    return { server, reply: structuredClone(receipt.reply) };
  }

  const current = Object.hasOwn(server.records, command.task.id)
    ? server.records[command.task.id]
    : null;

  if ((current?.revision ?? 0) !== command.baseRevision) {
    return {
      server,
      reply: {
        status: "conflict",
        operationId: command.operationId,
        record: current ? structuredClone(current) : null
      }
    };
  }

  const record: RemoteRecord = {
    task: structuredClone(command.task),
    revision: (current?.revision ?? 0) + 1
  };
  const reply: Reply = {
    status: "accepted",
    operationId: command.operationId,
    record
  };
  const records = structuredClone(server.records);
  const receipts = structuredClone(server.receipts);

  // defineProperty also safely handles special property names.
  Object.defineProperty(records, command.task.id, {
    value: structuredClone(record), enumerable: true,
    writable: true, configurable: true
  });
  Object.defineProperty(receipts, command.operationId, {
    value: { command: structuredClone(command), reply: structuredClone(reply) },
    enumerable: true, writable: true, configurable: true
  });

  return { server: { records, receipts }, reply: structuredClone(reply) };
}