package com.randomproject.cdcmaterializedview;

import java.util.List;

public record ProjectionView(
        List<OrderSummaryView> orderSummaries,
        List<CustomerTotalView> customerTotals,
        List<SearchIndexView> searchIndex) {
}
