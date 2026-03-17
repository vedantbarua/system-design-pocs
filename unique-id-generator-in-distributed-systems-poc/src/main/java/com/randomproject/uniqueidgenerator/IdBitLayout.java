package com.randomproject.uniqueidgenerator;

public record IdBitLayout(
        String fullBinary,
        String timestampBits,
        String nodeBits,
        String sequenceBits
) {
}
