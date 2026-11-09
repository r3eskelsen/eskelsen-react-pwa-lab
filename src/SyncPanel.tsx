import { useEffect, useRef, useState } from "react";
import { readSnapshot } from "./db";
import {
  prepareFlight, deliverFlight, acknowledgeFlight, readSyncState,
  simulateRemoteEdit, resolveFlight
} from "./sync-storage";
import type { Reply } from "./sync-engine";

interface Props {
  onChanged: () => Promise<void>;
}

// Web Locks serializes participating sync panels across tabs/app windows.
// Local edits remain allowed; acknowledgements cover only frozen outbox IDs.
export function SyncPanel({ onChanged }: Props) {
  const [connected, setConnected] = useState(false);
  const connectedRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [message, setMessage] = useState("Simulated connection is off. Pending changes remain on this device.");
  const [conflict, setConflict] = useState<Extract<Reply, { status: "conflict" }> | null>(null);
  const [remoteCount, setRemoteCount] = useState(0);
  const [receiptCount, setReceiptCount] = useState(0);
  const [error, setError] = useState("");
  const changedRef = useRef(onChanged);
  changedRef.current = onChanged;

  async function refreshPanel() {
    const state = await readSyncState();
    setRemoteCount(Object.values(state.server.records)
      .filter(record => !record.task.deleted).length);
    setReceiptCount(Object.keys(state.server.receipts).length);
    const flight = state.flight;
    const remote = flight && Object.hasOwn(state.server.records, flight.command.task.id)
      ? state.server.records[flight.command.task.id] : null;
    const unresolved = flight &&
      !Object.hasOwn(state.server.receipts, flight.command.operationId) &&
      (remote?.revision ?? 0) !== flight.command.baseRevision;
    setConflict(unresolved ? {
      status: "conflict",
      operationId: flight.command.operationId,
      record: remote
    } : null);
    await changedRef.current();
  }

  async function action(work: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      if (!navigator.locks) throw new Error("This demo requires Web Locks for coordinated synchronization.");
      await navigator.locks.request("eskelsen-fieldnote-sync", async () => {
        await work();
        await refreshPanel();
      });
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function drain(loseAcknowledgement = false) {
    if (!connectedRef.current) {
      setMessage("Simulated server unavailable. Queue preserved.");
      return;
    }
    let batches = 0;
    while (connectedRef.current && batches < 100) {
      const flight = await prepareFlight();
      if (!flight) {
        setMessage("Demo synchronization complete. All queued changes confirmed.");
        return;
      }
      const reply = await deliverFlight();
      if (reply.status === "conflict") {
        setMessage("Conflict detected. Choose which version to keep.");
        return;
      }
      if (loseAcknowledgement) {
        setMessage("Remote commit saved; acknowledgement deliberately lost. Retry sync to recover.");
        return;
      }
      await acknowledgeFlight(reply.operationId);
      batches++;
    }
    setMessage("Sync paused. Any remaining changes stay queued.");
  }

  useEffect(() => {
    void refreshPanel().catch(error => setError(String(error)));
    const timer = window.setInterval(() => {
      if (connectedRef.current) void action(() => drain());
    }, 5000);
    const reconnect = () => {
      if (connectedRef.current) void action(() => drain());
    };
    window.addEventListener("online", reconnect);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", reconnect);
    };
  }, []);

  return (
    <section className="workspace" style={{ marginTop: 24 }} aria-label="Demo synchronization">
      <p className="eyebrow">SIMULATED SYNC LAB</p>
      <h2>One queue. Confirmed changes.</h2>
      <p style={{ fontSize: 13, lineHeight: 1.7 }}>
        Both local and simulated remote data live in this browser.
        No real server upload or cross-device sync occurs.
        Automatic retry runs every five seconds while this app is open and the simulation is connected.
      </p>

      <label style={{ display: "flex", gap: 10, alignItems: "center", margin: "18px 0" }}>
        <input type="checkbox" checked={connected} disabled={busy}
          onChange={event => {
            const value = event.target.checked;
            connectedRef.current = value;
            setConnected(value);
            if (value) void action(() => drain());
            else setMessage("Simulated connection off. New changes stay queued.");
          }} />
        Simulated connection
      </label>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        <button disabled={busy || !connected} onClick={() => void action(() => drain())}>
          Sync now
        </button>
        <button disabled={busy} onClick={() => void action(async () => {
          connectedRef.current = true;
          try {
            await drain(true);
          } finally {
            connectedRef.current = false;
            setConnected(false);
          }
        })}>
          Lose next acknowledgement
        </button>
        <button disabled={busy} onClick={() => void action(async () => {
          const snapshot = await readSnapshot();
          const task = snapshot.tasks[0];
          if (!task) throw new Error("Create a synthetic task first.");
          // Pause automatic delivery so the competing edit can be inspected.
          connectedRef.current = false;
          setConnected(false);
          await simulateRemoteEdit(task);
          setMessage("Competing remote edit created. Change that task locally, then reconnect to demonstrate a conflict.");
        })}>
          Simulate remote edit
        </button>
      </div>

      <p role="status" className="notice">{message}</p>
      <p style={{ fontSize: 12 }}>
        Simulated remote tasks: {remoteCount} / Stored receipts: {receiptCount}
      </p>
      {error && <p role="alert" className="error">{error}</p>}

      {conflict && (
        <div style={{ border: "1px solid #c6a56d", borderRadius: 10, padding: 18 }}>
          <strong>Conflict requires a decision</strong>
          <p>Remote title: {conflict.record?.task.title ?? "(missing record)"}</p>
          <p style={{ fontSize: 12 }}>
            Keep local resubmits the current device version against the remote revision.
            Use remote replaces the conflicting local task and archives both versions for audit.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <button disabled={busy} onClick={() => void action(async () => {
              await resolveFlight("local");
              setMessage("Local version selected. Reconnect or sync to confirm it.");
              if (connectedRef.current) await drain();
            })}>Keep local</button>
            <button disabled={busy || !conflict.record} onClick={() => void action(async () => {
              await resolveFlight("remote");
              setMessage("Remote version selected. Conflicting local operations archived.");
            })}>Use remote</button>
          </div>
        </div>
      )}
    </section>
  );
}