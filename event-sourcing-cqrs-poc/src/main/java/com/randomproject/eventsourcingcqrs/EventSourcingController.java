package com.randomproject.eventsourcingcqrs;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import java.util.List;

@Controller
public class EventSourcingController {
    private final EventSourcingService service;

    public EventSourcingController(EventSourcingService service) {
        this.service = service;
    }

    @ModelAttribute("config")
    public EventConfigView config() {
        return service.configSnapshot();
    }

    @GetMapping("/")
    public String home(Model model) {
        model.addAttribute("snapshot", service.snapshot());
        return "index";
    }

    @PostMapping("/commands/create-order")
    public String createOrder(
            @RequestParam("orderId") String orderId,
            @RequestParam("customerId") String customerId,
            @RequestParam("expectedVersion") Long expectedVersion,
            @RequestParam(value = "commandId", required = false) String commandId,
            RedirectAttributes redirectAttributes) {
        try {
            CommandOutcomeView outcome = service.createOrder(orderId, customerId, expectedVersion, commandId);
            redirectAttributes.addFlashAttribute("message", outcome.message());
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/commands/add-item")
    public String addItem(
            @RequestParam("orderId") String orderId,
            @RequestParam("sku") String sku,
            @RequestParam("quantity") Integer quantity,
            @RequestParam("unitPrice") Double unitPrice,
            @RequestParam("expectedVersion") Long expectedVersion,
            @RequestParam(value = "commandId", required = false) String commandId,
            RedirectAttributes redirectAttributes) {
        try {
            CommandOutcomeView outcome = service.addItem(orderId, sku, quantity, unitPrice, expectedVersion, commandId);
            redirectAttributes.addFlashAttribute("message", outcome.message());
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/commands/confirm-order")
    public String confirmOrder(
            @RequestParam("orderId") String orderId,
            @RequestParam("expectedVersion") Long expectedVersion,
            @RequestParam(value = "commandId", required = false) String commandId,
            RedirectAttributes redirectAttributes) {
        try {
            CommandOutcomeView outcome = service.confirmOrder(orderId, expectedVersion, commandId);
            redirectAttributes.addFlashAttribute("message", outcome.message());
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/commands/cancel-order")
    public String cancelOrder(
            @RequestParam("orderId") String orderId,
            @RequestParam("expectedVersion") Long expectedVersion,
            @RequestParam(value = "reason", required = false) String reason,
            @RequestParam(value = "commandId", required = false) String commandId,
            RedirectAttributes redirectAttributes) {
        try {
            CommandOutcomeView outcome = service.cancelOrder(orderId, expectedVersion, reason, commandId);
            redirectAttributes.addFlashAttribute("message", outcome.message());
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/projections/rebuild")
    public String rebuildProjections(RedirectAttributes redirectAttributes) {
        CommandOutcomeView outcome = service.rebuildProjections("ui");
        redirectAttributes.addFlashAttribute("message", outcome.message());
        return "redirect:/";
    }

    @GetMapping("/api/snapshot")
    @ResponseBody
    public EventSourcingSnapshotView snapshot() {
        return service.snapshot();
    }

    @GetMapping("/api/orders/{orderId}")
    @ResponseBody
    public ResponseEntity<OrderSummaryView> order(@PathVariable String orderId) {
        OrderSummaryView summary = service.findOrder(orderId);
        return summary == null ? ResponseEntity.notFound().build() : ResponseEntity.ok(summary);
    }

    @GetMapping("/api/orders/{orderId}/events")
    @ResponseBody
    public List<StoredEventView> orderEvents(@PathVariable String orderId) {
        return service.eventsForOrder(orderId);
    }

    @PostMapping("/api/commands/create-order")
    @ResponseBody
    public ResponseEntity<CommandOutcomeView> createOrderApi(@Valid @RequestBody CreateOrderRequest request) {
        try {
            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(service.createOrder(request.orderId(), request.customerId(), request.expectedVersion(), request.commandId()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/commands/add-item")
    @ResponseBody
    public ResponseEntity<CommandOutcomeView> addItemApi(@Valid @RequestBody AddItemRequest request) {
        try {
            return ResponseEntity.status(HttpStatus.CREATED)
                    .body(service.addItem(
                            request.orderId(),
                            request.sku(),
                            request.quantity(),
                            request.unitPrice(),
                            request.expectedVersion(),
                            request.commandId()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/commands/confirm-order")
    @ResponseBody
    public ResponseEntity<CommandOutcomeView> confirmOrderApi(@Valid @RequestBody ConfirmOrderRequest request) {
        try {
            return ResponseEntity.ok(service.confirmOrder(request.orderId(), request.expectedVersion(), request.commandId()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/commands/cancel-order")
    @ResponseBody
    public ResponseEntity<CommandOutcomeView> cancelOrderApi(@Valid @RequestBody CancelOrderRequest request) {
        try {
            return ResponseEntity.ok(service.cancelOrder(
                    request.orderId(), request.expectedVersion(), request.reason(), request.commandId()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/projections/rebuild")
    @ResponseBody
    public ResponseEntity<CommandOutcomeView> rebuildApi(@RequestBody(required = false) RebuildProjectionRequest request) {
        String trigger = request == null ? "api" : request.trigger();
        return ResponseEntity.ok(service.rebuildProjections(trigger));
    }
}
