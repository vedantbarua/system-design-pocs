package com.randomproject.distributedcache;

import java.util.List;

public record RebalancePreview(
        String candidateNodeId,
        int observedKeys,
        int primaryMoves,
        int replicaMoves,
        List<MovedKeyView> sampleMovedKeys) {
}
