# API Gateway with Dynamic Routing POC

A small system design POC that builds an API gateway as the entry point for multiple microservices. It demonstrates dynamic routing, request aggregation, and a circuit breaker pattern while a React "Service Health" dashboard keeps everything observable.

## What This POC Shows
- Dynamic routing via `http-proxy-middleware` with a live route registry.
- Request aggregation that merges User + Order service data into one response.
- Circuit breaker pattern to stop repeated calls to failing services.
- A dashboard that visualizes service health and lets you inject failures.

## Architecture
- Gateway: `backend/server.js`
- User Service: `backend/services/user-service.js`
- Order Service: `backend/services/order-service.js`
- Dashboard: `frontend/`

Ports
- Gateway: `9100`
- User Service: `9101`
- Order Service: `9102`
- Dashboard: `5179`

## Run It
Backend (starts gateway + both services):
```bash
cd api-gateway-dynamic-routing-poc/backend
npm install
npm run start:all
```

Frontend:
```bash
cd api-gateway-dynamic-routing-poc/frontend
npm install
npm run dev
```

Open the dashboard at `http://localhost:5179`.

## Try It
Aggregate request:
```bash
curl http://localhost:9100/api/aggregate/u-1001
```

Proxy routing (through the gateway):
```bash
curl http://localhost:9100/api/users/u-1001
curl http://localhost:9100/api/orders?userId=u-1001
```

Trip a circuit breaker by forcing the User service down:
```bash
curl -X POST http://localhost:9100/api/users/admin/chaos \
  -H "Content-Type: application/json" \
  -d '{"down": true}'
```

Reset breaker:
```bash
curl -X POST http://localhost:9100/api/circuit/users/reset
```

## Everyday Use
Think of the gateway as a hub for hobby projects. It gives you one URL to route traffic, combine data across services, and avoid cascading failures when a single project is unhealthy.
