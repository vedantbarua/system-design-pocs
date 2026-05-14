package com.randomproject.antientropyrepair;

import java.util.List;

public record RepairPlanView(
        boolean consistent,
        int totalRanges,
        int divergentRanges,
        int divergentKeys,
        List<RangeDiffView> ranges) {
}
