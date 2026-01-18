# Technical README: Local Delivery Service POC

This document explains the architecture, flow, and file-by-file purpose of the local delivery service proof-of-concept.

## Architecture Overview
- **Framework**: Spring Boot 3.2 with MVC and Thymeleaf for server-rendered UI.
- **Dispatch core**: In-memory orders and drivers with assignment and status transitions.
- **Service**: `DeliveryService` validates input, manages assignments, and updates metrics.
- **Controller**: `DeliveryController` renders the UI and exposes JSON endpoints.
- **Views**: `index.html` provides forms for orders, drivers, assignments, and status updates.

## File Structure
```
local-delivery-service-poc/
├── pom.xml                                      # Maven configuration (Spring Boot, Thymeleaf, validation)
├── src/main/java/com/randomproject/localdelivery/
│   ├── LocalDeliveryServicePocApplication.java  # Boots the Spring application
│   ├── DeliveryController.java                  # MVC + REST endpoints
│   ├── DeliveryService.java                     # In-memory orders + drivers + validation
│   ├── DeliveryOrder.java                       # Immutable order state
│   ├── DeliveryDriver.java                      # Immutable driver state
│   ├── DeliveryOrderRequest.java                # Validation-backed order payload
│   ├── DriverRequest.java                       # Validation-backed driver payload
│   ├── AssignmentRequest.java                   # Validation-backed assignment payload
│   ├── DeliveryStatusUpdateRequest.java         # Validation-backed order status update
│   ├── DriverStatusUpdateRequest.java           # Validation-backed driver status update
│   ├── DeliveryOrderResponse.java               # API response payload
│   ├── DriverResponse.java                      # API response payload
│   ├── DeliveryMetricsResponse.java             # API metrics payload
│   ├── DeliveryStatus.java                      # Order status enum
│   ├── DriverStatus.java                        # Driver status enum
│   ├── DeliveryPriority.java                    # Priority enum
│   └── PackageSize.java                         # Package size enum
└── src/main/resources/
    ├── application.properties                   # Port + Thymeleaf dev config
    └── templates/
        └── index.html                            # UI dashboard for dispatching
```

## Flow
1. **Home**: GET `/` renders the dashboard with orders, drivers, and metrics.
2. **Create order (UI/API)**: POST `/orders` or `/api/orders` stores a new order or updates an active one.
3. **Add driver (UI/API)**: POST `/drivers` or `/api/drivers` registers a driver.
4. **Assign driver (UI/API)**: POST `/assignments` or `/api/assignments` binds a driver to an order and sets ETA.
5. **Update status**: POST `/orders/{id}/status` updates the order; delivered/canceled orders release drivers.
6. **Metrics**: GET `/api/metrics` returns counts for the dashboard.

## Notable Implementation Details
- **Id validation**: Strict pattern for order/driver ids ensures stable URLs and map keys.
- **Driver availability**: Drivers with active orders remain `ON_DELIVERY` until completion.
- **Order lifecycle**: Closed orders (delivered/canceled) cannot be edited.
- **Metrics**: Computed on demand from the in-memory maps.

## Configuration
- `server.port=8093` — avoid clashing with other POCs.
- `spring.thymeleaf.cache=false` — reload templates during development.

## Build/Run
- `mvn org.springframework.boot:spring-boot-maven-plugin:run`
