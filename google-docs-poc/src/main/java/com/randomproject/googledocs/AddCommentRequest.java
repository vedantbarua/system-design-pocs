package com.randomproject.googledocs;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AddCommentRequest(
        @NotBlank
        @Email
        String author,
        @NotBlank
        @Size(max = 500)
        String message
) {
}
