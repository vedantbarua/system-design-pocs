package com.randomproject.multiregionactiveactive;

public record DrainResult(int appliedEvents, int skippedEvents, SystemSnapshot snapshot) {
}
