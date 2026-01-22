package com.randomproject.googledocs;

import java.time.Instant;

public record DocumentVersion(
        int version,
        String content,
        String editor,
        Instant savedAt
) {
}
