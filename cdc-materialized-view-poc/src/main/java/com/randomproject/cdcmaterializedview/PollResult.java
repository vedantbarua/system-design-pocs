package com.randomproject.cdcmaterializedview;

public record PollResult(int appliedEvents, int duplicateEvents, long committedOffset, SystemSnapshot snapshot) {
}
