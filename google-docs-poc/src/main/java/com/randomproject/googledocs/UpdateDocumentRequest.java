package com.randomproject.googledocs;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record UpdateDocumentRequest(
        @NotBlank
        @Email
        String editor,
        @NotBlank
        String content
) {
}
