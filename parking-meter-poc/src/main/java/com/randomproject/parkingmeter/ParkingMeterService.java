package com.randomproject.parkingmeter;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class ParkingMeterService {
    private final ParkingMeter meter;

    public ParkingMeterService(
            @Value("${meter.max-minutes:120}") int maxMinutes,
            @Value("${meter.minutes-per-quarter:15}") int minutesPerQuarter) {
        this.meter = new ParkingMeter(maxMinutes, minutesPerQuarter);
    }

    public synchronized MeterState insert(int quarters) {
        meter.insertQuarters(quarters);
        return meter.snapshot();
    }

    public synchronized MeterState advance(int minutes) {
        meter.advanceMinutes(minutes);
        return meter.snapshot();
    }

    public synchronized MeterState tick() {
        meter.advanceMinutes(1);
        return meter.snapshot();
    }

    public synchronized MeterState state() {
        return meter.snapshot();
    }
}
