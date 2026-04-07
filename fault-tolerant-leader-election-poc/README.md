# Fault-Tolerant Leader Election POC

A simplified Raft-style leader election and heartbeat system. The Java backend simulates a 5-node cluster, broadcasts heartbeats over WebSockets, and elects a new leader on failure. The React UI visualizes node roles in real time and lets you kill the current leader to trigger a new election without losing committed state.

## Goal

Show the mechanics of lease-free leader election in a small cluster: randomized election timeouts, majority voting, heartbeats from the winning leader, and state continuity after leader failure.

## What It Covers

- Randomized election timeouts and leader heartbeats
- Candidate vote requests and majority election
- Leader failover after a simulated crash
- Committed value replication to all alive nodes

## Quick Start

1. Ensure Java 17+ and Maven are installed.
2. Start the backend:
   ```bash
   cd fault-tolerant-leader-election-poc/backend
   mvn spring-boot:run
   ```
3. Start the frontend:
   ```bash
   cd fault-tolerant-leader-election-poc/frontend
   npm install
   npm start
   ```
4. Open `http://localhost:3000`.

## UI Flows

- Watch the initial leader emerge after follower timeouts
- Observe live role changes and heartbeat updates over WebSocket
- Kill the current leader and watch followers start a new election
- Track the replicated committed value before and after failover

## JSON / WebSocket Endpoints

- `GET /api/cluster/state`
- `POST /api/cluster/kill-leader`
- WebSocket endpoint: `ws://localhost:8080/ws`

## Configuration

- backend and cluster timing are configured in the backend simulation code
- the frontend runs on the CRA development server at `3000`
- all nodes are simulated inside one JVM process

## Notes and Limitations

- This is a single-process simulation (all nodes live in one JVM).
- The POC models leader election and a monotonic committed value, not a full Raft log.
- Network partitions, message reordering, and durable recovery are intentionally omitted.

## Technologies Used

- Spring Boot
- Java 17
- React
- WebSocket
