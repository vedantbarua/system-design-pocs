package com.randomproject.antientropyrepair;

public record WriteRequest(String key, String value, String skipReplicaId) {
}
