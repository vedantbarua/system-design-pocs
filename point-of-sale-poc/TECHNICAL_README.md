# Technical README: Point of Sale POC

This document explains the architecture, flow, and file-by-file purpose of the POS proof-of-concept.

## Architecture Overview
- **Framework**: Spring Boot 3.2 with MVC and Thymeleaf for server-rendered UI.
- **Catalog**: In-memory map keyed by item id with price and metadata.
- **Cart**: In-memory map of item ids to quantities.
- **Sales**: Snapshot of cart lines at checkout with totals and change due.
- **Service**: `PosService` validates inputs and calculates totals/tax.
- **Controller**: `PosController` renders the UI and exposes JSON endpoints.

## File Structure
```
point-of-sale-poc/
├── pom.xml                                      # Maven configuration (Spring Boot, Thymeleaf, validation)
├── src/main/java/com/randomproject/pointofsale/
│   ├── PointOfSalePocApplication.java           # Boots the Spring application
│   ├── PosController.java                       # MVC + REST endpoints
│   ├── PosService.java                          # In-memory catalog/cart/sales + validation
│   ├── CatalogItem.java                         # Catalog item state
│   ├── CartLine.java                            # Cart line item snapshot
│   ├── CartSummary.java                         # Cart totals
│   ├── SaleLine.java                            # Sale line snapshot
│   ├── Sale.java                                # Completed sale
│   ├── CatalogItemRequest.java                  # Validation-backed create/update payload
│   ├── CartItemRequest.java                     # Validation-backed cart payload
│   ├── CheckoutRequest.java                     # Validation-backed checkout payload
│   ├── CatalogItemResponse.java                 # API response payload
│   ├── CartSummaryResponse.java                 # API response payload
│   └── SaleResponse.java                        # API response payload
└── src/main/resources/
    ├── application.properties                   # Port + Thymeleaf dev config
    └── templates/
        └── index.html                           # POS UI
```

## Flow
1. **Catalog**: POST `/catalog` creates or updates an item.
2. **Cart**: POST `/cart/add` adds items; POST `/cart/update` adjusts quantities.
3. **Checkout**: POST `/checkout` validates tendered amount, creates a sale, and clears the cart.
4. **API**: JSON endpoints mirror UI actions for catalog, cart, and sales.

## Notable Implementation Details
- **Validation**: Item ids use a strict pattern to keep URLs stable.
- **Tax**: Fixed rate of 8.25% (`TAX_RATE`) applied to subtotal.
- **Snapshot**: Sales capture item price + quantity at checkout time.
- **Totals**: Monetary values use `BigDecimal` with 2 decimal rounding.

## Configuration
- `server.port=8104` — avoid clashing with other POCs.
- `spring.thymeleaf.cache=false` — reload templates during development.

## Build/Run
- `mvn org.springframework.boot:spring-boot-maven-plugin:run`
