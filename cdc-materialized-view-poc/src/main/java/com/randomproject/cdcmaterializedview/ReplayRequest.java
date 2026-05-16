package com.randomproject.cdcmaterializedview;

public record ReplayRequest(Long fromOffset, Boolean clearProjections) {
}
