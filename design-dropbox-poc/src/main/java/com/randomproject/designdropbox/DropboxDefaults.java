package com.randomproject.designdropbox;

public record DropboxDefaults(
        int maxFileSize,
        int defaultTtlMinutes
) {
}
