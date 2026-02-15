package com.randomproject.onlineshopping;

import jakarta.validation.constraints.Min;

public record UpdateCartRequest(
        @Min(0) int quantity
) {
}
