# Online Shopping POC

A lightweight Amazon-style shopping experience with a Java Spring Boot backend and a React + Vite frontend. The POC includes catalog browsing, search, cart management, and a simulated checkout flow.

## What’s inside
- Spring Boot REST API with in-memory catalog, cart, and orders
- Pricing engine with tax + shipping logic
- React storefront with search, filters, cart, and checkout

## How to Run

### Backend
1. Ensure Java 17+ and Maven are installed.
2. From this directory:
   ```bash
   mvn spring-boot:run
   ```
3. API runs at `http://localhost:8120`.

### Frontend
1. In another terminal:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
2. Open `http://localhost:5173`.

## API Endpoints

### List products
```bash
curl "http://localhost:8120/api/products?query=headphones&category=Electronics"
```

### Add to cart
```bash
curl -X POST http://localhost:8120/api/cart/items \
  -H "Content-Type: application/json" \
  -d '{"productId":1001,"quantity":1}'
```

### Update cart quantity
```bash
curl -X PATCH http://localhost:8120/api/cart/items/1001 \
  -H "Content-Type: application/json" \
  -d '{"quantity":2}'
```

### Checkout
```bash
curl -X POST http://localhost:8120/api/orders/checkout \
  -H "Content-Type: application/json" \
  -d '{"shippingSpeed":"EXPRESS"}'
```

### Orders
```bash
curl http://localhost:8120/api/orders
```

## Notes
- All data is in-memory and resets on restart.
- Shipping defaults to `STANDARD` and becomes free above $50.
- CORS allows `http://localhost:5173` for local development.
