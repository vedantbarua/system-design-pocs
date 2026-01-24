# Technical README: Online Auction POC

This document explains the structure and logic of the online auction proof-of-concept.

## Architecture Overview

- **Framework**: Spring Boot 3.2 (MVC + Thymeleaf).
- **Domain**: `Auction` holds auction metadata and bids; `Bid` captures bidder, amount, and timestamp.
- **Service**: `AuctionService` maintains the in-memory auction map, validates inputs, and enforces bidding rules.
- **Controller**: `OnlineAuctionController` serves the UI and JSON API endpoints.
- **Views**: `index.html` (dashboard) and `auction.html` (detail + bid panel).

## File Structure

```
online-auction-poc/
├── pom.xml
├── src/main/java/com/randomproject/onlineauction/
│   ├── OnlineAuctionPocApplication.java
│   ├── AuctionStatus.java
│   ├── Auction.java
│   ├── Bid.java
│   ├── AuctionSummary.java
│   ├── AuctionService.java
│   ├── OnlineAuctionController.java
│   ├── AuctionCreateRequest.java
│   ├── BidCreateRequest.java
│   ├── AuctionResponse.java
│   └── BidResponse.java
├── src/main/resources/
│   ├── application.properties
│   └── templates/
│       ├── index.html
│       └── auction.html
└── README.md
```

## Logic Walkthrough

- **Configuration**: `application.properties` sets the port, default auction duration, max duration, and minimum bid increment.
- **Auction lifecycle**:
  - Auctions are created with a start price, optional reserve, and end time.
  - Bids must be at least the current price (or starting price) plus the configured increment.
  - Auctions auto-close when the current time is past `endsAt`.
- **Service layer**:
  - Uses a concurrent map and `synchronized` methods for consistency.
  - `expireIfNeeded` converts open auctions to closed once the timer elapses.
  - `summary` aggregates total auctions, bid count, and volume.
- **Controller**:
  - Provides HTML routes for the dashboard and detail view.
  - Exposes JSON endpoints for create, read, bid, and close.

## Running and Ports

- Run with `mvn org.springframework.boot:spring-boot-maven-plugin:run`.
- Default port: `8098`.

## Extending the POC

- Add authentication and seller/bidder accounts.
- Persist auctions and bids via JPA or a document store.
- Add automatic bid sniping extension rules.
- Add WebSocket updates for live bidding.
- Introduce a payment/settlement flow after close.
