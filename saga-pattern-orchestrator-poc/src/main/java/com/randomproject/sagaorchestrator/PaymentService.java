package com.randomproject.sagaorchestrator;

import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class PaymentService {
    private final Map<String, Instant> successfulCharges = new ConcurrentHashMap<>();
    private final SagaMessagePublisher publisher;

    public PaymentService(SagaMessagePublisher publisher) {
        this.publisher = publisher;
    }

    @RabbitListener(queues = MessagingConfig.PAYMENT_COMMAND_QUEUE)
    public void onPaymentCommand(SagaMessage message) {
        if (message.getType() != SagaMessageType.CHARGE_CARD_COMMAND) {
            return;
        }

        if (message.isSimulatePaymentFailure()) {
            SagaMessage failed = copy(message, SagaMessageType.CARD_CHARGE_FAILED_EVENT, "Card authorization declined");
            publisher.publish("saga.event.payment.card-charge-failed", failed,
                    "Payment failed for order " + message.getOrderId());
            return;
        }

        successfulCharges.put(message.getSagaId(), Instant.now());
        SagaMessage charged = copy(message, SagaMessageType.CARD_CHARGED_EVENT, null);
        publisher.publish("saga.event.payment.card-charged", charged,
                "Payment charged $" + message.getAmount() + " for order " + message.getOrderId());
    }

    public int successfulChargeCount() {
        return successfulCharges.size();
    }

    private SagaMessage copy(SagaMessage original, SagaMessageType type, String failureReason) {
        return new SagaMessage(
                original.getSagaId(),
                original.getOrderId(),
                original.getCustomerId(),
                original.getSku(),
                original.getQuantity(),
                original.getAmount(),
                original.isSimulatePaymentFailure(),
                type,
                failureReason,
                Instant.now()
        );
    }
}
