package com.poc.retrospective.api;

import com.poc.retrospective.model.ItemType;
import java.util.List;
import java.util.Map;

public record RetroBoardResponse(
    TeamResponse team,
    SprintResponse sprint,
    Map<ItemType, List<RetroItemResponse>> itemsByType,
    List<ActionItemResponse> actionItems,
    RetroSummaryResponse summary
) {
}
