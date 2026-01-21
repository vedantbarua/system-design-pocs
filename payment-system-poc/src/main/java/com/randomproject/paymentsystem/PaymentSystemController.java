package com.randomproject.paymentsystem;

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

@Controller
public class PaymentSystemController {
    private final PaymentSystemService service;

    public PaymentSystemController(PaymentSystemService service) {
        this.service = service;
    }

    @GetMapping("/")
    public String home(Model model) {
        model.addAttribute("payments", service.listPayments());
        model.addAttribute("stats", service.stats());
        model.addAttribute("events", service.listEvents());
        model.addAttribute("currencies", service.supportedCurrencies());
        return "index";
    }

    @PostMapping("/payments")
    public String createPayment(@RequestParam("merchantId") String merchantId,
                                @RequestParam("customerId") String customerId,
                                @RequestParam("amount") BigDecimal amount,
                                @RequestParam("currency") String currency,
                                @RequestParam("paymentMethod") String paymentMethod,
                                @RequestParam(value = "idempotencyKey", required = false) String idempotencyKey,
                                @RequestParam(value = "captureNow", defaultValue = "false") boolean captureNow,
                                @RequestParam(value = "simulateFailure", defaultValue = "false") boolean simulateFailure,
                                RedirectAttributes redirectAttributes) {
        try {
            PaymentCreateResult result = service.createPayment(new PaymentRequest(
                    merchantId,
                    customerId,
                    amount,
                    currency,
                    paymentMethod,
                    idempotencyKey,
                    captureNow,
                    simulateFailure
            ));
            redirectAttributes.addFlashAttribute("message", result.message());
            redirectAttributes.addFlashAttribute("highlightPaymentId", result.payment().getId());
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/payments/{paymentId}/capture")
    public String capture(@PathVariable String paymentId, RedirectAttributes redirectAttributes) {
        try {
            PaymentActionResult result = service.capturePayment(paymentId);
            redirectAttributes.addFlashAttribute("message", result.message());
            redirectAttributes.addFlashAttribute("highlightPaymentId", paymentId);
        } catch (IllegalArgumentException | IllegalStateException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/payments/capture")
    public String captureById(@RequestParam("paymentId") String paymentId, RedirectAttributes redirectAttributes) {
        return capture(paymentId, redirectAttributes);
    }

    @PostMapping("/payments/{paymentId}/refund")
    public String refund(@PathVariable String paymentId, RedirectAttributes redirectAttributes) {
        try {
            PaymentActionResult result = service.refundPayment(paymentId);
            redirectAttributes.addFlashAttribute("message", result.message());
            redirectAttributes.addFlashAttribute("highlightPaymentId", paymentId);
        } catch (IllegalArgumentException | IllegalStateException ex) {
            redirectAttributes.addFlashAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/payments/refund")
    public String refundById(@RequestParam("paymentId") String paymentId, RedirectAttributes redirectAttributes) {
        return refund(paymentId, redirectAttributes);
    }

    @PostMapping("/api/payments")
    @ResponseBody
    public ResponseEntity<PaymentResponse> apiCreate(@Valid @RequestBody PaymentRequest request) {
        try {
            PaymentCreateResult result = service.createPayment(request);
            PaymentResponse response = PaymentResponse.from(result.payment(), result.idempotent());
            HttpStatus status = result.idempotent() ? HttpStatus.OK : HttpStatus.CREATED;
            return ResponseEntity.status(status).body(response);
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/payments")
    @ResponseBody
    public List<PaymentResponse> apiList() {
        return service.listPayments().stream()
                .map(payment -> PaymentResponse.from(payment, false))
                .toList();
    }

    @GetMapping("/api/payments/{paymentId}")
    @ResponseBody
    public ResponseEntity<PaymentResponse> apiGet(@PathVariable String paymentId) {
        Payment payment = service.getPayment(paymentId);
        if (payment == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(PaymentResponse.from(payment, false));
    }

    @PostMapping("/api/payments/{paymentId}/capture")
    @ResponseBody
    public ResponseEntity<PaymentResponse> apiCapture(@PathVariable String paymentId) {
        try {
            PaymentActionResult result = service.capturePayment(paymentId);
            return ResponseEntity.ok(PaymentResponse.from(result.payment(), false));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.notFound().build();
        } catch (IllegalStateException ex) {
            return ResponseEntity.status(HttpStatus.CONFLICT).build();
        }
    }

    @PostMapping("/api/payments/{paymentId}/refund")
    @ResponseBody
    public ResponseEntity<PaymentResponse> apiRefund(@PathVariable String paymentId) {
        try {
            PaymentActionResult result = service.refundPayment(paymentId);
            return ResponseEntity.ok(PaymentResponse.from(result.payment(), false));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.notFound().build();
        } catch (IllegalStateException ex) {
            return ResponseEntity.status(HttpStatus.CONFLICT).build();
        }
    }

    @GetMapping("/api/events")
    @ResponseBody
    public List<PaymentEvent> apiEvents() {
        return service.listEvents();
    }

    @GetMapping("/api/stats")
    @ResponseBody
    public PaymentStats apiStats() {
        return service.stats();
    }
}
