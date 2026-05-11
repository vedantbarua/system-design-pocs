package com.randomproject.writeaheadlog;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.Map;

record PutRequest(
        @NotBlank @Size(max = 80) String commandId,
        @NotBlank @Size(max = 80) String key,
        @NotBlank @Size(max = 240) String value) {
}

record DeleteRequest(
        @NotBlank @Size(max = 80) String commandId,
        @NotBlank @Size(max = 80) String key) {
}

record WalEntry(
        long lsn,
        String commandId,
        WalOperation operation,
        String key,
        String value,
        Instant appendedAt) {
}

record CheckpointView(
        long lsn,
        Instant createdAt,
        Map<String, String> state) {
}

record WalEvent(
        Instant occurredAt,
        String type,
        String message) {
}

record ApplyResult(
        boolean duplicate,
        String message,
        WalEntry entry,
        Map<String, String> state) {
}

record RecoveryResult(
        int replayedEntries,
        long restoredCheckpointLsn,
        Map<String, String> state) {
}

record WalSnapshot(
        Map<String, String> state,
        List<WalEntry> log,
        CheckpointView checkpoint,
        List<WalEvent> events,
        int commandIdCount,
        long nextLsn) {
}
