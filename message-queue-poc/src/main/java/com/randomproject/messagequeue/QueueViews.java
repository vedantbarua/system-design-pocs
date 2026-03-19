package com.randomproject.messagequeue;

import java.time.Instant;
import java.util.List;

record QueueConfigSnapshot(
        int defaultPartitionCount,
        int maxPartitions,
        int maxDeliveryAttempts) {
}

record QueueSnapshot(
        QueueConfigSnapshot config,
        int topicCount,
        int groupCount,
        int queuedMessageCount,
        int deadLetterCount,
        List<TopicView> topics,
        List<ConsumerGroupView> consumerGroups,
        List<DeadLetterMessageView> deadLetters,
        List<QueueEvent> events) {
}

record TopicView(
        String topic,
        int partitions,
        int totalMessages,
        List<PartitionView> partitionViews) {
}

record PartitionView(
        int partition,
        long nextOffset,
        int messageCount,
        List<MessageSummaryView> recentMessages) {
}

record MessageSummaryView(
        long offset,
        String key,
        String payloadPreview,
        Instant producedAt) {
}

record ConsumerGroupView(
        String topic,
        String groupId,
        long totalLag,
        int inflightCount,
        List<PartitionLagView> partitionLags) {
}

record PartitionLagView(
        int partition,
        long nextOffset,
        long endOffset,
        long lag,
        PolledMessageView inflightMessage) {
}

record PollResponse(
        String topic,
        String groupId,
        int deliveredCount,
        long totalLag,
        List<PolledMessageView> messages) {
}

record PolledMessageView(
        String topic,
        String groupId,
        int partition,
        long offset,
        String key,
        String payload,
        int deliveryAttempt,
        boolean redelivery,
        Instant producedAt) {
}

record PublishResult(
        String topic,
        int partition,
        long offset,
        String key,
        Instant producedAt) {
}

record AckResult(
        String topic,
        String groupId,
        int partition,
        long ackedOffset,
        long nextOffset,
        long remainingLag) {
}

record RetryResult(
        String topic,
        String groupId,
        int partition,
        long offset,
        int deliveryAttempt,
        boolean deadLettered,
        String reason) {
}

record ResetOffsetResult(
        String topic,
        String groupId,
        int partition,
        long nextOffset,
        long remainingLag) {
}

record DeadLetterMessageView(
        String topic,
        String groupId,
        int partition,
        long offset,
        String key,
        String payloadPreview,
        int deliveryAttempts,
        String reason,
        Instant deadLetteredAt) {
}

record QueueEvent(
        String type,
        String message,
        Instant at) {
}
