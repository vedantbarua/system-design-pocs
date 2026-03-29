package com.randomproject.eventsourcingcqrs;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

record CreateOrderRequest(
        @NotBlank @Size(max = 40) String orderId,
        @NotBlank @Size(max = 40) String customerId,
        @NotNull @Min(0) Long expectedVersion,
        @Size(max = 80) String commandId) {
}

record AddItemRequest(
        @NotBlank @Size(max = 40) String orderId,
        @NotBlank @Size(max = 40) String sku,
        @NotNull @Min(1) Integer quantity,
        @NotNull @DecimalMin(value = "0.01") Double unitPrice,
        @NotNull @Min(0) Long expectedVersion,
        @Size(max = 80) String commandId) {
}

record ConfirmOrderRequest(
        @NotBlank @Size(max = 40) String orderId,
        @NotNull @Min(0) Long expectedVersion,
        @Size(max = 80) String commandId) {
}

record CancelOrderRequest(
        @NotBlank @Size(max = 40) String orderId,
        @NotNull @Min(0) Long expectedVersion,
        @Size(max = 120) String reason,
        @Size(max = 80) String commandId) {
}

record RebuildProjectionRequest(
        @Size(max = 80) String trigger) {
}
