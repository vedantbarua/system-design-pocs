# API Gateway With Dynamic Routing POC

Node-based API gateway proof-of-concept that sits in front of multiple backend services, performs dynamic proxy routing, exposes an aggregation endpoint, and demonstrates a lightweight circuit breaker. A React dashboard makes the health and failure behavior easier to understand than raw logs alone.

## Why This POC Matters

Gateways are one of the first real platform layers teams build once services start multiplying. The valuable part is not just request forwarding. It is dynamic route ownership, combined responses, and preventing one unhealthy service from dragging down the rest of the system.

## What It Shows

- Dynamic routing with a live route registry
- Proxying requests to downstream services
- Aggregating user and order responses into a single API
- Circuit-breaker behavior for unhealthy dependencies
- A frontend dashboard for health visibility and chaos toggles

## Architecture At A Glance

- `backend/server.js` runs the gateway
- `backend/services/user-service.js` is a sample user service
- `backend/services/order-service.js` is a sample order service
- `frontend/` is a React + Vite dashboard

## Ports

- Gateway: `9100`
- User service: `9101`
- Order service: `9102`
- Frontend dashboard: `5179`

## Run It Locally

### Backend

```bash
cd api-gateway-dynamic-routing-poc/backend
npm install
npm run start:all
```

### Frontend

```bash
cd api-gateway-dynamic-routing-poc/frontend
npm install
npm run dev
```

Open `http://localhost:5179`.

## Demo Flow

1. Load the dashboard and confirm all services are healthy.
2. Call the aggregate endpoint through the gateway.
3. Query individual user and order routes through the same gateway host.
4. Simulate a service outage and watch the breaker behavior change.
5. Reset the circuit and confirm traffic recovers.

## Example Requests

Aggregate request:

```bash
curl http://localhost:9100/api/aggregate/u-1001
```

Proxy routing:

```bash
curl http://localhost:9100/api/users/u-1001
curl http://localhost:9100/api/orders?userId=u-1001
```

Force the user service down:

```bash
curl -X POST http://localhost:9100/api/users/admin/chaos \
  -H "Content-Type: application/json" \
  -d '{"down": true}'
```

Reset the breaker:

```bash
curl -X POST http://localhost:9100/api/circuit/users/reset
```

## Design Notes

- The gateway acts as the single external entry point.
- Aggregation is useful for client efficiency, but it also couples the gateway to downstream response shapes.
- Circuit breakers help stop repeated calls to a dependency that is already failing.

## Limitations

- In-memory route and breaker state
- No service discovery integration
- No auth, rate limiting, or request tracing
- Simplified downstream services for demonstration only
