package com.randomproject.sagaorchestrator;

import jakarta.validation.Valid;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Service;
import org.springframework.validation.annotation.Validated;

import java.util.List;
import java.util.UUID;

@Service
@Validated
public class SagaOrchestratorService {
    private final SagaStore sagaStore;
    private final SagaMessagePublisher publisher;

    public SagaOrchestratorService(SagaStore sagaStore, SagaMessagePublisher publisher) {
        this.sagaStore = sagaStore;
        this.publisher = publisher;
    }

    public SagaView startCheckout(@Valid CheckoutRequest request) {
        String sagaId = "saga-" + UUID.randomUUID().toString().substring(0, 8);
        String orderId = "order-" + UUID.randomUUID().toString().substring(0, 8);
        OrderSaga saga = new OrderSaga(
                sagaId,
                orderId,
                request.customerId(),
                request.sku(),
                request.quantity(),
                request.amount(),
                request.simulatePaymentFailure()
        );
        sagaStore.save(saga);

        SagaMessage command = SagaMessage.forSaga(saga, SagaMessageType.RESERVE_STOCK_COMMAND, null);
        publisher.publish("saga.command.inventory.reserve-stock", command,
                "Orchestrator started " + sagaId + " and requested stock reservation");
        return SagaView.from(saga);
    }

    @RabbitListener(queues = MessagingConfig.ORCHESTRATOR_EVENT_QUEUE)
    public void onSagaEvent(SagaMessage message) {
        OrderSaga saga = sagaStore.get(message.getSagaId());
        if (saga == null) {
            return;
        }

        synchronized (saga) {
            switch (message.getType()) {
                case STOCK_RESERVED_EVENT -> {
                    saga.stockReserved();
                    publisher.publish("saga.command.payment.charge-card",
                            SagaMessage.forSaga(saga, SagaMessageType.CHARGE_CARD_COMMAND, null),
                            "Orchestrator requested card charge for " + saga.getOrderId());
                }
                case STOCK_RESERVATION_FAILED_EVENT -> saga.stockReservationFailed(message.getFailureReason());
                case CARD_CHARGED_EVENT -> {
                    saga.cardCharged();
                    publisher.publish("saga.command.shipping.ship-package",
                            SagaMessage.forSaga(saga, SagaMessageType.SHIP_PACKAGE_COMMAND, null),
                            "Orchestrator requested shipment for " + saga.getOrderId());
                }
                case CARD_CHARGE_FAILED_EVENT -> {
                    saga.cardChargeFailed(message.getFailureReason());
                    publisher.publish("saga.command.inventory.release-stock",
                            SagaMessage.forSaga(saga, SagaMessageType.RELEASE_STOCK_COMMAND, message.getFailureReason()),
                            "Orchestrator triggered compensation to release reserved stock");
                }
                case STOCK_RELEASED_EVENT -> saga.stockReleased();
                case PACKAGE_SHIPPED_EVENT -> saga.packageShipped();
                default -> {
                }
            }
        }
    }

    public List<SagaView> listSagas() {
        return sagaStore.listSagas();
    }

    public List<SagaEventView> recentEvents() {
        return sagaStore.recentEvents();
    }

    public SagaMetrics metrics() {
        return sagaStore.metrics();
    }

    public SagaView getSaga(String sagaId) {
        OrderSaga saga = sagaStore.get(sagaId);
        return saga == null ? null : SagaView.from(saga);
    }
}
