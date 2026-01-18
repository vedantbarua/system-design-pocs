package com.randomproject.localdelivery;

import java.time.Instant;

public class DeliveryDriver {
    private final String id;
    private final String name;
    private final String vehicleType;
    private final DriverStatus status;
    private final int completedDeliveries;
    private final String activeOrderId;
    private final Instant createdAt;
    private final Instant updatedAt;

    public DeliveryDriver(String id,
                          String name,
                          String vehicleType,
                          DriverStatus status,
                          int completedDeliveries,
                          String activeOrderId,
                          Instant createdAt,
                          Instant updatedAt) {
        this.id = id;
        this.name = name;
        this.vehicleType = vehicleType;
        this.status = status;
        this.completedDeliveries = completedDeliveries;
        this.activeOrderId = activeOrderId;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getVehicleType() {
        return vehicleType;
    }

    public DriverStatus getStatus() {
        return status;
    }

    public int getCompletedDeliveries() {
        return completedDeliveries;
    }

    public String getActiveOrderId() {
        return activeOrderId;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public boolean isAvailable() {
        return status == DriverStatus.AVAILABLE;
    }
}
