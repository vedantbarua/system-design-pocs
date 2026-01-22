package com.randomproject.googledocs;

public record DocsDefaults(
        int maxContentLength,
        String defaultOwner,
        int maxDocs
) {
}
