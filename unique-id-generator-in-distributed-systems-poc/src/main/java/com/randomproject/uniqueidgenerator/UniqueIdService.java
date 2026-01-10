package com.randomproject.uniqueidgenerator;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class UniqueIdService {
    private final Map<Integer, NodeState> nodes = new ConcurrentHashMap<>();
    private final long epochMillis;
    private final int nodeBits;
    private final int sequenceBits;
    private final int maxNodeId;
    private final int maxSequence;
    private final int maxBatch;
    private final int defaultNodeId;
    private final int nodeShift;
    private final int timestampShift;

    public UniqueIdService(
            @Value("${id.epoch-millis:1704067200000}") long epochMillis,
            @Value("${id.node-bits:10}") int nodeBits,
            @Value("${id.sequence-bits:12}") int sequenceBits,
            @Value("${id.max-batch:20}") int maxBatch,
            @Value("${id.default-node-id:0}") int defaultNodeId) {
        if (nodeBits <= 0 || sequenceBits <= 0) {
            throw new IllegalArgumentException("Node bits and sequence bits must be positive.");
        }
        if (nodeBits + sequenceBits >= 63) {
            throw new IllegalArgumentException("Total bits must fit within 63 bits.");
        }
        this.epochMillis = epochMillis;
        this.nodeBits = nodeBits;
        this.sequenceBits = sequenceBits;
        this.maxNodeId = (1 << nodeBits) - 1;
        this.maxSequence = (1 << sequenceBits) - 1;
        this.maxBatch = maxBatch;
        this.defaultNodeId = defaultNodeId;
        this.nodeShift = sequenceBits;
        this.timestampShift = nodeBits + sequenceBits;
        if (defaultNodeId < 0 || defaultNodeId > maxNodeId) {
            throw new IllegalArgumentException("Default node id must be between 0 and " + maxNodeId + ".");
        }
        if (maxBatch <= 0) {
            throw new IllegalArgumentException("Max batch must be at least 1.");
        }
    }

    public IdConfigSnapshot configSnapshot() {
        return new IdConfigSnapshot(
                epochMillis,
                Instant.ofEpochMilli(epochMillis),
                nodeBits,
                sequenceBits,
                maxNodeId,
                maxSequence,
                defaultNodeId,
                maxBatch);
    }

    public synchronized List<IdGeneration> generate(Integer nodeId, Integer count) {
        int resolvedNodeId = normalizeNodeId(nodeId);
        int resolvedCount = normalizeCount(count);
        NodeState state = nodes.computeIfAbsent(resolvedNodeId, NodeState::new);
        List<IdGeneration> results = new java.util.ArrayList<>(resolvedCount);
        for (int i = 0; i < resolvedCount; i++) {
            long id = nextId(state);
            results.add(toGeneration(id, resolvedNodeId));
        }
        return results;
    }

    public synchronized IdDecodeResult decode(long id) {
        if (id < 0) {
            throw new IllegalArgumentException("ID must be non-negative.");
        }
        long timestampPart = id >> timestampShift;
        long timestamp = timestampPart + epochMillis;
        int nodeId = (int) ((id >> nodeShift) & maxNodeId);
        int sequence = (int) (id & maxSequence);
        return new IdDecodeResult(id, nodeId, sequence, timestamp, Instant.ofEpochMilli(timestamp), epochMillis);
    }

    public synchronized List<NodeSnapshot> nodes() {
        return nodes.values().stream()
                .sorted(Comparator.comparingInt(state -> state.nodeId))
                .map(state -> new NodeSnapshot(
                        state.nodeId,
                        state.lastTimestamp,
                        state.lastTimestamp > 0 ? Instant.ofEpochMilli(state.lastTimestamp) : null,
                        state.sequence,
                        state.generatedCount))
                .toList();
    }

    private IdGeneration toGeneration(long id, int nodeId) {
        long timestamp = ((id >> timestampShift) + epochMillis);
        int sequence = (int) (id & maxSequence);
        return new IdGeneration(id, nodeId, sequence, timestamp, Instant.ofEpochMilli(timestamp), epochMillis);
    }

    private long nextId(NodeState state) {
        long current = System.currentTimeMillis();
        if (current < state.lastTimestamp) {
            throw new IllegalArgumentException("Clock moved backwards. Refusing to generate id.");
        }
        if (current == state.lastTimestamp) {
            state.sequence = (state.sequence + 1) & maxSequence;
            if (state.sequence == 0) {
                current = waitNextMillis(state.lastTimestamp);
            }
        } else {
            state.sequence = 0;
        }
        state.lastTimestamp = current;
        state.generatedCount++;
        long timestampPart = current - epochMillis;
        return (timestampPart << timestampShift) | ((long) state.nodeId << nodeShift) | state.sequence;
    }

    private long waitNextMillis(long lastTimestamp) {
        long current = System.currentTimeMillis();
        while (current <= lastTimestamp) {
            current = System.currentTimeMillis();
        }
        return current;
    }

    private int normalizeNodeId(Integer nodeId) {
        int resolved = nodeId == null ? defaultNodeId : nodeId;
        if (resolved < 0 || resolved > maxNodeId) {
            throw new IllegalArgumentException("Node id must be between 0 and " + maxNodeId + ".");
        }
        return resolved;
    }

    private int normalizeCount(Integer count) {
        int resolved = count == null ? 1 : count;
        if (resolved <= 0) {
            throw new IllegalArgumentException("Count must be at least 1.");
        }
        if (resolved > maxBatch) {
            throw new IllegalArgumentException("Count must be at most " + maxBatch + ".");
        }
        return resolved;
    }

    private static class NodeState {
        private final int nodeId;
        private long lastTimestamp;
        private int sequence;
        private long generatedCount;
        private NodeState(int nodeId) {
            this.nodeId = nodeId;
        }
    }
}
