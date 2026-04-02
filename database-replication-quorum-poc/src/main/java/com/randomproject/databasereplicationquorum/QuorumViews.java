package com.randomproject.databasereplicationquorum;

import java.time.Instant;
import java.util.List;

public final class QuorumViews {
    private QuorumViews() {
    }
}

record ClusterSnapshotView(
        ClusterConfigView config,
        ClusterMetricsView metrics,
        List<ReplicaView> replicas,
        List<KeyStateView> keys,
        List<OperationEventView> recentEvents) {
}

record ClusterConfigView(
        int replicaCount,
        int defaultReadQuorum,
        int defaultWriteQuorum,
        int historyLimit) {
}

record ClusterMetricsView(
        int healthyReplicas,
        int laggingReplicas,
        int downReplicas,
        int keysWithVisibleData,
        int pendingReplications,
        long latestCommittedVersion) {
}

record ReplicaView(
        String replicaId,
        String mode,
        int storedKeys,
        int pendingReplications,
        long highestVersion,
        List<ReplicaValueView> values,
        List<PendingReplicationView> pending) {
}

record ReplicaValueView(
        String key,
        String value,
        long version,
        Instant committedAt,
        String coordinatorReplica) {
}

record PendingReplicationView(
        String key,
        String value,
        long version,
        String reason,
        Instant queuedAt) {
}

record KeyStateView(
        String key,
        Long latestVersion,
        String latestValue,
        List<KeyReplicaStateView> replicas) {
}

record KeyReplicaStateView(
        String replicaId,
        String mode,
        Long version,
        String value,
        boolean latest) {
}

record OperationEventView(
        String type,
        String status,
        String key,
        String detail,
        Instant happenedAt) {
}

record WriteResultView(
        String key,
        String value,
        long version,
        int requestedWriteQuorum,
        int acknowledgements,
        boolean quorumSatisfied,
        List<String> appliedReplicas,
        List<String> queuedReplicas,
        List<String> missedReplicas,
        String message,
        Instant happenedAt) {
}

record ReadResultView(
        String key,
        int requestedReadQuorum,
        int contactedReplicas,
        boolean quorumSatisfied,
        boolean valueFound,
        String value,
        Long version,
        boolean staleReplicaObserved,
        List<String> contactedReplicaIds,
        List<String> staleReplicaIds,
        int repairedReplicas,
        String message,
        Instant happenedAt) {
}
