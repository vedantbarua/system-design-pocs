# Technical README: Online Shopping POC

## Overview
This POC models a simplified Amazon-style flow: browse a product catalog, build a cart, and complete a checkout. The backend is a Spring Boot API with in-memory product, cart, and order state. The frontend is a React + Vite storefront with filters, cart management, and a checkout summary.

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

Spring Boot
  -> OnlineShoppingController
  -> OnlineShoppingService (in-memory catalog/cart/orders)
```

### Backend
- Spring Boot 3.2 (Java 17)
- REST + validation (Jakarta)
- In-memory maps for catalog and cart
- Shipping + tax pricing engine

### Frontend
- React 18 + Vite
- Storefront layout with product grid
- Cart panel with live totals and checkout

## Runtime Flow
1. User loads catalog and filters/searches products.
2. React sends cart updates to `/api/cart/items`.
3. Service computes pricing with shipping + tax rules.
4. Checkout builds an order, decrements stock, and clears the cart.

## Backend Details

### Endpoints
- `GET /api/products` → list catalog, supports `query` + `category`
- `GET /api/products/{id}` → product detail
- `GET /api/recommendations` → top-rated items
- `GET /api/cart` → current cart + pricing
- `POST /api/cart/items` → add to cart
- `PATCH /api/cart/items/{productId}` → update quantity (0 removes)
- `DELETE /api/cart/items/{productId}` → remove item
- `POST /api/orders/checkout` → create order
- `GET /api/orders` → list orders

### Core Classes
- `OnlineShoppingService` — catalog, cart, pricing, checkout logic
- `OnlineShoppingController` — REST endpoints
- `Product`, `CartItem`, `CartLineItem` — data models
- `Order`, `PricingSummary` — checkout output

## Data Models

### Product
- `id: long`
- `name: String`
- `category: String`
- `description: String`
- `price: double`
- `rating: double`
- `reviewCount: int`
- `stock: int`
- `primeEligible: boolean`
- `imageUrl: String`

### CartLineItem
- `productId: long`
- `name: String`
- `imageUrl: String`
- `price: double`
- `quantity: int`
- `lineTotal: double`

### PricingSummary
- `subtotal: double`
- `shipping: double`
- `tax: double`
- `total: double`

### Order
- `id: long`
- `items: List<CartLineItem>`
- `pricing: PricingSummary`
- `status: String`
- `shippingSpeed: String`
- `createdAt: Instant`
- `estimatedDelivery: Instant`

## Local Development

### Backend
```
cd /Users/vedantbarua/Desktop/Projects/system-design-pocs/online-shopping-poc
mvn spring-boot:run
```

### Frontend
```
cd /Users/vedantbarua/Desktop/Projects/system-design-pocs/online-shopping-poc/frontend
npm install
npm run dev
```

## Notes
- Data is in-memory only and resets on restart.
- Shipping defaults to `STANDARD`; `EXPRESS` adds a higher fee.
- Stock is decremented on checkout.
