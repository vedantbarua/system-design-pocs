package com.randomproject.searchengine;

import jakarta.validation.constraints.Size;

public record DocumentRequest(
        @Size(max = 60, message = "ID must be at most 60 characters.")
        String id,
        @Size(min = 3, max = 140, message = "Title must be between 3 and 140 characters.")
        String title,
        @Size(max = 180, message = "URL must be at most 180 characters.")
        String url,
        @Size(min = 20, max = 6000, message = "Content must be between 20 and 6000 characters.")
        String content,
        @Size(max = 160, message = "Tags must be at most 160 characters.")
        String tags
) {
}
