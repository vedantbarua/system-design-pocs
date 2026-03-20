# Trading Log POC Technical Notes

## Architecture
- `TradingLogController` exposes both the HTML workflow and JSON API.
- `TradingLogService` owns in-memory state and recomputes derived portfolio state from the trade ledger.
- `TradeEntry` is the immutable execution record.
- `PositionSnapshot` and `PortfolioSummary` are derived read models.

## Position Calculation Model
- Trades are replayed in chronological order.
- Open inventory uses a weighted-average open price.
- Selling against a long position crystallizes realized P&L as `sellPrice - avgOpenPrice`.
- Buying against a short position crystallizes realized P&L as `avgOpenPrice - buyPrice`.
- Unrealized P&L uses the latest market mark when present.

## Why Replay On Read
- The trade list is the primary ledger.
- Rebuilding positions from trades keeps the mutation surface small.
- For a POC-sized workload, recalculating snapshots on each read is simpler than maintaining separate mutable books.

## Alert Model
- Missing mark: open position without a market price.
- Exposure breach: gross exposure at or above `$100,000`.
- Drawdown breach: total P&L at or below `-$1,000`.
- Flat-but-booked: informational alert when a symbol is flat with non-zero realized P&L.

## Obvious Production Upgrades
- Persist trades and marks in a database or append-only log.
- Add user auth, audit history, and immutable correction workflows.
- Use FIFO or tax-lot accounting instead of weighted average if the use case requires it.
- Stream position updates over WebSocket rather than recomputing only on page refresh.
