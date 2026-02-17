# Backmarket POC

A refurbished marketplace proof-of-concept with a Java Spring Boot backend and a React + Vite frontend. The POC highlights certified device listings, condition grades, warranty coverage, and a trade-in quote flow.

## What’s inside
- Spring Boot REST API with in-memory devices, cart, and orders
- Refurbished catalog fields (condition grade, warranty, seller, eco savings)
- Trade-in quote simulator
- React storefront with filters, cart, and checkout

## How to Run

### Backend
1. Ensure Java 17+ and Maven are installed.
2. From this directory:
   ```bash
   mvn spring-boot:run
   ```
3. API runs at `http://localhost:8121`.

### Frontend
1. In another terminal:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
2. Open `http://localhost:5173`.

## API Endpoints

### List devices
```bash
curl "http://localhost:8121/api/products?query=phone&category=Phones"
```

### Add to cart
```bash
curl -X POST http://localhost:8121/api/cart/items \
  -H "Content-Type: application/json" \
  -d '{"productId":2001,"quantity":1}'
```

### Update cart quantity
```bash
curl -X PATCH http://localhost:8121/api/cart/items/2001 \
  -H "Content-Type: application/json" \
  -d '{"quantity":2}'
```

### Trade-in quote
```bash
curl -X POST http://localhost:8121/api/trade-in/quote \
  -H "Content-Type: application/json" \
  -d '{"deviceType":"Phone","brand":"Nova","model":"NovaPhone 12","condition":"B","storageGb":256}'
```

### Checkout
```bash
curl -X POST http://localhost:8121/api/orders/checkout \
  -H "Content-Type: application/json" \
  -d '{"shippingSpeed":"EXPRESS"}'
```

## Notes
- All data is in-memory and resets on restart.
- Shipping defaults to `STANDARD` and becomes free above $50.
- CORS allows `http://localhost:5173` for local development.
