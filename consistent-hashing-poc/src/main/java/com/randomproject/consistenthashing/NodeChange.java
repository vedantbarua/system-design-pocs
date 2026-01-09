package com.randomproject.consistenthashing;

public record NodeChange(
        String nodeId,
        boolean added,
        boolean removed,
        int virtualNodes,
        int nodeCount,
        int ringSize
) {
}
