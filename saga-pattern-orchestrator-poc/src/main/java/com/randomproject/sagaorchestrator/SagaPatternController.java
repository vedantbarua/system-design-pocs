package com.randomproject.sagaorchestrator;

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

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@Controller
public class SagaPatternController {
    private final SagaOrchestratorService orchestratorService;
    private final InventoryService inventoryService;
    private final PaymentService paymentService;
    private final ShippingService shippingService;

    public SagaPatternController(SagaOrchestratorService orchestratorService,
                                 InventoryService inventoryService,
                                 PaymentService paymentService,
                                 ShippingService shippingService) {
        this.orchestratorService = orchestratorService;
        this.inventoryService = inventoryService;
        this.paymentService = paymentService;
        this.shippingService = shippingService;
    }

    @GetMapping("/")
    public String home(Model model) {
        model.addAttribute("inventory", inventoryService.inventorySnapshot());
        model.addAttribute("sagas", orchestratorService.listSagas());
        model.addAttribute("events", orchestratorService.recentEvents());
        model.addAttribute("metrics", orchestratorService.metrics());
        model.addAttribute("successfulCharges", paymentService.successfulChargeCount());
        model.addAttribute("shipments", shippingService.shipmentCount());
        return "index";
    }

    @PostMapping("/checkouts")
    public String createCheckout(@RequestParam String customerId,
                                 @RequestParam String sku,
                                 @RequestParam int quantity,
                                 @RequestParam BigDecimal amount,
                                 @RequestParam(defaultValue = "false") boolean simulatePaymentFailure,
                                 RedirectAttributes redirectAttributes) {
        SagaView saga = orchestratorService.startCheckout(new CheckoutRequest(
                customerId,
                sku,
                quantity,
                amount,
                simulatePaymentFailure
        ));
        redirectAttributes.addFlashAttribute("message",
                "Started " + saga.sagaId() + " for " + saga.orderId() + ". Watch the event timeline update.");
        return "redirect:/";
    }

    @PostMapping("/api/checkouts")
    @ResponseBody
    public ResponseEntity<SagaView> apiCreateCheckout(@Valid @RequestBody CheckoutRequest request) {
        SagaView saga = orchestratorService.startCheckout(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(saga);
    }

    @GetMapping("/api/sagas")
    @ResponseBody
    public List<SagaView> apiListSagas() {
        return orchestratorService.listSagas();
    }

    @GetMapping("/api/sagas/{sagaId}")
    @ResponseBody
    public ResponseEntity<SagaView> apiGetSaga(@PathVariable String sagaId) {
        SagaView saga = orchestratorService.getSaga(sagaId);
        return saga == null ? ResponseEntity.notFound().build() : ResponseEntity.ok(saga);
    }

    @GetMapping("/api/events")
    @ResponseBody
    public List<SagaEventView> apiEvents() {
        return orchestratorService.recentEvents();
    }

    @GetMapping("/api/inventory")
    @ResponseBody
    public Map<String, Integer> apiInventory() {
        return inventoryService.inventorySnapshot();
    }

    @GetMapping("/api/metrics")
    @ResponseBody
    public SagaMetrics apiMetrics() {
        return orchestratorService.metrics();
    }
}
