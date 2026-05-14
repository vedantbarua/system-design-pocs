package com.randomproject.antientropyrepair;

import java.util.List;

public record SystemSnapshot(
        int replicaCount,
        int healthyReplicas,
        int totalLogicalKeys,
        int consistentKeys,
        int divergentKeys,
        int consistencyPercent,
        RepairPlanView latestRepairPlan,
        List<ReplicaView> replicas,
        List<String> recentEvents) {
}
