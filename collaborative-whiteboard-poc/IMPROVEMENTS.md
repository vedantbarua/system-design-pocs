# Improvements

## Production Gaps

- Add durable board storage so strokes survive backend restarts.
- Add authentication, board ownership, invite links, and permission checks.
- Add operation IDs or sequence numbers for reconnect recovery, duplicate suppression, and deterministic event replay.
- Add board history with undo, redo, per-stroke deletion, and version restore.
- Add object-aware erasing instead of drawing with the background color.

## Reliability Improvements

- Persist accepted strokes before broadcasting them to connected clients.
- Add reconnect handling that lets a client resume from its last received event instead of refetching the entire board.
- Add heartbeat or ping handling to detect dead WebSocket connections faster.
- Add per-board size limits, payload limits, and defensive validation for points, colors, widths, and names.
- Add server-side cleanup for inactive empty boards.

## Scaling Improvements

- Move WebSocket fanout behind a pub/sub layer such as Redis, NATS, or Kafka.
- Partition boards across backend workers by board ID.
- Store cursor and presence state in an ephemeral TTL-backed store.
- Compact long stroke histories into periodic snapshots so large boards do not require full replay on join.
- Add backpressure handling for slow WebSocket clients and large broadcasts.

## Security Improvements

- Require authenticated users for private boards.
- Enforce board-level roles such as owner, editor, and viewer.
- Sanitize and validate user-controlled display names and color values.
- Add rate limits for stroke creation, cursor updates, and board clear operations.
- Audit destructive actions such as clearing a board or restoring an old version.

## Testing Improvements

- Add backend tests for REST health, board fetch, and clear behavior.
- Add WebSocket integration tests for join, presence, stroke broadcast, cursor broadcast, and disconnect cleanup.
- Add validation tests for malformed messages, invalid strokes, and invalid cursor payloads.
- Add frontend tests around board switching, local drawing state, and clear behavior.
- Add load tests for many clients connected to the same board.
