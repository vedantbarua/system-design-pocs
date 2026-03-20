package com.randomproject.tradinglog;

import jakarta.validation.Valid;
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

import java.math.BigDecimal;
import java.util.Map;

@Controller
public class TradingLogController {
    private final TradingLogService service;

    public TradingLogController(TradingLogService service) {
        this.service = service;
    }

    @GetMapping("/")
    public String home(@RequestParam(value = "message", required = false) String message, Model model) {
        TradingLogSnapshot snapshot = service.snapshot();
        model.addAttribute("snapshot", snapshot);
        model.addAttribute("message", message);
        model.addAttribute("defaultQuantity", 25);
        model.addAttribute("defaultTradePrice", new BigDecimal("100.00"));
        model.addAttribute("defaultMarketPrice", new BigDecimal("101.25"));
        model.addAttribute("tradeSides", TradeSide.values());
        return "index";
    }

    @PostMapping("/trades")
    public String logTrade(@RequestParam("symbol") String symbol,
                           @RequestParam("side") TradeSide side,
                           @RequestParam("quantity") int quantity,
                           @RequestParam("price") BigDecimal price,
                           @RequestParam("trader") String trader,
                           @RequestParam(value = "venue", required = false) String venue,
                           RedirectAttributes redirectAttributes) {
        try {
            TradeEntry trade = service.logTrade(symbol, side, quantity, price, trader, venue);
            redirectAttributes.addAttribute("message",
                    "Logged " + trade.getSide() + " " + trade.getQuantity() + " " + trade.getSymbol() + " @ $" + trade.getPrice());
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/prices")
    public String upsertPrice(@RequestParam("symbol") String symbol,
                              @RequestParam("marketPrice") BigDecimal marketPrice,
                              RedirectAttributes redirectAttributes) {
        try {
            BigDecimal normalizedPrice = service.upsertMarketPrice(symbol, marketPrice);
            redirectAttributes.addAttribute("message", "Updated " + symbol.trim().toUpperCase() + " market price to $" + normalizedPrice);
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/api/trades")
    @ResponseBody
    public ResponseEntity<TradeEntry> apiLogTrade(@Valid @RequestBody TradeRequest request) {
        try {
            TradeEntry trade = service.logTrade(
                    request.symbol(),
                    request.side(),
                    request.quantity(),
                    request.price(),
                    request.trader(),
                    request.venue());
            return ResponseEntity.status(201).body(trade);
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/prices")
    @ResponseBody
    public ResponseEntity<Map<String, BigDecimal>> apiUpsertPrice(@Valid @RequestBody PriceUpdateRequest request) {
        try {
            BigDecimal normalized = service.upsertMarketPrice(request.symbol(), request.marketPrice());
            return ResponseEntity.ok(Map.of("marketPrice", normalized));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/trades")
    @ResponseBody
    public java.util.List<TradeEntry> apiTrades() {
        return service.trades();
    }

    @GetMapping("/api/positions")
    @ResponseBody
    public java.util.List<PositionSnapshot> apiPositions() {
        return service.snapshot().getPositions();
    }

    @GetMapping("/api/summary")
    @ResponseBody
    public PortfolioSummary apiSummary() {
        return service.snapshot().getSummary();
    }

    @GetMapping("/api/alerts")
    @ResponseBody
    public java.util.List<AlertEntry> apiAlerts() {
        return service.snapshot().getAlerts();
    }

    @GetMapping("/api/prices")
    @ResponseBody
    public Map<String, BigDecimal> apiPrices() {
        return service.marketPrices();
    }

    @GetMapping("/api/positions/{symbol}")
    @ResponseBody
    public ResponseEntity<PositionSnapshot> apiPosition(@PathVariable String symbol) {
        return service.snapshot().getPositions().stream()
                .filter(position -> position.getSymbol().equalsIgnoreCase(symbol))
                .findFirst()
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
}
