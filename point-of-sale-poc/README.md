# Point of Sale POC

Spring Boot proof-of-concept for a point-of-sale workflow: manage a catalog, build a cart, and complete checkout with tax and change due.

## Features
- Catalog CRUD for items and prices
- Cart with quantities and totals
- Checkout with tax + change due
- Sales history feed
- In-memory store resets on restart

## Quick Start
1. Ensure Java 17+ and Maven are installed.
2. Run the app:
   ```bash
   cd point-of-sale-poc
   mvn org.springframework.boot:spring-boot-maven-plugin:run
   ```
3. Open `http://localhost:8104` for the UI.

## Endpoints
- `/` — POS UI
- `/catalog` `POST` — Create/update catalog item
- `/catalog/{id}/delete` `POST` — Delete item
- `/cart/add` `POST` — Add item to cart
- `/cart/update` `POST` — Update cart item quantity
- `/cart/{id}/remove` `POST` — Remove item from cart
- `/cart/clear` `POST` — Clear cart
- `/checkout` `POST` — Complete checkout
- `/api/catalog` `POST` — Create/update item (JSON)
- `/api/catalog` `GET` — List catalog
- `/api/catalog/{id}` `GET` — Get one item
- `/api/catalog/{id}` `DELETE` — Delete item
- `/api/cart` `GET` — Cart summary
- `/api/cart/items` `POST` — Add to cart (JSON)
- `/api/cart/items/{id}` `POST` — Update cart quantity (JSON)
- `/api/cart/items/{id}` `DELETE` — Remove from cart
- `/api/cart` `DELETE` — Clear cart
- `/api/checkout` `POST` — Checkout (JSON)
- `/api/sales` `GET` — List sales
- `/api/sales/{id}` `GET` — Fetch sale

## Notes
- Item ids must use letters, numbers, `.`, `_`, `-`, or `:`.
- Prices must be greater than zero.
- Cart quantities must be between 1 and 999.

## Technologies
- Spring Boot 3.2 (web + Thymeleaf + validation)
- Java 17
- In-memory maps and lists
