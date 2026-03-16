package com.randomproject.sagaorchestrator;

import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class ShippingService {
    private final Map<String, Instant> shipments = new ConcurrentHashMap<>();
    private final SagaMessagePublisher publisher;

    public ShippingService(SagaMessagePublisher publisher) {
        this.publisher = publisher;
    }

    @RabbitListener(queues = MessagingConfig.SHIPPING_COMMAND_QUEUE)
    public void onShippingCommand(SagaMessage message) {
        if (message.getType() != SagaMessageType.SHIP_PACKAGE_COMMAND) {
            return;
        }

        shipments.put(message.getSagaId(), Instant.now());
        SagaMessage shipped = copy(message, SagaMessageType.PACKAGE_SHIPPED_EVENT, null);
        publisher.publish("saga.event.shipping.package-shipped", shipped,
                "Shipping dispatched package for order " + message.getOrderId());
    }

    public int shipmentCount() {
        return shipments.size();
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
