package com.randomproject.uber;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import java.util.Comparator;
import java.util.List;

@Controller
public class UberController {
    private final UberService service;

    public UberController(UberService service) {
        this.service = service;
    }

    @GetMapping("/")
    public String home(@RequestParam(value = "message", required = false) String message, Model model) {
        model.addAttribute("riders", sortedRiders());
        model.addAttribute("drivers", sortedDrivers());
        model.addAttribute("trips", sortedTrips());
        model.addAttribute("metrics", service.metrics());
        model.addAttribute("message", message);
        model.addAttribute("products", RideProduct.values());
        model.addAttribute("tripStatuses", TripStatus.values());
        model.addAttribute("driverStatuses", DriverStatus.values());
        return "index";
    }

    @PostMapping("/riders")
    public String createRider(@RequestParam("id") String id,
                              @RequestParam("name") String name,
                              @RequestParam("rating") Double rating,
                              @RequestParam("homeZone") String homeZone,
                              RedirectAttributes redirectAttributes) {
        try {
            Rider rider = service.createRider(id, name, rating, homeZone);
            redirectAttributes.addAttribute("message", "Rider " + rider.getId() + " saved.");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/drivers")
    public String addDriver(@RequestParam("id") String id,
                            @RequestParam("name") String name,
                            @RequestParam("vehicle") String vehicle,
                            @RequestParam("rating") Double rating,
                            @RequestParam("zone") String zone,
                            @RequestParam("status") DriverStatus status,
                            RedirectAttributes redirectAttributes) {
        try {
            Driver driver = service.addDriver(id, name, vehicle, rating, zone, status);
            redirectAttributes.addAttribute("message", "Driver " + driver.getId() + " is " + driver.getStatus() + ".");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/trips")
    public String requestTrip(@RequestParam("id") String id,
                              @RequestParam("riderId") String riderId,
                              @RequestParam("pickupAddress") String pickupAddress,
                              @RequestParam("dropoffAddress") String dropoffAddress,
                              @RequestParam("zone") String zone,
                              @RequestParam("product") RideProduct product,
                              @RequestParam("distanceKm") Double distanceKm,
                              RedirectAttributes redirectAttributes) {
        try {
            Trip trip = service.requestTrip(id, riderId, pickupAddress, dropoffAddress, zone, product, distanceKm);
            redirectAttributes.addAttribute("message", "Trip " + trip.getId() + " requested at $" + trip.getEstimatedFare() + ".");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/assignments")
    public String assignDriver(@RequestParam("tripId") String tripId,
                               @RequestParam("driverId") String driverId,
                               RedirectAttributes redirectAttributes) {
        try {
            Trip trip = service.assignDriver(tripId, driverId);
            redirectAttributes.addAttribute("message", "Matched " + trip.getDriverId() + " to trip " + trip.getId() + ".");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/trips/{id}/status")
    public String updateTripStatus(@PathVariable String id,
                                   @RequestParam("status") TripStatus status,
                                   RedirectAttributes redirectAttributes) {
        return handleTripStatusUpdate(id, status, redirectAttributes);
    }

    @PostMapping("/trips/status")
    public String updateTripStatusByParam(@RequestParam("tripId") String id,
                                          @RequestParam("status") TripStatus status,
                                          RedirectAttributes redirectAttributes) {
        return handleTripStatusUpdate(id, status, redirectAttributes);
    }

    @PostMapping("/drivers/{id}/status")
    public String updateDriverStatus(@PathVariable String id,
                                     @RequestParam("status") DriverStatus status,
                                     RedirectAttributes redirectAttributes) {
        return handleDriverStatusUpdate(id, status, redirectAttributes);
    }

    @PostMapping("/drivers/status")
    public String updateDriverStatusByParam(@RequestParam("driverId") String id,
                                            @RequestParam("status") DriverStatus status,
                                            RedirectAttributes redirectAttributes) {
        return handleDriverStatusUpdate(id, status, redirectAttributes);
    }

    @PostMapping("/api/riders")
    @ResponseBody
    public ResponseEntity<RiderResponse> apiCreateRider(@Valid @RequestBody RiderRequest request) {
        try {
            Rider rider = service.createRider(request.id(), request.name(), request.rating(), request.homeZone());
            return ResponseEntity.status(201).body(toResponse(rider));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/riders")
    @ResponseBody
    public List<RiderResponse> apiRiders() {
        return sortedRiders().stream().map(this::toResponse).toList();
    }

    @GetMapping("/api/riders/{id}")
    @ResponseBody
    public ResponseEntity<RiderResponse> apiRider(@PathVariable String id) {
        return service.getRider(id)
                .map(rider -> ResponseEntity.ok(toResponse(rider)))
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/api/drivers")
    @ResponseBody
    public ResponseEntity<DriverResponse> apiCreateDriver(@Valid @RequestBody DriverRequest request) {
        try {
            Driver driver = service.addDriver(request.id(), request.name(), request.vehicle(), request.rating(), request.zone(), request.status());
            return ResponseEntity.status(201).body(toResponse(driver));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/drivers")
    @ResponseBody
    public List<DriverResponse> apiDrivers() {
        return sortedDrivers().stream().map(this::toResponse).toList();
    }

    @GetMapping("/api/drivers/{id}")
    @ResponseBody
    public ResponseEntity<DriverResponse> apiDriver(@PathVariable String id) {
        return service.getDriver(id)
                .map(driver -> ResponseEntity.ok(toResponse(driver)))
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/api/drivers/{id}/status")
    @ResponseBody
    public ResponseEntity<DriverResponse> apiUpdateDriverStatus(@PathVariable String id,
                                                                @Valid @RequestBody DriverStatusUpdateRequest request) {
        try {
            Driver driver = service.updateDriverStatus(id, request.status());
            return ResponseEntity.ok(toResponse(driver));
        } catch (IllegalArgumentException ex) {
            if (isUnknown(ex)) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/trips")
    @ResponseBody
    public ResponseEntity<TripResponse> apiCreateTrip(@Valid @RequestBody TripRequest request) {
        try {
            Trip trip = service.requestTrip(
                    request.id(),
                    request.riderId(),
                    request.pickupAddress(),
                    request.dropoffAddress(),
                    request.zone(),
                    request.product(),
                    request.distanceKm());
            return ResponseEntity.status(201).body(toResponse(trip));
        } catch (IllegalArgumentException ex) {
            if (isUnknown(ex)) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/trips")
    @ResponseBody
    public List<TripResponse> apiTrips() {
        return sortedTrips().stream().map(this::toResponse).toList();
    }

    @GetMapping("/api/trips/{id}")
    @ResponseBody
    public ResponseEntity<TripResponse> apiTrip(@PathVariable String id) {
        return service.getTrip(id)
                .map(trip -> ResponseEntity.ok(toResponse(trip)))
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/api/trips/{id}/status")
    @ResponseBody
    public ResponseEntity<TripResponse> apiUpdateTripStatus(@PathVariable String id,
                                                            @Valid @RequestBody TripStatusUpdateRequest request) {
        try {
            Trip trip = service.updateTripStatus(id, request.status());
            return ResponseEntity.ok(toResponse(trip));
        } catch (IllegalArgumentException ex) {
            if (isUnknown(ex)) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/assignments")
    @ResponseBody
    public ResponseEntity<TripResponse> apiAssign(@Valid @RequestBody TripAssignmentRequest request) {
        try {
            Trip trip = service.assignDriver(request.tripId(), request.driverId());
            return ResponseEntity.ok(toResponse(trip));
        } catch (IllegalArgumentException ex) {
            if (isUnknown(ex)) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/metrics")
    @ResponseBody
    public UberMetricsResponse apiMetrics() {
        return service.metrics();
    }

    private List<Rider> sortedRiders() {
        return service.allRiders().stream()
                .sorted(Comparator.comparing(Rider::getUpdatedAt).reversed())
                .toList();
    }

    private List<Driver> sortedDrivers() {
        return service.allDrivers().stream()
                .sorted(Comparator.comparing(Driver::getUpdatedAt).reversed())
                .toList();
    }

    private List<Trip> sortedTrips() {
        return service.allTrips().stream()
                .sorted(Comparator.comparing(Trip::getUpdatedAt).reversed())
                .toList();
    }

    private RiderResponse toResponse(Rider rider) {
        return new RiderResponse(
                rider.getId(),
                rider.getName(),
                rider.getRating(),
                rider.getHomeZone(),
                rider.getCreatedAt(),
                rider.getUpdatedAt());
    }

    private DriverResponse toResponse(Driver driver) {
        return new DriverResponse(
                driver.getId(),
                driver.getName(),
                driver.getVehicle(),
                driver.getRating(),
                driver.getStatus(),
                driver.getCurrentZone(),
                driver.getCompletedTrips(),
                driver.getActiveTripId(),
                driver.getCreatedAt(),
                driver.getUpdatedAt());
    }

    private TripResponse toResponse(Trip trip) {
        return new TripResponse(
                trip.getId(),
                trip.getRiderId(),
                trip.getDriverId(),
                trip.getPickupAddress(),
                trip.getDropoffAddress(),
                trip.getZone(),
                trip.getProduct(),
                trip.getStatus(),
                trip.getDistanceKm(),
                trip.getSurgeMultiplier(),
                trip.getEstimatedFare(),
                trip.getRequestedAt(),
                trip.getUpdatedAt());
    }

    private boolean isUnknown(IllegalArgumentException ex) {
        String message = ex.getMessage();
        return message != null && message.startsWith("Unknown");
    }

    private String handleTripStatusUpdate(String id, TripStatus status, RedirectAttributes redirectAttributes) {
        try {
            Trip trip = service.updateTripStatus(id, status);
            redirectAttributes.addAttribute("message", "Trip " + trip.getId() + " is now " + trip.getStatus() + ".");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    private String handleDriverStatusUpdate(String id, DriverStatus status, RedirectAttributes redirectAttributes) {
        try {
            Driver driver = service.updateDriverStatus(id, status);
            redirectAttributes.addAttribute("message", "Driver " + driver.getId() + " is now " + driver.getStatus() + ".");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }
}
