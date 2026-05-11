package com.randomproject.writeaheadlog;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WriteAheadLogServiceTest {
    private final WriteAheadLogService service = new WriteAheadLogService(
            Clock.fixed(Instant.parse("2026-05-11T12:00:00Z"), ZoneOffset.UTC));

    @Test
    void appendsBeforeApplyingState() {
        ApplyResult result = service.put("cmd-100", "alpha", "one");

        assertThat(result.duplicate()).isFalse();
        assertThat(result.entry().operation()).isEqualTo(WalOperation.PUT);
        assertThat(service.snapshot().log())
                .extracting(WalEntry::commandId)
                .contains("cmd-100");
        assertThat(service.snapshot().state()).containsEntry("alpha", "one");
    }

    @Test
    void ignoresDuplicateCommandIds() {
        service.put("cmd-200", "alpha", "one");
        ApplyResult duplicate = service.put("cmd-200", "alpha", "two");

        assertThat(duplicate.duplicate()).isTrue();
        assertThat(service.snapshot().state()).containsEntry("alpha", "one");
    }

    @Test
    void recoversByReplayingEntriesAfterCheckpoint() {
        service.put("cmd-300", "alpha", "one");
        service.createCheckpoint();
        service.put("cmd-301", "alpha", "two");
        service.delete("cmd-302", "queue:cursor");

        RecoveryResult recovery = service.simulateCrashAndRecover();

        assertThat(recovery.restoredCheckpointLsn()).isGreaterThan(0);
        assertThat(recovery.replayedEntries()).isEqualTo(2);
        assertThat(recovery.state()).containsEntry("alpha", "two");
        assertThat(recovery.state()).doesNotContainKey("queue:cursor");
    }

    @Test
    void compactionRequiresCheckpointAndRetainsOnlyNewerEntries() {
        WriteAheadLogService freshService = new WriteAheadLogService(
                Clock.fixed(Instant.parse("2026-05-11T12:00:00Z"), ZoneOffset.UTC));
        freshService.put("cmd-400", "alpha", "one");
        CheckpointView checkpoint = freshService.createCheckpoint();
        freshService.put("cmd-401", "beta", "two");

        WalSnapshot compacted = freshService.compactLog();

        assertThat(compacted.log()).allMatch(entry -> entry.lsn() > checkpoint.lsn());
        assertThat(compacted.log()).extracting(WalEntry::commandId).containsExactly("cmd-401");
    }

    @Test
    void rejectsCompactionWithoutCheckpoint() {
        WriteAheadLogService serviceWithoutSeed = new WriteAheadLogService(
                Clock.fixed(Instant.parse("2026-05-11T12:00:00Z"), ZoneOffset.UTC),
                false);

        assertThatThrownBy(serviceWithoutSeed::compactLog)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Create a checkpoint");
    }
}
