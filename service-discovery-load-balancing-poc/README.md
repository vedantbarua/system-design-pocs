# Service Discovery + Load Balancing POC

Spring Boot proof-of-concept for lease-based service discovery and zone-aware request routing with sticky sessions, canary instances, draining, and temporary failure ejection.

## Goal

Demonstrate the control-plane logic behind finding healthy service instances and routing traffic without relying on Eureka, Consul, Kubernetes, or a real sidecar mesh.

## What It Covers

- In-memory service registry with explicit instance registration
- Lease-based health using heartbeats and expiry windows
- Zone-aware routing with cross-zone fallback when local capacity is unhealthy
- Sticky session routing via weighted rendezvous hashing
- Weighted round robin when there is no session key
- Draining mode that removes instances from new traffic without deleting them
- Temporary ejection after repeated failures
- Dashboard showing registry state, routing decisions, and event history

## Quick Start

1. Ensure Java 17+ and Maven are installed.
2. Run the app:
   ```bash
   cd service-discovery-load-balancing-poc
   mvn org.springframework.boot:spring-boot-maven-plugin:run
   ```
3. Open `http://localhost:8135`.

## UI Flows

- Register healthy primary and canary instances for the same service
- Route requests with or without a session key to compare sticky versus round-robin behavior
- Put an instance into draining mode and verify that new routes avoid it
- Skip heartbeats long enough for a lease to expire and watch routing stop using the stale instance
- Record failures twice on an instance and observe temporary ejection from the routing pool

## JSON Endpoints

- `GET /api/snapshot` inspect all services, instances, routes, and event history
- `POST /api/instances/register` register a service instance
- `POST /api/instances/{instanceId}/heartbeat` renew an instance lease
- `POST /api/instances/{instanceId}/status` switch lifecycle to `UP`, `DRAINING`, or `DOWN`
- `POST /api/instances/{instanceId}/result` record request success or failure for temporary ejection logic
- `POST /api/route` simulate a routing decision

Example registration request:

```json
{
  "service": "checkout",
  "instanceId": "checkout-us-east-1a-v2",
  "zone": "us-east-1a",
  "version": "v2",
  "weight": 100,
  "canary": false,
  "metadata": {
    "rack": "r1",
    "owner": "edge"
  }
}
```

Example route request:

```json
{
  "service": "checkout",
  "clientZone": "us-east-1a",
  "sessionKey": "cart-42",
  "allowCanary": true
}
```

Example result request:

```json
{
  "success": false
}
```

## Configuration

- `server.port` defaults to `8135`
- heartbeat lease duration is fixed to `15000` ms in the service
- temporary ejection duration is fixed to `10000` ms in the service
- `spring.thymeleaf.cache=false` keeps the dashboard editable during development

## Notes and Limitations

- Storage is in memory and resets on restart.
- Health is modeled with heartbeats plus local failure events only.
- Routing is simulated inside one process rather than across network hops.
- The registry does not push updates to clients; consumers query the current snapshot.

## Technologies Used

- Spring Boot 3.2
- Thymeleaf
- Java 17
- In-memory routing and registry state
