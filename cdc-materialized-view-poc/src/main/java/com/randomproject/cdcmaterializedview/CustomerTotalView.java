package com.randomproject.cdcmaterializedview;

import java.math.BigDecimal;

public record CustomerTotalView(String customerId, int orderCount, BigDecimal activeTotal) {
}
