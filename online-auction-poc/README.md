# Online Auction POC

Spring Boot proof-of-concept for an online auction system with listings, bids, reserve pricing, and close actions.

## Features

- Create auctions with optional reserve price and duration
- Bid placement with minimum increment enforcement
- Automatic close when auction reaches its end time
- UI for open/closed auctions and bid history
- JSON API for auctions and bids

## Quick Start

1. Ensure you have Java 17+ and Maven installed.
2. Navigate to the project directory: `cd online-auction-poc`
3. Run: `mvn org.springframework.boot:spring-boot-maven-plugin:run`
4. Open `http://localhost:8098` in your browser

## Endpoints

- `/` - Dashboard of open/closed auctions
- `/auction/{id}` - Auction detail + bid form
- `/auctions` (POST) - Create auction (form)
- `/auctions/{id}/bid` (POST) - Place bid (form)
- `/auctions/{id}/close` (POST) - Close auction
- `/api/auctions` (GET, POST)
- `/api/auctions/{id}` (GET)
- `/api/auctions/{id}/bids` (GET, POST)
- `/api/auctions/{id}/close` (POST)

## Config

- `server.port` (default `8098`)
- `auction.default-duration-minutes` (default `90`)
- `auction.max-duration-minutes` (default `4320`)
- `auction.min-bid-increment` (default `1.00`)

See TECHNICAL_README.md for implementation details and IMPROVEMENTS.md for next steps.
