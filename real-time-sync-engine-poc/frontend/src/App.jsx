import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import * as Y from "yjs";

const SERVER_URL = "http://localhost:4000";

function toUint8Array(payload) {
  if (payload instanceof Uint8Array) return payload;
  if (payload instanceof ArrayBuffer) return new Uint8Array(payload);
  if (Array.isArray(payload)) return new Uint8Array(payload);
  return new Uint8Array(payload?.data || []);
}

function applyDiff(ytext, prev, next) {
  if (prev === next) return;
  let start = 0;
  while (start < prev.length && start < next.length && prev[start] === next[start]) {
    start += 1;
  }

  let endPrev = prev.length - 1;
  let endNext = next.length - 1;
  while (endPrev >= start && endNext >= start && prev[endPrev] === next[endNext]) {
    endPrev -= 1;
    endNext -= 1;
  }

  const deleteCount = endPrev - start + 1;
  if (deleteCount > 0) {
    ytext.delete(start, deleteCount);
  }

  const insertText = next.slice(start, endNext + 1);
  if (insertText) {
    ytext.insert(start, insertText);
  }
}

export default function App() {
  const [text, setText] = useState("");
  const [status, setStatus] = useState("disconnected");
  const [clientId, setClientId] = useState("-");
  const socketRef = useRef(null);
  const docRef = useRef(null);
  const textRef = useRef(null);
  const prevValueRef = useRef("");

  useEffect(() => {
    const doc = new Y.Doc();
    const ytext = doc.getText("content");
    docRef.current = doc;
    textRef.current = ytext;

    const socket = io(SERVER_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      setStatus("connected");
      setClientId(socket.id);
    });

    socket.on("disconnect", () => {
      setStatus("disconnected");
    });

    socket.on("sync:init", (payload) => {
      const update = toUint8Array(payload);
      Y.applyUpdate(doc, update, "remote");
    });

    socket.on("doc:update", (payload) => {
      const update = toUint8Array(payload);
      Y.applyUpdate(doc, update, "remote");
    });

    const updateHandler = (update, origin) => {
      if (origin === "remote") return;
      if (!socket.connected) return;
      socket.emit("doc:update", update);
    };

    doc.on("update", updateHandler);

    const observeHandler = () => {
      const next = ytext.toString();
      prevValueRef.current = next;
      setText(next);
    };

    ytext.observe(observeHandler);

    return () => {
      ytext.unobserve(observeHandler);
      doc.off("update", updateHandler);
      socket.disconnect();
      doc.destroy();
    };
  }, []);

  const handleChange = (event) => {
    const next = event.target.value;
    const prev = prevValueRef.current;
    const ytext = textRef.current;
    if (!ytext) return;
    applyDiff(ytext, prev, next);
    prevValueRef.current = next;
    setText(next);
  };

  return (
    <div className="page">
      <header className="header">
        <div>
          <p className="eyebrow">Real-Time Sync Engine</p>
          <h1>Shared Text Surface</h1>
          <p className="subhead">
            Every keystroke is turned into a CRDT update and broadcast to all
            connected clients over WebSockets.
          </p>
        </div>
        <div className="status">
          <div>
            <span className={`dot ${status}`} />
            <span className="label">{status}</span>
          </div>
          <div className="client-id">client: {clientId}</div>
        </div>
      </header>

      <main className="panel">
        <textarea
          className="editor"
          value={text}
          onChange={handleChange}
          placeholder="Start typing here... open a second tab to see real-time sync."
        />
        <div className="meta">
          <span>{text.length} characters</span>
          <span>CRDT: Yjs Text</span>
        </div>
      </main>

      <section className="notes">
        <h2>What to Try</h2>
        <ul>
          <li>Open two browser tabs and type simultaneously.</li>
          <li>Pause one tab, type in the other, then resume.</li>
          <li>Paste multi-line text to test large updates.</li>
        </ul>
      </section>
    </div>
  );
}
