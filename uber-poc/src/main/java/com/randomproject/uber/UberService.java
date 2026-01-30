package com.randomproject.uber;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

@Service
public class UberService {
    private static final Pattern ID_PATTERN = Pattern.compile("^[A-Za-z0-9._:-]+$");
    private static final double DEFAULT_RIDER_RATING = 4.8;
    private static final double DEFAULT_DRIVER_RATING = 4.9;

    private final Map<String, Rider> riders = new ConcurrentHashMap<>();
    private final Map<String, Driver> drivers = new ConcurrentHashMap<>();
    private final Map<String, Trip> trips = new ConcurrentHashMap<>();

    public synchronized List<Rider> allRiders() {
        return new ArrayList<>(riders.values());
    }

    public synchronized List<Driver> allDrivers() {
        return new ArrayList<>(drivers.values());
    }

    public synchronized List<Trip> allTrips() {
        return new ArrayList<>(trips.values());
    }

    public synchronized Optional<Rider> getRider(String id) {
        if (!StringUtils.hasText(id)) {
            return Optional.empty();
        }
        return Optional.ofNullable(riders.get(id.trim()));
    }

    public synchronized Optional<Driver> getDriver(String id) {
        if (!StringUtils.hasText(id)) {
            return Optional.empty();
        }
        return Optional.ofNullable(drivers.get(id.trim()));
    }

    public synchronized Optional<Trip> getTrip(String id) {
        if (!StringUtils.hasText(id)) {
            return Optional.empty();
        }
        return Optional.ofNullable(trips.get(id.trim()));
    }

    public synchronized Rider createRider(String id, String name, Double rating, String homeZone) {
        String normalizedId = normalizeId(id, "Rider id");
        String normalizedName = normalizeText(name, "Rider name");
        String normalizedZone = normalizeText(homeZone, "Home zone");
        double normalizedRating = normalizeRating(rating, DEFAULT_RIDER_RATING, "Rider rating");
        Instant now = Instant.now();
        Rider existing = riders.get(normalizedId);
        Instant createdAt = existing == null ? now : existing.getCreatedAt();
        Rider rider = new Rider(normalizedId, normalizedName, normalizedRating, normalizedZone, createdAt, now);
        riders.put(normalizedId, rider);
        return rider;
    }

    public synchronized Driver addDriver(String id, String name, String vehicle, Double rating, String zone, DriverStatus status) {
        String normalizedId = normalizeId(id, "Driver id");
        String normalizedName = normalizeText(name, "Driver name");
        String normalizedVehicle = normalizeText(vehicle, "Vehicle");
        String normalizedZone = normalizeText(zone, "Driver zone");
        double normalizedRating = normalizeRating(rating, DEFAULT_DRIVER_RATING, "Driver rating");
        DriverStatus normalizedStatus = status == null ? DriverStatus.AVAILABLE : status;
        Instant now = Instant.now();
        Driver existing = drivers.get(normalizedId);
        Instant createdAt = existing == null ? now : existing.getCreatedAt();
        String activeTripId = existing == null ? null : existing.getActiveTripId();
        int completedTrips = existing == null ? 0 : existing.getCompletedTrips();
        if (normalizedStatus == DriverStatus.ON_TRIP && activeTripId == null) {
            throw new IllegalArgumentException("Driver cannot be on trip without an active trip.");
        }
        if (normalizedStatus != DriverStatus.ON_TRIP && activeTripId != null) {
            throw new IllegalArgumentException("Driver has an active trip and must remain on trip.");
        }
        Driver driver = new Driver(
                normalizedId,
                normalizedName,
                normalizedVehicle,
                normalizedRating,
                normalizedStatus,
                normalizedZone,
                completedTrips,
                activeTripId,
                createdAt,
                now);
        drivers.put(normalizedId, driver);
        return driver;
    }

    public synchronized Trip requestTrip(String id,
                                         String riderId,
                                         String pickupAddress,
                                         String dropoffAddress,
                                         String zone,
                                         RideProduct product,
                                         Double distanceKm) {
        String normalizedTripId = normalizeId(id, "Trip id");
        String normalizedRiderId = normalizeId(riderId, "Rider id");
        requireRider(normalizedRiderId);
        String normalizedPickup = normalizeText(pickupAddress, "Pickup address");
        String normalizedDropoff = normalizeText(dropoffAddress, "Dropoff address");
        String normalizedZone = normalizeText(zone, "Zone");
        if (product == null) {
            throw new IllegalArgumentException("Ride product is required.");
        }
        double normalizedDistance = normalizeDistance(distanceKm);

        Trip existing = trips.get(normalizedTripId);
        if (existing != null && !existing.isActive()) {
            throw new IllegalArgumentException("Cannot update a closed trip.");
        }
        if (existing != null && !existing.getRiderId().equals(normalizedRiderId)) {
            throw new IllegalArgumentException("Trip belongs to another rider.");
        }

        Instant now = Instant.now();
        Instant requestedAt = existing == null ? now : existing.getRequestedAt();
        TripStatus status = existing == null ? TripStatus.REQUESTED : existing.getStatus();
        String driverId = existing == null ? null : existing.getDriverId();
        double surgeMultiplier = computeSurgeMultiplier(normalizedZone);
        double estimatedFare = product.estimateFare(normalizedDistance, surgeMultiplier);

        Trip trip = new Trip(
                normalizedTripId,
                normalizedRiderId,
                driverId,
                normalizedPickup,
                normalizedDropoff,
                normalizedZone,
                product,
                status,
                normalizedDistance,
                surgeMultiplier,
                estimatedFare,
                requestedAt,
                now);
        trips.put(normalizedTripId, trip);
        return trip;
    }

    public synchronized Trip assignDriver(String tripId, String driverId) {
        String normalizedTripId = normalizeId(tripId, "Trip id");
        String normalizedDriverId = normalizeId(driverId, "Driver id");
        Trip trip = requireTrip(normalizedTripId);
        Driver driver = requireDriver(normalizedDriverId);
        if (!trip.isActive()) {
            throw new IllegalArgumentException("Trip is already closed.");
        }
        if (trip.getDriverId() != null && !trip.getDriverId().equals(driver.getId())) {
            throw new IllegalArgumentException("Trip is already assigned to another driver.");
        }
        boolean sameAssignment = driver.getActiveTripId() != null && driver.getActiveTripId().equals(trip.getId());
        if (!sameAssignment && driver.getStatus() != DriverStatus.AVAILABLE) {
            throw new IllegalArgumentException("Driver is not available.");
        }
        if (!sameAssignment && driver.getActiveTripId() != null) {
            throw new IllegalArgumentException("Driver already has an active trip.");
        }
        Instant now = Instant.now();
        Trip updatedTrip = new Trip(
                trip.getId(),
                trip.getRiderId(),
                driver.getId(),
                trip.getPickupAddress(),
                trip.getDropoffAddress(),
                trip.getZone(),
                trip.getProduct(),
                TripStatus.MATCHED,
                trip.getDistanceKm(),
                trip.getSurgeMultiplier(),
                trip.getEstimatedFare(),
                trip.getRequestedAt(),
                now);
        trips.put(trip.getId(), updatedTrip);
        Driver updatedDriver = new Driver(
                driver.getId(),
                driver.getName(),
                driver.getVehicle(),
                driver.getRating(),
                DriverStatus.ON_TRIP,
                driver.getCurrentZone(),
                driver.getCompletedTrips(),
                trip.getId(),
                driver.getCreatedAt(),
                now);
        drivers.put(driver.getId(), updatedDriver);
        return updatedTrip;
    }

    public synchronized Trip updateTripStatus(String tripId, TripStatus status) {
        String normalizedTripId = normalizeId(tripId, "Trip id");
        if (status == null) {
            throw new IllegalArgumentException("Trip status is required.");
        }
        Trip trip = requireTrip(normalizedTripId);
        if (!trip.isActive()) {
            throw new IllegalArgumentException("Trip is already closed.");
        }
        if (requiresDriver(status) && trip.getDriverId() == null) {
            throw new IllegalArgumentException("Trip needs an assigned driver for this status.");
        }
        Instant now = Instant.now();
        Trip updatedTrip = new Trip(
                trip.getId(),
                trip.getRiderId(),
                trip.getDriverId(),
                trip.getPickupAddress(),
                trip.getDropoffAddress(),
                trip.getZone(),
                trip.getProduct(),
                status,
                trip.getDistanceKm(),
                trip.getSurgeMultiplier(),
                trip.getEstimatedFare(),
                trip.getRequestedAt(),
                now);
        trips.put(trip.getId(), updatedTrip);
        if (status == TripStatus.COMPLETED || status == TripStatus.CANCELED) {
            releaseDriver(trip.getDriverId(), trip.getId(), status == TripStatus.COMPLETED, now);
        }
        return updatedTrip;
    }

    public synchronized Driver updateDriverStatus(String driverId, DriverStatus status) {
        String normalizedDriverId = normalizeId(driverId, "Driver id");
        if (status == null) {
            throw new IllegalArgumentException("Driver status is required.");
        }
        Driver driver = requireDriver(normalizedDriverId);
        if (status == DriverStatus.ON_TRIP && driver.getActiveTripId() == null) {
            throw new IllegalArgumentException("Driver cannot be on trip without an active trip.");
        }
        if (status != DriverStatus.ON_TRIP && driver.getActiveTripId() != null) {
            throw new IllegalArgumentException("Driver has an active trip and must remain on trip.");
        }
        Instant now = Instant.now();
        Driver updatedDriver = new Driver(
                driver.getId(),
                driver.getName(),
                driver.getVehicle(),
                driver.getRating(),
                status,
                driver.getCurrentZone(),
                driver.getCompletedTrips(),
                driver.getActiveTripId(),
                driver.getCreatedAt(),
                now);
        drivers.put(driver.getId(), updatedDriver);
        return updatedDriver;
    }

    public synchronized UberMetricsResponse metrics() {
        int totalRiders = riders.size();
        int totalDrivers = drivers.size();
        int availableDrivers = (int) drivers.values().stream().filter(driver -> driver.getStatus() == DriverStatus.AVAILABLE).count();
        int onTripDrivers = (int) drivers.values().stream().filter(driver -> driver.getStatus() == DriverStatus.ON_TRIP).count();
        int totalTrips = trips.size();
        int activeTrips = (int) trips.values().stream().filter(Trip::isActive).count();
        int requestedTrips = (int) trips.values().stream().filter(trip -> trip.getStatus() == TripStatus.REQUESTED).count();
        return new UberMetricsResponse(totalRiders, totalDrivers, availableDrivers, onTripDrivers, totalTrips, activeTrips, requestedTrips);
    }

    private double computeSurgeMultiplier(String zone) {
        long available = drivers.values().stream()
                .filter(driver -> driver.getStatus() == DriverStatus.AVAILABLE)
                .filter(driver -> sameZone(driver.getCurrentZone(), zone))
                .count();
        long requested = trips.values().stream()
                .filter(trip -> trip.getStatus() == TripStatus.REQUESTED)
                .filter(trip -> sameZone(trip.getZone(), zone))
                .count();
        if (available == 0) {
            return 2.5;
        }
        double load = (double) requested / Math.max(1, available);
        double surge = 1.0 + Math.min(1.5, load * 0.3);
        return Math.round(surge * 100.0) / 100.0;
    }

    private boolean sameZone(String left, String right) {
        return left != null && right != null && left.equalsIgnoreCase(right);
    }

    private boolean requiresDriver(TripStatus status) {
        return status == TripStatus.MATCHED
                || status == TripStatus.EN_ROUTE
                || status == TripStatus.IN_PROGRESS
                || status == TripStatus.COMPLETED;
    }

    private void releaseDriver(String driverId, String tripId, boolean completed, Instant now) {
        if (driverId == null) {
            return;
        }
        Driver driver = drivers.get(driverId);
        if (driver == null) {
            return;
        }
        if (driver.getActiveTripId() != null && !driver.getActiveTripId().equals(tripId)) {
            return;
        }
        int completedTrips = driver.getCompletedTrips() + (completed ? 1 : 0);
        Driver updatedDriver = new Driver(
                driver.getId(),
                driver.getName(),
                driver.getVehicle(),
                driver.getRating(),
                DriverStatus.AVAILABLE,
                driver.getCurrentZone(),
                completedTrips,
                null,
                driver.getCreatedAt(),
                now);
        drivers.put(driver.getId(), updatedDriver);
    }

    private Rider requireRider(String riderId) {
        Rider rider = riders.get(riderId);
        if (rider == null) {
            throw new IllegalArgumentException("Unknown rider id: " + riderId);
        }
        return rider;
    }

    private Driver requireDriver(String driverId) {
        Driver driver = drivers.get(driverId);
        if (driver == null) {
            throw new IllegalArgumentException("Unknown driver id: " + driverId);
        }
        return driver;
    }

    private Trip requireTrip(String tripId) {
        Trip trip = trips.get(tripId);
        if (trip == null) {
            throw new IllegalArgumentException("Unknown trip id: " + tripId);
        }
        return trip;
    }

    private String normalizeId(String value, String label) {
        String normalized = normalizeText(value, label);
        if (!ID_PATTERN.matcher(normalized).matches()) {
            throw new IllegalArgumentException(label + " must use letters, numbers, ., -, _, : only.");
        }
        return normalized;
    }

    private String normalizeText(String value, String label) {
        if (!StringUtils.hasText(value)) {
            throw new IllegalArgumentException(label + " is required.");
        }
        return value.trim();
    }

    private double normalizeRating(Double value, double defaultValue, String label) {
        double rating = value == null ? defaultValue : value;
        if (rating < 1.0 || rating > 5.0) {
            throw new IllegalArgumentException(label + " must be between 1.0 and 5.0.");
        }
        return Math.round(rating * 10.0) / 10.0;
    }

    private double normalizeDistance(Double value) {
        if (value == null || value <= 0.0) {
            throw new IllegalArgumentException("Distance must be greater than 0.");
        }
        return Math.round(value * 10.0) / 10.0;
    }
}
