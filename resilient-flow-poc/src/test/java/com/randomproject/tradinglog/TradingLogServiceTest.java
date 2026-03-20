package com.randomproject.tradinglog;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;

class TradingLogServiceTest {

    @Test
    void computesRealizedAndUnrealizedPnlForLongInventory() {
        TradingLogService service = new TradingLogService();
        service.logTrade("TSLA", TradeSide.BUY, 100, new BigDecimal("200.00"), "Alice", "NASDAQ");
        service.logTrade("TSLA", TradeSide.SELL, 40, new BigDecimal("215.00"), "Alice", "NASDAQ");
        service.upsertMarketPrice("TSLA", new BigDecimal("210.00"));

        PositionSnapshot snapshot = service.snapshot().getPositions().stream()
                .filter(position -> position.getSymbol().equals("TSLA"))
                .findFirst()
                .orElseThrow();

        assertEquals(60, snapshot.getNetQuantity());
        assertEquals(new BigDecimal("200.00"), snapshot.getAverageOpenPrice());
        assertEquals(new BigDecimal("600.00"), snapshot.getRealizedPnl());
        assertEquals(new BigDecimal("600.00"), snapshot.getUnrealizedPnl());
        assertEquals(new BigDecimal("1200.00"), snapshot.getTotalPnl());
    }

    @Test
    void computesPnlForShortInventory() {
        TradingLogService service = new TradingLogService();
        service.logTrade("AMD", TradeSide.SELL, 50, new BigDecimal("150.00"), "Bob", "NYSE");
        service.logTrade("AMD", TradeSide.BUY, 20, new BigDecimal("140.00"), "Bob", "NYSE");
        service.upsertMarketPrice("AMD", new BigDecimal("145.00"));

        PositionSnapshot snapshot = service.snapshot().getPositions().stream()
                .filter(position -> position.getSymbol().equals("AMD"))
                .findFirst()
                .orElseThrow();

        assertEquals(-30, snapshot.getNetQuantity());
        assertEquals(new BigDecimal("150.00"), snapshot.getAverageOpenPrice());
        assertEquals(new BigDecimal("200.00"), snapshot.getRealizedPnl());
        assertEquals(new BigDecimal("150.00"), snapshot.getUnrealizedPnl());
        assertEquals(new BigDecimal("350.00"), snapshot.getTotalPnl());
    }
}
