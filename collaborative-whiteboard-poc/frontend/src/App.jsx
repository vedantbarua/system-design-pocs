import React, { useEffect, useMemo, useRef, useState } from "react";

const BOARD_BACKGROUND = "#f6f6f8";

function randomName() {
  const suffix = Math.floor(Math.random() * 900 + 100);
  return `Guest-${suffix}`;
}

function randomColor() {
  const palette = ["#2d7ff9", "#f97316", "#10b981", "#ef4444", "#8b5cf6", "#0ea5e9"];
  return palette[Math.floor(Math.random() * palette.length)];
}

function drawStroke(ctx, stroke) {
  if (!stroke || stroke.points.length < 2) return;
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
  for (let i = 1; i < stroke.points.length; i += 1) {
    const point = stroke.points[i];
    ctx.lineTo(point.x, point.y);
  }
  ctx.stroke();
}

export default function App() {
  const canvasRef = useRef(null);
  const boardRef = useRef(null);
  const wsRef = useRef(null);
  const dprRef = useRef(window.devicePixelRatio || 1);
  const currentStrokeRef = useRef(null);
  const cursorThrottleRef = useRef(0);

  const [boardId, setBoardId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("board") || "default";
  });
  const [name, setName] = useState(() => localStorage.getItem("whiteboard-name") || randomName());
  const [color, setColor] = useState(() => localStorage.getItem("whiteboard-color") || randomColor());
  const [tool, setTool] = useState("pen");
  const [width, setWidth] = useState(4);
  const [strokes, setStrokes] = useState([]);
  const [users, setUsers] = useState([]);
  const [cursors, setCursors] = useState({});
  const [clientId, setClientId] = useState(null);
  const [connection, setConnection] = useState("disconnected");

  const activeColor = tool === "eraser" ? BOARD_BACKGROUND : color;
  const strokeWidth = tool === "eraser" ? width * 3 : width;

  const wsUrl = useMemo(() => {
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const base = `${protocol}://${window.location.host}/ws`;
    const params = new URLSearchParams({ boardId, name, color });
    return `${base}?${params.toString()}`;
  }, [boardId, name, color]);

  useEffect(() => {
    localStorage.setItem("whiteboard-name", name);
  }, [name]);

  useEffect(() => {
    localStorage.setItem("whiteboard-color", color);
  }, [color]);

  useEffect(() => {
    const resizeCanvas = () => {
      const canvas = canvasRef.current;
      const container = boardRef.current;
      if (!canvas || !container) return;
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      dprRef.current = dpr;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      redraw();
    };

    const redraw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = BOARD_BACKGROUND;
      ctx.fillRect(0, 0, canvas.width / dprRef.current, canvas.height / dprRef.current);
      strokes.forEach((stroke) => drawStroke(ctx, stroke));
      if (currentStrokeRef.current) {
        drawStroke(ctx, currentStrokeRef.current);
      }
      Object.entries(cursors).forEach(([id, cursor]) => {
        if (id === clientId) return;
        ctx.fillStyle = cursor.color;
        ctx.beginPath();
        ctx.arc(cursor.x, cursor.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = "12px 'Space Grotesk', sans-serif";
        ctx.fillText(cursor.name, cursor.x + 8, cursor.y - 8);
      });
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [strokes, cursors, clientId]);

  useEffect(() => {
    setConnection("connecting");
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.addEventListener("open", () => {
      setConnection("connected");
    });

    ws.addEventListener("message", (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === "init") {
        setStrokes(payload.strokes || []);
        setUsers(payload.users || []);
        setClientId(payload.clientId);
        return;
      }
      if (payload.type === "stroke:add") {
        setStrokes((prev) => [...prev, payload.stroke]);
        return;
      }
      if (payload.type === "board:clear") {
        setStrokes([]);
        return;
      }
      if (payload.type === "presence:update") {
        const nextUsers = payload.users || [];
        setUsers(nextUsers);
        setCursors((prev) => {
          const activeIds = new Set(nextUsers.map((user) => user.id));
          const filtered = {};
          Object.entries(prev).forEach(([id, cursor]) => {
            if (activeIds.has(id)) filtered[id] = cursor;
          });
          return filtered;
        });
        return;
      }
      if (payload.type === "cursor:update") {
        setCursors((prev) => ({
          ...prev,
          [payload.clientId]: payload.cursor
        }));
      }
    });

    ws.addEventListener("close", () => {
      setConnection("disconnected");
    });

    return () => {
      ws.close();
    };
  }, [wsUrl]);

  const sendMessage = (payload) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(payload));
  };

  const getPoint = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  };

  const handlePointerDown = (event) => {
    if (event.button !== 0) return;
    const point = getPoint(event);
    currentStrokeRef.current = {
      id: crypto.randomUUID(),
      points: [point],
      color: activeColor,
      width: strokeWidth,
      author: name
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event) => {
    if (!currentStrokeRef.current) return;
    const point = getPoint(event);
    currentStrokeRef.current.points.push(point);
    const now = Date.now();
    if (now - cursorThrottleRef.current > 60) {
      cursorThrottleRef.current = now;
      sendMessage({ type: "cursor:update", cursor: point });
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    drawStroke(ctx, currentStrokeRef.current);
  };

  const handlePointerUp = (event) => {
    if (!currentStrokeRef.current) return;
    const finished = currentStrokeRef.current;
    currentStrokeRef.current = null;
    setStrokes((prev) => [...prev, finished]);
    sendMessage({ type: "stroke:add", stroke: finished });
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handleClear = () => {
    setStrokes([]);
    sendMessage({ type: "board:clear" });
  };

  const handleBoardChange = () => {
    const params = new URLSearchParams(window.location.search);
    params.set("board", boardId);
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">◻</span>
          <div>
            <h1>Collaborative Whiteboard</h1>
            <p>Realtime canvas with WebSocket sync (in-memory)</p>
          </div>
        </div>
        <div className={`status ${connection}`}>
          <span className="dot" />
          {connection}
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <div className="panel">
            <h2>Session</h2>
            <label>
              Board
              <input
                value={boardId}
                onChange={(event) => setBoardId(event.target.value)}
                onBlur={handleBoardChange}
                placeholder="default"
              />
            </label>
            <label>
              Your name
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              Color
              <input type="color" value={color} onChange={(event) => setColor(event.target.value)} />
            </label>
            <div className="users">
              <h3>Participants</h3>
              {users.length === 0 ? (
                <p className="muted">No one else yet.</p>
              ) : (
                <ul>
                  {users.map((user) => (
                    <li key={user.id}>
                      <span className="swatch" style={{ background: user.color }} />
                      {user.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="panel">
            <h2>Tools</h2>
            <div className="tool-row">
              <button className={tool === "pen" ? "active" : ""} onClick={() => setTool("pen")}>
                Pen
              </button>
              <button className={tool === "eraser" ? "active" : ""} onClick={() => setTool("eraser")}>
                Eraser
              </button>
            </div>
            <label>
              Width
              <input
                type="range"
                min="2"
                max="12"
                value={width}
                onChange={(event) => setWidth(Number(event.target.value))}
              />
            </label>
            <button className="clear" onClick={handleClear}>
              Clear board
            </button>
          </div>

          <div className="panel">
            <h2>Tips</h2>
            <ul className="tips">
              <li>Open multiple tabs to see realtime sync.</li>
              <li>Change the board name to create a new room.</li>
              <li>Holding the mouse down streams live cursor updates.</li>
            </ul>
          </div>
        </aside>

        <main className="board" ref={boardRef}>
          <canvas
            ref={canvasRef}
            className="canvas"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          />
        </main>
      </div>
    </div>
  );
}
