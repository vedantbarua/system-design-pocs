package com.randomproject.antientropyrepair;

public record CorruptRequest(String replicaId, String key, String value) {
}
