package com.randomproject.googledocs;

import java.time.Instant;

public record CollaboratorEntry(
        String email,
        String role,
        Instant addedAt
) {
}
