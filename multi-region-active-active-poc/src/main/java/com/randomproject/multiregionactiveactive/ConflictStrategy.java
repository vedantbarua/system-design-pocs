package com.randomproject.multiregionactiveactive;

public enum ConflictStrategy {
    LAST_WRITE_WINS,
    VECTOR_CLOCK,
    CART_MERGE
}
