package com.randomproject.paymentsystem;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayDeque;
import java.util.Comparator;
import java.util.Deque;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Pattern;

@Service
public class PaymentSystemService {
    private static final Set<String> SUPPORTED_CURRENCIES = Set.of("USD", "EUR", "GBP", "INR");
    private static final Pattern ID_PATTERN = Pattern.compile("^[A-Za-z0-9._:-]+$");
    private final Map<String, Payment> payments = new ConcurrentHashMap<>();
    private final Map<String, String> idempotencyIndex = new ConcurrentHashMap<>();
    private final Deque<PaymentEvent> events = new ArrayDeque<>();
    private final AtomicLong paymentSequence = new AtomicLong(1000);
    private final AtomicLong eventSequence = new AtomicLong(5000);
    private final int maxEvents;

    public PaymentSystemService(@Value("${payment.max-events:120}") int maxEvents) {
        this.maxEvents = maxEvents;
    }

    public synchronized PaymentCreateResult createPayment(PaymentRequest request) {
        String merchantId = normalizeId("Merchant", request.merchantId());
        String customerId = normalizeId("Customer", request.customerId());
        BigDecimal amount = normalizeAmount(request.amount());
        String currency = normalizeCurrency(request.currency());
        String paymentMethod = normalizeMethod(request.paymentMethod());
        String idempotencyKey = normalizeOptionalId("Idempotency key", request.idempotencyKey());
        boolean captureNow = request.captureNow() != null && request.captureNow();
        boolean simulateFailure = request.simulateFailure() != null && request.simulateFailure();

        if (StringUtils.hasText(idempotencyKey)) {
            String existingId = idempotencyIndex.get(idempotencyKey);
            if (existingId != null && payments.containsKey(existingId)) {
                Payment existing = payments.get(existingId);
                return new PaymentCreateResult(existing, true, "Idempotent replay: returned existing payment.");
            }
        }

        String paymentId = "pay_" + Long.toString(paymentSequence.incrementAndGet(), 36);
        LocalDateTime now = LocalDateTime.now();
        Payment payment = new Payment(
                paymentId,
                merchantId,
                customerId,
                amount,
                currency,
                paymentMethod,
                idempotencyKey,
                PaymentStatus.AUTHORIZED,
                now
        );

        if (simulateFailure) {
            payment.markFailed("Simulated issuer decline", now);
            addEvent(paymentId, "FAILED", "Payment declined by issuer", now);
        } else {
            payment.markAuthorized(now);
            addEvent(paymentId, "AUTHORIZED", "Authorized " + formatAmount(amount, currency), now);
            if (captureNow) {
                LocalDateTime captureTime = LocalDateTime.now();
                payment.markCaptured(captureTime);
                addEvent(paymentId, "CAPTURED", "Captured " + formatAmount(amount, currency), captureTime);
            }
        }

        payments.put(paymentId, payment);
        if (StringUtils.hasText(idempotencyKey)) {
            idempotencyIndex.put(idempotencyKey, paymentId);
        }
        return new PaymentCreateResult(payment, false, "Created payment " + paymentId + ".");
    }

    public synchronized PaymentActionResult capturePayment(String paymentId) {
        Payment payment = payments.get(paymentId);
        if (payment == null) {
            throw new IllegalArgumentException("Payment not found: " + paymentId);
        }
        if (payment.getStatus() == PaymentStatus.CAPTURED) {
            return new PaymentActionResult(payment, false, "Payment already captured.");
        }
        if (payment.getStatus() != PaymentStatus.AUTHORIZED) {
            throw new IllegalStateException("Only authorized payments can be captured.");
        }
        LocalDateTime now = LocalDateTime.now();
        payment.markCaptured(now);
        addEvent(paymentId, "CAPTURED", "Captured " + formatAmount(payment.getAmount(), payment.getCurrency()), now);
        return new PaymentActionResult(payment, true, "Captured payment " + paymentId + ".");
    }

    public synchronized PaymentActionResult refundPayment(String paymentId) {
        Payment payment = payments.get(paymentId);
        if (payment == null) {
            throw new IllegalArgumentException("Payment not found: " + paymentId);
        }
        if (payment.getStatus() == PaymentStatus.REFUNDED) {
            return new PaymentActionResult(payment, false, "Payment already refunded.");
        }
        if (payment.getStatus() != PaymentStatus.CAPTURED) {
            throw new IllegalStateException("Only captured payments can be refunded.");
        }
        LocalDateTime now = LocalDateTime.now();
        payment.markRefunded(now);
        addEvent(paymentId, "REFUNDED", "Refunded " + formatAmount(payment.getAmount(), payment.getCurrency()), now);
        return new PaymentActionResult(payment, true, "Refunded payment " + paymentId + ".");
    }

    public synchronized Payment getPayment(String paymentId) {
        return payments.get(paymentId);
    }

    public synchronized List<Payment> listPayments() {
        return payments.values().stream()
                .sorted(Comparator.comparing(Payment::getCreatedAt).reversed())
                .toList();
    }

    public synchronized List<PaymentEvent> listEvents() {
        return events.stream()
                .sorted(Comparator.comparing(PaymentEvent::createdAt).reversed())
                .toList();
    }

    public synchronized PaymentStats stats() {
        int total = payments.size();
        int authorized = 0;
        int captured = 0;
        int refunded = 0;
        int failed = 0;
        BigDecimal authorizedAmount = BigDecimal.ZERO;
        BigDecimal capturedAmount = BigDecimal.ZERO;
        BigDecimal refundedAmount = BigDecimal.ZERO;

        for (Payment payment : payments.values()) {
            switch (payment.getStatus()) {
                case AUTHORIZED -> {
                    authorized++;
                    authorizedAmount = authorizedAmount.add(payment.getAmount());
                }
                case CAPTURED -> {
                    captured++;
                    capturedAmount = capturedAmount.add(payment.getAmount());
                }
                case REFUNDED -> {
                    refunded++;
                    refundedAmount = refundedAmount.add(payment.getAmount());
                }
                case FAILED -> failed++;
            }
        }

        return new PaymentStats(
                total,
                authorized,
                captured,
                refunded,
                failed,
                authorizedAmount,
                capturedAmount,
                refundedAmount
        );
    }

    public Set<String> supportedCurrencies() {
        return SUPPORTED_CURRENCIES;
    }

    private void addEvent(String paymentId, String type, String message, LocalDateTime when) {
        String eventId = "evt_" + Long.toString(eventSequence.incrementAndGet(), 36);
        events.addFirst(new PaymentEvent(eventId, paymentId, type, message, when));
        while (events.size() > maxEvents) {
            events.removeLast();
        }
    }

    private String normalizeId(String label, String value) {
        if (!StringUtils.hasText(value)) {
            throw new IllegalArgumentException(label + " cannot be empty.");
        }
        String trimmed = value.trim();
        if (!ID_PATTERN.matcher(trimmed).matches()) {
            throw new IllegalArgumentException(label + " must use letters, numbers, '.', '-', '_', or ':'.");
        }
        return trimmed;
    }

    private String normalizeOptionalId(String label, String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return normalizeId(label, value);
    }

    private BigDecimal normalizeAmount(BigDecimal amount) {
        if (amount == null) {
            throw new IllegalArgumentException("Amount is required.");
        }
        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Amount must be greater than 0.");
        }
        return amount.setScale(2, RoundingMode.HALF_UP);
    }

    private String normalizeCurrency(String currency) {
        if (!StringUtils.hasText(currency)) {
            throw new IllegalArgumentException("Currency is required.");
        }
        String normalized = currency.trim().toUpperCase(Locale.US);
        if (!SUPPORTED_CURRENCIES.contains(normalized)) {
            throw new IllegalArgumentException("Currency must be one of: " + String.join(", ", SUPPORTED_CURRENCIES));
        }
        return normalized;
    }

    private String normalizeMethod(String method) {
        if (!StringUtils.hasText(method)) {
            throw new IllegalArgumentException("Payment method is required.");
        }
        return method.trim();
    }

    private String formatAmount(BigDecimal amount, String currency) {
        return currency + " " + amount.setScale(2, RoundingMode.HALF_UP);
    }
}
