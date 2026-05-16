package com.randomproject.cdcmaterializedview;

public record ConnectorView(boolean paused, long committedOffset, long latestSequence, long lag, int processedEvents, int duplicateEvents) {
}
