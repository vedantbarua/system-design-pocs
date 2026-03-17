package com.randomproject.uniqueidgenerator;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;

import java.util.List;

public record SimulationRequest(
        @NotEmpty
        List<@Min(0) Integer> nodeIds,
        @Min(1)
        Integer idsPerNode
) {
}
