package com.randomproject.distributedstream;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.TreeMap;
import java.util.function.LongSupplier;
import java.util.regex.Pattern;

@Service
public class DistributedStreamProcessingService {
    private static final Pattern ID_PATTERN = Pattern.compile("^[A-Za-z0-9._:-]+$");
    private static final int MAX_EVENTS = 24;
    private static final int MAX_CHECKPOINTS_PER_JOB = 8;
    private static final int RECENT_EVENTS_PER_PARTITION = 6;
    private static final int WINDOWS_PER_JOB = 20;

    private final Map<String, StreamState> streams = new LinkedHashMap<>();
    private final Map<String, JobState> jobs = new LinkedHashMap<>();
    private final Deque<ProcessingEventView> events = new ArrayDeque<>();
    private final int defaultPartitions;
    private final int maxPartitions;
    private final int defaultWindowSeconds;
    private final LongSupplier timeSource;

    @Autowired
    public DistributedStreamProcessingService(
            @Value("${stream.default-partitions:3}") int defaultPartitions,
            @Value("${stream.max-partitions:8}") int maxPartitions,
            @Value("${stream.default-window-seconds:30}") int defaultWindowSeconds) {
        this(defaultPartitions, maxPartitions, defaultWindowSeconds, System::currentTimeMillis);
    }

    DistributedStreamProcessingService(
            int defaultPartitions,
            int maxPartitions,
            int defaultWindowSeconds,
            LongSupplier timeSource) {
        if (defaultPartitions < 1 || maxPartitions < defaultPartitions) {
            throw new IllegalArgumentException("Partition configuration is invalid.");
        }
        if (defaultWindowSeconds < 5) {
            throw new IllegalArgumentException("Default window must be at least 5 seconds.");
        }
        this.defaultPartitions = defaultPartitions;
        this.maxPartitions = maxPartitions;
        this.defaultWindowSeconds = defaultWindowSeconds;
        this.timeSource = timeSource;
    }

    public synchronized StreamProcessorConfig configSnapshot() {
        return new StreamProcessorConfig(defaultPartitions, maxPartitions, defaultWindowSeconds);
    }

    public synchronized StreamProcessingSnapshot snapshot() {
        List<StreamView> streamViews = streams.values().stream()
                .map(this::toStreamView)
                .toList();
        List<JobView> jobViews = jobs.values().stream()
                .sorted(Comparator.comparing(JobState::stream).thenComparing(JobState::jobId))
                .map(this::toJobView)
                .toList();
        long eventCount = streams.values().stream()
                .mapToLong(stream -> stream.partitions.stream().mapToLong(partition -> partition.records.size()).sum())
                .sum();
        long checkpointCount = jobs.values().stream()
                .mapToLong(job -> job.checkpoints.size())
                .sum();
        return new StreamProcessingSnapshot(
                configSnapshot(),
                streams.size(),
                jobs.size(),
                (int) checkpointCount,
                eventCount,
                streamViews,
                jobViews,
                List.copyOf(events));
    }

    public synchronized StreamView createStream(String stream, Integer partitions, Integer windowSeconds) {
        String streamId = normalizeId(stream, "stream");
        if (streams.containsKey(streamId)) {
            throw new IllegalArgumentException("Stream " + streamId + " already exists.");
        }
        int resolvedPartitions = partitions == null ? defaultPartitions : partitions;
        int resolvedWindowSeconds = windowSeconds == null ? defaultWindowSeconds : windowSeconds;
        if (resolvedPartitions < 1 || resolvedPartitions > maxPartitions) {
            throw new IllegalArgumentException("Partition count must be between 1 and " + maxPartitions + ".");
        }
        if (resolvedWindowSeconds < 5 || resolvedWindowSeconds > 300) {
            throw new IllegalArgumentException("Window size must be between 5 and 300 seconds.");
        }
        StreamState state = new StreamState(streamId, resolvedWindowSeconds, resolvedPartitions);
        streams.put(streamId, state);
        addEvent("stream", "Created stream " + streamId + " with " + resolvedPartitions + " partitions.");
        return toStreamView(state);
    }

    public synchronized PublishEventResult publishEvent(String stream, String key, Integer value, Long eventTimeMillis, Integer partition) {
        StreamState streamState = requireStream(stream);
        String normalizedKey = normalizeOptionalKey(key);
        int normalizedValue = normalizeValue(value);
        PartitionState partitionState = resolvePartition(streamState, normalizedKey, partition);
        long now = now();
        long eventTime = eventTimeMillis == null ? now : eventTimeMillis;
        if (eventTime < 0) {
            throw new IllegalArgumentException("eventTimeMillis must be non-negative.");
        }
        long offset = partitionState.nextOffset++;
        partitionState.records.add(new StreamRecord(offset, normalizedKey, normalizedValue, eventTime, now));
        addEvent(
                "publish",
                "Published " + streamState.name + "[p" + partitionState.partition + "] offset " + offset + " key " + normalizedKey + ".");
        return new PublishEventResult(streamState.name, partitionState.partition, offset, normalizedKey, normalizedValue, Instant.ofEpochMilli(eventTime));
    }

    public synchronized ProcessBatchResult processBatch(String stream, String jobId, Integer maxRecords) {
        StreamState streamState = requireStream(stream);
        JobState job = requireJob(streamState, jobId);
        int limit = maxRecords == null ? 10 : maxRecords;
        if (limit < 1 || limit > 64) {
            throw new IllegalArgumentException("maxRecords must be between 1 and 64.");
        }

        List<ProcessedRecordView> processed = new ArrayList<>();
        Map<String, WindowAggregateView> touched = new LinkedHashMap<>();
        int partitionCount = streamState.partitions.size();
        int startIndex = job.nextPartitionHint;
        if (partitionCount > 0) {
            job.nextPartitionHint = (job.nextPartitionHint + 1) % partitionCount;
        }

        for (int i = 0; i < partitionCount && processed.size() < limit; i++) {
            PartitionState partition = streamState.partitions.get((startIndex + i) % partitionCount);
            CursorState cursor = job.partitionCursors.get(partition.partition);
            while (cursor.nextOffset < partition.records.size() && processed.size() < limit) {
                StreamRecord record = partition.records.get((int) cursor.nextOffset);
                WindowKey windowKey = applyRecord(job, partition.partition, record);
                processed.add(toProcessedRecordView(partition.partition, record, job.windowSeconds));
                touched.put(windowKey.id(), toWindowAggregateView(job.windowAggregates.get(windowKey)));
                cursor.nextOffset = record.offset + 1;
                job.processedEvents++;
                job.maxEventTimeMillis = Math.max(job.maxEventTimeMillis, record.eventTimeMillis);
            }
        }

        if (!processed.isEmpty()) {
            addEvent("process", "Processed " + processed.size() + " record(s) for " + job.jobId + " on " + streamState.name + ".");
        }
        return new ProcessBatchResult(
                streamState.name,
                job.jobId,
                processed.size(),
                job.processedEvents,
                job.maxEventTimeMillis,
                processed,
                touched.values().stream()
                        .sorted(Comparator.comparing(WindowAggregateView::windowStart).thenComparing(WindowAggregateView::key))
                        .toList());
    }

    public synchronized CheckpointView createCheckpoint(String stream, String jobId, String checkpointId) {
        JobState job = requireJob(requireStream(stream), jobId);
        String normalizedCheckpointId = normalizeId(checkpointId, "checkpointId");
        if (job.checkpoints.containsKey(normalizedCheckpointId)) {
            throw new IllegalArgumentException("Checkpoint " + normalizedCheckpointId + " already exists.");
        }
        CheckpointState checkpoint = snapshotCheckpoint(normalizedCheckpointId, job);
        job.checkpoints.put(normalizedCheckpointId, checkpoint);
        trimCheckpoints(job);
        addEvent("checkpoint", "Created checkpoint " + normalizedCheckpointId + " for " + job.jobId + ".");
        return toCheckpointView(checkpoint);
    }

    public synchronized ReplayResult replay(
            String stream,
            String jobId,
            Integer partition,
            Long nextOffset,
            String checkpointId,
            boolean clearState) {
        StreamState streamState = requireStream(stream);
        JobState job = requireJob(streamState, jobId);

        boolean restoredCheckpoint = checkpointId != null && !checkpointId.isBlank();
        if (restoredCheckpoint) {
            restoreCheckpoint(job, checkpointId);
            addEvent("replay", "Restored checkpoint " + checkpointId + " for " + job.jobId + ".");
            return new ReplayResult(
                    streamState.name,
                    job.jobId,
                    true,
                    checkpointId,
                    clearState,
                    checkpointOffsets(job),
                    job.processedEvents);
        }

        if (partition == null || nextOffset == null) {
            throw new IllegalArgumentException("partition and nextOffset are required unless checkpointId is provided.");
        }
        PartitionState partitionState = requirePartition(streamState, partition);
        long normalizedOffset = normalizeOffset(nextOffset, partitionState.records.size());
        job.partitionCursors.get(partitionState.partition).nextOffset = normalizedOffset;
        if (clearState) {
            clearAggregates(job);
        }
        addEvent("replay", "Reset " + job.jobId + " on " + streamState.name + "[p" + partitionState.partition + "] to offset " + normalizedOffset + ".");
        return new ReplayResult(
                streamState.name,
                job.jobId,
                false,
                null,
                clearState,
                checkpointOffsets(job),
                job.processedEvents);
    }

    private WindowKey applyRecord(JobState job, int partition, StreamRecord record) {
        long windowSizeMillis = job.windowSeconds * 1000L;
        long windowStart = (record.eventTimeMillis / windowSizeMillis) * windowSizeMillis;
        WindowKey windowKey = new WindowKey(record.key, windowStart);
        WindowAggregate aggregate = job.windowAggregates.computeIfAbsent(windowKey, ignored -> new WindowAggregate(windowStart, windowStart + windowSizeMillis));
        aggregate.count++;
        aggregate.sum += record.value;
        aggregate.min = Math.min(aggregate.min, record.value);
        aggregate.max = Math.max(aggregate.max, record.value);
        aggregate.lastUpdatedPartition = partition;
        return windowKey;
    }

    private void restoreCheckpoint(JobState job, String checkpointId) {
        CheckpointState checkpoint = Optional.ofNullable(job.checkpoints.get(checkpointId))
                .orElseThrow(() -> new IllegalArgumentException("Checkpoint " + checkpointId + " was not found."));
        job.processedEvents = checkpoint.processedEvents;
        job.maxEventTimeMillis = checkpoint.maxEventTimeMillis;
        job.windowAggregates.clear();
        checkpoint.windowAggregates.forEach((key, value) -> job.windowAggregates.put(key, value.copy()));
        checkpoint.partitionOffsets.forEach((partition, offset) -> job.partitionCursors.get(partition).nextOffset = offset);
    }

    private void clearAggregates(JobState job) {
        job.processedEvents = 0;
        job.maxEventTimeMillis = 0;
        job.windowAggregates.clear();
    }

    private CheckpointState snapshotCheckpoint(String checkpointId, JobState job) {
        Map<Integer, Long> partitionOffsets = new LinkedHashMap<>();
        job.partitionCursors.forEach((partition, cursor) -> partitionOffsets.put(partition, cursor.nextOffset));
        Map<WindowKey, WindowAggregate> windows = new LinkedHashMap<>();
        job.windowAggregates.forEach((key, aggregate) -> windows.put(key, aggregate.copy()));
        return new CheckpointState(checkpointId, now(), job.processedEvents, job.maxEventTimeMillis, partitionOffsets, windows);
    }

    private void trimCheckpoints(JobState job) {
        while (job.checkpoints.size() > MAX_CHECKPOINTS_PER_JOB) {
            String oldest = job.checkpoints.keySet().iterator().next();
            job.checkpoints.remove(oldest);
        }
    }

    private List<CheckpointPartitionView> checkpointOffsets(JobState job) {
        return job.partitionCursors.entrySet().stream()
                .map(entry -> new CheckpointPartitionView(entry.getKey(), entry.getValue().nextOffset))
                .toList();
    }

    private StreamView toStreamView(StreamState stream) {
        return new StreamView(
                stream.name,
                stream.partitions.size(),
                stream.windowSeconds,
                stream.partitions.stream().mapToLong(partition -> partition.records.size()).sum(),
                stream.partitions.stream().map(this::toPartitionView).toList());
    }

    private PartitionView toPartitionView(PartitionState partition) {
        return new PartitionView(
                partition.partition,
                partition.nextOffset,
                partition.records.size(),
                partition.records.stream()
                        .skip(Math.max(0, partition.records.size() - RECENT_EVENTS_PER_PARTITION))
                        .map(record -> new StreamRecordView(
                                record.offset,
                                record.key,
                                record.value,
                                Instant.ofEpochMilli(record.eventTimeMillis),
                                Instant.ofEpochMilli(record.ingestedAtMillis)))
                        .toList());
    }

    private JobView toJobView(JobState job) {
        StreamState stream = requireStream(job.stream);
        return new JobView(
                job.stream,
                job.jobId,
                job.windowSeconds,
                job.processedEvents,
                job.maxEventTimeMillis,
                stream.partitions.stream()
                        .map(partition -> {
                            CursorState cursor = job.partitionCursors.get(partition.partition);
                            return new PartitionStateView(
                                    partition.partition,
                                    cursor.nextOffset,
                                    partition.nextOffset,
                                    partition.nextOffset - cursor.nextOffset);
                        })
                        .toList(),
                job.windowAggregates.entrySet().stream()
                        .sorted(Map.Entry.comparingByKey())
                        .map(entry -> toWindowAggregateView(entry.getValue(), entry.getKey()))
                        .skip(Math.max(0, job.windowAggregates.size() - WINDOWS_PER_JOB))
                        .toList(),
                job.checkpoints.values().stream().map(this::toCheckpointView).toList());
    }

    private WindowAggregateView toWindowAggregateView(WindowAggregate aggregate, WindowKey key) {
        return new WindowAggregateView(
                key.key,
                Instant.ofEpochMilli(aggregate.windowStartMillis),
                Instant.ofEpochMilli(aggregate.windowEndMillis),
                aggregate.count,
                aggregate.sum,
                aggregate.min == Integer.MAX_VALUE ? 0 : aggregate.min,
                aggregate.max == Integer.MIN_VALUE ? 0 : aggregate.max);
    }

    private WindowAggregateView toWindowAggregateView(WindowAggregate aggregate) {
        return toWindowAggregateView(aggregate, findKeyForAggregate(aggregate));
    }

    private WindowKey findKeyForAggregate(WindowAggregate aggregate) {
        return jobs.values().stream()
                .flatMap(job -> job.windowAggregates.entrySet().stream())
                .filter(entry -> entry.getValue() == aggregate)
                .map(Map.Entry::getKey)
                .findFirst()
                .orElseThrow();
    }

    private CheckpointView toCheckpointView(CheckpointState checkpoint) {
        return new CheckpointView(
                checkpoint.checkpointId,
                checkpoint.processedEvents,
                Instant.ofEpochMilli(checkpoint.createdAtMillis),
                checkpoint.partitionOffsets.entrySet().stream()
                        .map(entry -> new CheckpointPartitionView(entry.getKey(), entry.getValue()))
                        .toList());
    }

    private ProcessedRecordView toProcessedRecordView(int partition, StreamRecord record, int windowSeconds) {
        long windowSizeMillis = windowSeconds * 1000L;
        long windowStart = (record.eventTimeMillis / windowSizeMillis) * windowSizeMillis;
        return new ProcessedRecordView(
                partition,
                record.offset,
                record.key,
                record.value,
                Instant.ofEpochMilli(record.eventTimeMillis),
                Instant.ofEpochMilli(windowStart),
                Instant.ofEpochMilli(windowStart + windowSizeMillis));
    }

    private StreamState requireStream(String stream) {
        String streamId = normalizeId(stream, "stream");
        StreamState state = streams.get(streamId);
        if (state == null) {
            throw new IllegalArgumentException("Stream " + streamId + " does not exist.");
        }
        return state;
    }

    private JobState requireJob(StreamState stream, String jobId) {
        String normalizedJobId = normalizeId(jobId, "jobId");
        String compoundKey = stream.name + "::" + normalizedJobId;
        return jobs.computeIfAbsent(compoundKey, ignored -> {
            JobState job = new JobState(stream.name, normalizedJobId, stream.windowSeconds);
            stream.partitions.forEach(partition -> job.partitionCursors.put(partition.partition, new CursorState()));
            addEvent("consumer", "Created processor job " + normalizedJobId + " for stream " + stream.name + ".");
            return job;
        });
    }

    private PartitionState resolvePartition(StreamState stream, String key, Integer requestedPartition) {
        if (requestedPartition != null) {
            return requirePartition(stream, requestedPartition);
        }
        if (!key.isBlank()) {
            int hash = Math.floorMod(key.hashCode(), stream.partitions.size());
            return stream.partitions.get(hash);
        }
        PartitionState partition = stream.partitions.get(stream.publishPartitionCursor);
        stream.publishPartitionCursor = (stream.publishPartitionCursor + 1) % stream.partitions.size();
        return partition;
    }

    private PartitionState requirePartition(StreamState stream, Integer partition) {
        if (partition == null || partition < 0 || partition >= stream.partitions.size()) {
            throw new IllegalArgumentException("Partition must be between 0 and " + (stream.partitions.size() - 1) + ".");
        }
        return stream.partitions.get(partition);
    }

    private String normalizeId(String value, String fieldName) {
        if (value == null) {
            throw new IllegalArgumentException(fieldName + " is required.");
        }
        String normalized = value.trim();
        if (normalized.isEmpty() || normalized.length() > 40 || !ID_PATTERN.matcher(normalized).matches()) {
            throw new IllegalArgumentException(fieldName + " must match " + ID_PATTERN.pattern() + " and be <= 40 chars.");
        }
        return normalized;
    }

    private String normalizeOptionalKey(String value) {
        if (value == null || value.isBlank()) {
            return "default";
        }
        return normalizeId(value, "key");
    }

    private int normalizeValue(Integer value) {
        if (value == null) {
            throw new IllegalArgumentException("value is required.");
        }
        return value;
    }

    private long normalizeOffset(Long offset, int maxExclusive) {
        if (offset == null || offset < 0 || offset > maxExclusive) {
            throw new IllegalArgumentException("nextOffset must be between 0 and " + maxExclusive + ".");
        }
        return offset;
    }

    private void addEvent(String type, String message) {
        events.addFirst(new ProcessingEventView(type, message, Instant.ofEpochMilli(now())));
        while (events.size() > MAX_EVENTS) {
            events.removeLast();
        }
    }

    private long now() {
        return timeSource.getAsLong();
    }

    private static final class StreamState {
        private final String name;
        private final int windowSeconds;
        private final List<PartitionState> partitions;
        private int publishPartitionCursor = 0;

        private StreamState(String name, int windowSeconds, int partitionCount) {
            this.name = name;
            this.windowSeconds = windowSeconds;
            this.partitions = new ArrayList<>();
            for (int i = 0; i < partitionCount; i++) {
                this.partitions.add(new PartitionState(i));
            }
        }
    }

    private static final class PartitionState {
        private final int partition;
        private final List<StreamRecord> records = new ArrayList<>();
        private long nextOffset = 0;

        private PartitionState(int partition) {
            this.partition = partition;
        }
    }

    private static final class JobState {
        private final String stream;
        private final String jobId;
        private final int windowSeconds;
        private final Map<Integer, CursorState> partitionCursors = new LinkedHashMap<>();
        private final Map<WindowKey, WindowAggregate> windowAggregates = new TreeMap<>();
        private final Map<String, CheckpointState> checkpoints = new LinkedHashMap<>();
        private long processedEvents = 0;
        private long maxEventTimeMillis = 0;
        private int nextPartitionHint = 0;

        private JobState(String stream, String jobId, int windowSeconds) {
            this.stream = stream;
            this.jobId = jobId;
            this.windowSeconds = windowSeconds;
        }

        private String stream() {
            return stream;
        }

        private String jobId() {
            return jobId;
        }
    }

    private static final class CursorState {
        private long nextOffset = 0;
    }

    private record StreamRecord(
            long offset,
            String key,
            int value,
            long eventTimeMillis,
            long ingestedAtMillis) {
    }

    private static final class WindowAggregate {
        private final long windowStartMillis;
        private final long windowEndMillis;
        private long count = 0;
        private long sum = 0;
        private int min = Integer.MAX_VALUE;
        private int max = Integer.MIN_VALUE;
        private int lastUpdatedPartition = -1;

        private WindowAggregate(long windowStartMillis, long windowEndMillis) {
            this.windowStartMillis = windowStartMillis;
            this.windowEndMillis = windowEndMillis;
        }

        private WindowAggregate copy() {
            WindowAggregate copy = new WindowAggregate(windowStartMillis, windowEndMillis);
            copy.count = count;
            copy.sum = sum;
            copy.min = min;
            copy.max = max;
            copy.lastUpdatedPartition = lastUpdatedPartition;
            return copy;
        }
    }

    private record WindowKey(String key, long windowStartMillis) implements Comparable<WindowKey> {
        private String id() {
            return key + "@" + windowStartMillis;
        }

        @Override
        public int compareTo(WindowKey other) {
            int byTime = Long.compare(windowStartMillis, other.windowStartMillis);
            if (byTime != 0) {
                return byTime;
            }
            return key.compareTo(other.key);
        }
    }

    private static final class CheckpointState {
        private final String checkpointId;
        private final long createdAtMillis;
        private final long processedEvents;
        private final long maxEventTimeMillis;
        private final Map<Integer, Long> partitionOffsets;
        private final Map<WindowKey, WindowAggregate> windowAggregates;

        private CheckpointState(
                String checkpointId,
                long createdAtMillis,
                long processedEvents,
                long maxEventTimeMillis,
                Map<Integer, Long> partitionOffsets,
                Map<WindowKey, WindowAggregate> windowAggregates) {
            this.checkpointId = checkpointId;
            this.createdAtMillis = createdAtMillis;
            this.processedEvents = processedEvents;
            this.maxEventTimeMillis = maxEventTimeMillis;
            this.partitionOffsets = Objects.requireNonNull(partitionOffsets);
            this.windowAggregates = Objects.requireNonNull(windowAggregates);
        }
    }
}
