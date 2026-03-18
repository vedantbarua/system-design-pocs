package com.randomproject.distributedcache;

import jakarta.validation.constraints.NotBlank;

public record RebalanceRequest(@NotBlank String candidateNodeId) {
}
