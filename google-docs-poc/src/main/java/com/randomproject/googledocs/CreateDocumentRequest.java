package com.randomproject.googledocs;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateDocumentRequest(
        @NotBlank
        @Size(max = 120)
        String title,
        @NotBlank
        @Email
        String owner,
        @NotBlank
        String content
) {
}
