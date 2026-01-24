package com.randomproject.onlineauction;

import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.springframework.http.HttpStatus.NOT_FOUND;

@Controller
public class OnlineAuctionController {
    private final AuctionService service;

    public OnlineAuctionController(AuctionService service) {
        this.service = service;
    }

    @GetMapping("/")
    public String home(@RequestParam(value = "message", required = false) String message, Model model) {
        model.addAttribute("openAuctions", service.openAuctions());
        model.addAttribute("closedAuctions", service.closedAuctions());
        model.addAttribute("summary", service.summary());
        model.addAttribute("message", message);
        model.addAttribute("defaultDuration", service.getDefaultDurationMinutes());
        model.addAttribute("defaultIncrement", service.getMinBidIncrement());
        model.addAttribute("defaultStarting", new BigDecimal("25.00"));
        model.addAttribute("now", Instant.now());
        return "index";
    }

    @GetMapping("/auction/{id}")
    public String auction(@PathVariable String id,
                          @RequestParam(value = "message", required = false) String message,
                          Model model) {
        Auction auction = service.get(id)
                .orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "Auction not found"));
        BigDecimal nextMinimum = auction.getHighestBid()
                .map(bid -> bid.getAmount().add(service.getMinBidIncrement()))
                .orElse(auction.getStartingPrice());
        model.addAttribute("auction", auction);
        model.addAttribute("message", message);
        model.addAttribute("now", Instant.now());
        model.addAttribute("minBidIncrement", service.getMinBidIncrement());
        model.addAttribute("nextMinimum", nextMinimum);
        return "auction";
    }

    @PostMapping("/auctions")
    public String createAuction(@RequestParam("id") String id,
                                @RequestParam("title") String title,
                                @RequestParam(value = "description", required = false) String description,
                                @RequestParam("seller") String seller,
                                @RequestParam("startingPrice") BigDecimal startingPrice,
                                @RequestParam(value = "reservePrice", required = false) BigDecimal reservePrice,
                                @RequestParam(value = "durationMinutes", required = false) Integer durationMinutes,
                                RedirectAttributes redirectAttributes) {
        try {
            Auction auction = service.create(id, title, description, seller, startingPrice, reservePrice, durationMinutes);
            redirectAttributes.addAttribute("message", "Created auction " + auction.getId() + ".");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/auctions/{id}/bid")
    public String placeBid(@PathVariable String id,
                           @RequestParam("bidder") String bidder,
                           @RequestParam("amount") BigDecimal amount,
                           RedirectAttributes redirectAttributes) {
        try {
            service.placeBid(id, bidder, amount);
            redirectAttributes.addAttribute("message", "Bid placed successfully.");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/auction/" + id;
    }

    @PostMapping("/auctions/{id}/close")
    public String closeAuction(@PathVariable String id, RedirectAttributes redirectAttributes) {
        try {
            service.close(id);
            redirectAttributes.addAttribute("message", "Auction closed.");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/auction/" + id;
    }

    @PostMapping("/api/auctions")
    @ResponseBody
    public ResponseEntity<AuctionResponse> apiCreate(@RequestBody AuctionCreateRequest request) {
        try {
            Auction auction = service.create(
                    request.id(),
                    request.title(),
                    request.description(),
                    request.seller(),
                    request.startingPrice(),
                    request.reservePrice(),
                    request.durationMinutes());
            return ResponseEntity.status(201).body(toResponse(auction));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/auctions")
    @ResponseBody
    public List<AuctionResponse> apiAuctions() {
        return service.all().stream().map(this::toResponse).toList();
    }

    @GetMapping("/api/auctions/{id}")
    @ResponseBody
    public ResponseEntity<AuctionResponse> apiAuction(@PathVariable String id) {
        Optional<Auction> auction = service.get(id);
        return auction.map(value -> ResponseEntity.ok(toResponse(value)))
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/api/auctions/{id}/bids")
    @ResponseBody
    public ResponseEntity<AuctionResponse> apiBid(@PathVariable String id, @RequestBody BidCreateRequest request) {
        try {
            Auction auction = service.placeBid(id, request.bidder(), request.amount());
            return ResponseEntity.status(201).body(toResponse(auction));
        } catch (IllegalArgumentException ex) {
            if (ex.getMessage() != null && ex.getMessage().startsWith("Unknown auction")) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/auctions/{id}/bids")
    @ResponseBody
    public ResponseEntity<List<BidResponse>> apiBids(@PathVariable String id) {
        return service.get(id)
                .map(auction -> ResponseEntity.ok(auction.getBids().stream().map(this::toResponse).toList()))
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/api/auctions/{id}/close")
    @ResponseBody
    public ResponseEntity<AuctionResponse> apiClose(@PathVariable String id) {
        try {
            Auction auction = service.close(id);
            return ResponseEntity.ok(toResponse(auction));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.notFound().build();
        }
    }

    private AuctionResponse toResponse(Auction auction) {
        Bid highest = auction.getHighestBid().orElse(null);
        return new AuctionResponse(
                auction.getId(),
                auction.getTitle(),
                auction.getDescription(),
                auction.getSeller(),
                auction.getStartingPrice(),
                auction.getReservePrice(),
                auction.getStatus(),
                auction.getCreatedAt(),
                auction.getEndsAt(),
                auction.getUpdatedAt(),
                auction.getCurrentPrice(),
                highest == null ? null : highest.getBidder(),
                highest == null ? null : highest.getAmount(),
                auction.getBidCount(),
                auction.isReserveMet());
    }

    private BidResponse toResponse(Bid bid) {
        return new BidResponse(bid.getBidder(), bid.getAmount(), bid.getPlacedAt());
    }
}
