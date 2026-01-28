package com.randomproject.ticketmaster;

import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.springframework.http.HttpStatus.NOT_FOUND;

@Controller
public class TicketmasterController {
    private final TicketmasterService service;

    public TicketmasterController(TicketmasterService service) {
        this.service = service;
    }

    @GetMapping("/")
    public String home(@RequestParam(value = "message", required = false) String message, Model model) {
        model.addAttribute("summary", service.summary());
        model.addAttribute("events", service.listEventListings());
        model.addAttribute("venues", service.listVenues());
        model.addAttribute("categories", EventCategory.values());
        model.addAttribute("message", message);
        model.addAttribute("now", LocalDateTime.now().withSecond(0).withNano(0));
        model.addAttribute("holdDuration", service.getHoldDurationMinutes());
        model.addAttribute("maxTickets", service.getMaxTicketsPerOrder());
        return "index";
    }

    @GetMapping("/events/{id}")
    public String event(@PathVariable String id,
                        @RequestParam(value = "message", required = false) String message,
                        Model model) {
        Event event = service.getEvent(id)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Event not found"));
        Venue venue = service.getVenue(event.getVenueId()).orElse(null);
        model.addAttribute("event", event);
        model.addAttribute("venue", venue);
        model.addAttribute("status", service.eventStatus(event));
        model.addAttribute("tiers", service.tiersForEvent(event.getId()));
        model.addAttribute("holds", service.holdsForEvent(event.getId()));
        model.addAttribute("orders", service.ordersForEvent(event.getId()));
        model.addAttribute("message", message);
        model.addAttribute("holdDuration", service.getHoldDurationMinutes());
        model.addAttribute("maxTickets", service.getMaxTicketsPerOrder());
        return "event";
    }

    @PostMapping("/venues")
    public String createVenue(@RequestParam("id") String id,
                              @RequestParam("name") String name,
                              @RequestParam("city") String city,
                              @RequestParam("state") String state,
                              @RequestParam("capacity") Integer capacity,
                              RedirectAttributes redirectAttributes) {
        try {
            service.createVenue(id, name, city, state, capacity);
            redirectAttributes.addAttribute("message", "Venue created.");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/events")
    public String createEvent(@RequestParam("id") String id,
                              @RequestParam("name") String name,
                              @RequestParam("category") String category,
                              @RequestParam("venueId") String venueId,
                              @RequestParam("startsAt") String startsAt,
                              @RequestParam(value = "headliner", required = false) String headliner,
                              @RequestParam(value = "description", required = false) String description,
                              RedirectAttributes redirectAttributes) {
        try {
            LocalDateTime parsedStart = LocalDateTime.parse(startsAt);
            service.createEvent(id, name, category, venueId, parsedStart, headliner, description);
            redirectAttributes.addAttribute("message", "Event created.");
        } catch (RuntimeException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/events/{id}/tiers")
    public String createTier(@PathVariable String id,
                             @RequestParam("tierId") String tierId,
                             @RequestParam("name") String name,
                             @RequestParam("price") java.math.BigDecimal price,
                             @RequestParam("capacity") Integer capacity,
                             RedirectAttributes redirectAttributes) {
        try {
            service.createTier(id, tierId, name, price, capacity);
            redirectAttributes.addAttribute("message", "Tier created.");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/events/" + id;
    }

    @PostMapping("/holds")
    public String createHold(@RequestParam("eventId") String eventId,
                             @RequestParam("tierId") String tierId,
                             @RequestParam("customer") String customer,
                             @RequestParam("quantity") Integer quantity,
                             RedirectAttributes redirectAttributes) {
        try {
            Hold hold = service.createHold(eventId, tierId, customer, quantity);
            redirectAttributes.addAttribute("message", "Hold created: " + hold.getId());
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/events/" + eventId;
    }

    @PostMapping("/holds/{id}/release")
    public String releaseHold(@PathVariable String id,
                              @RequestParam("eventId") String eventId,
                              RedirectAttributes redirectAttributes) {
        try {
            service.releaseHold(id);
            redirectAttributes.addAttribute("message", "Hold released.");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/events/" + eventId;
    }

    @PostMapping("/orders")
    public String createOrder(@RequestParam("eventId") String eventId,
                              @RequestParam("tierId") String tierId,
                              @RequestParam("customer") String customer,
                              @RequestParam("quantity") Integer quantity,
                              @RequestParam(value = "holdId", required = false) String holdId,
                              RedirectAttributes redirectAttributes) {
        try {
            Order order = service.createOrder(eventId, tierId, customer, quantity, holdId);
            redirectAttributes.addAttribute("message", "Order confirmed: " + order.getId());
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/events/" + eventId;
    }

    @GetMapping("/api/venues")
    @ResponseBody
    public List<VenueResponse> apiVenues() {
        return service.listVenues().stream()
                .map(venue -> new VenueResponse(venue.getId(), venue.getName(), venue.getCity(), venue.getState(), venue.getCapacity()))
                .toList();
    }

    @PostMapping("/api/venues")
    @ResponseBody
    public ResponseEntity<VenueResponse> apiCreateVenue(@RequestBody VenueCreateRequest request) {
        try {
            Venue venue = service.createVenue(request.id(), request.name(), request.city(), request.state(), request.capacity());
            return ResponseEntity.status(201)
                    .body(new VenueResponse(venue.getId(), venue.getName(), venue.getCity(), venue.getState(), venue.getCapacity()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/events")
    @ResponseBody
    public List<EventResponse> apiEvents() {
        return service.listEvents().stream().map(this::toEventResponse).toList();
    }

    @GetMapping("/api/events/{id}")
    @ResponseBody
    public ResponseEntity<EventResponse> apiEvent(@PathVariable String id) {
        Optional<Event> event = service.getEvent(id);
        return event.map(value -> ResponseEntity.ok(toEventResponse(value)))
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/api/events")
    @ResponseBody
    public ResponseEntity<EventResponse> apiCreateEvent(@RequestBody EventCreateRequest request) {
        try {
            Event event = service.createEvent(request.id(), request.name(), request.category(), request.venueId(),
                    request.startsAt(), request.headliner(), request.description());
            return ResponseEntity.status(201).body(toEventResponse(event));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/events/{id}/tiers")
    @ResponseBody
    public ResponseEntity<List<TierResponse>> apiTiers(@PathVariable String id) {
        try {
            List<TierResponse> tiers = service.tiersForEvent(id).stream()
                    .map(tier -> new TierResponse(tier.getId(), tier.getEventId(), tier.getName(), tier.getPrice(),
                            tier.getCapacity(), tier.getSoldCount(), tier.getHeldCount(), tier.getAvailable()))
                    .toList();
            return ResponseEntity.ok(tiers);
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.notFound().build();
        }
    }

    @PostMapping("/api/events/{id}/tiers")
    @ResponseBody
    public ResponseEntity<TierResponse> apiCreateTier(@PathVariable String id, @RequestBody TierCreateRequest request) {
        try {
            TicketTier tier = service.createTier(id, request.id(), request.name(), request.price(), request.capacity());
            return ResponseEntity.status(201)
                    .body(new TierResponse(tier.getId(), tier.getEventId(), tier.getName(), tier.getPrice(),
                            tier.getCapacity(), tier.getSoldCount(), tier.getHeldCount(), tier.getAvailable()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/holds")
    @ResponseBody
    public List<HoldResponse> apiHolds(@RequestParam(value = "eventId", required = false) String eventId) {
        List<Hold> holds = StringUtils.hasText(eventId) ? service.holdsForEvent(eventId) :
                service.listEvents().stream().flatMap(event -> service.holdsForEvent(event.getId()).stream()).toList();
        return holds.stream()
                .map(hold -> new HoldResponse(hold.getId(), hold.getEventId(), hold.getTierId(), hold.getCustomer(),
                        hold.getQuantity(), hold.getStatus(), hold.getCreatedAt(), hold.getExpiresAt(), hold.getUpdatedAt()))
                .toList();
    }

    @PostMapping("/api/holds")
    @ResponseBody
    public ResponseEntity<HoldResponse> apiCreateHold(@RequestBody HoldCreateRequest request) {
        try {
            Hold hold = service.createHold(request.eventId(), request.tierId(), request.customer(), request.quantity());
            return ResponseEntity.status(201)
                    .body(new HoldResponse(hold.getId(), hold.getEventId(), hold.getTierId(), hold.getCustomer(),
                            hold.getQuantity(), hold.getStatus(), hold.getCreatedAt(), hold.getExpiresAt(), hold.getUpdatedAt()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/holds/{id}/release")
    @ResponseBody
    public ResponseEntity<HoldResponse> apiReleaseHold(@PathVariable String id) {
        try {
            Hold hold = service.releaseHold(id);
            return ResponseEntity.ok(new HoldResponse(hold.getId(), hold.getEventId(), hold.getTierId(), hold.getCustomer(),
                    hold.getQuantity(), hold.getStatus(), hold.getCreatedAt(), hold.getExpiresAt(), hold.getUpdatedAt()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.notFound().build();
        }
    }

    @GetMapping("/api/orders")
    @ResponseBody
    public List<OrderResponse> apiOrders(@RequestParam(value = "eventId", required = false) String eventId) {
        List<Order> orders = StringUtils.hasText(eventId) ? service.ordersForEvent(eventId) :
                service.listEvents().stream().flatMap(event -> service.ordersForEvent(event.getId()).stream()).toList();
        return orders.stream()
                .map(order -> new OrderResponse(order.getId(), order.getEventId(), order.getTierId(), order.getCustomer(),
                        order.getQuantity(), order.getUnitPrice(), order.getFees(), order.getTotal(), order.getStatus(),
                        order.getCreatedAt()))
                .toList();
    }

    @PostMapping("/api/orders")
    @ResponseBody
    public ResponseEntity<OrderResponse> apiCreateOrder(@RequestBody OrderCreateRequest request) {
        try {
            Order order = service.createOrder(request.eventId(), request.tierId(), request.customer(), request.quantity(),
                    request.holdId());
            return ResponseEntity.status(201)
                    .body(new OrderResponse(order.getId(), order.getEventId(), order.getTierId(), order.getCustomer(),
                            order.getQuantity(), order.getUnitPrice(), order.getFees(), order.getTotal(),
                            order.getStatus(), order.getCreatedAt()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/summary")
    @ResponseBody
    public EventSummary apiSummary() {
        return service.summary();
    }

    private EventResponse toEventResponse(Event event) {
        Venue venue = service.getVenue(event.getVenueId()).orElse(null);
        EventListing listing = service.listEventListings().stream()
                .filter(item -> item.getEvent().getId().equals(event.getId()))
                .findFirst()
                .orElse(null);
        int totalCapacity = listing != null ? listing.getTotalCapacity() : 0;
        int totalAvailable = listing != null ? listing.getTotalAvailable() : 0;
        return new EventResponse(event.getId(), event.getName(), event.getCategory(), event.getVenueId(),
                venue != null ? venue.getName() : null, event.getStartsAt(), service.eventStatus(event),
                totalCapacity, totalAvailable,
                listing != null ? listing.getMinPrice() : null,
                listing != null ? listing.getMaxPrice() : null,
                event.getHeadliner(), event.getDescription(), event.getCreatedAt(), event.getUpdatedAt());
    }
}
