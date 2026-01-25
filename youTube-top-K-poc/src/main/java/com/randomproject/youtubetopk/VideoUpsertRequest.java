package com.randomproject.youtubetopk;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.util.List;

public record VideoUpsertRequest(
        @NotBlank @Size(max = 40) String id,
        @NotBlank @Size(max = 120) String title,
        @NotBlank @Size(max = 60) String channel,
        List<@Size(max = 24) String> tags,
        @PositiveOrZero Long views,
        @PositiveOrZero Long likes
) {
}
