package com.randomproject.designdropbox;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UploadFileRequest(
        @NotBlank
        @Size(max = 128)
        String name,
        @NotBlank
        String content,
        @Size(max = 64)
        String parentId
) {
}
