package com.randomproject.antientropyrepair;

public record KeyValueView(String key, String value, long version, String writerReplicaId) {
}
