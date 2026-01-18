package com.randomproject.localdelivery;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.DeleteMapping;
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
public class DeliveryController {
    private final DeliveryService service;

    public DeliveryController(DeliveryService service) {
        this.service = service;
    }

    @GetMapping("/")
    public String home(@RequestParam(value = "message", required = false) String message, Model model) {
        List<DeliveryOrder> orders = sortedOrders();
        List<DeliveryDriver> drivers = sortedDrivers();
        model.addAttribute("orders", orders);
        model.addAttribute("drivers", drivers);
        model.addAttribute("metrics", service.metrics());
        model.addAttribute("message", message);
        model.addAttribute("sizes", PackageSize.values());
        model.addAttribute("priorities", DeliveryPriority.values());
        model.addAttribute("statuses", DeliveryStatus.values());
        model.addAttribute("driverStatuses", DriverStatus.values());
        return "index";
    }

    @PostMapping("/orders")
    public String createOrder(@RequestParam("id") String id,
                              @RequestParam("customerName") String customerName,
                              @RequestParam("pickupAddress") String pickupAddress,
                              @RequestParam("dropoffAddress") String dropoffAddress,
                              @RequestParam("zone") String zone,
                              @RequestParam("size") PackageSize size,
                              @RequestParam("priority") DeliveryPriority priority,
                              RedirectAttributes redirectAttributes) {
        try {
            DeliveryOrder order = service.createOrder(id, customerName, pickupAddress, dropoffAddress, zone, size, priority);
            redirectAttributes.addAttribute("message", "Order " + order.getId() + " saved as " + order.getStatus() + ".");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/drivers")
    public String addDriver(@RequestParam("id") String id,
                            @RequestParam("name") String name,
                            @RequestParam("vehicleType") String vehicleType,
                            @RequestParam("status") DriverStatus status,
                            RedirectAttributes redirectAttributes) {
        try {
            DeliveryDriver driver = service.addDriver(id, name, vehicleType, status);
            redirectAttributes.addAttribute("message", "Driver " + driver.getId() + " is " + driver.getStatus() + ".");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/assignments")
    public String assignDriver(@RequestParam("orderId") String orderId,
                               @RequestParam("driverId") String driverId,
                               @RequestParam("etaMinutes") Integer etaMinutes,
                               RedirectAttributes redirectAttributes) {
        try {
            DeliveryOrder order = service.assignDriver(orderId, driverId, etaMinutes);
            redirectAttributes.addAttribute("message", "Assigned " + order.getDriverId() + " to " + order.getId() + ".");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/orders/{id}/status")
    public String updateOrderStatus(@PathVariable String id,
                                    @RequestParam("status") DeliveryStatus status,
                                    RedirectAttributes redirectAttributes) {
        try {
            DeliveryOrder order = service.updateStatus(id, status);
            redirectAttributes.addAttribute("message", "Order " + order.getId() + " is now " + order.getStatus() + ".");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/drivers/{id}/status")
    public String updateDriverStatus(@PathVariable String id,
                                     @RequestParam("status") DriverStatus status,
                                     RedirectAttributes redirectAttributes) {
        try {
            DeliveryDriver driver = service.updateDriverStatus(id, status);
            redirectAttributes.addAttribute("message", "Driver " + driver.getId() + " is now " + driver.getStatus() + ".");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/api/orders")
    @ResponseBody
    public ResponseEntity<DeliveryOrderResponse> apiCreateOrder(@Valid @RequestBody DeliveryOrderRequest request) {
        try {
            DeliveryOrder order = service.createOrder(
                    request.id(),
                    request.customerName(),
                    request.pickupAddress(),
                    request.dropoffAddress(),
                    request.zone(),
                    request.size(),
                    request.priority());
            return ResponseEntity.status(201).body(toResponse(order));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/orders")
    @ResponseBody
    public List<DeliveryOrderResponse> apiOrders() {
        return sortedOrders().stream().map(this::toResponse).toList();
    }

    @GetMapping("/api/orders/{id}")
    @ResponseBody
    public ResponseEntity<DeliveryOrderResponse> apiOrder(@PathVariable String id) {
        return service.getOrder(id)
                .map(order -> ResponseEntity.ok(toResponse(order)))
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/api/orders/{id}/status")
    @ResponseBody
    public ResponseEntity<DeliveryOrderResponse> apiUpdateStatus(@PathVariable String id,
                                                                 @Valid @RequestBody DeliveryStatusUpdateRequest request) {
        try {
            DeliveryOrder order = service.updateStatus(id, request.status());
            return ResponseEntity.ok(toResponse(order));
        } catch (IllegalArgumentException ex) {
            if (isUnknown(ex)) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.badRequest().build();
        }
    }

    @DeleteMapping("/api/orders/{id}")
    @ResponseBody
    public ResponseEntity<Void> apiCancelOrder(@PathVariable String id) {
        try {
            service.updateStatus(id, DeliveryStatus.CANCELED);
            return ResponseEntity.noContent().build();
        } catch (IllegalArgumentException ex) {
            if (isUnknown(ex)) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/drivers")
    @ResponseBody
    public ResponseEntity<DriverResponse> apiCreateDriver(@Valid @RequestBody DriverRequest request) {
        try {
            DeliveryDriver driver = service.addDriver(request.id(), request.name(), request.vehicleType(), request.status());
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
            DeliveryDriver driver = service.updateDriverStatus(id, request.status());
            return ResponseEntity.ok(toResponse(driver));
        } catch (IllegalArgumentException ex) {
            if (isUnknown(ex)) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/assignments")
    @ResponseBody
    public ResponseEntity<DeliveryOrderResponse> apiAssign(@Valid @RequestBody AssignmentRequest request) {
        try {
            DeliveryOrder order = service.assignDriver(request.orderId(), request.driverId(), request.etaMinutes());
            return ResponseEntity.ok(toResponse(order));
        } catch (IllegalArgumentException ex) {
            if (isUnknown(ex)) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/metrics")
    @ResponseBody
    public DeliveryMetricsResponse apiMetrics() {
        return service.metrics();
    }

    private List<DeliveryOrder> sortedOrders() {
        return service.allOrders().stream()
                .sorted(Comparator.comparing(DeliveryOrder::getUpdatedAt).reversed())
                .toList();
    }

    private List<DeliveryDriver> sortedDrivers() {
        return service.allDrivers().stream()
                .sorted(Comparator.comparing(DeliveryDriver::getUpdatedAt).reversed())
                .toList();
    }

    private DeliveryOrderResponse toResponse(DeliveryOrder order) {
        return new DeliveryOrderResponse(
                order.getId(),
                order.getCustomerName(),
                order.getPickupAddress(),
                order.getDropoffAddress(),
                order.getZone(),
                order.getSize(),
                order.getPriority(),
                order.getStatus(),
                order.getDriverId(),
                order.getEtaMinutes(),
                order.getCreatedAt(),
                order.getUpdatedAt());
    }

    private DriverResponse toResponse(DeliveryDriver driver) {
        return new DriverResponse(
                driver.getId(),
                driver.getName(),
                driver.getVehicleType(),
                driver.getStatus(),
                driver.getCompletedDeliveries(),
                driver.getActiveOrderId(),
                driver.getCreatedAt(),
                driver.getUpdatedAt());
    }

    private boolean isUnknown(IllegalArgumentException ex) {
        String message = ex.getMessage();
        return message != null && message.startsWith("Unknown");
    }
}
