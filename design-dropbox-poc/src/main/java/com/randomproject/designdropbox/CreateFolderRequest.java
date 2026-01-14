package com.randomproject.designdropbox;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateFolderRequest(
        @NotBlank
        @Size(max = 64)
        String name,
        @Size(max = 64)
        String parentId
) {
}
