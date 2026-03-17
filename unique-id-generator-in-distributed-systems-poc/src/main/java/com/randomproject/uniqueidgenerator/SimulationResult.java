package com.randomproject.uniqueidgenerator;

import java.time.Instant;
import java.util.List;

public record SimulationResult(
        List<Integer> nodeIds,
        int idsPerNode,
        int totalGenerated,
        boolean unique,
        boolean generationOrderMonotonic,
        Instant simulatedAt,
        List<IdGeneration> generations
) {
}
