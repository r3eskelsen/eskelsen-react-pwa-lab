export interface Task {
  id: string;
  title: string;
  completed: boolean;
  deleted: boolean;
  updatedAt: string;
}

export interface Operation {
  id: string;
  taskId: string;
  kind: "upsert" | "delete";
  task: Task;
  createdAt: string;
}

let database: Promise<IDBDatabase> | undefined;

export function openDatabase(): Promise<IDBDatabase> {
  if (!database) {
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("eskelsen-fieldnote-lab", 2);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("tasks")) db.createObjectStore("tasks", { keyPath: "id" });
        if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "id" }); if (!db.objectStoreNames.contains("sync")) db.createObjectStore("sync");
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(
        new Error("Database upgrade blocked. Close other demo tabs and reload.")
      );
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          database = undefined;
        };
        resolve(db);
      };
    }).catch(error => {
      database = undefined;
      throw error;
    });
  }
  return database;
}

export async function readSnapshot(): Promise<{
  tasks: Task[];
  pending: number;
}> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["tasks", "outbox"], "readonly");
    const tasks = tx.objectStore("tasks").getAll();
    const count = tx.objectStore("outbox").count();
    tx.oncomplete = () => resolve({
      tasks: (tasks.result as Task[])
        .filter(task => !task.deleted)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      pending: count.result
    });
    tx.onabort = () => reject(tx.error ?? new Error("Database read aborted."));
  });
}

export async function saveTask(task: Task): Promise<void> {
  const title = task.title.trim();
  if (!title || title.length > 120) {
    throw new Error("Task title must contain 1 to 120 characters.");
  }

  const stored = { ...task, title };
  const operation: Operation = {
    id: crypto.randomUUID(),
    taskId: task.id,
    kind: task.deleted ? "delete" : "upsert",
    task: stored,
    createdAt: new Date().toISOString()
  };

  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["tasks", "outbox"], "readwrite");
    tx.objectStore("tasks").put(stored);
    tx.objectStore("outbox").put(operation);
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("Save aborted. Change was not confirmed."));
  });
}