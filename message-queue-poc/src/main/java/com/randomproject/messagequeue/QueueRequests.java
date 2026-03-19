package com.randomproject.messagequeue;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

record CreateTopicRequest(
        @NotBlank @Size(max = 40) String topic,
        @Min(1) @Max(8) Integer partitions) {
}

record PublishMessageRequest(
        @NotBlank @Size(max = 40) String topic,
        @Size(max = 80) String key,
        @NotBlank @Size(max = 2000) String payload,
        @Min(0) Integer partition) {
}

record PollRequest(
        @NotBlank @Size(max = 40) String topic,
        @NotBlank @Size(max = 40) String groupId,
        @Min(1) @Max(16) Integer maxMessages) {
}

record AckRequest(
        @NotBlank @Size(max = 40) String topic,
        @NotBlank @Size(max = 40) String groupId,
        @Min(0) Integer partition,
        @Min(0) Long offset) {
}

record RetryRequest(
        @NotBlank @Size(max = 40) String topic,
        @NotBlank @Size(max = 40) String groupId,
        @Min(0) Integer partition,
        @Min(0) Long offset,
        @Size(max = 120) String reason) {
}

record ResetOffsetRequest(
        @NotBlank @Size(max = 40) String topic,
        @NotBlank @Size(max = 40) String groupId,
        @Min(0) Integer partition,
        @Min(0) Long nextOffset) {
}
