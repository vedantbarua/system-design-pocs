package com.randomproject.ticketmaster;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

@Service
public class TicketmasterService {
    private static final Pattern ID_PATTERN = Pattern.compile("^[A-Za-z0-9._:-]+$");

    private final Map<String, Venue> venues = new ConcurrentHashMap<>();
    private final Map<String, Event> events = new ConcurrentHashMap<>();
    private final Map<String, TicketTier> tiers = new ConcurrentHashMap<>();
    private final Map<String, Hold> holds = new ConcurrentHashMap<>();
    private final Map<String, Order> orders = new ConcurrentHashMap<>();

    private final int holdDurationMinutes;
    private final int maxTicketsPerOrder;
    private final BigDecimal serviceFeePercent;
    private final BigDecimal flatFee;

    public TicketmasterService(
            @Value("${ticketmaster.hold-duration-minutes:12}") int holdDurationMinutes,
            @Value("${ticketmaster.max-tickets-per-order:8}") int maxTicketsPerOrder,
            @Value("${ticketmaster.service-fee-percent:0.12}") BigDecimal serviceFeePercent,
            @Value("${ticketmaster.flat-fee:2.50}") BigDecimal flatFee) {
        this.holdDurationMinutes = holdDurationMinutes > 0 ? holdDurationMinutes : 12;
        this.maxTicketsPerOrder = Math.max(1, maxTicketsPerOrder);
        this.serviceFeePercent = normalizePercent(serviceFeePercent);
        this.flatFee = normalizeAmount(flatFee, BigDecimal.ZERO);
        seedData();
    }

    public int getHoldDurationMinutes() {
        return holdDurationMinutes;
    }

    public int getMaxTicketsPerOrder() {
        return maxTicketsPerOrder;
    }

    public BigDecimal getServiceFeePercent() {
        return serviceFeePercent;
    }

    public BigDecimal getFlatFee() {
        return flatFee;
    }

    public synchronized List<EventListing> listEventListings() {
        refreshExpiredHolds();
        List<Event> sorted = events.values().stream()
                .sorted(Comparator.comparing(Event::getStartsAt))
                .toList();
        List<EventListing> listings = new ArrayList<>();
        for (Event event : sorted) {
            listings.add(toListing(event));
        }
        return listings;
    }

    public synchronized List<Event> listEvents() {
        refreshExpiredHolds();
        return events.values().stream()
                .sorted(Comparator.comparing(Event::getStartsAt))
                .toList();
    }

    public synchronized Optional<Event> getEvent(String id) {
        String normalized = normalizeIdAllowingUnknown(id);
        if (normalized == null) {
            return Optional.empty();
        }
        refreshExpiredHolds();
        return Optional.ofNullable(events.get(normalized));
    }

    public synchronized Optional<Venue> getVenue(String id) {
        String normalized = normalizeIdAllowingUnknown(id);
        if (normalized == null) {
            return Optional.empty();
        }
        return Optional.ofNullable(venues.get(normalized));
    }

    public synchronized List<Venue> listVenues() {
        return venues.values().stream()
                .sorted(Comparator.comparing(Venue::getName))
                .toList();
    }

    public synchronized List<TicketTier> tiersForEvent(String eventId) {
        String normalized = normalizeId(eventId);
        refreshExpiredHolds();
        return tiers.values().stream()
                .filter(tier -> tier.getEventId().equals(normalized))
                .sorted(Comparator.comparing(TicketTier::getPrice))
                .toList();
    }

    public synchronized List<Hold> holdsForEvent(String eventId) {
        String normalized = normalizeId(eventId);
        refreshExpiredHolds();
        return holds.values().stream()
                .filter(hold -> hold.getEventId().equals(normalized))
                .sorted(Comparator.comparing(Hold::getCreatedAt).reversed())
                .toList();
    }

    public synchronized List<Order> ordersForEvent(String eventId) {
        String normalized = normalizeId(eventId);
        return orders.values().stream()
                .filter(order -> order.getEventId().equals(normalized))
                .sorted(Comparator.comparing(Order::getCreatedAt).reversed())
                .toList();
    }

    public synchronized Venue createVenue(String id,
                                          String name,
                                          String city,
                                          String state,
                                          Integer capacity) {
        String normalizedId = normalizeId(id);
        if (venues.containsKey(normalizedId)) {
            throw new IllegalArgumentException("Venue id already exists: " + normalizedId);
        }
        String normalizedName = normalizeRequired("Venue name", name);
        String normalizedCity = normalizeRequired("City", city);
        String normalizedState = normalizeRequired("State", state);
        int normalizedCapacity = normalizePositiveInt("Capacity", capacity, 1);
        Instant now = Instant.now();
        Venue venue = new Venue(normalizedId, normalizedName, normalizedCity, normalizedState, normalizedCapacity, now, now);
        venues.put(normalizedId, venue);
        return venue;
    }

    public synchronized Event createEvent(String id,
                                          String name,
                                          String category,
                                          String venueId,
                                          LocalDateTime startsAt,
                                          String headliner,
                                          String description) {
        String normalizedId = normalizeId(id);
        if (events.containsKey(normalizedId)) {
            throw new IllegalArgumentException("Event id already exists: " + normalizedId);
        }
        String normalizedName = normalizeRequired("Event name", name);
        EventCategory normalizedCategory = normalizeCategory(category);
        String normalizedVenueId = normalizeId(venueId);
        Venue venue = venues.get(normalizedVenueId);
        if (venue == null) {
            throw new IllegalArgumentException("Unknown venue: " + normalizedVenueId);
        }
        LocalDateTime normalizedStart = normalizeStartTime(startsAt);
        String normalizedHeadliner = normalizeOptional(headliner, 80);
        String normalizedDescription = normalizeOptional(description, 280);
        Instant now = Instant.now();
        Event event = new Event(normalizedId, normalizedName, normalizedCategory, normalizedVenueId, normalizedStart,
                normalizedHeadliner, normalizedDescription, now, now, EventStatus.ON_SALE);
        events.put(normalizedId, event);
        return event;
    }

    public synchronized TicketTier createTier(String eventId,
                                              String id,
                                              String name,
                                              BigDecimal price,
                                              Integer capacity) {
        String normalizedEventId = normalizeId(eventId);
        Event event = events.get(normalizedEventId);
        if (event == null) {
            throw new IllegalArgumentException("Unknown event: " + normalizedEventId);
        }
        String normalizedId = normalizeId(id);
        if (tiers.containsKey(normalizedId)) {
            throw new IllegalArgumentException("Tier id already exists: " + normalizedId);
        }
        String normalizedName = normalizeRequired("Tier name", name);
        BigDecimal normalizedPrice = normalizeAmount(price, new BigDecimal("1.00"));
        int normalizedCapacity = normalizePositiveInt("Tier capacity", capacity, 1);
        Instant now = Instant.now();
        TicketTier tier = new TicketTier(normalizedId, normalizedEventId, normalizedName, normalizedPrice,
                normalizedCapacity, 0, 0, now, now);
        tiers.put(normalizedId, tier);
        return tier;
    }

    public synchronized Hold createHold(String eventId,
                                        String tierId,
                                        String customer,
                                        Integer quantity) {
        String normalizedEventId = normalizeId(eventId);
        String normalizedTierId = normalizeId(tierId);
        Event event = events.get(normalizedEventId);
        if (event == null) {
            throw new IllegalArgumentException("Unknown event: " + normalizedEventId);
        }
        TicketTier tier = tiers.get(normalizedTierId);
        if (tier == null || !tier.getEventId().equals(normalizedEventId)) {
            throw new IllegalArgumentException("Unknown ticket tier: " + normalizedTierId);
        }
        String normalizedCustomer = normalizeRequired("Customer", customer);
        int normalizedQuantity = normalizePositiveInt("Quantity", quantity, 1);
        if (normalizedQuantity > maxTicketsPerOrder) {
            throw new IllegalArgumentException("Max tickets per order is " + maxTicketsPerOrder + ".");
        }
        refreshExpiredHolds();
        if (tier.getAvailable() < normalizedQuantity) {
            throw new IllegalArgumentException("Not enough tickets available for this tier.");
        }
        String holdId = generateId("hold", normalizedEventId, normalizedTierId, holds.size() + 1);
        Instant now = Instant.now();
        Instant expiresAt = now.plusSeconds(holdDurationMinutes * 60L);
        Hold hold = new Hold(holdId, normalizedEventId, normalizedTierId, normalizedCustomer,
                normalizedQuantity, HoldStatus.ACTIVE, now, expiresAt, now);
        TicketTier updatedTier = tier.withHold(normalizedQuantity, now);
        tiers.put(updatedTier.getId(), updatedTier);
        holds.put(holdId, hold);
        return hold;
    }

    public synchronized Hold releaseHold(String holdId) {
        String normalizedHoldId = normalizeId(holdId);
        Hold hold = holds.get(normalizedHoldId);
        if (hold == null) {
            throw new IllegalArgumentException("Unknown hold: " + normalizedHoldId);
        }
        refreshExpiredHolds();
        if (hold.getStatus() != HoldStatus.ACTIVE) {
            throw new IllegalArgumentException("Hold is no longer active.");
        }
        TicketTier tier = tiers.get(hold.getTierId());
        if (tier != null) {
            TicketTier updatedTier = tier.withReleaseHold(hold.getQuantity(), Instant.now());
            tiers.put(updatedTier.getId(), updatedTier);
        }
        Hold updated = hold.withStatus(HoldStatus.RELEASED, Instant.now());
        holds.put(updated.getId(), updated);
        return updated;
    }

    public synchronized Order createOrder(String eventId,
                                          String tierId,
                                          String customer,
                                          Integer quantity,
                                          String holdId) {
        String normalizedEventId = normalizeId(eventId);
        String normalizedTierId = normalizeId(tierId);
        Event event = events.get(normalizedEventId);
        if (event == null) {
            throw new IllegalArgumentException("Unknown event: " + normalizedEventId);
        }
        TicketTier tier = tiers.get(normalizedTierId);
        if (tier == null || !tier.getEventId().equals(normalizedEventId)) {
            throw new IllegalArgumentException("Unknown ticket tier: " + normalizedTierId);
        }
        String normalizedCustomer = normalizeRequired("Customer", customer);
        int normalizedQuantity = normalizePositiveInt("Quantity", quantity, 1);
        if (normalizedQuantity > maxTicketsPerOrder) {
            throw new IllegalArgumentException("Max tickets per order is " + maxTicketsPerOrder + ".");
        }
        refreshExpiredHolds();
        Hold hold = null;
        if (StringUtils.hasText(holdId)) {
            String normalizedHoldId = normalizeId(holdId);
            hold = holds.get(normalizedHoldId);
            if (hold == null) {
                throw new IllegalArgumentException("Unknown hold: " + normalizedHoldId);
            }
            if (hold.getStatus() != HoldStatus.ACTIVE) {
                throw new IllegalArgumentException("Hold is no longer active.");
            }
            if (!hold.getEventId().equals(normalizedEventId) || !hold.getTierId().equals(normalizedTierId)) {
                throw new IllegalArgumentException("Hold does not match event and tier.");
            }
            if (normalizedQuantity != hold.getQuantity()) {
                throw new IllegalArgumentException("Quantity must match hold quantity: " + hold.getQuantity());
            }
        } else {
            if (tier.getAvailable() < normalizedQuantity) {
                throw new IllegalArgumentException("Not enough tickets available for this tier.");
            }
        }

        Instant now = Instant.now();
        BigDecimal subtotal = tier.getPrice().multiply(BigDecimal.valueOf(normalizedQuantity));
        BigDecimal percentFee = subtotal.multiply(serviceFeePercent);
        BigDecimal fees = percentFee.add(flatFee).setScale(2, RoundingMode.HALF_UP);
        BigDecimal total = subtotal.add(fees).setScale(2, RoundingMode.HALF_UP);

        if (hold != null) {
            TicketTier updatedTier = tier.withSaleFromHold(normalizedQuantity, now);
            tiers.put(updatedTier.getId(), updatedTier);
            Hold updatedHold = hold.withStatus(HoldStatus.CONVERTED, now);
            holds.put(updatedHold.getId(), updatedHold);
        } else {
            TicketTier updatedTier = tier.withSale(normalizedQuantity, now);
            tiers.put(updatedTier.getId(), updatedTier);
        }

        String orderId = generateId("order", normalizedEventId, normalizedTierId, orders.size() + 1);
        Order order = new Order(orderId, normalizedEventId, normalizedTierId, normalizedCustomer,
                normalizedQuantity, tier.getPrice(), fees, total, OrderStatus.CONFIRMED, now);
        orders.put(orderId, order);
        return order;
    }

    public synchronized EventSummary summary() {
        refreshExpiredHolds();
        int totalEvents = events.size();
        int upcoming = 0;
        int totalTiers = tiers.size();
        int totalHolds = (int) holds.values().stream().filter(hold -> hold.getStatus() == HoldStatus.ACTIVE).count();
        int totalOrders = orders.size();
        int totalTicketsSold = tiers.values().stream().mapToInt(TicketTier::getSoldCount).sum();
        BigDecimal revenue = orders.values().stream()
                .map(Order::getTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        LocalDateTime now = LocalDateTime.now();
        for (Event event : events.values()) {
            if (event.getStartsAt().isAfter(now)) {
                upcoming++;
            }
        }
        return new EventSummary(totalEvents, upcoming, venues.size(), totalTiers, totalHolds,
                totalOrders, totalTicketsSold, revenue.setScale(2, RoundingMode.HALF_UP));
    }

    public synchronized EventStatus eventStatus(Event event) {
        if (event.getStatus() == EventStatus.CANCELED) {
            return EventStatus.CANCELED;
        }
        if (event.getStartsAt().isBefore(LocalDateTime.now())) {
            return EventStatus.PAST;
        }
        List<TicketTier> eventTiers = tiersForEvent(event.getId());
        int available = eventTiers.stream().mapToInt(TicketTier::getAvailable).sum();
        return available == 0 && !eventTiers.isEmpty() ? EventStatus.SOLD_OUT : EventStatus.ON_SALE;
    }

    private EventListing toListing(Event event) {
        Venue venue = venues.get(event.getVenueId());
        List<TicketTier> eventTiers = tiers.values().stream()
                .filter(tier -> tier.getEventId().equals(event.getId()))
                .toList();
        int totalCapacity = eventTiers.stream().mapToInt(TicketTier::getCapacity).sum();
        int totalSold = eventTiers.stream().mapToInt(TicketTier::getSoldCount).sum();
        int totalHeld = eventTiers.stream().mapToInt(TicketTier::getHeldCount).sum();
        int totalAvailable = eventTiers.stream().mapToInt(TicketTier::getAvailable).sum();
        BigDecimal minPrice = eventTiers.stream().map(TicketTier::getPrice).min(BigDecimal::compareTo).orElse(null);
        BigDecimal maxPrice = eventTiers.stream().map(TicketTier::getPrice).max(BigDecimal::compareTo).orElse(null);
        EventStatus status = eventStatus(event);
        return new EventListing(event, venue, status, totalCapacity, totalSold, totalHeld, totalAvailable, minPrice, maxPrice);
    }

    private void refreshExpiredHolds() {
        Instant now = Instant.now();
        for (Hold hold : new ArrayList<>(holds.values())) {
            if (hold.isExpired(now)) {
                expireHold(hold, now);
            }
        }
    }

    private void expireHold(Hold hold, Instant now) {
        TicketTier tier = tiers.get(hold.getTierId());
        if (tier != null) {
            TicketTier updatedTier = tier.withReleaseHold(hold.getQuantity(), now);
            tiers.put(updatedTier.getId(), updatedTier);
        }
        Hold updated = hold.withStatus(HoldStatus.EXPIRED, now);
        holds.put(updated.getId(), updated);
    }

    private String normalizeId(String id) {
        if (!StringUtils.hasText(id)) {
            throw new IllegalArgumentException("Id cannot be empty.");
        }
        String normalized = id.trim();
        if (!ID_PATTERN.matcher(normalized).matches()) {
            throw new IllegalArgumentException("Id must use letters, numbers, '.', '-', '_', or ':'.");
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

    private String normalizeRequired(String field, String value) {
        if (!StringUtils.hasText(value)) {
            throw new IllegalArgumentException(field + " cannot be empty.");
        }
        return value.trim();
    }

    private String normalizeOptional(String value, int maxLen) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        String trimmed = value.trim();
        if (trimmed.length() > maxLen) {
            return trimmed.substring(0, maxLen);
        }
        return trimmed;
    }

    private int normalizePositiveInt(String field, Integer value, int minimum) {
        if (value == null || value < minimum) {
            throw new IllegalArgumentException(field + " must be at least " + minimum + ".");
        }
        return value;
    }

    private BigDecimal normalizeAmount(BigDecimal value, BigDecimal minimum) {
        if (value == null) {
            throw new IllegalArgumentException("Amount is required.");
        }
        if (value.compareTo(minimum) < 0) {
            throw new IllegalArgumentException("Amount must be at least " + minimum + ".");
        }
        return value.setScale(2, RoundingMode.HALF_UP);
    }

    private BigDecimal normalizePercent(BigDecimal value) {
        if (value == null) {
            return new BigDecimal("0.10");
        }
        if (value.compareTo(BigDecimal.ZERO) < 0) {
            throw new IllegalArgumentException("Fee percent cannot be negative.");
        }
        return value;
    }

    private EventCategory normalizeCategory(String value) {
        if (!StringUtils.hasText(value)) {
            throw new IllegalArgumentException("Category is required.");
        }
        try {
            return EventCategory.valueOf(value.trim().toUpperCase());
        } catch (IllegalArgumentException ex) {
            throw new IllegalArgumentException("Unknown category: " + value);
        }
    }

    private LocalDateTime normalizeStartTime(LocalDateTime startsAt) {
        if (startsAt == null) {
            throw new IllegalArgumentException("Start time is required.");
        }
        return startsAt;
    }

    private String generateId(String prefix, String eventId, String tierId, int sequence) {
        return prefix + "-" + eventId + "-" + tierId + "-" + sequence;
    }

    private void seedData() {
        Venue arena = new Venue("venue-msg", "Midtown Arena", "New York", "NY", 18000, Instant.now(), Instant.now());
        Venue theatre = new Venue("venue-regal", "Regal Theatre", "Chicago", "IL", 4200, Instant.now(), Instant.now());
        Venue park = new Venue("venue-bayfront", "Bayfront Park", "San Francisco", "CA", 15000, Instant.now(), Instant.now());
        venues.put(arena.getId(), arena);
        venues.put(theatre.getId(), theatre);
        venues.put(park.getId(), park);

        Event concert = new Event("event-echoes", "Echoes Live Tour", EventCategory.CONCERT, arena.getId(),
                LocalDateTime.now().plusDays(12).withHour(19).withMinute(30),
                "The Echoes", "Stadium show with surprise guests.", Instant.now(), Instant.now(), EventStatus.ON_SALE);
        Event sports = new Event("event-city-derby", "City Derby", EventCategory.SPORTS, arena.getId(),
                LocalDateTime.now().plusDays(20).withHour(18).withMinute(0),
                "NYC United vs. Gotham FC", "Rivalry night under the lights.", Instant.now(), Instant.now(), EventStatus.ON_SALE);
        Event comedy = new Event("event-late-night", "Late Night Laughs", EventCategory.COMEDY, theatre.getId(),
                LocalDateTime.now().plusDays(7).withHour(20).withMinute(0),
                "Maya Torres", "Standup showcase with guest comics.", Instant.now(), Instant.now(), EventStatus.ON_SALE);
        events.put(concert.getId(), concert);
        events.put(sports.getId(), sports);
        events.put(comedy.getId(), comedy);

        TicketTier ga = new TicketTier("tier-echoes-ga", concert.getId(), "GA Floor", new BigDecimal("85.00"), 6000, 1200, 2,
                Instant.now(), Instant.now());
        TicketTier vip = new TicketTier("tier-echoes-vip", concert.getId(), "VIP Club", new BigDecimal("220.00"), 800, 320, 0,
                Instant.now(), Instant.now());
        TicketTier derbyLower = new TicketTier("tier-derby-lower", sports.getId(), "Lower Bowl", new BigDecimal("95.00"), 5000, 2100, 0,
                Instant.now(), Instant.now());
        TicketTier derbyClub = new TicketTier("tier-derby-club", sports.getId(), "Club Seats", new BigDecimal("180.00"), 1200, 540, 0,
                Instant.now(), Instant.now());
        TicketTier comedyOrch = new TicketTier("tier-laughs-orch", comedy.getId(), "Orchestra", new BigDecimal("55.00"), 1200, 420, 0,
                Instant.now(), Instant.now());
        TicketTier comedyBal = new TicketTier("tier-laughs-bal", comedy.getId(), "Balcony", new BigDecimal("38.00"), 1000, 300, 0,
                Instant.now(), Instant.now());

        tiers.put(ga.getId(), ga);
        tiers.put(vip.getId(), vip);
        tiers.put(derbyLower.getId(), derbyLower);
        tiers.put(derbyClub.getId(), derbyClub);
        tiers.put(comedyOrch.getId(), comedyOrch);
        tiers.put(comedyBal.getId(), comedyBal);

        Hold seededHold = new Hold("hold-event-echoes-tier-echoes-ga-1", concert.getId(), ga.getId(), "Sasha Kim", 2,
                HoldStatus.ACTIVE, Instant.now(), Instant.now().plusSeconds(holdDurationMinutes * 60L), Instant.now());
        holds.put(seededHold.getId(), seededHold);

        Order seededOrder = new Order("order-event-echoes-tier-echoes-vip-1", concert.getId(), vip.getId(), "Andre White", 2,
                vip.getPrice(), new BigDecimal("55.30"), new BigDecimal("495.30"), OrderStatus.CONFIRMED, Instant.now());
        orders.put(seededOrder.getId(), seededOrder);
    }
}
