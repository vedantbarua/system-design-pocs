package com.randomproject.pricetracker;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import java.math.BigDecimal;
import java.util.Comparator;
import java.util.List;

@Controller
public class PriceTrackerController {
    private final PriceTrackerService service;

    public PriceTrackerController(PriceTrackerService service) {
        this.service = service;
    }

    @GetMapping("/")
    public String home(@RequestParam(value = "message", required = false) String message, Model model) {
        List<PriceTrackerItem> items = sortedItems();
        List<PriceTrackerItem> alerts = sortedAlerts();
        model.addAttribute("items", items);
        model.addAttribute("alerts", alerts);
        model.addAttribute("alertCount", alerts.size());
        model.addAttribute("message", message);
        model.addAttribute("defaultTarget", new BigDecimal("199.00"));
        model.addAttribute("defaultCurrent", new BigDecimal("249.00"));
        return "index";
    }

    @PostMapping("/items")
    public String trackItem(@RequestParam("id") String id,
                            @RequestParam("name") String name,
                            @RequestParam(value = "url", required = false) String url,
                            @RequestParam("targetPrice") BigDecimal targetPrice,
                            @RequestParam("currentPrice") BigDecimal currentPrice,
                            RedirectAttributes redirectAttributes) {
        try {
            PriceTrackerItem item = service.track(id, name, url, targetPrice, currentPrice);
            String status = item.isBelowTarget() ? "below target" : "above target";
            redirectAttributes.addAttribute("message", "Tracking " + item.getId() + " (" + status + ").");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/items/{id}/price")
    public String updatePrice(@PathVariable String id,
                              @RequestParam("currentPrice") BigDecimal currentPrice,
                              RedirectAttributes redirectAttributes) {
        try {
            PriceTrackerItem item = service.updatePrice(id, currentPrice);
            String status = item.isBelowTarget() ? "below target" : "above target";
            redirectAttributes.addAttribute("message", "Updated " + item.getId() + " to " + status + ".");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/items/{id}/delete")
    public String deleteItem(@PathVariable String id, RedirectAttributes redirectAttributes) {
        boolean removed = service.delete(id);
        redirectAttributes.addAttribute("message", removed ? "Deleted " + id + "." : "Item not found: " + id);
        return "redirect:/";
    }

    @PostMapping("/api/items")
    @ResponseBody
    public ResponseEntity<PriceTrackerResponse> apiTrack(@Valid @RequestBody PriceTrackRequest request) {
        try {
            PriceTrackerItem item = service.track(
                    request.id(),
                    request.name(),
                    request.url(),
                    request.targetPrice(),
                    request.currentPrice());
            return ResponseEntity.status(201).body(toResponse(item));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/items")
    @ResponseBody
    public List<PriceTrackerResponse> apiItems() {
        return sortedItems().stream().map(this::toResponse).toList();
    }

    @GetMapping("/api/items/{id}")
    @ResponseBody
    public ResponseEntity<PriceTrackerResponse> apiItem(@PathVariable String id) {
        return service.get(id)
                .map(item -> ResponseEntity.ok(toResponse(item)))
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/api/items/{id}/price")
    @ResponseBody
    public ResponseEntity<PriceTrackerResponse> apiUpdatePrice(@PathVariable String id,
                                                               @Valid @RequestBody PriceUpdateRequest request) {
        try {
            PriceTrackerItem item = service.updatePrice(id, request.currentPrice());
            return ResponseEntity.ok(toResponse(item));
        } catch (IllegalArgumentException ex) {
            if (ex.getMessage() != null && ex.getMessage().startsWith("Unknown item")) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.badRequest().build();
        }
    }

    @DeleteMapping("/api/items/{id}")
    @ResponseBody
    public ResponseEntity<Void> apiDelete(@PathVariable String id) {
        boolean removed = service.delete(id);
        return removed ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }

    @GetMapping("/api/alerts")
    @ResponseBody
    public List<PriceTrackerResponse> apiAlerts() {
        return sortedAlerts().stream().map(this::toResponse).toList();
    }

    private List<PriceTrackerItem> sortedItems() {
        return service.all().stream()
                .sorted(Comparator.comparing(PriceTrackerItem::getUpdatedAt).reversed())
                .toList();
    }

    private List<PriceTrackerItem> sortedAlerts() {
        return service.alerts().stream()
                .sorted(Comparator.comparing(PriceTrackerItem::getUpdatedAt).reversed())
                .toList();
    }

    private PriceTrackerResponse toResponse(PriceTrackerItem item) {
        return new PriceTrackerResponse(
                item.getId(),
                item.getName(),
                item.getUrl(),
                item.getTargetPrice(),
                item.getCurrentPrice(),
                item.getCreatedAt(),
                item.getUpdatedAt(),
                item.isBelowTarget());
    }
}
