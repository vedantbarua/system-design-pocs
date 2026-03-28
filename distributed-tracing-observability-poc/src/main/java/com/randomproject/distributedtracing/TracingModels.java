package com.randomproject.distributedtracing;

import jakarta.validation.constraints.NotBlank;

import java.util.List;
import java.util.Map;

enum SpanStatus {
    OK,
    ERROR
}

record TraceLogEntry(
        String timestamp,
        String level,
        String message
) {
}

record SpanView(
        String traceId,
        String spanId,
        String parentSpanId,
        String serviceName,
        String operation,
        SpanStatus status,
        long startTimeMs,
        long endTimeMs,
        long durationMs,
        Map<String, String> attributes,
        List<TraceLogEntry> logs
) {
}

record TraceView(
        String traceId,
        String flowName,
        String rootService,
        SpanStatus status,
        long startedAtMs,
        long totalDurationMs,
        boolean propagationBroken,
        List<String> services,
        List<String> anomalies,
        List<SpanView> spans
) {
}

record ServiceMetricView(
        String serviceName,
        long spanCount,
        long errorCount,
        double avgLatencyMs,
        long p95LatencyMs,
        long activeTraceCount
) {
}

record SnapshotView(
        long totalTraceCount,
        long brokenTraceCount,
        long errorTraceCount,
        int serviceCount,
        TraceView latestTrace,
        List<ServiceMetricView> serviceMetrics,
        List<TraceView> traces
) {
}

record SimulationRequest(
        @NotBlank String flowName,
        @NotBlank String userId,
        @NotBlank String region,
        boolean paymentFails,
        String breakPropagationAt
) {
}

record SimulationResult(
        String primaryTraceId,
        List<String> detachedTraceIds,
        int tracesCreated,
        String message
) {
}
