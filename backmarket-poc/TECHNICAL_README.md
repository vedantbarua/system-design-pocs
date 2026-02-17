# Technical README: Backmarket POC

## Overview
This POC models a Backmarket-style refurbished marketplace: browse certified devices, compare condition grades and warranties, add items to cart, and simulate checkout. It also includes a trade-in quote flow to estimate device buyback values. The backend is a Spring Boot API with in-memory state and the frontend is a React + Vite storefront.

## Architecture

```
React (Vite)
  -> GET  /api/products
  -> GET  /api/recommendations
  -> GET  /api/cart
  -> POST /api/cart/items
  -> PATCH /api/cart/items/{productId}
  -> DELETE /api/cart/items/{productId}
  -> POST /api/orders/checkout
  -> GET  /api/orders
  -> POST /api/trade-in/quote

Spring Boot
  -> BackmarketController
  -> BackmarketService (in-memory catalog/cart/orders + trade-in quote)
```

### Backend
- Spring Boot 3.2 (Java 17)
- REST + validation (Jakarta)
- In-memory maps for devices and cart
- Shipping + tax pricing engine
- Trade-in quote simulator with condition/storage multipliers

### Frontend
- React 18 + Vite
- Marketplace layout with catalog, cart, and order history
- Trade-in quote form and response summary

## Runtime Flow
1. User loads refurbished catalog and filters by category or query.
2. Cart updates send POST/PATCH requests to `/api/cart/items`.
3. Service computes pricing with shipping + tax rules.
4. Checkout decrements stock, creates an order, and clears the cart.
5. Trade-in form posts to `/api/trade-in/quote` for a simulated offer.

## Backend Details

### Endpoints
- `GET /api/products` → list catalog, supports `query` + `category`
- `GET /api/products/{id}` → product detail
- `GET /api/recommendations` → top rated inventory
- `GET /api/cart` → cart + pricing summary
- `POST /api/cart/items` → add to cart
- `PATCH /api/cart/items/{productId}` → update quantity (0 removes)
- `DELETE /api/cart/items/{productId}` → remove item
- `POST /api/orders/checkout` → create order
- `GET /api/orders` → list orders
- `POST /api/trade-in/quote` → estimate trade-in offer

### Core Classes
- `BackmarketService` — catalog, cart, pricing, trade-in logic
- `BackmarketController` — REST endpoints
- `Product`, `CartItem`, `CartLineItem` — device and cart models
- `Order`, `PricingSummary` — checkout output
- `TradeInQuoteRequest`, `TradeInQuoteResponse` — trade-in flow

## Data Models

### Product
- `id: long`
- `name: String`
- `category: String`
- `description: String`
- `price: double`
- `originalPrice: double`
- `conditionGrade: String`
- `warrantyMonths: int`
- `sellerName: String`
- `ecoSavingsKg: double`
- `rating: double`
- `reviewCount: int`
- `stock: int`
- `imageUrl: String`

### TradeInQuoteResponse
- `quoteId: String`
- `offerAmount: double`
- `estimatedPayout: double`
- `condition: String`
- `inspectionNotes: String`
- `expiresAt: Instant`

## Local Development

### Backend
```
cd /Users/vedantbarua/Desktop/Projects/system-design-pocs/backmarket-poc
mvn spring-boot:run
```

### Frontend
```
cd /Users/vedantbarua/Desktop/Projects/system-design-pocs/backmarket-poc/frontend
npm install
npm run dev
```

## Notes
- Data is in-memory only and resets on restart.
- Shipping defaults to `STANDARD`; `EXPRESS` adds a higher fee.
- Trade-in quote offers expire after 3 days.
