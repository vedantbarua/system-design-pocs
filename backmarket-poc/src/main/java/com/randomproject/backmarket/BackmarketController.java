package com.randomproject.backmarket;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api")
public class BackmarketController {
    private final BackmarketService service;

    public BackmarketController(BackmarketService service) {
        this.service = service;
    }

    @GetMapping("/products")
    public List<Product> listProducts(@RequestParam(required = false) String query,
                                      @RequestParam(required = false) String category) {
        return service.listProducts(query, category);
    }

    @GetMapping("/products/{id}")
    public Product getProduct(@PathVariable long id) {
        return service.getProduct(id);
    }

    @GetMapping("/recommendations")
    public List<Product> recommendations(@RequestParam(required = false) Long productId) {
        return service.recommendations(productId);
    }

    @GetMapping("/cart")
    public CartView cart(@RequestParam(required = false) String shippingSpeed) {
        return service.getCartView(shippingSpeed);
    }

    @PostMapping("/cart/items")
    public CartView addToCart(@Valid @RequestBody AddToCartRequest request) {
        return service.addToCart(request);
    }

    @PatchMapping("/cart/items/{productId}")
    public CartView updateCartItem(@PathVariable long productId,
                                   @Valid @RequestBody UpdateCartRequest request) {
        return service.updateCartItem(productId, request);
    }

    @DeleteMapping("/cart/items/{productId}")
    public CartView removeCartItem(@PathVariable long productId) {
        return service.removeCartItem(productId);
    }

    @PostMapping("/orders/checkout")
    public Order checkout(@RequestBody(required = false) CheckoutRequest request) {
        return service.checkout(request);
    }

    @GetMapping("/orders")
    public List<Order> listOrders() {
        return service.listOrders();
    }

    @PostMapping("/trade-in/quote")
    public TradeInQuoteResponse tradeInQuote(@Valid @RequestBody TradeInQuoteRequest request) {
        return service.tradeInQuote(request);
    }
}
