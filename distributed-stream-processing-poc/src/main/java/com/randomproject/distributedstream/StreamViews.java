package com.randomproject.distributedstream;

import java.time.Instant;
import java.util.List;

record StreamProcessorConfig(
        int defaultPartitions,
        int maxPartitions,
        int defaultWindowSeconds) {
}

record StreamProcessingSnapshot(
        StreamProcessorConfig config,
        int streamCount,
        int jobCount,
        int checkpointCount,
        long totalEventCount,
        List<StreamView> streams,
        List<JobView> jobs,
        List<ProcessingEventView> events) {
}

record StreamView(
        String stream,
        int partitions,
        int windowSeconds,
        long totalEvents,
        List<PartitionView> partitionViews) {
}

record PartitionView(
        int partition,
        long endOffset,
        int eventCount,
        List<StreamRecordView> recentEvents) {
}

record StreamRecordView(
        long offset,
        String key,
        int value,
        Instant eventTime,
        Instant ingestedAt) {
}

record JobView(
        String stream,
        String jobId,
        int windowSeconds,
        long processedEvents,
        long maxEventTimeMillis,
        List<PartitionStateView> partitions,
        List<WindowAggregateView> windows,
        List<CheckpointView> checkpoints) {
}

record PartitionStateView(
        int partition,
        long nextOffset,
        long endOffset,
        long lag) {
}

record WindowAggregateView(
        String key,
        Instant windowStart,
        Instant windowEnd,
        long count,
        long sum,
        long min,
        long max) {
}

record CheckpointView(
        String checkpointId,
        long processedEvents,
        Instant createdAt,
        List<CheckpointPartitionView> partitionOffsets) {
}

record CheckpointPartitionView(
        int partition,
        long nextOffset) {
}

record PublishEventResult(
        String stream,
        int partition,
        long offset,
        String key,
        int value,
        Instant eventTime) {
}

record ProcessBatchResult(
        String stream,
        String jobId,
        int processedCount,
        long totalProcessedEvents,
        long watermarkMillis,
        List<ProcessedRecordView> records,
        List<WindowAggregateView> touchedWindows) {
}

record ProcessedRecordView(
        int partition,
        long offset,
        String key,
        int value,
        Instant eventTime,
        Instant windowStart,
        Instant windowEnd) {
}

record ReplayResult(
        String stream,
        String jobId,
        boolean restoredCheckpoint,
        String checkpointId,
        boolean clearedState,
        List<CheckpointPartitionView> partitionOffsets,
        long totalProcessedEvents) {
}

record ProcessingEventView(
        String type,
        String message,
        Instant at) {
}
