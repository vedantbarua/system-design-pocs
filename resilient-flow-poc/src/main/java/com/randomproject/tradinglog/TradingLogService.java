package com.randomproject.tradinglog;

import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicLong;

@Service
public class TradingLogService {
    private static final String SYMBOL_PATTERN = "^[A-Z0-9.:-]{1,12}$";
    private static final BigDecimal POSITION_ALERT_NOTIONAL = new BigDecimal("100000.00");
    private static final BigDecimal LOSS_ALERT_THRESHOLD = new BigDecimal("-1000.00");

    private final List<TradeEntry> trades = new CopyOnWriteArrayList<>();
    private final Map<String, BigDecimal> marketPrices = new ConcurrentHashMap<>();
    private final AtomicLong tradeSequence = new AtomicLong(1000);

    public TradingLogService() {
        seed();
    }

    public TradeEntry logTrade(String symbol,
                               TradeSide side,
                               int quantity,
                               BigDecimal price,
                               String trader,
                               String venue) {
        String normalizedSymbol = validateSymbol(symbol);
        TradeSide normalizedSide = requireSide(side);
        int normalizedQuantity = validateQuantity(quantity);
        BigDecimal normalizedPrice = validateMoney(price, "Trade price");
        String normalizedTrader = validateText(trader, 60, "Trader");
        String normalizedVenue = normalizeOptional(venue, 40);

        TradeEntry entry = new TradeEntry(
                "trade_" + tradeSequence.incrementAndGet(),
                normalizedSymbol,
                normalizedSide,
                normalizedQuantity,
                normalizedPrice,
                normalizedTrader,
                normalizedVenue,
                Instant.now(),
                scaleMoney(normalizedPrice.multiply(BigDecimal.valueOf(normalizedQuantity))));
        trades.add(0, entry);
        return entry;
    }

    public BigDecimal upsertMarketPrice(String symbol, BigDecimal marketPrice) {
        String normalizedSymbol = validateSymbol(symbol);
        BigDecimal normalizedPrice = validateMoney(marketPrice, "Market price");
        marketPrices.put(normalizedSymbol, normalizedPrice);
        return normalizedPrice;
    }

    public TradingLogSnapshot snapshot() {
        List<PositionSnapshot> positions = calculatePositions();
        List<AlertEntry> alerts = buildAlerts(positions);
        PortfolioSummary summary = buildSummary(positions, alerts);
        Map<String, BigDecimal> sortedPrices = new TreeMap<>(marketPrices);
        return new TradingLogSnapshot(summary, positions, List.copyOf(trades), alerts, sortedPrices);
    }

    public List<TradeEntry> trades() {
        return List.copyOf(trades);
    }

    public Map<String, BigDecimal> marketPrices() {
        return new TreeMap<>(marketPrices);
    }

    private List<PositionSnapshot> calculatePositions() {
        Map<String, MutablePosition> positions = new LinkedHashMap<>();
        List<TradeEntry> chronologicalTrades = new ArrayList<>(trades);
        chronologicalTrades.sort(Comparator.comparing(TradeEntry::getExecutedAt));

        for (TradeEntry trade : chronologicalTrades) {
            MutablePosition position = positions.computeIfAbsent(trade.getSymbol(), ignored -> new MutablePosition());
            position.apply(trade);
        }

        List<PositionSnapshot> snapshots = new ArrayList<>();
        for (Map.Entry<String, MutablePosition> entry : positions.entrySet()) {
            String symbol = entry.getKey();
            MutablePosition position = entry.getValue();
            BigDecimal marketPrice = marketPrices.get(symbol);
            BigDecimal averageOpenPrice = position.netQuantity == 0 ? BigDecimal.ZERO : scaleMoney(position.averageOpenPrice);
            BigDecimal grossExposure = scaleMoney(averageOpenPrice.multiply(BigDecimal.valueOf(Math.abs(position.netQuantity))));
            BigDecimal marketValue = marketPrice == null
                    ? BigDecimal.ZERO
                    : scaleMoney(marketPrice.multiply(BigDecimal.valueOf(position.netQuantity)));
            BigDecimal unrealizedPnl = calculateUnrealizedPnl(position, marketPrice);
            BigDecimal realizedPnl = scaleMoney(position.realizedPnl);
            BigDecimal totalPnl = scaleMoney(realizedPnl.add(unrealizedPnl));
            snapshots.add(new PositionSnapshot(
                    symbol,
                    position.buyQuantity,
                    position.sellQuantity,
                    position.netQuantity,
                    averageOpenPrice,
                    marketPrice,
                    grossExposure,
                    marketValue,
                    realizedPnl,
                    unrealizedPnl,
                    totalPnl));
        }

        snapshots.sort(Comparator.comparing(PositionSnapshot::getTotalPnl).thenComparing(PositionSnapshot::getSymbol));
        return snapshots;
    }

    private List<AlertEntry> buildAlerts(List<PositionSnapshot> positions) {
        List<AlertEntry> alerts = new ArrayList<>();
        for (PositionSnapshot position : positions) {
            if (position.getNetQuantity() != 0 && position.getMarketPrice() == null) {
                alerts.add(new AlertEntry(AlertSeverity.WARN, position.getSymbol(),
                        "Open position has no market price. Unrealized P&L is unavailable."));
            }
            if (position.getGrossExposure().compareTo(POSITION_ALERT_NOTIONAL) >= 0) {
                alerts.add(new AlertEntry(AlertSeverity.CRITICAL, position.getSymbol(),
                        "Gross exposure breached the $100k notional threshold."));
            }
            if (position.getTotalPnl().compareTo(LOSS_ALERT_THRESHOLD) <= 0) {
                alerts.add(new AlertEntry(AlertSeverity.CRITICAL, position.getSymbol(),
                        "Total P&L fell below the -$1,000 alert threshold."));
            }
            if (position.getNetQuantity() == 0 && position.getRealizedPnl().compareTo(BigDecimal.ZERO) != 0) {
                alerts.add(new AlertEntry(AlertSeverity.INFO, position.getSymbol(),
                        "Position is flat. Realized P&L has been fully locked in."));
            }
        }
        alerts.sort(Comparator.comparing(AlertEntry::getSeverity).reversed().thenComparing(AlertEntry::getSymbol));
        return alerts;
    }

    private PortfolioSummary buildSummary(List<PositionSnapshot> positions, List<AlertEntry> alerts) {
        BigDecimal grossExposure = BigDecimal.ZERO;
        BigDecimal realizedPnl = BigDecimal.ZERO;
        BigDecimal unrealizedPnl = BigDecimal.ZERO;
        int openPositions = 0;

        for (PositionSnapshot position : positions) {
            grossExposure = grossExposure.add(position.getGrossExposure());
            realizedPnl = realizedPnl.add(position.getRealizedPnl());
            unrealizedPnl = unrealizedPnl.add(position.getUnrealizedPnl());
            if (position.getNetQuantity() != 0) {
                openPositions++;
            }
        }

        BigDecimal totalPnl = scaleMoney(realizedPnl.add(unrealizedPnl));
        return new PortfolioSummary(
                positions.size(),
                openPositions,
                trades.size(),
                scaleMoney(grossExposure),
                scaleMoney(realizedPnl),
                scaleMoney(unrealizedPnl),
                totalPnl,
                alerts.size());
    }

    private BigDecimal calculateUnrealizedPnl(MutablePosition position, BigDecimal marketPrice) {
        if (marketPrice == null || position.netQuantity == 0) {
            return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        }
        if (position.netQuantity > 0) {
            return scaleMoney(marketPrice.subtract(position.averageOpenPrice)
                    .multiply(BigDecimal.valueOf(position.netQuantity)));
        }
        return scaleMoney(position.averageOpenPrice.subtract(marketPrice)
                .multiply(BigDecimal.valueOf(Math.abs(position.netQuantity))));
    }

    private String validateSymbol(String symbol) {
        if (symbol == null || symbol.isBlank()) {
            throw new IllegalArgumentException("Symbol is required.");
        }
        String normalized = symbol.trim().toUpperCase();
        if (!normalized.matches(SYMBOL_PATTERN)) {
            throw new IllegalArgumentException("Symbol must be 1-12 chars using A-Z, 0-9, ., :, or -.");
        }
        return normalized;
    }

    private TradeSide requireSide(TradeSide side) {
        if (side == null) {
            throw new IllegalArgumentException("Trade side is required.");
        }
        return side;
    }

    private int validateQuantity(int quantity) {
        if (quantity < 1 || quantity > 1_000_000) {
            throw new IllegalArgumentException("Quantity must be between 1 and 1,000,000.");
        }
        return quantity;
    }

    private BigDecimal validateMoney(BigDecimal amount, String field) {
        if (amount == null) {
            throw new IllegalArgumentException(field + " is required.");
        }
        if (amount.compareTo(new BigDecimal("0.01")) < 0) {
            throw new IllegalArgumentException(field + " must be greater than zero.");
        }
        return scaleMoney(amount);
    }

    private String validateText(String value, int maxLength, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " is required.");
        }
        String normalized = value.trim();
        if (normalized.length() > maxLength) {
            throw new IllegalArgumentException(field + " must be <= " + maxLength + " chars.");
        }
        return normalized;
    }

    private String normalizeOptional(String value, int maxLength) {
        if (value == null || value.isBlank()) {
            return "";
        }
        String normalized = value.trim();
        if (normalized.length() > maxLength) {
            throw new IllegalArgumentException("Optional text must be <= " + maxLength + " chars.");
        }
        return normalized;
    }

    private BigDecimal scaleMoney(BigDecimal amount) {
        return amount.setScale(2, RoundingMode.HALF_UP);
    }

    private void seed() {
        logTrade("AAPL", TradeSide.BUY, 120, new BigDecimal("182.40"), "Vedant", "NASDAQ");
        logTrade("AAPL", TradeSide.SELL, 40, new BigDecimal("187.90"), "Vedant", "NASDAQ");
        logTrade("MSFT", TradeSide.BUY, 75, new BigDecimal("411.10"), "Nina", "IEX");
        logTrade("NVDA", TradeSide.SELL, 50, new BigDecimal("903.35"), "Omar", "ARCA");
        upsertMarketPrice("AAPL", new BigDecimal("189.25"));
        upsertMarketPrice("MSFT", new BigDecimal("405.50"));
        upsertMarketPrice("NVDA", new BigDecimal("888.20"));
    }

    private final class MutablePosition {
        private int buyQuantity;
        private int sellQuantity;
        private int netQuantity;
        private BigDecimal averageOpenPrice = BigDecimal.ZERO;
        private BigDecimal realizedPnl = BigDecimal.ZERO;

        private void apply(TradeEntry trade) {
            if (trade.getSide() == TradeSide.BUY) {
                buyQuantity += trade.getQuantity();
                applyBuy(trade.getQuantity(), trade.getPrice());
            } else {
                sellQuantity += trade.getQuantity();
                applySell(trade.getQuantity(), trade.getPrice());
            }
        }

        private void applyBuy(int quantity, BigDecimal price) {
            if (netQuantity >= 0) {
                BigDecimal currentCost = averageOpenPrice.multiply(BigDecimal.valueOf(netQuantity));
                BigDecimal incomingCost = price.multiply(BigDecimal.valueOf(quantity));
                netQuantity += quantity;
                averageOpenPrice = netQuantity == 0 ? BigDecimal.ZERO : currentCost.add(incomingCost)
                        .divide(BigDecimal.valueOf(netQuantity), 8, RoundingMode.HALF_UP);
                return;
            }

            int closingQuantity = Math.min(quantity, Math.abs(netQuantity));
            realizedPnl = realizedPnl.add(averageOpenPrice.subtract(price)
                    .multiply(BigDecimal.valueOf(closingQuantity)));
            netQuantity += closingQuantity;
            int remaining = quantity - closingQuantity;
            if (netQuantity == 0) {
                averageOpenPrice = BigDecimal.ZERO;
            }
            if (remaining > 0) {
                netQuantity = remaining;
                averageOpenPrice = price;
            }
        }

        private void applySell(int quantity, BigDecimal price) {
            if (netQuantity <= 0) {
                BigDecimal currentProceeds = averageOpenPrice.multiply(BigDecimal.valueOf(Math.abs(netQuantity)));
                BigDecimal incomingProceeds = price.multiply(BigDecimal.valueOf(quantity));
                netQuantity -= quantity;
                averageOpenPrice = currentProceeds.add(incomingProceeds)
                        .divide(BigDecimal.valueOf(Math.abs(netQuantity)), 8, RoundingMode.HALF_UP);
                return;
            }

            int closingQuantity = Math.min(quantity, netQuantity);
            realizedPnl = realizedPnl.add(price.subtract(averageOpenPrice)
                    .multiply(BigDecimal.valueOf(closingQuantity)));
            netQuantity -= closingQuantity;
            int remaining = quantity - closingQuantity;
            if (netQuantity == 0) {
                averageOpenPrice = BigDecimal.ZERO;
            }
            if (remaining > 0) {
                netQuantity = -remaining;
                averageOpenPrice = price;
            }
        }
    }
}
