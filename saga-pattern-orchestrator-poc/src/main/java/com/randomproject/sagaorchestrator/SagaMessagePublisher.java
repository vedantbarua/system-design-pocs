package com.randomproject.sagaorchestrator;

import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

@Component
public class SagaMessagePublisher {
    private final RabbitTemplate rabbitTemplate;
    private final SagaStore sagaStore;

    public SagaMessagePublisher(RabbitTemplate rabbitTemplate, SagaStore sagaStore) {
        this.rabbitTemplate = rabbitTemplate;
        this.sagaStore = sagaStore;
    }

    public void publish(String routingKey, SagaMessage message, String summary) {
        sagaStore.appendEvent(routingKey, message, summary);
        rabbitTemplate.convertAndSend(MessagingConfig.EXCHANGE, routingKey, message);
    }
}
