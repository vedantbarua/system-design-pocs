package com.randomproject.sagaorchestrator;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentLinkedDeque;

@Component
public class SagaStore {
    private static final int MAX_EVENTS = 80;

    private final Map<String, OrderSaga> sagas = new ConcurrentHashMap<>();
    private final Deque<SagaEventView> events = new ConcurrentLinkedDeque<>();

    public void save(OrderSaga saga) {
        sagas.put(saga.getSagaId(), saga);
    }

    public OrderSaga get(String sagaId) {
        return sagas.get(sagaId);
    }

    public List<SagaView> listSagas() {
        return sagas.values().stream()
                .sorted(Comparator.comparing(OrderSaga::getCreatedAt).reversed())
                .map(SagaView::from)
                .toList();
    }

    public void appendEvent(String routingKey, SagaMessage message, String summary) {
        events.addFirst(new SagaEventView(
                message.getOccurredAt(),
                routingKey,
                message.getType(),
                message.getSagaId(),
                summary
        ));
        while (events.size() > MAX_EVENTS) {
            events.pollLast();
        }
    }

    public List<SagaEventView> recentEvents() {
        return new ArrayList<>(events);
    }

    public SagaMetrics metrics() {
        List<OrderSaga> snapshot = new ArrayList<>(sagas.values());
        long completed = snapshot.stream().filter(s -> s.getStatus() == SagaStatus.COMPLETED).count();
        long compensated = snapshot.stream().filter(s -> s.getStatus() == SagaStatus.COMPENSATED).count();
        return new SagaMetrics(snapshot.size(), completed, compensated);
    }
}
