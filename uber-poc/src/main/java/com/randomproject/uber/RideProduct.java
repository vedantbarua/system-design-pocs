package com.randomproject.uber;

public enum RideProduct {
    UBER_X("UberX", 3.0, 1.4, 1.5),
    UBER_XL("UberXL", 4.5, 1.9, 2.0),
    UBER_BLACK("Uber Black", 8.0, 3.0, 3.5);

    private final String label;
    private final double baseFare;
    private final double perKm;
    private final double bookingFee;

    RideProduct(String label, double baseFare, double perKm, double bookingFee) {
        this.label = label;
        this.baseFare = baseFare;
        this.perKm = perKm;
        this.bookingFee = bookingFee;
    }

    public String getLabel() {
        return label;
    }

    public double estimateFare(double distanceKm, double surgeMultiplier) {
        double raw = (baseFare + (perKm * distanceKm) + bookingFee) * surgeMultiplier;
        return Math.round(raw * 100.0) / 100.0;
    }
}
