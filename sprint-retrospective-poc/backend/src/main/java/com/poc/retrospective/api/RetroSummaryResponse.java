package com.poc.retrospective.api;

import java.util.List;

public record RetroSummaryResponse(
    int totalItems,
    int totalVotes,
    double actionCompletionRate,
    List<TopItemResponse> topItems
) {
}
