# Technical README: Price Tracker POC

This document explains the architecture, flow, and file-by-file purpose of the price tracker proof-of-concept.

## Architecture Overview
- **Framework**: Spring Boot 3.2 with MVC and Thymeleaf for server-rendered UI.
- **Tracker**: In-memory items keyed by id, each with target and current price.
- **Service**: `PriceTrackerService` validates inputs, normalizes ids/URLs, and maintains item state.
- **Controller**: `PriceTrackerController` renders the UI and exposes JSON endpoints.
- **Views**: `index.html` provides forms to track items, update prices, and view alerts.

## File Structure
```
price-tracker-poc/
├── pom.xml                                      # Maven configuration (Spring Boot, Thymeleaf, validation)
├── src/main/java/com/randomproject/pricetracker/
│   ├── PriceTrackerPocApplication.java          # Boots the Spring application
│   ├── PriceTrackerController.java              # MVC + REST endpoints
│   ├── PriceTrackerService.java                 # In-memory items + validation
│   ├── PriceTrackerItem.java                    # Immutable tracked item state
│   ├── PriceTrackerResponse.java                # API response payload
│   ├── PriceTrackRequest.java                   # Validation-backed create/update payload
│   └── PriceUpdateRequest.java                  # Validation-backed price update payload
└── src/main/resources/
    ├── application.properties                   # Port + Thymeleaf dev config
    └── templates/
        └── index.html                            # UI for tracking and updating prices
```

## Flow
1. **Home**: GET `/` renders `index.html` with tracked items and current alerts.
2. **Track item (UI)**: POST `/items` validates inputs and upserts a tracked item.
3. **Update price (UI)**: POST `/items/{id}/price` updates current price and alert status.
4. **Track item (API)**: POST `/api/items` returns 201 with the tracked item payload.
5. **Alerts**: GET `/api/alerts` returns items with current price at or below target.

## Notable Implementation Details
- **Id validation**: Item ids use a strict pattern for stability in URLs and map keys.
- **Price checks**: Items are considered deals when `currentPrice <= targetPrice`.
- **Upserts**: Tracking an existing id updates name, URL, target, and current price.
- **Status codes**: API returns 201 for tracked items and 404 for unknown ids.

## Configuration
- `server.port=8090` — avoid clashing with other POCs.
- `spring.thymeleaf.cache=false` — reload templates during development.

## Build/Run
- `mvn org.springframework.boot:spring-boot-maven-plugin:run`
