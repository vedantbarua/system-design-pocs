package com.randomproject.flighttracking;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.stream.Collectors;

@Service
public class FlightTrackingService {
    private static final double EARTH_RADIUS_MILES = 3958.8;

    private final Map<String, Airport> airports = new LinkedHashMap<>();
    private final List<Flight> flights = new CopyOnWriteArrayList<>();

    public FlightTrackingService() {
        seedAirports();
        seedFlights();
    }

    public List<Airport> listAirports() {
        return new ArrayList<>(airports.values());
    }

    public List<Flight> listFlights(String query, String status, String origin, String destination) {
        return flights.stream()
                .filter(flight -> matchesQuery(flight, query))
                .filter(flight -> matchesStatus(flight, status))
                .filter(flight -> matchesAirport(flight.origin(), origin))
                .filter(flight -> matchesAirport(flight.destination(), destination))
                .sorted(Comparator.comparing(Flight::scheduledDeparture))
                .collect(Collectors.toList());
    }

    public Flight getFlight(long id) {
        return flights.stream()
                .filter(flight -> flight.id() == id)
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Flight not found"));
    }

    public FlightTrackResponse trackFlight(long id) {
        Flight flight = getFlight(id);
        Airport origin = airportFor(flight.origin());
        Airport destination = airportFor(flight.destination());

        Instant now = Instant.now();
        Instant departure = flight.estimatedDeparture();
        Instant arrival = flight.estimatedArrival();

        double progress = computeProgress(flight.status(), departure, arrival, now);
        Position current = buildPosition(origin, destination, progress, now, flight.status());
        List<Position> path = buildPath(origin, destination, flight.id(), progress, now, flight.status());
        double distanceTotal = distanceMiles(origin, destination);
        double distanceRemaining = Math.max(0.0, distanceTotal * (1.0 - progress));

        return new FlightTrackResponse(
                flight.id(),
                flight.flightNumber(),
                flight.status(),
                progress,
                now,
                current,
                path,
                round(distanceTotal),
                round(distanceRemaining),
                flight.estimatedArrival()
        );
    }

    private Airport airportFor(String code) {
        Airport airport = airports.get(code);
        if (airport == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Airport not found");
        }
        return airport;
    }

    private boolean matchesQuery(Flight flight, String query) {
        if (query == null || query.isBlank()) {
            return true;
        }
        String needle = query.trim().toLowerCase(Locale.ROOT);
        Airport origin = airports.get(flight.origin());
        Airport destination = airports.get(flight.destination());
        return containsIgnoreCase(flight.flightNumber(), needle)
                || containsIgnoreCase(flight.airline(), needle)
                || containsIgnoreCase(flight.origin(), needle)
                || containsIgnoreCase(flight.destination(), needle)
                || containsIgnoreCase(origin == null ? null : origin.city(), needle)
                || containsIgnoreCase(destination == null ? null : destination.city(), needle);
    }

    private boolean matchesStatus(Flight flight, String status) {
        if (status == null || status.isBlank()) {
            return true;
        }
        return flight.status().equalsIgnoreCase(status.trim());
    }

    private boolean matchesAirport(String airportCode, String filter) {
        if (filter == null || filter.isBlank()) {
            return true;
        }
        return airportCode.equalsIgnoreCase(filter.trim());
    }

    private boolean containsIgnoreCase(String value, String needle) {
        if (value == null) {
            return false;
        }
        return value.toLowerCase(Locale.ROOT).contains(needle);
    }

    private double computeProgress(String status, Instant departure, Instant arrival, Instant now) {
        if (status != null && status.equalsIgnoreCase("CANCELLED")) {
            return 0.0;
        }
        if (status != null && status.equalsIgnoreCase("ARRIVED")) {
            return 1.0;
        }
        if (departure == null || arrival == null) {
            return 0.0;
        }
        if (now.isBefore(departure)) {
            return 0.0;
        }
        if (now.isAfter(arrival)) {
            return 1.0;
        }
        long totalMillis = Math.max(1, Duration.between(departure, arrival).toMillis());
        long elapsedMillis = Math.max(0, Duration.between(departure, now).toMillis());
        return clamp(elapsedMillis / (double) totalMillis, 0.0, 1.0);
    }

    private Position buildPosition(Airport origin, Airport destination, double progress, Instant now, String status) {
        if (progress <= 0.0 || isGrounded(status)) {
            return new Position(origin.latitude(), origin.longitude(), 0, 0, 0, now);
        }
        if (progress >= 1.0) {
            return new Position(destination.latitude(), destination.longitude(), 0, 0, 0, now);
        }
        double latitude = interpolate(origin.latitude(), destination.latitude(), progress);
        double longitude = interpolate(origin.longitude(), destination.longitude(), progress);
        int altitude = altitudeFor(progress);
        int speed = speedFor(progress);
        int heading = bearing(origin.latitude(), origin.longitude(), destination.latitude(), destination.longitude());
        return new Position(latitude, longitude, altitude, speed, heading, now);
    }

    private List<Position> buildPath(Airport origin, Airport destination, long flightId, double progress, Instant now,
                                    String status) {
        List<Position> points = new ArrayList<>();
        int samples = 18;
        for (int i = 0; i < samples; i++) {
            double t = i / (double) (samples - 1);
            double latitude = interpolate(origin.latitude(), destination.latitude(), t);
            double longitude = interpolate(origin.longitude(), destination.longitude(), t);
            double latJitter = Math.sin(flightId * 0.17 + i * 0.63) * 0.22;
            double lonJitter = Math.cos(flightId * 0.21 + i * 0.51) * 0.28;
            latitude += latJitter;
            longitude += lonJitter;
            int altitude = altitudeFor(t);
            int speed = speedFor(t);
            int heading = bearing(origin.latitude(), origin.longitude(), destination.latitude(), destination.longitude());
            Instant timestamp = now.minusSeconds((long) ((samples - 1 - i) * 180L));
            points.add(new Position(latitude, longitude, altitude, speed, heading, timestamp));
        }
        if (progress <= 0.0 || isGrounded(status)) {
            Position ground = new Position(origin.latitude(), origin.longitude(), 0, 0, 0, now);
            points.set(0, ground);
        }
        if (progress >= 1.0) {
            Position arrived = new Position(destination.latitude(), destination.longitude(), 0, 0, 0, now);
            points.set(points.size() - 1, arrived);
        }
        return points;
    }

    private boolean isGrounded(String status) {
        if (status == null) {
            return false;
        }
        String normalized = status.toUpperCase(Locale.ROOT);
        return Objects.equals(normalized, "BOARDING")
                || Objects.equals(normalized, "DELAYED")
                || Objects.equals(normalized, "CANCELLED");
    }

    private int altitudeFor(double progress) {
        if (progress <= 0.0) {
            return 0;
        }
        if (progress < 0.12) {
            return (int) Math.round(progress / 0.12 * 32000);
        }
        if (progress > 0.88) {
            return (int) Math.round((1.0 - progress) / 0.12 * 32000);
        }
        return 34000 + (int) Math.round(Math.sin(progress * Math.PI) * 1500);
    }

    private int speedFor(double progress) {
        if (progress <= 0.0 || progress >= 1.0) {
            return 0;
        }
        if (progress < 0.1) {
            return 230;
        }
        if (progress > 0.9) {
            return 250;
        }
        return 485;
    }

    private double interpolate(double start, double end, double t) {
        return start + (end - start) * t;
    }

    private int bearing(double lat1, double lon1, double lat2, double lon2) {
        double phi1 = Math.toRadians(lat1);
        double phi2 = Math.toRadians(lat2);
        double deltaLon = Math.toRadians(lon2 - lon1);
        double y = Math.sin(deltaLon) * Math.cos(phi2);
        double x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLon);
        double theta = Math.atan2(y, x);
        int bearing = (int) Math.round((Math.toDegrees(theta) + 360) % 360);
        return bearing;
    }

    private double distanceMiles(Airport origin, Airport destination) {
        double latDistance = Math.toRadians(destination.latitude() - origin.latitude());
        double lonDistance = Math.toRadians(destination.longitude() - origin.longitude());
        double a = Math.sin(latDistance / 2) * Math.sin(latDistance / 2)
                + Math.cos(Math.toRadians(origin.latitude())) * Math.cos(Math.toRadians(destination.latitude()))
                * Math.sin(lonDistance / 2) * Math.sin(lonDistance / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return EARTH_RADIUS_MILES * c;
    }

    private double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }

    private double round(double value) {
        return Math.round(value * 10.0) / 10.0;
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
