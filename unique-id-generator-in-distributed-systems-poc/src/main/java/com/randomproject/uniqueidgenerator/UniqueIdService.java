package com.randomproject.uniqueidgenerator;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;

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
    private final int timestampBits;
    private final long maxTimestampPart;
    private final long maxBackwardDriftMillis;
    private final LongSupplier timeSource;

    @Autowired
    public UniqueIdService(
            @Value("${id.epoch-millis:1704067200000}") long epochMillis,
            @Value("${id.node-bits:10}") int nodeBits,
            @Value("${id.sequence-bits:12}") int sequenceBits,
            @Value("${id.max-batch:20}") int maxBatch,
            @Value("${id.default-node-id:0}") int defaultNodeId,
            @Value("${id.max-backward-drift-millis:5}") long maxBackwardDriftMillis) {
        this(epochMillis, nodeBits, sequenceBits, maxBatch, defaultNodeId, maxBackwardDriftMillis, System::currentTimeMillis);
    }

    UniqueIdService(
            long epochMillis,
            int nodeBits,
            int sequenceBits,
            int maxBatch,
            int defaultNodeId,
            long maxBackwardDriftMillis,
            LongSupplier timeSource) {
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
        this.timestampBits = 63 - nodeBits - sequenceBits;
        this.maxTimestampPart = (1L << timestampBits) - 1;
        this.maxBackwardDriftMillis = maxBackwardDriftMillis;
        this.timeSource = timeSource;
        if (defaultNodeId < 0 || defaultNodeId > maxNodeId) {
            throw new IllegalArgumentException("Default node id must be between 0 and " + maxNodeId + ".");
        }
        if (maxBatch <= 0) {
            throw new IllegalArgumentException("Max batch must be at least 1.");
        }
        if (maxBackwardDriftMillis < 0) {
            throw new IllegalArgumentException("Max backward drift must be non-negative.");
        }
    }

    public IdConfigSnapshot configSnapshot() {
        return new IdConfigSnapshot(
                epochMillis,
                Instant.ofEpochMilli(epochMillis),
                timestampBits,
                nodeBits,
                sequenceBits,
                maxNodeId,
                maxSequence,
                defaultNodeId,
                maxBatch,
                maxBackwardDriftMillis);
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

    public synchronized SimulationResult simulate(List<Integer> nodeIds, Integer idsPerNode) {
        List<Integer> resolvedNodeIds = normalizeNodeIds(nodeIds);
        int resolvedCount = normalizeCount(idsPerNode);
        List<IdGeneration> results = new java.util.ArrayList<>(resolvedNodeIds.size() * resolvedCount);
        for (int i = 0; i < resolvedCount; i++) {
            for (int nodeId : resolvedNodeIds) {
                NodeState state = nodes.computeIfAbsent(nodeId, NodeState::new);
                results.add(toGeneration(nextId(state), nodeId));
            }
        }
        boolean unique = results.stream().map(IdGeneration::id).distinct().count() == results.size();
        boolean monotonic = isStrictlyIncreasing(results);
        return new SimulationResult(
                resolvedNodeIds,
                resolvedCount,
                results.size(),
                unique,
                monotonic,
                Instant.now(),
                results);
    }

    public synchronized IdDecodeResult decode(long id) {
        if (id < 0) {
            throw new IllegalArgumentException("ID must be non-negative.");
        }
        long timestampPart = id >> timestampShift;
        long timestamp = timestampPart + epochMillis;
        int nodeId = (int) ((id >> nodeShift) & maxNodeId);
        int sequence = (int) (id & maxSequence);
        return new IdDecodeResult(
                id,
                nodeId,
                sequence,
                timestampPart,
                timestamp,
                Instant.ofEpochMilli(timestamp),
                epochMillis,
                bitLayout(id));
    }

    public synchronized List<NodeSnapshot> nodes() {
        return nodes.values().stream()
                .sorted(Comparator.comparingInt(state -> state.nodeId))
                .map(state -> new NodeSnapshot(
                        state.nodeId,
                        state.lastTimestamp,
                        state.lastTimestamp > 0 ? Instant.ofEpochMilli(state.lastTimestamp) : null,
                        state.lastObservedTimestamp,
                        state.lastObservedTimestamp > 0 ? Instant.ofEpochMilli(state.lastObservedTimestamp) : null,
                        state.sequence,
                        state.generatedCount,
                        state.clockRegressionEvents,
                        state.lastDriftMillis))
                .toList();
    }

    private IdGeneration toGeneration(long id, int nodeId) {
        long relativeTimestamp = id >> timestampShift;
        long timestamp = relativeTimestamp + epochMillis;
        int sequence = (int) (id & maxSequence);
        return new IdGeneration(
                id,
                nodeId,
                sequence,
                relativeTimestamp,
                timestamp,
                Instant.ofEpochMilli(timestamp),
                epochMillis,
                bitLayout(id));
    }

    private long nextId(NodeState state) {
        long observed = timeSource.getAsLong();
        if (observed < epochMillis) {
            throw new IllegalArgumentException("Clock is before the configured epoch. Refusing to generate id.");
        }
        state.lastObservedTimestamp = observed;
        long current = observed;
        if (current < state.lastTimestamp) {
            long drift = state.lastTimestamp - current;
            if (drift > maxBackwardDriftMillis) {
                throw new IllegalArgumentException(
                        "Clock moved backwards by " + drift + " ms. Max allowed drift is " + maxBackwardDriftMillis + " ms.");
            }
            state.clockRegressionEvents++;
            state.lastDriftMillis = drift;
            current = state.lastTimestamp;
        } else {
            state.lastDriftMillis = 0;
        }
        if (current == state.lastTimestamp) {
            state.sequence = (state.sequence + 1) & maxSequence;
            if (state.sequence == 0) {
                current = waitNextMillis(state.lastTimestamp);
                state.lastObservedTimestamp = current;
            }
        } else {
            state.sequence = 0;
        }
        state.lastTimestamp = current;
        state.generatedCount++;
        long timestampPart = current - epochMillis;
        if (timestampPart > maxTimestampPart) {
            throw new IllegalArgumentException("Timestamp is outside the " + timestampBits + "-bit range for the configured epoch.");
        }
        return (timestampPart << timestampShift) | ((long) state.nodeId << nodeShift) | state.sequence;
    }

    private long waitNextMillis(long lastTimestamp) {
        long current = timeSource.getAsLong();
        while (current <= lastTimestamp) {
            current = timeSource.getAsLong();
        }
        return current;
    }

    private List<Integer> normalizeNodeIds(List<Integer> nodeIds) {
        if (nodeIds == null || nodeIds.isEmpty()) {
            throw new IllegalArgumentException("At least one node id is required.");
        }
        LinkedHashSet<Integer> uniqueNodeIds = new LinkedHashSet<>();
        for (Integer nodeId : nodeIds) {
            uniqueNodeIds.add(normalizeNodeId(nodeId));
        }
        if (uniqueNodeIds.size() != nodeIds.size()) {
            throw new IllegalArgumentException("Simulation node ids must be unique.");
        }
        return List.copyOf(uniqueNodeIds);
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

    private boolean isStrictlyIncreasing(List<IdGeneration> generations) {
        long previous = Long.MIN_VALUE;
        for (IdGeneration generation : generations) {
            if (generation.id() <= previous) {
                return false;
            }
            previous = generation.id();
        }
        return true;
    }

    private IdBitLayout bitLayout(long id) {
        String fullBinary = Long.toBinaryString(id);
        String padded = "0".repeat(63 - fullBinary.length()) + fullBinary;
        int nodeStart = timestampBits;
        int sequenceStart = timestampBits + nodeBits;
        return new IdBitLayout(
                padded,
                padded.substring(0, nodeStart),
                padded.substring(nodeStart, sequenceStart),
                padded.substring(sequenceStart));
    }

    private static class NodeState {
        private final int nodeId;
        private long lastTimestamp;
        private long lastObservedTimestamp;
        private int sequence;
        private long generatedCount;
        private long clockRegressionEvents;
        private long lastDriftMillis;

        private NodeState(int nodeId) {
            this.nodeId = nodeId;
        }
    }
}
