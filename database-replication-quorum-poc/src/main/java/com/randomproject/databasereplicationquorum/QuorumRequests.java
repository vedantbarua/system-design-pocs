package com.randomproject.databasereplicationquorum;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public final class QuorumRequests {
    private QuorumRequests() {
    }
}

record WriteRequest(
        @NotBlank String key,
        @NotBlank String value,
        @NotNull @Min(1) @Max(3) Integer writeQuorum) {
}

record ReadRequest(
        @NotBlank String key,
        @NotNull @Min(1) @Max(3) Integer readQuorum,
        boolean repairOnRead) {
}

record ReplicaModeRequest(
        @NotBlank String replicaId,
        @NotBlank String mode) {
}

record ReplicaDrainRequest(
        @NotBlank String replicaId) {
}

record RepairKeyRequest(
        @NotBlank String key) {
}
