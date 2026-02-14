# Fault-Tolerant Leader Election POC

A simplified Raft-style leader election and heartbeat system. The Java backend simulates a 5-node cluster, broadcasts heartbeats over WebSockets, and elects a new leader on failure. The React UI visualizes node roles in real time and lets you kill the current leader to trigger a new election without losing committed state.

## What This Demonstrates
- Randomized election timeouts and leader heartbeats
- Candidate vote requests and majority election
- Leader failover after a simulated crash
- Committed value replication to all alive nodes

## How to Run
1. Ensure Java 17+ and Maven are installed.
2. Start the backend:
   - `cd fault-tolerant-leader-election-poc/backend`
   - `mvn spring-boot:run`
3. Start the frontend:
   - `cd ../frontend`
   - `npm install`
   - `npm start`
4. Open `http://localhost:3000`

## Controls
- **Kill Current Leader**: marks the leader as down so followers elect a new leader.

## Notes
- This is a single-process simulation (all nodes live in one JVM).
- WebSocket endpoint: `ws://localhost:8080/ws`
- REST state endpoint: `http://localhost:8080/api/cluster/state`
