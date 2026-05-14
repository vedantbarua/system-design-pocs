package com.randomproject.antientropyrepair;

public record RepairRequest(String sourceReplicaId, String targetReplicaId, String rangeStart, String rangeEnd) {
}
