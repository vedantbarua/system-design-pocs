package com.randomproject.sagaorchestrator;

import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class InventoryService {
    private final Map<String, Integer> availableStock = new ConcurrentHashMap<>();
    private final Map<String, Integer> reservations = new ConcurrentHashMap<>();
    private final SagaMessagePublisher publisher;

    public InventoryService(SagaMessagePublisher publisher) {
        this.publisher = publisher;
        availableStock.put("LAPTOP-15", 5);
        availableStock.put("HEADPHONES-02", 12);
        availableStock.put("BOOK-42", 40);
    }

    @RabbitListener(queues = MessagingConfig.INVENTORY_COMMAND_QUEUE)
    public void onInventoryCommand(SagaMessage message) {
        if (message.getType() == SagaMessageType.RESERVE_STOCK_COMMAND) {
            reserve(message);
        } else if (message.getType() == SagaMessageType.RELEASE_STOCK_COMMAND) {
            release(message);
        }
    }

    public Map<String, Integer> inventorySnapshot() {
        Map<String, Integer> ordered = new LinkedHashMap<>();
        availableStock.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .forEach(entry -> ordered.put(entry.getKey(), entry.getValue()));
        return ordered;
    }

    private void reserve(SagaMessage message) {
        synchronized (availableStock) {
            int available = availableStock.getOrDefault(message.getSku(), 0);
            if (available < message.getQuantity()) {
                SagaMessage failed = copy(message, SagaMessageType.STOCK_RESERVATION_FAILED_EVENT,
                        "Not enough stock for " + message.getSku());
                publisher.publish("saga.event.inventory.stock-reservation-failed", failed,
                        "Inventory could not reserve " + message.getQuantity() + " units of " + message.getSku());
                return;
            }
            availableStock.put(message.getSku(), available - message.getQuantity());
            reservations.put(message.getSagaId(), message.getQuantity());
        }

        SagaMessage success = copy(message, SagaMessageType.STOCK_RESERVED_EVENT, null);
        publisher.publish("saga.event.inventory.stock-reserved", success,
                "Inventory reserved " + message.getQuantity() + " units of " + message.getSku());
    }

    private void release(SagaMessage message) {
        Integer reservedQty;
        synchronized (availableStock) {
            reservedQty = reservations.remove(message.getSagaId());
            if (reservedQty == null) {
                reservedQty = 0;
            } else {
                availableStock.merge(message.getSku(), reservedQty, Integer::sum);
            }
        }

        SagaMessage released = copy(message, SagaMessageType.STOCK_RELEASED_EVENT, null);
        publisher.publish("saga.event.inventory.stock-released", released,
                "Inventory released " + reservedQty + " units of " + message.getSku());
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
                java.time.Instant.now()
        );
    }
}
