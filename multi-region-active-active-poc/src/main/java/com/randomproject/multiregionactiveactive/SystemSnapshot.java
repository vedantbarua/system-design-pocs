package com.randomproject.multiregionactiveactive;

import java.util.List;

public record SystemSnapshot(
        ConflictStrategy defaultStrategy,
        int regionCount,
        int activeRegions,
        int pendingReplication,
        int unresolvedConflicts,
        List<RegionView> regions,
        List<ReplicationEventView> pendingEvents,
        List<ConflictView> conflicts,
        List<String> recentEvents) {
}
