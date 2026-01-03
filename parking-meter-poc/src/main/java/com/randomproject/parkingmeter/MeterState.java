package com.randomproject.parkingmeter;

public record MeterState(int maxMinutes, int minutesPerQuarter, int remainingMinutes, boolean expired) {
}
