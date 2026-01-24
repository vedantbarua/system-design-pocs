package com.randomproject.onlineauction;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

@Service
public class AuctionService {
    private static final Pattern ID_PATTERN = Pattern.compile("^[A-Za-z0-9._:-]+$");

    private final Map<String, Auction> auctions = new ConcurrentHashMap<>();
    private final int defaultDurationMinutes;
    private final int maxDurationMinutes;
    private final BigDecimal minBidIncrement;

    public AuctionService(
            @Value("${auction.default-duration-minutes:90}") int defaultDurationMinutes,
            @Value("${auction.max-duration-minutes:4320}") int maxDurationMinutes,
            @Value("${auction.min-bid-increment:1.00}") BigDecimal minBidIncrement) {
        this.defaultDurationMinutes = defaultDurationMinutes > 0 ? defaultDurationMinutes : 90;
        this.maxDurationMinutes = Math.max(maxDurationMinutes, this.defaultDurationMinutes);
        this.minBidIncrement = normalizeIncrement(minBidIncrement);
        seedAuctions();
    }

    public int getDefaultDurationMinutes() {
        return defaultDurationMinutes;
    }

    public BigDecimal getMinBidIncrement() {
        return minBidIncrement;
    }

    public synchronized List<Auction> all() {
        Instant now = Instant.now();
        List<Auction> result = new ArrayList<>();
        for (Auction auction : auctions.values()) {
            result.add(expireIfNeeded(auction, now));
        }
        result.sort(Comparator.comparing(Auction::getUpdatedAt).reversed());
        return result;
    }

    public synchronized List<Auction> openAuctions() {
        Instant now = Instant.now();
        return auctions.values().stream()
                .map(auction -> expireIfNeeded(auction, now))
                .filter(auction -> auction.getStatus() == AuctionStatus.OPEN)
                .sorted(Comparator.comparing(Auction::getEndsAt))
                .toList();
    }

    public synchronized List<Auction> closedAuctions() {
        Instant now = Instant.now();
        return auctions.values().stream()
                .map(auction -> expireIfNeeded(auction, now))
                .filter(auction -> auction.getStatus() == AuctionStatus.CLOSED)
                .sorted(Comparator.comparing(Auction::getUpdatedAt).reversed())
                .toList();
    }

    public synchronized Optional<Auction> get(String id) {
        String normalized = normalizeIdAllowingUnknown(id);
        if (normalized == null) {
            return Optional.empty();
        }
        Auction auction = auctions.get(normalized);
        if (auction == null) {
            return Optional.empty();
        }
        return Optional.of(expireIfNeeded(auction, Instant.now()));
    }

    public synchronized Auction create(String id,
                                       String title,
                                       String description,
                                       String seller,
                                       BigDecimal startingPrice,
                                       BigDecimal reservePrice,
                                       Integer durationMinutes) {
        String normalizedId = normalizeId(id);
        if (auctions.containsKey(normalizedId)) {
            throw new IllegalArgumentException("Auction id already exists: " + normalizedId);
        }
        String normalizedTitle = normalizeTitle(title);
        String normalizedSeller = normalizeSeller(seller);
        String normalizedDescription = normalizeDescription(description);
        BigDecimal normalizedStarting = normalizeAmount("Starting price", startingPrice);
        BigDecimal normalizedReserve = normalizeReserve(reservePrice, normalizedStarting);
        int duration = normalizeDuration(durationMinutes);

        Instant now = Instant.now();
        Instant endsAt = now.plusSeconds(duration * 60L);
        Auction auction = new Auction(
                normalizedId,
                normalizedTitle,
                normalizedDescription,
                normalizedSeller,
                normalizedStarting,
                normalizedReserve,
                now,
                endsAt,
                now,
                AuctionStatus.OPEN,
                List.of());
        auctions.put(normalizedId, auction);
        return auction;
    }

    public synchronized Auction placeBid(String id, String bidder, BigDecimal amount) {
        String normalizedId = normalizeId(id);
        Auction auction = auctions.get(normalizedId);
        if (auction == null) {
            throw new IllegalArgumentException("Unknown auction: " + normalizedId);
        }
        Instant now = Instant.now();
        auction = expireIfNeeded(auction, now);
        if (auction.getStatus() == AuctionStatus.CLOSED) {
            throw new IllegalArgumentException("Auction is closed.");
        }

        String normalizedBidder = normalizeBidder(bidder);
        BigDecimal normalizedAmount = normalizeAmount("Bid amount", amount);
        BigDecimal requiredMinimum = auction.getHighestBid()
                .map(bid -> bid.getAmount().add(minBidIncrement))
                .orElse(auction.getStartingPrice());
        if (normalizedAmount.compareTo(requiredMinimum) < 0) {
            throw new IllegalArgumentException("Bid must be at least " + requiredMinimum + ".");
        }
        Bid bid = new Bid(normalizedBidder, normalizedAmount, now);
        Auction updated = auction.withBid(bid, now);
        auctions.put(normalizedId, updated);
        return updated;
    }

    public synchronized Auction close(String id) {
        String normalizedId = normalizeId(id);
        Auction auction = auctions.get(normalizedId);
        if (auction == null) {
            throw new IllegalArgumentException("Unknown auction: " + normalizedId);
        }
        if (auction.getStatus() == AuctionStatus.CLOSED) {
            return auction;
        }
        Auction updated = auction.withStatus(AuctionStatus.CLOSED, Instant.now());
        auctions.put(normalizedId, updated);
        return updated;
    }

    public synchronized AuctionSummary summary() {
        Instant now = Instant.now();
        int openCount = 0;
        int closedCount = 0;
        int totalBids = 0;
        BigDecimal volume = BigDecimal.ZERO;
        for (Auction auction : auctions.values()) {
            auction = expireIfNeeded(auction, now);
            if (auction.getStatus() == AuctionStatus.OPEN) {
                openCount++;
            } else {
                closedCount++;
            }
            totalBids += auction.getBidCount();
            volume = volume.add(auction.getHighestBid().map(Bid::getAmount).orElse(BigDecimal.ZERO));
        }
        int totalAuctions = openCount + closedCount;
        return new AuctionSummary(totalAuctions, openCount, closedCount, totalBids, volume);
    }

    private Auction expireIfNeeded(Auction auction, Instant now) {
        if (auction.getStatus() == AuctionStatus.OPEN && !now.isBefore(auction.getEndsAt())) {
            Auction closed = auction.withStatus(AuctionStatus.CLOSED, now);
            auctions.put(auction.getId(), closed);
            return closed;
        }
        return auction;
    }

    private String normalizeId(String id) {
        if (!StringUtils.hasText(id)) {
            throw new IllegalArgumentException("Auction id cannot be empty.");
        }
        String normalized = id.trim();
        if (!ID_PATTERN.matcher(normalized).matches()) {
            throw new IllegalArgumentException("Auction id must use letters, numbers, '.', '-', '_', or ':'.");
        }
        return normalized;
    }

    private String normalizeIdAllowingUnknown(String id) {
        if (!StringUtils.hasText(id)) {
            return null;
        }
        String normalized = id.trim();
        if (!ID_PATTERN.matcher(normalized).matches()) {
            return null;
        }
        return normalized;
    }

    private String normalizeTitle(String title) {
        if (!StringUtils.hasText(title)) {
            throw new IllegalArgumentException("Title cannot be empty.");
        }
        return title.trim();
    }

    private String normalizeSeller(String seller) {
        if (!StringUtils.hasText(seller)) {
            throw new IllegalArgumentException("Seller cannot be empty.");
        }
        return seller.trim();
    }

    private String normalizeDescription(String description) {
        if (!StringUtils.hasText(description)) {
            return null;
        }
        return description.trim();
    }

    private String normalizeBidder(String bidder) {
        if (!StringUtils.hasText(bidder)) {
            throw new IllegalArgumentException("Bidder cannot be empty.");
        }
        return bidder.trim();
    }

    private BigDecimal normalizeAmount(String label, BigDecimal amount) {
        if (amount == null) {
            throw new IllegalArgumentException(label + " is required.");
        }
        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException(label + " must be greater than zero.");
        }
        return amount.setScale(2, RoundingMode.HALF_UP);
    }

    private BigDecimal normalizeReserve(BigDecimal reservePrice, BigDecimal startingPrice) {
        if (reservePrice == null) {
            return null;
        }
        BigDecimal normalized = normalizeAmount("Reserve price", reservePrice);
        if (normalized.compareTo(startingPrice) < 0) {
            throw new IllegalArgumentException("Reserve price must be at least starting price.");
        }
        return normalized;
    }

    private int normalizeDuration(Integer durationMinutes) {
        int value = durationMinutes == null ? defaultDurationMinutes : durationMinutes;
        if (value <= 0) {
            throw new IllegalArgumentException("Duration must be greater than zero.");
        }
        if (value > maxDurationMinutes) {
            throw new IllegalArgumentException("Duration exceeds max of " + maxDurationMinutes + " minutes.");
        }
        return value;
    }

    private BigDecimal normalizeIncrement(BigDecimal increment) {
        BigDecimal normalized = increment == null ? BigDecimal.ONE : increment;
        if (normalized.compareTo(BigDecimal.ZERO) <= 0) {
            normalized = BigDecimal.ONE;
        }
        return normalized.setScale(2, RoundingMode.HALF_UP);
    }

    private void seedAuctions() {
        Auction camera = createSeedAuction(
                "vintage-camera",
                "Vintage Polaroid SX-70",
                "Original folding instant camera with leather case.",
                "AnalogAntiques",
                new BigDecimal("85.00"),
                new BigDecimal("120.00"),
                180);
        placeSeedBid(camera.getId(), "Maya L.", new BigDecimal("95.00"));
        placeSeedBid(camera.getId(), "Jordan P.", new BigDecimal("110.00"));

        Auction chair = createSeedAuction(
                "ergonomic-chair",
                "ErgoMesh Office Chair",
                "Breathable mesh, adjustable lumbar support, light wear.",
                "StudioSupply",
                new BigDecimal("140.00"),
                null,
                120);
        placeSeedBid(chair.getId(), "Ravi K.", new BigDecimal("145.00"));

        Auction comics = createSeedAuction(
                "silver-age-comics",
                "Silver Age Comic Bundle",
                "12 issue bundle, graded 7.5-8.0, includes key #128.",
                "ArchivistVault",
                new BigDecimal("60.00"),
                new BigDecimal("80.00"),
                60);
        placeSeedBid(comics.getId(), "Nadia T.", new BigDecimal("75.00"));
        close(comics.getId());
    }

    private Auction createSeedAuction(String id,
                                      String title,
                                      String description,
                                      String seller,
                                      BigDecimal startingPrice,
                                      BigDecimal reservePrice,
                                      int durationMinutes) {
        Auction auction = new Auction(
                id,
                title,
                description,
                seller,
                startingPrice,
                reservePrice,
                Instant.now().minusSeconds(900),
                Instant.now().plusSeconds(durationMinutes * 60L),
                Instant.now().minusSeconds(900),
                AuctionStatus.OPEN,
                List.of());
        auctions.put(id, auction);
        return auction;
    }

    private void placeSeedBid(String id, String bidder, BigDecimal amount) {
        Auction auction = auctions.get(id);
        if (auction == null) {
            return;
        }
        Instant now = Instant.now();
        Bid bid = new Bid(bidder, amount.setScale(2, RoundingMode.HALF_UP), now.minusSeconds(300));
        Auction updated = auction.withBid(bid, now.minusSeconds(300));
        auctions.put(id, updated);
    }
}
