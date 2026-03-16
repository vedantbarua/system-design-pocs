package com.randomproject.sagaorchestrator;

import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class MessagingConfig {
    public static final String EXCHANGE = "saga.exchange";
    public static final String INVENTORY_COMMAND_QUEUE = "saga.inventory.commands";
    public static final String PAYMENT_COMMAND_QUEUE = "saga.payment.commands";
    public static final String SHIPPING_COMMAND_QUEUE = "saga.shipping.commands";
    public static final String ORCHESTRATOR_EVENT_QUEUE = "saga.orchestrator.events";

    @Bean
    TopicExchange sagaExchange() {
        return new TopicExchange(EXCHANGE);
    }

    @Bean
    Queue inventoryCommandQueue() {
        return new Queue(INVENTORY_COMMAND_QUEUE, false);
    }

    @Bean
    Queue paymentCommandQueue() {
        return new Queue(PAYMENT_COMMAND_QUEUE, false);
    }

    @Bean
    Queue shippingCommandQueue() {
        return new Queue(SHIPPING_COMMAND_QUEUE, false);
    }

    @Bean
    Queue orchestratorEventQueue() {
        return new Queue(ORCHESTRATOR_EVENT_QUEUE, false);
    }

    @Bean
    Binding inventoryReserveBinding() {
        return BindingBuilder.bind(inventoryCommandQueue()).to(sagaExchange()).with("saga.command.inventory.#");
    }

    @Bean
    Binding paymentChargeBinding() {
        return BindingBuilder.bind(paymentCommandQueue()).to(sagaExchange()).with("saga.command.payment.#");
    }

    @Bean
    Binding shippingBinding() {
        return BindingBuilder.bind(shippingCommandQueue()).to(sagaExchange()).with("saga.command.shipping.#");
    }

    @Bean
    Binding orchestratorEventBinding() {
        return BindingBuilder.bind(orchestratorEventQueue()).to(sagaExchange()).with("saga.event.#");
    }

    @Bean
    Jackson2JsonMessageConverter jackson2JsonMessageConverter() {
        return new Jackson2JsonMessageConverter();
    }
}
