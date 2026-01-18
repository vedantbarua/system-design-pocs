package com.randomproject.localdelivery;

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
public class DeliveryService {
    private static final Pattern ID_PATTERN = Pattern.compile("^[A-Za-z0-9._:-]+$");
    private final Map<String, DeliveryOrder> orders = new ConcurrentHashMap<>();
    private final Map<String, DeliveryDriver> drivers = new ConcurrentHashMap<>();

    public synchronized List<DeliveryOrder> allOrders() {
        return new ArrayList<>(orders.values());
    }

    public synchronized List<DeliveryDriver> allDrivers() {
        return new ArrayList<>(drivers.values());
    }

    public synchronized Optional<DeliveryOrder> getOrder(String id) {
        if (!StringUtils.hasText(id)) {
            return Optional.empty();
        }
        return Optional.ofNullable(orders.get(id.trim()));
    }

    public synchronized Optional<DeliveryDriver> getDriver(String id) {
        if (!StringUtils.hasText(id)) {
            return Optional.empty();
        }
        return Optional.ofNullable(drivers.get(id.trim()));
    }

    public synchronized DeliveryOrder createOrder(String id,
                                                  String customerName,
                                                  String pickupAddress,
                                                  String dropoffAddress,
                                                  String zone,
                                                  PackageSize size,
                                                  DeliveryPriority priority) {
        String normalizedId = normalizeId(id, "Order id");
        String normalizedCustomer = normalizeText(customerName, "Customer name");
        String normalizedPickup = normalizeText(pickupAddress, "Pickup address");
        String normalizedDropoff = normalizeText(dropoffAddress, "Dropoff address");
        String normalizedZone = normalizeText(zone, "Zone");
        if (size == null) {
            throw new IllegalArgumentException("Package size is required.");
        }
        if (priority == null) {
            throw new IllegalArgumentException("Priority is required.");
        }
        Instant now = Instant.now();
        DeliveryOrder existing = orders.get(normalizedId);
        Instant createdAt = existing == null ? now : existing.getCreatedAt();
        DeliveryStatus status = existing == null ? DeliveryStatus.REQUESTED : existing.getStatus();
        String driverId = existing == null ? null : existing.getDriverId();
        Integer etaMinutes = existing == null ? null : existing.getEtaMinutes();
        if (existing != null && !existing.isActive()) {
            throw new IllegalArgumentException("Cannot update a closed order.");
        }
        DeliveryOrder order = new DeliveryOrder(
                normalizedId,
                normalizedCustomer,
                normalizedPickup,
                normalizedDropoff,
                normalizedZone,
                size,
                priority,
                status,
                driverId,
                etaMinutes,
                createdAt,
                now);
        orders.put(normalizedId, order);
        return order;
    }

    public synchronized DeliveryDriver addDriver(String id, String name, String vehicleType, DriverStatus status) {
        String normalizedId = normalizeId(id, "Driver id");
        String normalizedName = normalizeText(name, "Driver name");
        String normalizedVehicle = normalizeText(vehicleType, "Vehicle type");
        DriverStatus normalizedStatus = status == null ? DriverStatus.AVAILABLE : status;
        Instant now = Instant.now();
        DeliveryDriver existing = drivers.get(normalizedId);
        Instant createdAt = existing == null ? now : existing.getCreatedAt();
        String activeOrderId = existing == null ? null : existing.getActiveOrderId();
        int completed = existing == null ? 0 : existing.getCompletedDeliveries();
        if (normalizedStatus == DriverStatus.ON_DELIVERY && activeOrderId == null) {
            throw new IllegalArgumentException("Driver cannot be on delivery without an active order.");
        }
        if (normalizedStatus != DriverStatus.ON_DELIVERY && activeOrderId != null) {
            throw new IllegalArgumentException("Driver has an active order and must remain on delivery.");
        }
        DeliveryDriver driver = new DeliveryDriver(
                normalizedId,
                normalizedName,
                normalizedVehicle,
                normalizedStatus,
                completed,
                activeOrderId,
                createdAt,
                now);
        drivers.put(normalizedId, driver);
        return driver;
    }

    public synchronized DeliveryOrder assignDriver(String orderId, String driverId, Integer etaMinutes) {
        String normalizedOrderId = normalizeId(orderId, "Order id");
        String normalizedDriverId = normalizeId(driverId, "Driver id");
        Integer normalizedEta = normalizeEta(etaMinutes);
        DeliveryOrder order = requireOrder(normalizedOrderId);
        DeliveryDriver driver = requireDriver(normalizedDriverId);
        if (!order.isActive()) {
            throw new IllegalArgumentException("Order is already closed.");
        }
        if (order.getDriverId() != null && !order.getDriverId().equals(driver.getId())) {
            throw new IllegalArgumentException("Order is already assigned to another driver.");
        }
        boolean sameAssignment = driver.getActiveOrderId() != null && driver.getActiveOrderId().equals(order.getId());
        if (!sameAssignment && driver.getStatus() != DriverStatus.AVAILABLE) {
            throw new IllegalArgumentException("Driver is not available.");
        }
        if (!sameAssignment && driver.getActiveOrderId() != null) {
            throw new IllegalArgumentException("Driver already has an active order.");
        }
        Instant now = Instant.now();
        DeliveryOrder updatedOrder = new DeliveryOrder(
                order.getId(),
                order.getCustomerName(),
                order.getPickupAddress(),
                order.getDropoffAddress(),
                order.getZone(),
                order.getSize(),
                order.getPriority(),
                DeliveryStatus.ASSIGNED,
                driver.getId(),
                normalizedEta,
                order.getCreatedAt(),
                now);
        orders.put(order.getId(), updatedOrder);
        DeliveryDriver updatedDriver = new DeliveryDriver(
                driver.getId(),
                driver.getName(),
                driver.getVehicleType(),
                DriverStatus.ON_DELIVERY,
                driver.getCompletedDeliveries(),
                order.getId(),
                driver.getCreatedAt(),
                now);
        drivers.put(driver.getId(), updatedDriver);
        return updatedOrder;
    }

    public synchronized DeliveryOrder updateStatus(String orderId, DeliveryStatus status) {
        String normalizedOrderId = normalizeId(orderId, "Order id");
        if (status == null) {
            throw new IllegalArgumentException("Status is required.");
        }
        DeliveryOrder order = requireOrder(normalizedOrderId);
        if (!order.isActive()) {
            throw new IllegalArgumentException("Order is already closed.");
        }
        if (status == DeliveryStatus.ASSIGNED && order.getDriverId() == null) {
            throw new IllegalArgumentException("Assign a driver before marking as assigned.");
        }
        if ((status == DeliveryStatus.PICKED_UP || status == DeliveryStatus.IN_TRANSIT || status == DeliveryStatus.DELIVERED)
                && order.getDriverId() == null) {
            throw new IllegalArgumentException("Order needs an assigned driver for this status.");
        }
        Instant now = Instant.now();
        DeliveryStatus nextStatus = status;
        DeliveryOrder updatedOrder = new DeliveryOrder(
                order.getId(),
                order.getCustomerName(),
                order.getPickupAddress(),
                order.getDropoffAddress(),
                order.getZone(),
                order.getSize(),
                order.getPriority(),
                nextStatus,
                order.getDriverId(),
                order.getEtaMinutes(),
                order.getCreatedAt(),
                now);
        orders.put(order.getId(), updatedOrder);
        if (nextStatus == DeliveryStatus.DELIVERED || nextStatus == DeliveryStatus.CANCELED) {
            releaseDriver(order.getDriverId(), order.getId(), nextStatus == DeliveryStatus.DELIVERED, now);
        }
        return updatedOrder;
    }

    public synchronized DeliveryDriver updateDriverStatus(String driverId, DriverStatus status) {
        String normalizedDriverId = normalizeId(driverId, "Driver id");
        if (status == null) {
            throw new IllegalArgumentException("Driver status is required.");
        }
        DeliveryDriver driver = requireDriver(normalizedDriverId);
        if (status == DriverStatus.ON_DELIVERY && driver.getActiveOrderId() == null) {
            throw new IllegalArgumentException("Driver cannot be on delivery without an active order.");
        }
        if (status != DriverStatus.ON_DELIVERY && driver.getActiveOrderId() != null) {
            throw new IllegalArgumentException("Driver has an active order and must remain on delivery.");
        }
        Instant now = Instant.now();
        DeliveryDriver updatedDriver = new DeliveryDriver(
                driver.getId(),
                driver.getName(),
                driver.getVehicleType(),
                status,
                driver.getCompletedDeliveries(),
                driver.getActiveOrderId(),
                driver.getCreatedAt(),
                now);
        drivers.put(driver.getId(), updatedDriver);
        return updatedDriver;
    }

    public synchronized DeliveryMetricsResponse metrics() {
        int totalOrders = orders.size();
        int activeOrders = (int) orders.values().stream().filter(DeliveryOrder::isActive).count();
        int unassignedOrders = (int) orders.values().stream()
                .filter(order -> order.getStatus() == DeliveryStatus.REQUESTED)
                .count();
        int availableDrivers = (int) drivers.values().stream()
                .filter(driver -> driver.getStatus() == DriverStatus.AVAILABLE)
                .count();
        int onDeliveryDrivers = (int) drivers.values().stream()
                .filter(driver -> driver.getStatus() == DriverStatus.ON_DELIVERY)
                .count();
        return new DeliveryMetricsResponse(totalOrders, activeOrders, unassignedOrders, availableDrivers, onDeliveryDrivers);
    }

    private DeliveryOrder requireOrder(String id) {
        DeliveryOrder order = orders.get(id);
        if (order == null) {
            throw new IllegalArgumentException("Unknown order: " + id);
        }
        return order;
    }

    private DeliveryDriver requireDriver(String id) {
        DeliveryDriver driver = drivers.get(id);
        if (driver == null) {
            throw new IllegalArgumentException("Unknown driver: " + id);
        }
        return driver;
    }

    private void releaseDriver(String driverId, String orderId, boolean delivered, Instant now) {
        if (!StringUtils.hasText(driverId)) {
            return;
        }
        DeliveryDriver driver = drivers.get(driverId);
        if (driver == null) {
            return;
        }
        if (!StringUtils.hasText(orderId) || !orderId.equals(driver.getActiveOrderId())) {
            return;
        }
        DeliveryDriver updatedDriver = new DeliveryDriver(
                driver.getId(),
                driver.getName(),
                driver.getVehicleType(),
                DriverStatus.AVAILABLE,
                delivered ? driver.getCompletedDeliveries() + 1 : driver.getCompletedDeliveries(),
                null,
                driver.getCreatedAt(),
                now);
        drivers.put(driver.getId(), updatedDriver);
    }

    private String normalizeId(String id, String label) {
        if (!StringUtils.hasText(id)) {
            throw new IllegalArgumentException(label + " cannot be empty.");
        }
        String normalized = id.trim();
        if (!ID_PATTERN.matcher(normalized).matches()) {
            throw new IllegalArgumentException(label + " must use letters, numbers, '.', '-', '_', or ':'.");
        }
        return normalized;
    }

    private String normalizeText(String value, String label) {
        if (!StringUtils.hasText(value)) {
            throw new IllegalArgumentException(label + " cannot be empty.");
        }
        return value.trim();
    }

    private Integer normalizeEta(Integer etaMinutes) {
        if (etaMinutes == null) {
            throw new IllegalArgumentException("ETA minutes is required.");
        }
        if (etaMinutes < 5) {
            throw new IllegalArgumentException("ETA minutes must be at least 5.");
        }
        return etaMinutes;
    }
}
