package com.randomproject.onlineauction;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

public class Auction {
    private final String id;
    private final String title;
    private final String description;
    private final String seller;
    private final BigDecimal startingPrice;
    private final BigDecimal reservePrice;
    private final Instant createdAt;
    private final Instant endsAt;
    private final Instant updatedAt;
    private final AuctionStatus status;
    private final List<Bid> bids;

    public Auction(String id,
                   String title,
                   String description,
                   String seller,
                   BigDecimal startingPrice,
                   BigDecimal reservePrice,
                   Instant createdAt,
                   Instant endsAt,
                   Instant updatedAt,
                   AuctionStatus status,
                   List<Bid> bids) {
        this.id = id;
        this.title = title;
        this.description = description;
        this.seller = seller;
        this.startingPrice = startingPrice;
        this.reservePrice = reservePrice;
        this.createdAt = createdAt;
        this.endsAt = endsAt;
        this.updatedAt = updatedAt;
        this.status = status;
        this.bids = List.copyOf(bids == null ? List.of() : bids);
    }

    public String getId() {
        return id;
    }

    public String getTitle() {
        return title;
    }

    public String getDescription() {
        return description;
    }

    public String getSeller() {
        return seller;
    }

    public BigDecimal getStartingPrice() {
        return startingPrice;
    }

    public BigDecimal getReservePrice() {
        return reservePrice;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getEndsAt() {
        return endsAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public AuctionStatus getStatus() {
        return status;
    }

    public List<Bid> getBids() {
        return bids;
    }

    public Optional<Bid> getHighestBid() {
        return bids.stream()
                .max(Comparator.comparing(Bid::getAmount)
                        .thenComparing(Bid::getPlacedAt));
    }

    public BigDecimal getCurrentPrice() {
        return getHighestBid().map(Bid::getAmount).orElse(startingPrice);
    }

    public boolean isReserveMet() {
        if (reservePrice == null) {
            return true;
        }
        return getHighestBid().map(bid -> bid.getAmount().compareTo(reservePrice) >= 0).orElse(false);
    }

    public int getBidCount() {
        return bids.size();
    }

    public Auction withBid(Bid bid, Instant updatedAt) {
        List<Bid> nextBids = new ArrayList<>(bids);
        nextBids.add(bid);
        return new Auction(id, title, description, seller, startingPrice, reservePrice,
                createdAt, endsAt, updatedAt, status, nextBids);
    }

    public Auction withStatus(AuctionStatus status, Instant updatedAt) {
        return new Auction(id, title, description, seller, startingPrice, reservePrice,
                createdAt, endsAt, updatedAt, status, bids);
    }
}
