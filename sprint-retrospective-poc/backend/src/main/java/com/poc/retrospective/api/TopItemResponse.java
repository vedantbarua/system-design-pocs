package com.poc.retrospective.api;

import com.poc.retrospective.model.ItemType;

public record TopItemResponse(long id, ItemType type, String text, int votes) {
}
