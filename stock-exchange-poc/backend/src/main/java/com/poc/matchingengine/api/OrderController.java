package com.poc.matchingengine.api;

import com.poc.matchingengine.service.MatchingEngineService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
@Tag(name = "Orders & Market Data")
public class OrderController {
  private final MatchingEngineService engineService;

  public OrderController(MatchingEngineService engineService) {
    this.engineService = engineService;
  }

  @PostMapping("/orders")
  @Operation(summary = "Place a limit order")
  public OrderResponse placeOrder(@Valid @RequestBody OrderRequest request) {
    return engineService.placeOrder(request);
  }

  @GetMapping("/engine/sequence")
  @Operation(summary = "Get last processed engine sequence")
  public long currentSequence() {
    return engineService.currentSequence();
  }

  @GetMapping("/market/{symbol}")
  @Operation(summary = "Get current order book snapshot and recent trades")
  public MarketStateResponse marketState(@PathVariable String symbol) {
    return engineService.marketState(symbol);
  }
}
