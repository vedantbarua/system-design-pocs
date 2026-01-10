package com.randomproject.uniqueidgenerator;

import java.time.Instant;
import java.util.List;

public record IdBatchResponse(
        int nodeId,
        int count,
        Instant generatedAt,
        List<IdGeneration> ids
) {
}
