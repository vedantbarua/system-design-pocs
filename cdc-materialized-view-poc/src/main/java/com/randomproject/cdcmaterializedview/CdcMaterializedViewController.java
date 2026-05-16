package com.randomproject.cdcmaterializedview;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import java.math.BigDecimal;
import java.util.Map;

@Controller
public class CdcMaterializedViewController {
    private final CdcMaterializedViewService service;

    public CdcMaterializedViewController(CdcMaterializedViewService service) {
        this.service = service;
    }

    @GetMapping("/")
    public String home(Model model) {
        model.addAttribute("snapshot", service.snapshot());
        model.addAttribute("statuses", OrderStatus.values());
        return "index";
    }

    @GetMapping("/api/snapshot")
    @ResponseBody
    public SystemSnapshot snapshot() {
        return service.snapshot();
    }

    @PostMapping("/api/orders")
    @ResponseBody
    public CommandResult createOrder(@Valid @RequestBody CreateOrderRequest request) {
        return service.createOrder(request);
    }

    @PatchMapping("/api/orders/{orderId}")
    @ResponseBody
    public CommandResult updateOrder(@PathVariable String orderId, @Valid @RequestBody UpdateOrderRequest request) {
        return service.updateOrder(orderId, request);
    }

    @DeleteMapping("/api/orders/{orderId}")
    @ResponseBody
    public CommandResult deleteOrder(@PathVariable String orderId) {
        return service.deleteOrder(orderId);
    }

    @PostMapping("/api/cdc/poll")
    @ResponseBody
    public PollResult poll(@Valid @RequestBody(required = false) PollRequest request) {
        return service.poll(request);
    }

    @PostMapping("/api/cdc/pause")
    @ResponseBody
    public CommandResult pause() {
        return service.setPaused(true);
    }

    @PostMapping("/api/cdc/resume")
    @ResponseBody
    public CommandResult resume() {
        return service.setPaused(false);
    }

    @PostMapping("/api/cdc/duplicate")
    @ResponseBody
    public CommandResult duplicate(@Valid @RequestBody DuplicateEventRequest request) {
        return service.duplicateEvent(request);
    }

    @PostMapping("/api/cdc/replay")
    @ResponseBody
    public CommandResult replay(@Valid @RequestBody ReplayRequest request) {
        return service.replay(request);
    }

    @PostMapping("/api/cdc/backfill")
    @ResponseBody
    public CommandResult backfill() {
        return service.backfill();
    }

    @PostMapping("/ui/orders")
    public String createOrderFromUi(
            @RequestParam String customerId,
            @RequestParam String sku,
            @RequestParam Integer quantity,
            @RequestParam BigDecimal unitPrice,
            RedirectAttributes redirectAttributes) {
        CommandResult result = service.createOrder(new CreateOrderRequest(customerId, sku, quantity, unitPrice));
        redirectAttributes.addFlashAttribute("message", result.message());
        return "redirect:/";
    }

    @PostMapping("/ui/orders/update")
    public String updateOrderFromUi(
            @RequestParam String orderId,
            @RequestParam(required = false) String sku,
            @RequestParam(required = false) Integer quantity,
            @RequestParam(required = false) BigDecimal unitPrice,
            @RequestParam(required = false) OrderStatus status,
            RedirectAttributes redirectAttributes) {
        CommandResult result = service.updateOrder(orderId, new UpdateOrderRequest(sku, quantity, unitPrice, status));
        redirectAttributes.addFlashAttribute("message", result.message());
        return "redirect:/";
    }

    @PostMapping("/ui/orders/delete")
    public String deleteOrderFromUi(@RequestParam String orderId, RedirectAttributes redirectAttributes) {
        CommandResult result = service.deleteOrder(orderId);
        redirectAttributes.addFlashAttribute("message", result.message());
        return "redirect:/";
    }

    @PostMapping("/ui/cdc/poll")
    public String pollFromUi(@RequestParam Integer maxEvents, RedirectAttributes redirectAttributes) {
        PollResult result = service.poll(new PollRequest(maxEvents));
        redirectAttributes.addFlashAttribute("message", "Applied " + result.appliedEvents() + " events; duplicates " + result.duplicateEvents() + ".");
        return "redirect:/";
    }

    @PostMapping("/ui/cdc/pause")
    public String pauseFromUi(RedirectAttributes redirectAttributes) {
        CommandResult result = service.setPaused(true);
        redirectAttributes.addFlashAttribute("message", result.message());
        return "redirect:/";
    }

    @PostMapping("/ui/cdc/resume")
    public String resumeFromUi(RedirectAttributes redirectAttributes) {
        CommandResult result = service.setPaused(false);
        redirectAttributes.addFlashAttribute("message", result.message());
        return "redirect:/";
    }

    @PostMapping("/ui/cdc/duplicate")
    public String duplicateFromUi(@RequestParam(required = false) Long sequence, RedirectAttributes redirectAttributes) {
        CommandResult result = service.duplicateEvent(new DuplicateEventRequest(sequence));
        redirectAttributes.addFlashAttribute("message", result.message());
        return "redirect:/";
    }

    @PostMapping("/ui/cdc/replay")
    public String replayFromUi(
            @RequestParam Long fromOffset,
            @RequestParam(defaultValue = "false") boolean clearProjections,
            RedirectAttributes redirectAttributes) {
        CommandResult result = service.replay(new ReplayRequest(fromOffset, clearProjections));
        redirectAttributes.addFlashAttribute("message", result.message());
        return "redirect:/";
    }

    @PostMapping("/ui/cdc/backfill")
    public String backfillFromUi(RedirectAttributes redirectAttributes) {
        CommandResult result = service.backfill();
        redirectAttributes.addFlashAttribute("message", result.message());
        return "redirect:/";
    }

    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseBody
    public ResponseEntity<Map<String, String>> handleBadRequest(IllegalArgumentException ex) {
        return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
    }
}
