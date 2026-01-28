package com.randomproject.ticketmaster;

import java.math.BigDecimal;

public record EventSummary(int totalEvents,
                           int upcomingEvents,
                           int totalVenues,
                           int totalTiers,
                           int totalHolds,
                           int totalOrders,
                           int totalTicketsSold,
                           BigDecimal grossRevenue) {
}
