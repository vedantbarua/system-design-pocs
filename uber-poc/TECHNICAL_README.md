# Technical README: Uber POC

This document explains the architecture, flow, and file-by-file purpose of the Uber-style ride-hailing proof-of-concept.

## Architecture Overview
- **Framework**: Spring Boot 3.2 with MVC and Thymeleaf for server-rendered UI.
- **Service**: `UberService` stores riders, drivers, and trips in memory and enforces matching rules.
- **Controller**: `UberController` serves the UI and exposes JSON APIs.
- **Views**: Thymeleaf `index.html` renders the dispatch console.

## File Structure
```
uber-poc/
├── pom.xml                                      # Maven configuration
├── src/main/java/com/randomproject/uber/
│   ├── UberPocApplication.java                  # Boots the Spring application
│   ├── UberController.java                      # MVC + JSON endpoints
│   ├── UberService.java                         # In-memory store, matching, pricing
│   ├── Rider.java                               # Rider domain model
│   ├── Driver.java                              # Driver domain model
│   ├── Trip.java                                # Trip domain model
│   ├── RideProduct.java                         # Products + fare estimation
│   ├── TripStatus.java                          # Trip status enum
│   ├── DriverStatus.java                        # Driver status enum
│   ├── RiderRequest.java                        # JSON create rider payload
│   ├── DriverRequest.java                       # JSON create driver payload
│   ├── TripRequest.java                         # JSON trip request payload
│   ├── TripAssignmentRequest.java               # JSON match payload
│   ├── TripStatusUpdateRequest.java             # JSON status update payload
│   ├── DriverStatusUpdateRequest.java           # JSON status update payload
│   ├── RiderResponse.java                       # JSON rider response
│   ├── DriverResponse.java                      # JSON driver response
│   ├── TripResponse.java                        # JSON trip response
│   └── UberMetricsResponse.java                 # JSON metrics response
└── src/main/resources/
    ├── application.properties                   # Port + Thymeleaf dev config
    └── templates/
        └── index.html                            # Dispatch console UI
```

## Flow
1. **Create**: Riders and drivers are created via the UI or `/api/riders` + `/api/drivers`.
2. **Request**: A trip is requested with pickup/dropoff, zone, product, and distance. A surge multiplier and fare estimate are computed.
3. **Match**: Operators match a driver to a trip; the driver moves to `ON_TRIP` and the trip becomes `MATCHED`.
4. **Update**: Trip status transitions to `EN_ROUTE`, `IN_PROGRESS`, or `COMPLETED` via UI or API.
5. **Complete**: Completion releases the driver and increments completed trip counts.

## Notable Implementation Details
- **In-memory state**: Riders, drivers, and trips live in memory for fast iteration.
- **Surge multiplier**: Computed using requested trips vs. available drivers in the same zone.
- **Matching rules**: Drivers must be available and not already assigned.
- **Validation**: IDs enforce a conservative pattern and rating ranges are checked.

## Configuration
- `server.port=8103` — avoid clashing with other POCs.
- `spring.thymeleaf.cache=false` — reload templates during development.

## Build/Run
- `mvn org.springframework.boot:spring-boot-maven-plugin:run`
