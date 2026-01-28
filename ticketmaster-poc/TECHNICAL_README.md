# Technical README: Ticketmaster POC

This document explains the architecture, flow, and file-by-file purpose of the ticketing proof-of-concept.

## Architecture Overview
- **Framework**: Spring Boot 3.2 with MVC + Thymeleaf.
- **Service**: `TicketmasterService` stores venues, events, tiers, holds, and orders in memory.
- **Controller**: `TicketmasterController` renders the UI and exposes JSON endpoints.
- **Views**: `index.html` for listings + forms, `event.html` for event detail and purchase flows.

## File Structure
```
ticketmaster-poc/
├── pom.xml                                      # Maven configuration (Spring Boot, Thymeleaf, validation)
├── src/main/java/com/randomproject/ticketmaster/
│   ├── TicketmasterPocApplication.java          # Boots the Spring application
│   ├── TicketmasterController.java              # MVC + REST endpoints
│   ├── TicketmasterService.java                 # In-memory storage + validation + fee logic
│   ├── Event.java                               # Event domain model
│   ├── Venue.java                               # Venue domain model
│   ├── TicketTier.java                          # Ticket tier inventory model
│   ├── Hold.java                                # Hold (reservation) model
│   ├── Order.java                               # Order model
│   ├── EventCategory.java                       # Enum of categories
│   ├── EventStatus.java                         # Enum of event status
│   ├── HoldStatus.java                          # Enum of hold status
│   ├── OrderStatus.java                         # Enum of order status
│   ├── EventListing.java                        # Aggregated listing view model
│   ├── EventSummary.java                        # Summary metrics
│   ├── *CreateRequest.java                      # API request payloads
│   └── *Response.java                           # API response payloads
└── src/main/resources/
    ├── application.properties                   # Port + tuning knobs
    └── templates/
        ├── index.html                            # Event list + create forms
        └── event.html                            # Event detail + tiers + holds + orders
```

## Flow
1. **List events**: GET `/` renders `index.html` with event listings and summary metrics.
2. **Create venue**: POST `/venues` stores a new venue in memory.
3. **Create event**: POST `/events` stores a new event and ties it to a venue.
4. **Manage tiers**: POST `/events/{id}/tiers` adds a ticket tier with capacity and price.
5. **Create hold**: POST `/holds` reserves tickets and sets an expiry window.
6. **Create order**: POST `/orders` sells tickets directly or converts an active hold.

## Notable Implementation Details
- **Availability**: Each tier tracks capacity, sold, and held counts.
- **Hold expiry**: Expired holds release inventory automatically on access.
- **Fees**: Order total includes a percentage fee and a flat fee (configurable).
- **Status**: Event status is derived from start time + availability (sold out vs past).

## Configuration
- `server.port=8102`
- `ticketmaster.hold-duration-minutes=12`
- `ticketmaster.max-tickets-per-order=8`
- `ticketmaster.service-fee-percent=0.12`
- `ticketmaster.flat-fee=2.50`

## Build/Run
- `mvn org.springframework.boot:spring-boot-maven-plugin:run`
