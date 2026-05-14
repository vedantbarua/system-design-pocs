package com.randomproject.antientropyrepair;

import java.util.List;

public record ReplicaView(
        String replicaId,
        ReplicaMode mode,
        int keyCount,
        String rootHash,
        List<KeyValueView> entries) {
}
