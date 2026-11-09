import { SyncPanel } from "./SyncPanel";
import { registerOfflineSupport } from "./offline";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { readSnapshot, saveTask, type Task } from "./db";
import "./style.css";

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [pending, setPending] = useState(0);
  const [title, setTitle] = useState("");
  const [online, setOnline] = useState(navigator.onLine);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function refresh() {
    const snapshot = await readSnapshot();
    setTasks(snapshot.tasks);
    setPending(snapshot.pending);
  }

  useEffect(() => {
    refresh().then(() => setReady(true)).catch(error => {
      setError(error instanceof Error ? error.message : String(error));
    });
    const updateConnection = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);

  async function persist(task: Task, clearInput = false) {
    setBusy(true);
    setError("");
    setNotice("");
    let committed = false;
    try {
      await saveTask(task);
      committed = true;
      if (clearInput) setTitle("");
      await refresh();
      setNotice("Saved on this device. Open the simulated sync panel to inspect delivery.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setError(committed
        ? `The change was saved, but the list could not refresh. Reload the page. ${message}`
        : `Save was not confirmed. ${message}`);
    } finally {
      setBusy(false);
    }
  }

  const completed = tasks.filter(task => task.completed).length;

  return (
    <div className="shell">
      <header>
        <a className="brand" href="/">fieldnote<span> / lab</span></a>
        <span className={`connection ${online ? "" : "offline"}`}>
          <i />{online ? "Network reported online" : "Network reported offline"}
        </span>
      </header>

      <main>
        <section className="intro">
          <p className="eyebrow">ESKELSEN SYSTEMS / INDEPENDENT DEMO</p>
          <h1>Keep your plans.<br /><span>Even between connections.</span></h1>
          <p className="lead">
            A small workspace for synthetic tasks, built to explore
            local persistence and reliable change tracking.
          </p>
        </section>

        <section className="stats" aria-label="Workspace statistics">
          <div><strong>{tasks.length}</strong><span>Active tasks</span></div>
          <div><strong>{completed}</strong><span>Completed</span></div>
          <div><strong>{pending}</strong><span>Queued operations</span></div>
        </section>

        <section className="workspace">
          <div className="section-heading">
            <div><p className="eyebrow">YOUR WORKSPACE</p><h2>Today's fieldnotes</h2></div>
            <span className="pill">Device storage</span>
          </div>

          <form onSubmit={event => {
            event.preventDefault();
            if (!ready || busy || !title.trim()) return;
            void persist({
              id: crypto.randomUUID(),
              title: title.trim(),
              completed: false,
              deleted: false,
              updatedAt: new Date().toISOString()
            }, true);
          }}>
            <label htmlFor="task-title">New synthetic task</label>
            <div className="input-row">
              <input id="task-title" value={title} maxLength={120}
                placeholder="e.g. Prepare the demo checklist"
                onChange={event => setTitle(event.target.value)}
                disabled={!ready || busy} required />
              <button disabled={!ready || busy || !title.trim()}>
                {busy ? "Saving..." : "Add task"}
              </button>
            </div>
          </form>

          <p className="error" role="alert">{error}</p>
          <p className="notice" role="status">{notice}</p>

          {!ready && !error && <p>Opening device storage...</p>}
          {ready && tasks.length === 0 && (
            <div className="empty">
              <span className="empty-symbol">+</span>
              <h3>A clear page. A fresh start.</h3>
              <p>Add a task to begin testing local persistence.</p>
            </div>
          )}

          <ul className="task-list">
            {tasks.map(task => (
              <li key={task.id}>
                <label className="task">
                  <input type="checkbox" checked={task.completed} disabled={busy}
                    onChange={() => void persist({
                      ...task, completed: !task.completed,
                      updatedAt: new Date().toISOString()
                    })} />
                  <span className={task.completed ? "done" : ""}>{task.title}</span>
                </label>
                <button className="delete" type="button" disabled={busy}
                  aria-label={`Delete task: ${task.title}`}
                  onClick={() => void persist({
                    ...task, deleted: true, updatedAt: new Date().toISOString()
                  })}>Delete</button>
              </li>
            ))}
          </ul>
        </section>

        <SyncPanel onChanged={refresh} />
        <aside>
          <strong>Lab checkpoint: offline storage and simulated sync</strong>
          <p>
            Changes are stored in this browser profile. Queued operations are
            handled by the simulated sync panel. The offline shell must be cached
            during an initial online visit before it can load without the server.
          </p>
          <p>
            Use synthetic data only. Clearing site data, private browsing,
            storage eviction, or device loss can remove local records.
            Network status does not verify server availability.
          </p>
        </aside>
      </main>
      <footer>FIELDNOTE / React PWA Lab <span>Independent technical demonstration</span></footer>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>
);
window.addEventListener("load", registerOfflineSupport, { once: true });
