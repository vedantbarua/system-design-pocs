package com.randomproject.localdelivery;

import java.time.Instant;

public class DeliveryOrder {
    private final String id;
    private final String customerName;
    private final String pickupAddress;
    private final String dropoffAddress;
    private final String zone;
    private final PackageSize size;
    private final DeliveryPriority priority;
    private final DeliveryStatus status;
    private final String driverId;
    private final Integer etaMinutes;
    private final Instant createdAt;
    private final Instant updatedAt;

    public DeliveryOrder(String id,
                         String customerName,
                         String pickupAddress,
                         String dropoffAddress,
                         String zone,
                         PackageSize size,
                         DeliveryPriority priority,
                         DeliveryStatus status,
                         String driverId,
                         Integer etaMinutes,
                         Instant createdAt,
                         Instant updatedAt) {
        this.id = id;
        this.customerName = customerName;
        this.pickupAddress = pickupAddress;
        this.dropoffAddress = dropoffAddress;
        this.zone = zone;
        this.size = size;
        this.priority = priority;
        this.status = status;
        this.driverId = driverId;
        this.etaMinutes = etaMinutes;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public String getId() {
        return id;
    }

    public String getCustomerName() {
        return customerName;
    }

    public String getPickupAddress() {
        return pickupAddress;
    }

    public String getDropoffAddress() {
        return dropoffAddress;
    }

    public String getZone() {
        return zone;
    }

    public PackageSize getSize() {
        return size;
    }

    public DeliveryPriority getPriority() {
        return priority;
    }

    public DeliveryStatus getStatus() {
        return status;
    }

    public String getDriverId() {
        return driverId;
    }

    public Integer getEtaMinutes() {
        return etaMinutes;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public boolean isActive() {
        return status != DeliveryStatus.DELIVERED && status != DeliveryStatus.CANCELED;
    }
}
