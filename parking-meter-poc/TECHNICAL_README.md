# Technical README: Parking Meter POC

This document explains how the parking meter proof-of-concept is structured, how the logic works, and what each file does.

## Architecture Overview

- **Framework**: Spring Boot 3.2 (MVC + Thymeleaf).
- **Domain**: `ParkingMeter` encapsulates the meter rules (coin-to-minutes, cap, expiration).
- **Service**: `ParkingMeterService` holds the in-memory meter instance and exposes synchronized operations.
- **Controller**: `ParkingMeterController` serves the Thymeleaf UI and a JSON endpoint.
- **View**: `meter.html` renders current state and form controls.

## File Structure

```
parking-meter-poc/
├── pom.xml                                  # Maven configuration (Spring Boot, Thymeleaf)
├── src/main/java/com/randomproject/parkingmeter/
│   ├── ParkingMeterPocApplication.java      # Bootstraps Spring Boot
│   ├── ParkingMeter.java                    # Domain logic: coin insertion, countdown, cap
│   ├── MeterState.java                      # Immutable snapshot of meter state
│   ├── ParkingMeterService.java             # Holds one meter instance, synchronized operations
│   └── ParkingMeterController.java          # MVC controller for UI + JSON
├── src/main/resources/
│   ├── application.properties               # Meter defaults + port
│   └── templates/meter.html                 # Thymeleaf view
└── README.md                                # High-level overview & usage
```

## Logic Walkthrough

- **Configuration**: `application.properties` sets `meter.max-minutes`, `meter.minutes-per-quarter`, and `server.port`. `ParkingMeterService` injects these values and instantiates a single `ParkingMeter`.
- **Domain Rules (`ParkingMeter`)**:
  - `insertQuarters(int)` multiplies quarters by minutesPerQuarter and caps the total at `maxMinutes`.
  - `advanceMinutes(int)` subtracts time, never below zero.
  - `snapshot()` returns a `MeterState` containing max, rate, remaining, and expired flag.
- **Service Layer**:
  - Methods are `synchronized` to keep the shared in-memory meter consistent across concurrent requests.
  - `insert`, `advance`, `tick`, and `state` delegate to the domain object and return `MeterState`.
- **Controller**:
  - `GET /` renders `meter.html` with the current `MeterState`.
  - `POST /insert`, `POST /advance`, `POST /tick` mutate the meter, then redirect back with a message.
  - `GET /api/meter` returns JSON for quick inspection or automation.
- **View (`meter.html`)**:
  - Shows remaining minutes, max cap, minutes per quarter, and status (Active/Expired).
  - Forms to insert quarters, fast-forward minutes, or tick one minute.

## Running and Ports

- Run with `mvn org.springframework.boot:spring-boot-maven-plugin:run`.
- Default port: `8081` (set in `application.properties`). Change via `server.port`.

## Extending the POC

- Add persistence (e.g., JPA) to store meters.
- Allow multiple meters keyed by location/ID.
- Add validation and better UX feedback.
- Introduce tests around `ParkingMeter` edge cases (overflow near cap, zero/negative inputs).
