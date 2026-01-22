package com.randomproject.googledocs;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record AddCollaboratorRequest(
        @NotBlank
        @Email
        String email,
        @NotBlank
        @Pattern(regexp = "OWNER|EDITOR|VIEWER")
        String role
) {
}
