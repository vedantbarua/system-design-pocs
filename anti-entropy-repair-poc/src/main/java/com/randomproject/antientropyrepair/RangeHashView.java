package com.randomproject.antientropyrepair;

public record RangeHashView(
        String replicaId,
        String rangeStart,
        String rangeEnd,
        int keyCount,
        String hash) {
}
