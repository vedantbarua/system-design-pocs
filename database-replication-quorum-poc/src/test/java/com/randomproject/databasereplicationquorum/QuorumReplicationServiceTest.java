package com.randomproject.databasereplicationquorum;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class QuorumReplicationServiceTest {
    @Test
    void writeCanSucceedWithOneLaggingReplicaAndRepairLater() {
        QuorumReplicationService service = new QuorumReplicationService(3, 2, 2, 12);

        service.updateReplicaMode("replica-c", "LAGGING");
        WriteResultView write = service.write("cart-42", "paid", 2);

        assertThat(write.quorumSatisfied()).isTrue();
        assertThat(write.appliedReplicas()).containsExactly("replica-a", "replica-b");
        assertThat(write.queuedReplicas()).containsExactly("replica-c");

        service.updateReplicaMode("replica-c", "HEALTHY");
        service.drainPending("replica-c");

        ClusterSnapshotView snapshot = service.snapshot();
        ReplicaView replica = snapshot.replicas().stream()
                .filter(item -> item.replicaId().equals("replica-c"))
                .findFirst()
                .orElseThrow();

        assertThat(replica.pendingReplications()).isZero();
        assertThat(replica.values()).extracting(ReplicaValueView::version).containsExactly(1L);
    }

    @Test
    void readRepairUpdatesStaleReplicaWithinContactedQuorum() {
        QuorumReplicationService service = new QuorumReplicationService(3, 2, 2, 12);

        service.write("profile-7", "v1", 2);
        service.updateReplicaMode("replica-b", "DOWN");
        service.write("profile-7", "v2", 2);
        service.updateReplicaMode("replica-b", "HEALTHY");

        ReadResultView read = service.read("profile-7", 2, true);

        assertThat(read.quorumSatisfied()).isTrue();
        assertThat(read.staleReplicaObserved()).isTrue();
        assertThat(read.repairedReplicas()).isEqualTo(1);

        ClusterSnapshotView snapshot = service.snapshot();
        KeyStateView key = snapshot.keys().stream()
                .filter(item -> item.key().equals("profile-7"))
                .findFirst()
                .orElseThrow();

        assertThat(key.replicas())
                .filteredOn(item -> item.replicaId().equals("replica-b"))
                .extracting(KeyReplicaStateView::version)
                .containsExactly(2L);
    }
}
