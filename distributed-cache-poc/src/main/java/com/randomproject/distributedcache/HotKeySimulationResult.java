package com.randomproject.distributedcache;

import java.util.Map;

public record HotKeySimulationResult(
        String key,
        int requests,
        String hottestNode,
        Map<String, Long> nodeHits,
        boolean failoverObserved) {
}
