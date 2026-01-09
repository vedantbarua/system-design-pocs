package com.randomproject.consistenthashing;

public record NodeAssignment(
        String key,
        String keyHash,
        String assignedNode,
        String assignedHash,
        int ringSize,
        int nodeCount
) {
}
