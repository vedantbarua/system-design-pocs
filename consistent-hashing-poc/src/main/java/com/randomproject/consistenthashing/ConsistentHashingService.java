package com.randomproject.consistenthashing;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NavigableMap;
import java.util.TreeMap;
import java.util.regex.Pattern;

@Service
public class ConsistentHashingService {
    private static final Pattern ID_PATTERN = Pattern.compile("^[A-Za-z0-9._:-]+$");

    private final NavigableMap<Long, String> ring = new TreeMap<>(Long::compareUnsigned);
    private final Map<String, List<Long>> nodeHashes = new HashMap<>();
    private final int virtualNodes;

    public ConsistentHashingService(@Value("${hash.virtual-nodes:120}") int virtualNodes) {
        if (virtualNodes < 1) {
            throw new IllegalArgumentException("virtual-nodes must be >= 1");
        }
        this.virtualNodes = virtualNodes;
    }

    public int getVirtualNodes() {
        return virtualNodes;
    }

    public synchronized List<String> listNodes() {
        return nodeHashes.keySet().stream().sorted().toList();
    }

    public synchronized List<HashRingEntry> ringEntries() {
        return ring.entrySet()
                .stream()
                .map(entry -> new HashRingEntry(formatHash(entry.getKey()), entry.getValue()))
                .toList();
    }

    public synchronized NodeChange addNode(String nodeId) {
        validateId(nodeId, "nodeId");
        if (nodeHashes.containsKey(nodeId)) {
            return new NodeChange(nodeId, false, false, virtualNodes, nodeHashes.size(), ring.size());
        }
        List<Long> hashes = new ArrayList<>(virtualNodes);
        for (int i = 0; i < virtualNodes; i++) {
            long hash = hashValue(nodeId + "#" + i);
            ring.put(hash, nodeId);
            hashes.add(hash);
        }
        nodeHashes.put(nodeId, hashes);
        return new NodeChange(nodeId, true, false, virtualNodes, nodeHashes.size(), ring.size());
    }

    public synchronized NodeChange removeNode(String nodeId) {
        validateId(nodeId, "nodeId");
        List<Long> hashes = nodeHashes.remove(nodeId);
        if (hashes == null) {
            return new NodeChange(nodeId, false, false, virtualNodes, nodeHashes.size(), ring.size());
        }
        for (Long hash : hashes) {
            ring.remove(hash);
        }
        return new NodeChange(nodeId, false, true, virtualNodes, nodeHashes.size(), ring.size());
    }

    public synchronized NodeAssignment assignKey(String key) {
        validateId(key, "key");
        long hash = hashValue(key);
        if (ring.isEmpty()) {
            return new NodeAssignment(key, formatHash(hash), null, null, ring.size(), nodeHashes.size());
        }
        Map.Entry<Long, String> entry = ring.ceilingEntry(hash);
        if (entry == null) {
            entry = ring.firstEntry();
        }
        return new NodeAssignment(
                key,
                formatHash(hash),
                entry.getValue(),
                formatHash(entry.getKey()),
                ring.size(),
                nodeHashes.size());
    }

    private long hashValue(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("MD5");
            byte[] hashed = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            return ByteBuffer.wrap(hashed).getLong();
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("MD5 hashing not available", ex);
        }
    }

    private String formatHash(long value) {
        String hex = Long.toUnsignedString(value, 16);
        StringBuilder padded = new StringBuilder("0x");
        for (int i = hex.length(); i < 16; i++) {
            padded.append('0');
        }
        padded.append(hex);
        return padded.toString();
    }

    private void validateId(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " is required");
        }
        if (value.length() > 64) {
            throw new IllegalArgumentException(field + " must be <= 64 characters");
        }
        if (!ID_PATTERN.matcher(value).matches()) {
            throw new IllegalArgumentException(field + " must use letters, numbers, '.', '_', '-', ':' only");
        }
    }
}
