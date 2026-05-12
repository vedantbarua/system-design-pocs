package com.randomproject.transactionaloutbox;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
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

@Controller
public class TransactionalOutboxController {
    private final TransactionalOutboxService service;

    public TransactionalOutboxController(TransactionalOutboxService service) {
        this.service = service;
    }

    @GetMapping("/")
    public String home(Model model) {
        DemoSnapshot snapshot = service.snapshot();
        model.addAttribute("stats", snapshot.stats());
        model.addAttribute("orders", snapshot.orders());
        model.addAttribute("outboxEvents", snapshot.outboxEvents());
        model.addAttribute("brokerMessages", snapshot.brokerMessages());
        model.addAttribute("inboxEntries", snapshot.inboxEntries());
        model.addAttribute("auditEvents", snapshot.auditEvents());
        return "index";
    }

    @PostMapping("/orders")
    public String createOrder(@RequestParam String customerId,
                              @RequestParam String sku,
                              @RequestParam int quantity,
                              @RequestParam(defaultValue = "false") boolean poisonEvent,
                              RedirectAttributes redirectAttributes) {
        OrderView order = service.createOrder(new CreateOrderRequest(customerId, sku, quantity, poisonEvent));
        redirectAttributes.addFlashAttribute("message", "Created " + order.id() + " and wrote its outbox event in the same transaction.");
        return "redirect:/";
    }

    @PostMapping("/controls/publish-failures")
    public String armPublishFailures(@RequestParam(defaultValue = "1") int failures,
                                     RedirectAttributes redirectAttributes) {
        service.armPublishFailures(failures);
        redirectAttributes.addFlashAttribute("message", "Armed " + failures + " simulated broker publish failure(s).");
        return "redirect:/";
    }

    @PostMapping("/controls/consumer-paused")
    public String setConsumerPaused(@RequestParam(defaultValue = "false") boolean paused,
                                    RedirectAttributes redirectAttributes) {
        service.setConsumerPaused(paused);
        redirectAttributes.addFlashAttribute("message", paused ? "Paused the consumer." : "Resumed the consumer.");
        return "redirect:/";
    }

    @PostMapping("/controls/consumer-threshold")
    public String setConsumerFailureThreshold(@RequestParam int threshold,
                                              RedirectAttributes redirectAttributes) {
        service.setConsumerFailureThreshold(threshold);
        redirectAttributes.addFlashAttribute("message", "Updated poison-message DLQ threshold to " + threshold + ".");
        return "redirect:/";
    }

    @PostMapping("/controls/duplicates/{outboxEventId}")
    public String publishDuplicate(@PathVariable String outboxEventId,
                                   RedirectAttributes redirectAttributes) {
        service.publishDuplicate(outboxEventId);
        redirectAttributes.addFlashAttribute("message", "Republished " + outboxEventId + " with the same event id.");
        return "redirect:/";
    }

    @PostMapping("/controls/drain")
    public String drainOnce(RedirectAttributes redirectAttributes) {
        service.drainOnce();
        redirectAttributes.addFlashAttribute("message", "Ran one relay and consumer pass.");
        return "redirect:/";
    }

    @PostMapping("/controls/reset")
    public String reset(RedirectAttributes redirectAttributes) {
        service.reset();
        redirectAttributes.addFlashAttribute("message", "Reset the demo state.");
        return "redirect:/";
    }

    @PostMapping("/api/orders")
    @ResponseBody
    public ResponseEntity<OrderView> apiCreateOrder(@Valid @RequestBody CreateOrderRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(service.createOrder(request));
    }

    @GetMapping("/api/snapshot")
    @ResponseBody
    public DemoSnapshot apiSnapshot() {
        return service.snapshot();
    }

    @PostMapping("/api/controls/drain")
    @ResponseBody
    public DemoSnapshot apiDrainOnce() {
        service.drainOnce();
        return service.snapshot();
    }
}
