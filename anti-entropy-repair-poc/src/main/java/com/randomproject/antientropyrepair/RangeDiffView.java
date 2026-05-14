package com.randomproject.antientropyrepair;

import java.util.List;

public record RangeDiffView(
        String rangeStart,
        String rangeEnd,
        boolean consistent,
        List<RangeHashView> replicaHashes,
        List<String> divergentKeys) {
}
