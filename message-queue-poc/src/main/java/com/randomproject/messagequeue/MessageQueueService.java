package com.randomproject.messagequeue;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.LongSupplier;
import java.util.regex.Pattern;

@Service
public class MessageQueueService {
    private static final Pattern ID_PATTERN = Pattern.compile("^[A-Za-z0-9._:-]+$");
    private static final int MAX_EVENTS = 20;
    private static final int RECENT_MESSAGES_PER_PARTITION = 6;

    private final Map<String, TopicState> topics = new LinkedHashMap<>();
    private final Map<String, GroupTopicState> groupStates = new LinkedHashMap<>();
    private final Deque<DeadLetterEntry> deadLetters = new ArrayDeque<>();
    private final Deque<QueueEvent> events = new ArrayDeque<>();
    private final int defaultPartitionCount;
    private final int maxPartitions;
    private final int maxDeliveryAttempts;
    private final LongSupplier timeSource;

    @Autowired
    public MessageQueueService(
            @Value("${queue.default-partitions:3}") int defaultPartitionCount,
            @Value("${queue.max-partitions:8}") int maxPartitions,
            @Value("${queue.max-delivery-attempts:3}") int maxDeliveryAttempts) {
        this(defaultPartitionCount, maxPartitions, maxDeliveryAttempts, System::currentTimeMillis);
    }

    MessageQueueService(
            int defaultPartitionCount,
            int maxPartitions,
            int maxDeliveryAttempts,
            LongSupplier timeSource) {
        if (defaultPartitionCount < 1 || maxPartitions < defaultPartitionCount) {
            throw new IllegalArgumentException("Partition configuration is invalid.");
        }
        if (maxDeliveryAttempts < 1) {
            throw new IllegalArgumentException("max-delivery-attempts must be at least 1.");
        }
        this.defaultPartitionCount = defaultPartitionCount;
        this.maxPartitions = maxPartitions;
        this.maxDeliveryAttempts = maxDeliveryAttempts;
        this.timeSource = timeSource;
    }

    public synchronized QueueConfigSnapshot configSnapshot() {
        return new QueueConfigSnapshot(defaultPartitionCount, maxPartitions, maxDeliveryAttempts);
    }

    public synchronized QueueSnapshot snapshot() {
        List<TopicView> topicViews = topics.values().stream()
                .map(this::toTopicView)
                .toList();
        List<ConsumerGroupView> consumerViews = groupStates.values().stream()
                .sorted(Comparator.comparing(GroupTopicState::topic).thenComparing(GroupTopicState::groupId))
                .map(this::toConsumerGroupView)
                .toList();
        int queuedCount = topics.values().stream()
                .mapToInt(topic -> topic.partitions.stream().mapToInt(partition -> partition.messages.size()).sum())
                .sum();
        return new QueueSnapshot(
                configSnapshot(),
                topics.size(),
                groupStates.size(),
                queuedCount,
                deadLetters.size(),
                topicViews,
                consumerViews,
                deadLetters.stream().map(this::toDeadLetterView).limit(20).toList(),
                List.copyOf(events));
    }

    public synchronized TopicView createTopic(String topic, Integer partitions) {
        String normalizedTopic = normalizeId(topic, "topic");
        if (topics.containsKey(normalizedTopic)) {
            throw new IllegalArgumentException("Topic " + normalizedTopic + " already exists.");
        }
        int resolvedPartitions = partitions == null ? defaultPartitionCount : partitions;
        if (resolvedPartitions < 1 || resolvedPartitions > maxPartitions) {
            throw new IllegalArgumentException("Partition count must be between 1 and " + maxPartitions + ".");
        }
        TopicState topicState = new TopicState(normalizedTopic, resolvedPartitions);
        topics.put(normalizedTopic, topicState);
        addEvent("topic", "Created topic " + normalizedTopic + " with " + resolvedPartitions + " partitions.");
        return toTopicView(topicState);
    }

    public synchronized PublishResult publish(String topic, String key, String payload, Integer partition) {
        TopicState topicState = requireTopic(topic);
        String normalizedKey = normalizeOptionalKey(key);
        String normalizedPayload = normalizePayload(payload);
        PartitionState targetPartition = resolvePartition(topicState, normalizedKey, partition);
        long now = now();
        long offset = targetPartition.nextOffset++;
        MessageRecord message = new MessageRecord(offset, normalizedKey, normalizedPayload, now);
        targetPartition.messages.add(message);
        addEvent(
                "publish",
                "Published message to " + topicState.name + "[p" + targetPartition.partition + "] at offset " + offset + ".");
        return new PublishResult(topicState.name, targetPartition.partition, offset, normalizedKey, Instant.ofEpochMilli(now));
    }

    public synchronized PollResponse poll(String topic, String groupId, Integer maxMessages) {
        TopicState topicState = requireTopic(topic);
        GroupTopicState groupState = groupState(topicState.name, groupId);
        int limit = maxMessages == null ? 3 : maxMessages;
        if (limit < 1 || limit > 16) {
            throw new IllegalArgumentException("maxMessages must be between 1 and 16.");
        }
        List<PolledMessageView> deliveries = new ArrayList<>();
        if (topicState.partitions.isEmpty()) {
            return new PollResponse(topicState.name, groupState.groupId, 0, totalLag(groupState), deliveries);
        }
        int partitionCount = topicState.partitions.size();
        int startIndex = topicState.pollStartIndex;
        topicState.pollStartIndex = (topicState.pollStartIndex + 1) % partitionCount;
        for (int i = 0; i < partitionCount && deliveries.size() < limit; i++) {
            PartitionState partition = topicState.partitions.get((startIndex + i) % partitionCount);
            PartitionCursor cursor = groupState.partitionCursors.get(partition.partition);
            MessageRecord record = currentRecordForDelivery(partition, cursor).orElse(null);
            if (record == null) {
                continue;
            }
            boolean redelivery = cursor.inflight != null;
            int attempt = redelivery ? cursor.inflight.deliveryAttempt : 1;
            if (!redelivery) {
                cursor.inflight = new InflightDelivery(record.offset, 1, now(), null);
            } else {
                cursor.inflight.leasedAtMillis = now();
            }
            deliveries.add(toPolledMessageView(topicState.name, groupState.groupId, partition.partition, record, attempt, redelivery));
        }
        if (!deliveries.isEmpty()) {
            addEvent(
                    "poll",
                    "Delivered " + deliveries.size() + " message(s) to group " + groupState.groupId + " on topic " + topicState.name + ".");
        }
        return new PollResponse(topicState.name, groupState.groupId, deliveries.size(), totalLag(groupState), deliveries);
    }

    public synchronized AckResult ack(String topic, String groupId, Integer partition, Long offset) {
        TopicState topicState = requireTopic(topic);
        GroupTopicState groupState = groupState(topicState.name, groupId);
        PartitionState partitionState = requirePartition(topicState, partition);
        PartitionCursor cursor = groupState.partitionCursors.get(partitionState.partition);
        InflightDelivery inflight = requireInflight(cursor, offset);
        cursor.inflight = null;
        cursor.nextOffset = inflight.offset + 1;
        long remainingLag = lag(partitionState, cursor);
        addEvent(
                "ack",
                "Acked " + topicState.name + "[p" + partitionState.partition + "] offset " + inflight.offset + " for " + groupState.groupId + ".");
        return new AckResult(topicState.name, groupState.groupId, partitionState.partition, inflight.offset, cursor.nextOffset, remainingLag);
    }

    public synchronized RetryResult retry(String topic, String groupId, Integer partition, Long offset, String reason) {
        TopicState topicState = requireTopic(topic);
        GroupTopicState groupState = groupState(topicState.name, groupId);
        PartitionState partitionState = requirePartition(topicState, partition);
        PartitionCursor cursor = groupState.partitionCursors.get(partitionState.partition);
        InflightDelivery inflight = requireInflight(cursor, offset);
        int nextAttempt = inflight.deliveryAttempt + 1;
        String normalizedReason = normalizeReason(reason);
        if (nextAttempt > maxDeliveryAttempts) {
            MessageRecord record = requireRecord(partitionState, inflight.offset);
            deadLetters.addFirst(new DeadLetterEntry(
                    topicState.name,
                    groupState.groupId,
                    partitionState.partition,
                    record.offset,
                    record.key,
                    record.payload,
                    inflight.deliveryAttempt,
                    normalizedReason,
                    now()));
            cursor.inflight = null;
            cursor.nextOffset = inflight.offset + 1;
            trimDeadLetters();
            addEvent(
                    "dlq",
                    "Moved " + topicState.name + "[p" + partitionState.partition + "] offset " + inflight.offset + " to DLQ for " + groupState.groupId + ".");
            return new RetryResult(topicState.name, groupState.groupId, partitionState.partition, inflight.offset, inflight.deliveryAttempt, true, normalizedReason);
        }
        inflight.deliveryAttempt = nextAttempt;
        inflight.lastError = normalizedReason;
        inflight.leasedAtMillis = now();
        addEvent(
                "retry",
                "Scheduled redelivery for " + topicState.name + "[p" + partitionState.partition + "] offset " + inflight.offset + " attempt " + nextAttempt + ".");
        return new RetryResult(topicState.name, groupState.groupId, partitionState.partition, inflight.offset, nextAttempt, false, normalizedReason);
    }

    public synchronized ResetOffsetResult resetOffset(String topic, String groupId, Integer partition, Long nextOffset) {
        TopicState topicState = requireTopic(topic);
        GroupTopicState groupState = groupState(topicState.name, groupId);
        PartitionState partitionState = requirePartition(topicState, partition);
        long normalizedNextOffset = normalizeOffset(nextOffset, partitionState.messages.size());
        PartitionCursor cursor = groupState.partitionCursors.get(partitionState.partition);
        cursor.nextOffset = normalizedNextOffset;
        cursor.inflight = null;
        addEvent(
                "replay",
                "Reset " + groupState.groupId + " on " + topicState.name + "[p" + partitionState.partition + "] to offset " + normalizedNextOffset + ".");
        return new ResetOffsetResult(topicState.name, groupState.groupId, partitionState.partition, normalizedNextOffset, lag(partitionState, cursor));
    }

    private Optional<MessageRecord> currentRecordForDelivery(PartitionState partition, PartitionCursor cursor) {
        if (cursor.inflight != null) {
            return Optional.of(requireRecord(partition, cursor.inflight.offset));
        }
        if (cursor.nextOffset >= partition.messages.size()) {
            return Optional.empty();
        }
        return Optional.of(partition.messages.get((int) cursor.nextOffset));
    }

    private TopicView toTopicView(TopicState topic) {
        List<PartitionView> partitionViews = topic.partitions.stream()
                .map(partition -> new PartitionView(
                        partition.partition,
                        partition.nextOffset,
                        partition.messages.size(),
                        partition.messages.stream()
                                .skip(Math.max(0, partition.messages.size() - RECENT_MESSAGES_PER_PARTITION))
                                .map(record -> new MessageSummaryView(
                                        record.offset,
                                        record.key,
                                        preview(record.payload),
                                        Instant.ofEpochMilli(record.producedAtMillis)))
                                .toList()))
                .toList();
        int totalMessages = topic.partitions.stream().mapToInt(partition -> partition.messages.size()).sum();
        return new TopicView(topic.name, topic.partitions.size(), totalMessages, partitionViews);
    }

    private ConsumerGroupView toConsumerGroupView(GroupTopicState groupState) {
        TopicState topicState = topics.get(groupState.topic);
        List<PartitionLagView> lags = new ArrayList<>();
        long totalLag = 0L;
        int inflightCount = 0;
        for (PartitionState partition : topicState.partitions) {
            PartitionCursor cursor = groupState.partitionCursors.get(partition.partition);
            PolledMessageView inflightMessage = null;
            if (cursor.inflight != null) {
                inflightCount++;
                MessageRecord record = requireRecord(partition, cursor.inflight.offset);
                inflightMessage = toPolledMessageView(topicState.name, groupState.groupId, partition.partition, record, cursor.inflight.deliveryAttempt, cursor.inflight.deliveryAttempt > 1);
            }
            long partitionLag = lag(partition, cursor);
            totalLag += partitionLag;
            lags.add(new PartitionLagView(
                    partition.partition,
                    cursor.nextOffset,
                    partition.nextOffset,
                    partitionLag,
                    inflightMessage));
        }
        return new ConsumerGroupView(topicState.name, groupState.groupId, totalLag, inflightCount, lags);
    }

    private PolledMessageView toPolledMessageView(
            String topic,
            String groupId,
            int partition,
            MessageRecord record,
            int attempt,
            boolean redelivery) {
        return new PolledMessageView(
                topic,
                groupId,
                partition,
                record.offset,
                record.key,
                record.payload,
                attempt,
                redelivery,
                Instant.ofEpochMilli(record.producedAtMillis));
    }

    private DeadLetterMessageView toDeadLetterView(DeadLetterEntry entry) {
        return new DeadLetterMessageView(
                entry.topic,
                entry.groupId,
                entry.partition,
                entry.offset,
                entry.key,
                preview(entry.payload),
                entry.deliveryAttempts,
                entry.reason,
                Instant.ofEpochMilli(entry.deadLetteredAtMillis));
    }

    private TopicState requireTopic(String topic) {
        String normalizedTopic = normalizeId(topic, "topic");
        TopicState topicState = topics.get(normalizedTopic);
        if (topicState == null) {
            throw new IllegalArgumentException("Topic " + normalizedTopic + " does not exist.");
        }
        return topicState;
    }

    private PartitionState requirePartition(TopicState topicState, Integer partition) {
        if (partition == null || partition < 0 || partition >= topicState.partitions.size()) {
            throw new IllegalArgumentException("Partition must be between 0 and " + (topicState.partitions.size() - 1) + ".");
        }
        return topicState.partitions.get(partition);
    }

    private GroupTopicState groupState(String topic, String groupId) {
        String normalizedGroupId = normalizeId(groupId, "groupId");
        String stateKey = topic + "|" + normalizedGroupId;
        GroupTopicState existing = groupStates.get(stateKey);
        if (existing != null) {
            return existing;
        }
        TopicState topicState = topics.get(topic);
        Map<Integer, PartitionCursor> cursors = new LinkedHashMap<>();
        for (PartitionState partition : topicState.partitions) {
            cursors.put(partition.partition, new PartitionCursor());
        }
        GroupTopicState created = new GroupTopicState(topic, normalizedGroupId, cursors);
        groupStates.put(stateKey, created);
        addEvent("group", "Registered consumer group " + normalizedGroupId + " on topic " + topic + ".");
        return created;
    }

    private PartitionState resolvePartition(TopicState topicState, String key, Integer explicitPartition) {
        if (explicitPartition != null) {
            return requirePartition(topicState, explicitPartition);
        }
        if (key != null && !key.isBlank()) {
            int index = Math.floorMod(key.hashCode(), topicState.partitions.size());
            return topicState.partitions.get(index);
        }
        int index = topicState.publishCursor;
        topicState.publishCursor = (topicState.publishCursor + 1) % topicState.partitions.size();
        return topicState.partitions.get(index);
    }

    private InflightDelivery requireInflight(PartitionCursor cursor, Long offset) {
        if (offset == null || offset < 0) {
            throw new IllegalArgumentException("Offset must be non-negative.");
        }
        if (cursor.inflight == null || cursor.inflight.offset != offset) {
            throw new IllegalArgumentException("No in-flight delivery for offset " + offset + ".");
        }
        return cursor.inflight;
    }

    private MessageRecord requireRecord(PartitionState partitionState, long offset) {
        if (offset < 0 || offset >= partitionState.messages.size()) {
            throw new IllegalArgumentException("Offset " + offset + " is out of range.");
        }
        return partitionState.messages.get((int) offset);
    }

    private long totalLag(GroupTopicState groupState) {
        TopicState topicState = topics.get(groupState.topic);
        return topicState.partitions.stream()
                .mapToLong(partition -> lag(partition, groupState.partitionCursors.get(partition.partition)))
                .sum();
    }

    private long lag(PartitionState partition, PartitionCursor cursor) {
        return Math.max(0, partition.nextOffset - cursor.nextOffset);
    }

    private long normalizeOffset(Long offset, int messageCount) {
        if (offset == null || offset < 0 || offset > messageCount) {
            throw new IllegalArgumentException("nextOffset must be between 0 and " + messageCount + ".");
        }
        return offset;
    }

    private String normalizeId(String input, String fieldName) {
        if (input == null || input.isBlank()) {
            throw new IllegalArgumentException(fieldName + " is required.");
        }
        String normalized = input.trim();
        if (normalized.length() > 40) {
            throw new IllegalArgumentException(fieldName + " must be 40 characters or fewer.");
        }
        if (!ID_PATTERN.matcher(normalized).matches()) {
            throw new IllegalArgumentException(fieldName + " may use only letters, numbers, '.', '_', '-', or ':'.");
        }
        return normalized;
    }

    private String normalizeOptionalKey(String key) {
        if (key == null || key.isBlank()) {
            return null;
        }
        String normalized = key.trim();
        if (normalized.length() > 80) {
            throw new IllegalArgumentException("key must be 80 characters or fewer.");
        }
        if (!ID_PATTERN.matcher(normalized).matches()) {
            throw new IllegalArgumentException("key may use only letters, numbers, '.', '_', '-', or ':'.");
        }
        return normalized;
    }

    private String normalizePayload(String payload) {
        if (payload == null || payload.isBlank()) {
            throw new IllegalArgumentException("payload is required.");
        }
        String normalized = payload.trim();
        if (normalized.length() > 2000) {
            throw new IllegalArgumentException("payload must be 2000 characters or fewer.");
        }
        return normalized;
    }

    private String normalizeReason(String reason) {
        if (reason == null || reason.isBlank()) {
            return "consumer-error";
        }
        String normalized = reason.trim();
        return normalized.length() > 120 ? normalized.substring(0, 120) : normalized;
    }

    private String preview(String payload) {
        if (payload == null) {
            return "";
        }
        return payload.length() <= 60 ? payload : payload.substring(0, 57) + "...";
    }

    private long now() {
        return timeSource.getAsLong();
    }

    private void trimDeadLetters() {
        while (deadLetters.size() > 30) {
            deadLetters.removeLast();
        }
    }

    private void addEvent(String type, String message) {
        events.addFirst(new QueueEvent(type, message, Instant.ofEpochMilli(now())));
        while (events.size() > MAX_EVENTS) {
            events.removeLast();
        }
    }

    private static final class TopicState {
        private final String name;
        private final List<PartitionState> partitions;
        private int publishCursor;
        private int pollStartIndex;

        private TopicState(String name, int partitionCount) {
            this.name = name;
            this.partitions = new ArrayList<>();
            for (int i = 0; i < partitionCount; i++) {
                this.partitions.add(new PartitionState(i));
            }
        }
    }

    private static final class PartitionState {
        private final int partition;
        private final List<MessageRecord> messages = new ArrayList<>();
        private long nextOffset;

        private PartitionState(int partition) {
            this.partition = partition;
        }
    }

    private record MessageRecord(
            long offset,
            String key,
            String payload,
            long producedAtMillis) {
    }

    private record GroupTopicState(
            String topic,
            String groupId,
            Map<Integer, PartitionCursor> partitionCursors) {
    }

    private static final class PartitionCursor {
        private long nextOffset;
        private InflightDelivery inflight;
    }

    private static final class InflightDelivery {
        private final long offset;
        private int deliveryAttempt;
        private long leasedAtMillis;
        private String lastError;

        private InflightDelivery(long offset, int deliveryAttempt, long leasedAtMillis, String lastError) {
            this.offset = offset;
            this.deliveryAttempt = deliveryAttempt;
            this.leasedAtMillis = leasedAtMillis;
            this.lastError = lastError;
        }
    }

    private record DeadLetterEntry(
            String topic,
            String groupId,
            int partition,
            long offset,
            String key,
            String payload,
            int deliveryAttempts,
            String reason,
            long deadLetteredAtMillis) {
    }
}
