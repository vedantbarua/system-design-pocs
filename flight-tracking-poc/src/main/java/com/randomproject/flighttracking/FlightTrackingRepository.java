package com.randomproject.flighttracking;

import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.SpanKind;
import io.opentelemetry.api.trace.Tracer;
import io.opentelemetry.api.trace.StatusCode;
import org.springframework.stereotype.Repository;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Supplier;

@Repository
public class FlightTrackingRepository {
    private static final String DB_SYSTEM = "inmemory";

    private final Tracer tracer;
    private final Map<String, Airport> airports = new LinkedHashMap<>();
    private final List<Flight> flights = new CopyOnWriteArrayList<>();

    public FlightTrackingRepository(Tracer tracer) {
        this.tracer = tracer;
        seedAirports();
        seedFlights();
    }

    public List<Airport> listAirports() {
        return withDbSpan("db.airports.list", () -> new ArrayList<>(airports.values()));
    }

    public List<Flight> listFlights() {
        return withDbSpan("db.flights.list", () -> new ArrayList<>(flights));
    }

    public Flight findFlightById(long id) {
        return withDbSpan("db.flights.get", () -> flights.stream()
                .filter(flight -> flight.id() == id)
                .findFirst()
                .orElse(null));
    }

    public Airport findAirport(String code) {
        return withDbSpan("db.airports.get", () -> airports.get(code));
    }

    private <T> T withDbSpan(String name, Supplier<T> supplier) {
        Span span = tracer.spanBuilder(name)
                .setSpanKind(SpanKind.CLIENT)
                .startSpan();
        span.setAttribute("db.system", DB_SYSTEM);
        try {
            return supplier.get();
        } catch (RuntimeException ex) {
            span.recordException(ex);
            span.setStatus(StatusCode.ERROR);
            throw ex;
        } finally {
            span.end();
        }
    }

    private void seedAirports() {
        airports.put("SFO", new Airport("SFO", "San Francisco Intl", "San Francisco", "USA", 37.6213, -122.3790, "America/Los_Angeles"));
        airports.put("LAX", new Airport("LAX", "Los Angeles Intl", "Los Angeles", "USA", 33.9416, -118.4085, "America/Los_Angeles"));
        airports.put("SEA", new Airport("SEA", "Seattle-Tacoma Intl", "Seattle", "USA", 47.4502, -122.3088, "America/Los_Angeles"));
        airports.put("DEN", new Airport("DEN", "Denver Intl", "Denver", "USA", 39.8561, -104.6737, "America/Denver"));
        airports.put("JFK", new Airport("JFK", "John F. Kennedy Intl", "New York", "USA", 40.6413, -73.7781, "America/New_York"));
        airports.put("ORD", new Airport("ORD", "O'Hare Intl", "Chicago", "USA", 41.9742, -87.9073, "America/Chicago"));
        airports.put("ATL", new Airport("ATL", "Hartsfield-Jackson", "Atlanta", "USA", 33.6407, -84.4277, "America/New_York"));
        airports.put("DFW", new Airport("DFW", "Dallas/Fort Worth", "Dallas", "USA", 32.8998, -97.0403, "America/Chicago"));
    }

    private void seedFlights() {
        Instant now = Instant.now();
        flights.add(new Flight(
                201,
                "UA 241",
                "United Airlines",
                "SFO",
                "JFK",
                "Boeing 777-200",
                "EN_ROUTE",
                now.minus(Duration.ofHours(2)),
                now.plus(Duration.ofHours(4)),
                now.minus(Duration.ofHours(1).plusMinutes(30)),
                now.plus(Duration.ofHours(4).minusMinutes(10)),
                "G92",
                "3"
        ));
        flights.add(new Flight(
                202,
                "DL 487",
                "Delta Air Lines",
                "ATL",
                "LAX",
                "Airbus A330-900",
                "EN_ROUTE",
                now.minus(Duration.ofHours(4)),
                now.plus(Duration.ofMinutes(30)),
                now.minus(Duration.ofHours(3).plusMinutes(20)),
                now.plus(Duration.ofMinutes(25)),
                "E12",
                "I"
        ));
        flights.add(new Flight(
                203,
                "AA 128",
                "American Airlines",
                "JFK",
                "ORD",
                "Boeing 737 MAX",
                "EN_ROUTE",
                now.minus(Duration.ofMinutes(55)),
                now.plus(Duration.ofHours(1).plusMinutes(20)),
                now.minus(Duration.ofMinutes(35)),
                now.plus(Duration.ofHours(1).plusMinutes(5)),
                "B22",
                "8"
        ));
        flights.add(new Flight(
                204,
                "AS 912",
                "Alaska Airlines",
                "SEA",
                "SFO",
                "Boeing 737-900",
                "EN_ROUTE",
                now.minus(Duration.ofMinutes(50)),
                now.plus(Duration.ofHours(1).plusMinutes(5)),
                now.minus(Duration.ofMinutes(30)),
                now.plus(Duration.ofHours(1)),
                "C6",
                "N"
        ));
        flights.add(new Flight(
                205,
                "WN 582",
                "Southwest",
                "DFW",
                "DEN",
                "Boeing 737-800",
                "BOARDING",
                now.plus(Duration.ofMinutes(35)),
                now.plus(Duration.ofHours(2).plusMinutes(10)),
                now.plus(Duration.ofMinutes(40)),
                now.plus(Duration.ofHours(2).plusMinutes(15)),
                "A14",
                "1"
        ));
        flights.add(new Flight(
                206,
                "B6 204",
                "JetBlue",
                "LAX",
                "SFO",
                "Airbus A320",
                "ARRIVED",
                now.minus(Duration.ofHours(2)),
                now.minus(Duration.ofMinutes(10)),
                now.minus(Duration.ofHours(2).plusMinutes(5)),
                now.minus(Duration.ofMinutes(15)),
                "54",
                "5"
        ));
        flights.add(new Flight(
                207,
                "UA 511",
                "United Airlines",
                "DEN",
                "SEA",
                "Boeing 737-900",
                "DELAYED",
                now.minus(Duration.ofMinutes(15)),
                now.plus(Duration.ofHours(2).plusMinutes(30)),
                now.plus(Duration.ofHours(1)),
                now.plus(Duration.ofHours(3).plusMinutes(20)),
                "B31",
                "2"
        ));
        flights.add(new Flight(
                208,
                "AA 772",
                "American Airlines",
                "ORD",
                "DFW",
                "Airbus A321",
                "CANCELLED",
                now.minus(Duration.ofHours(1)),
                now.plus(Duration.ofHours(2)),
                now.minus(Duration.ofHours(1)),
                now.plus(Duration.ofHours(2)),
                "K7",
                "3"
        ));
    }
}
