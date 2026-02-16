package com.randomproject.flighttracking;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api")
public class FlightTrackingController {
    private final FlightTrackingService service;

    public FlightTrackingController(FlightTrackingService service) {
        this.service = service;
    }

    @GetMapping("/airports")
    public List<Airport> listAirports() {
        return service.listAirports();
    }

    @GetMapping("/flights")
    public List<Flight> listFlights(@RequestParam(required = false) String query,
                                    @RequestParam(required = false) String status,
                                    @RequestParam(required = false) String origin,
                                    @RequestParam(required = false) String destination) {
        return service.listFlights(query, status, origin, destination);
    }

    @GetMapping("/flights/{id}")
    public Flight getFlight(@PathVariable long id) {
        return service.getFlight(id);
    }

    @GetMapping("/flights/{id}/track")
    public FlightTrackResponse track(@PathVariable long id) {
        return service.trackFlight(id);
    }
}
