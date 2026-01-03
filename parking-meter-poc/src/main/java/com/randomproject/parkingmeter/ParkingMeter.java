package com.randomproject.parkingmeter;

public class ParkingMeter {
    private final int maxMinutes;
    private final int minutesPerQuarter;
    private int remainingMinutes;

    public ParkingMeter(int maxMinutes, int minutesPerQuarter) {
        if (maxMinutes <= 0 || minutesPerQuarter <= 0) {
            throw new IllegalArgumentException("Max minutes and minutes per quarter must be positive.");
        }
        this.maxMinutes = maxMinutes;
        this.minutesPerQuarter = minutesPerQuarter;
    }

    public int insertQuarters(int quarters) {
        if (quarters <= 0) {
            return 0;
        }
        int before = remainingMinutes;
        remainingMinutes = Math.min(maxMinutes, remainingMinutes + quarters * minutesPerQuarter);
        return remainingMinutes - before;
    }

    public int advanceMinutes(int minutes) {
        if (minutes <= 0) {
            return 0;
        }
        int before = remainingMinutes;
        remainingMinutes = Math.max(0, remainingMinutes - minutes);
        return before - remainingMinutes;
    }

    public boolean isExpired() {
        return remainingMinutes == 0;
    }

    public MeterState snapshot() {
        return new MeterState(maxMinutes, minutesPerQuarter, remainingMinutes, isExpired());
    }
}
