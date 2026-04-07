package com.randomproject.servicediscovery;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;
import java.util.List;
import java.util.Map;

enum InstanceLifecycle {
    UP,
    DRAINING,
    DOWN
}

record RegisterInstanceRequest(
        @NotBlank String service,
        String instanceId,
        @NotBlank String zone,
        @NotBlank String version,
        Integer weight,
        Boolean canary,
        Map<String, String> metadata) {
}

record HeartbeatResult(
        String instanceId,
        Instant heartbeatAt,
        long leaseExpiresAtMillis) {
}

record StatusUpdateRequest(
        @NotNull InstanceLifecycle status) {
}

record InstanceResultRequest(
        @NotNull Boolean success) {
}

record RoutingRequest(
        @NotBlank String service,
        String clientZone,
        String sessionKey,
        Boolean allowCanary) {
}

record RoutedInstance(
        String service,
        String instanceId,
        String zone,
        String version,
        int weight,
        boolean canary) {
}

record RoutingDecision(
        String service,
        String strategy,
        String requestedZone,
        String matchedZone,
        String sessionKey,
        boolean canaryAllowed,
        RoutedInstance instance,
        Instant routedAt,
        String note) {
}

record InstanceActionResult(
        String instanceId,
        String service,
        String effectiveState,
        Instant updatedAt,
        String message) {
}

record InstanceView(
        String service,
        String instanceId,
        String zone,
        String version,
        int weight,
        boolean canary,
        InstanceLifecycle lifecycle,
        String effectiveState,
        int consecutiveFailures,
        long leaseExpiresAtMillis,
        Instant lastHeartbeatAt,
        Instant ejectedUntil,
        Map<String, String> metadata) {
}

record ServiceView(
        String service,
        int totalInstances,
        int routableInstances,
        int canaryInstances,
        List<InstanceView> instances) {
}

record RegistryEventView(
        Instant happenedAt,
        String type,
        String service,
        String instanceId,
        String summary) {
}

record DiscoverySnapshot(
        int serviceCount,
        int instanceCount,
        int routableCount,
        int canaryCount,
        long leaseDurationMillis,
        long ejectionDurationMillis,
        List<ServiceView> services,
        List<RoutingDecision> recentRoutes,
        List<RegistryEventView> recentEvents) {
}
