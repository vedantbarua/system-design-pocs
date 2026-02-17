package com.randomproject.backmarket;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Random;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;

@Service
public class BackmarketService {
    private static final double TAX_RATE = 0.0825;
    private static final double STANDARD_SHIPPING = 4.99;
    private static final double EXPRESS_SHIPPING = 12.99;
    private static final double FREE_SHIPPING_THRESHOLD = 50.0;
    private static final double TRADE_IN_BASE = 28.0;

    private final Map<Long, Product> products = new ConcurrentHashMap<>();
    private final Map<Long, CartItem> cart = new ConcurrentHashMap<>();
    private final List<Order> orders = new CopyOnWriteArrayList<>();
    private final AtomicLong orderSeq = new AtomicLong(4000);
    private final Random random = new Random();

    public BackmarketService() {
        seedProducts();
    }

    public List<Product> listProducts(String query, String category) {
        return products.values().stream()
                .filter(product -> matchesQuery(product, query))
                .filter(product -> matchesCategory(product, category))
                .sorted(Comparator.comparing(Product::rating).reversed())
                .collect(Collectors.toList());
    }

    public Product getProduct(long id) {
        Product product = products.get(id);
        if (product == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Product not found");
        }
        return product;
    }

    public List<Product> recommendations(Long productId) {
        String category = null;
        if (productId != null) {
            Product product = products.get(productId);
            if (product != null) {
                category = product.category();
            }
        }
        String finalCategory = category;
        return products.values().stream()
                .filter(product -> product.stock() > 0)
                .filter(product -> finalCategory == null || product.category().equalsIgnoreCase(finalCategory))
                .sorted(Comparator.comparing(Product::rating).reversed())
                .limit(6)
                .collect(Collectors.toList());
    }

    public CartView getCartView(String shippingSpeed) {
        List<CartLineItem> lineItems = buildLineItems();
        PricingSummary pricing = pricingFor(lineItems, shippingSpeed);
        int itemCount = lineItems.stream().mapToInt(CartLineItem::quantity).sum();
        return new CartView(lineItems, itemCount, pricing);
    }

    public CartView addToCart(AddToCartRequest request) {
        Product product = getProduct(request.productId());
        int newQty = request.quantity();
        CartItem existing = cart.get(product.id());
        if (existing != null) {
            newQty += existing.quantity();
        }
        validateStock(product, newQty);
        cart.put(product.id(), new CartItem(product.id(), newQty));
        return getCartView("STANDARD");
    }

    public CartView updateCartItem(long productId, UpdateCartRequest request) {
        Product product = getProduct(productId);
        if (request.quantity() == 0) {
            cart.remove(productId);
            return getCartView("STANDARD");
        }
        validateStock(product, request.quantity());
        cart.put(productId, new CartItem(productId, request.quantity()));
        return getCartView("STANDARD");
    }

    public CartView removeCartItem(long productId) {
        cart.remove(productId);
        return getCartView("STANDARD");
    }

    public Order checkout(CheckoutRequest request) {
        if (cart.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cart is empty");
        }
        String shippingSpeed = normalizeShippingSpeed(request == null ? null : request.shippingSpeed());
        List<CartLineItem> lineItems = buildLineItems();
        for (CartLineItem line : lineItems) {
            Product product = getProduct(line.productId());
            if (line.quantity() > product.stock()) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "Insufficient stock for " + product.name());
            }
        }
        for (CartLineItem line : lineItems) {
            Product product = getProduct(line.productId());
            Product updated = new Product(
                    product.id(),
                    product.name(),
                    product.category(),
                    product.description(),
                    product.price(),
                    product.originalPrice(),
                    product.conditionGrade(),
                    product.warrantyMonths(),
                    product.sellerName(),
                    product.ecoSavingsKg(),
                    product.rating(),
                    product.reviewCount(),
                    product.stock() - line.quantity(),
                    product.imageUrl()
            );
            products.put(product.id(), updated);
        }

        PricingSummary pricing = pricingFor(lineItems, shippingSpeed);
        Order order = new Order(
                orderSeq.incrementAndGet(),
                lineItems,
                pricing,
                "CONFIRMED",
                shippingSpeed,
                Instant.now(),
                estimateDelivery(shippingSpeed)
        );
        orders.add(0, order);
        cart.clear();
        return order;
    }

    public List<Order> listOrders() {
        return new ArrayList<>(orders);
    }

    private List<CartLineItem> buildLineItems() {
        return cart.values().stream()
                .map(item -> {
                    Product product = getProduct(item.productId());
                    double lineTotal = roundToCents(product.price() * item.quantity());
                    return new CartLineItem(
                            product.id(),
                            product.name(),
                            product.imageUrl(),
                            product.price(),
                            product.conditionGrade(),
                            product.warrantyMonths(),
                            product.sellerName(),
                            item.quantity(),
                            lineTotal
                    );
                })
                .sorted(Comparator.comparing(CartLineItem::name))
                .collect(Collectors.toList());
    }

    private PricingSummary pricingFor(List<CartLineItem> items, String shippingSpeed) {
        double subtotal = items.stream().mapToDouble(CartLineItem::lineTotal).sum();
        double shipping = 0.0;
        if (subtotal > 0) {
            if ("EXPRESS".equalsIgnoreCase(shippingSpeed)) {
                shipping = EXPRESS_SHIPPING;
            } else if (subtotal < FREE_SHIPPING_THRESHOLD) {
                shipping = STANDARD_SHIPPING;
            }
        }
        double tax = subtotal * TAX_RATE;
        return new PricingSummary(
                roundToCents(subtotal),
                roundToCents(shipping),
                roundToCents(tax),
                roundToCents(subtotal + shipping + tax)
        );
    }

    private String normalizeShippingSpeed(String shippingSpeed) {
        if (shippingSpeed == null || shippingSpeed.isBlank()) {
            return "STANDARD";
        }
        return shippingSpeed.trim().toUpperCase(Locale.ROOT);
    }

    private void validateStock(Product product, int requestedQty) {
        if (requestedQty > product.stock()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Only " + product.stock() + " left for " + product.name());
        }
    }

    private boolean matchesQuery(Product product, String query) {
        if (query == null || query.isBlank()) {
            return true;
        }
        String lowered = query.toLowerCase(Locale.ROOT);
        return product.name().toLowerCase(Locale.ROOT).contains(lowered)
                || product.description().toLowerCase(Locale.ROOT).contains(lowered)
                || product.category().toLowerCase(Locale.ROOT).contains(lowered);
    }

    private boolean matchesCategory(Product product, String category) {
        if (category == null || category.isBlank()) {
            return true;
        }
        return product.category().equalsIgnoreCase(category);
    }

    private Instant estimateDelivery(String shippingSpeed) {
        int days = Objects.equals(shippingSpeed, "EXPRESS") ? 2 : 5;
        return Instant.now().plus(days, ChronoUnit.DAYS);
    }

    private double roundToCents(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    private void seedProducts() {
        List<Product> seeded = List.of(
                new Product(2001, "NovaPhone 13 Pro 256GB", "Phones",
                        "Refurbished flagship phone with OLED display and triple camera.",
                        689.0, 999.0, "A", 12, "BrightLoop", 27.4, 4.7, 2684, 18,
                        "https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?auto=format&fit=crop&w=600&q=80"),
                new Product(2002, "NovaPhone 12 128GB", "Phones",
                        "Certified refurbished device with new battery and charging cable.",
                        429.0, 799.0, "B", 12, "EcoMobile", 24.1, 4.5, 1890, 26,
                        "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=600&q=80"),
                new Product(2003, "ZenBook Air 13\" 512GB", "Laptops",
                        "Lightweight laptop tuned for productivity with 16GB RAM.",
                        799.0, 1299.0, "A", 12, "LoopTech", 41.6, 4.6, 940, 12,
                        "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=600&q=80"),
                new Product(2004, "PulseTab 11\" Wi-Fi", "Tablets",
                        "Refurbished tablet with 11-inch display and stylus support.",
                        319.0, 499.0, "A", 12, "RenewCircuit", 18.3, 4.4, 620, 20,
                        "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80"),
                new Product(2005, "SoundPod Max", "Audio",
                        "Over-ear headphones with adaptive noise cancelling.",
                        189.0, 399.0, "B", 12, "BrightLoop", 11.2, 4.3, 1420, 34,
                        "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80"),
                new Product(2006, "StreamCam Pro 4K", "Cameras",
                        "Refurbished streaming camera with 4K capture.",
                        139.0, 249.0, "A", 6, "EcoMobile", 7.8, 4.2, 512, 38,
                        "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=600&q=80"),
                new Product(2007, "FlexWatch Series 6", "Wearables",
                        "Fitness watch with heart-rate + sleep coaching.",
                        169.0, 329.0, "B", 12, "SecondWave", 9.1, 4.5, 2104, 44,
                        "https://images.unsplash.com/photo-1517504734587-2890819debab?auto=format&fit=crop&w=600&q=80"),
                new Product(2008, "LumenHome Smart Speaker", "Smart Home",
                        "Voice assistant speaker with room-filling sound.",
                        79.0, 149.0, "A", 6, "LoopTech", 6.2, 4.1, 688, 52,
                        "https://images.unsplash.com/photo-1511367461989-f85a21fda167?auto=format&fit=crop&w=600&q=80"),
                new Product(2009, "AuraBook Pro 15\" 1TB", "Laptops",
                        "Creator laptop with 32GB RAM and dedicated graphics.",
                        1099.0, 1999.0, "A", 12, "RenewCircuit", 58.9, 4.7, 760, 8,
                        "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=600&q=80"),
                new Product(2010, "NovaPhone 11 64GB", "Phones",
                        "Entry refurbished device, ideal for backups.",
                        289.0, 599.0, "C", 6, "SecondWave", 19.7, 4.0, 482, 40,
                        "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=600&q=80"),
                new Product(2011, "PulseTab Mini 8\"", "Tablets",
                        "Compact tablet with new screen + battery.",
                        199.0, 349.0, "B", 6, "BrightLoop", 12.2, 4.2, 388, 29,
                        "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=600&q=80"),
                new Product(2012, "GlowCast Home Hub", "Smart Home",
                        "Refurbished streaming hub with Wi-Fi 6.",
                        59.0, 99.0, "A", 6, "EcoMobile", 5.4, 4.1, 350, 62,
                        "https://images.unsplash.com/photo-1511367461989-f85a21fda167?auto=format&fit=crop&w=600&q=80")
        );

        for (Product product : seeded) {
            products.put(product.id(), product);
        }

        for (int i = 0; i < 4; i++) {
            Product product = new Product(
                    3000 + i,
                    "Clearance Drop " + (i + 1),
                    "Accessories",
                    "Limited batch of refurbished accessories and chargers.",
                    22 + random.nextInt(40),
                    59 + random.nextInt(40),
                    random.nextBoolean() ? "B" : "C",
                    6,
                    random.nextBoolean() ? "BrightLoop" : "SecondWave",
                    3.2 + random.nextDouble() * 2.8,
                    3.8 + random.nextDouble() * 1.0,
                    40 + random.nextInt(160),
                    12 + random.nextInt(18),
                    "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=600&q=80"
            );
            products.put(product.id(), product);
        }
    }

    public TradeInQuoteResponse tradeInQuote(TradeInQuoteRequest request) {
        String condition = request.condition().trim().toUpperCase(Locale.ROOT);
        double conditionMultiplier = switch (condition) {
            case "A", "EXCELLENT", "LIKE_NEW" -> 1.2;
            case "B", "GOOD" -> 1.0;
            case "C", "FAIR" -> 0.75;
            default -> 0.6;
        };
        double storageMultiplier = 1 + Math.min(0.6, request.storageGb() / 512.0);
        double offer = TRADE_IN_BASE * conditionMultiplier * storageMultiplier + random.nextInt(45);
        double payout = roundToCents(offer * 0.95);
        String notes = "Inspection covers battery health, screen, and ports. "
                + "Payout is reduced for water damage or carrier locks.";
        return new TradeInQuoteResponse(
                "TI-" + Math.abs(random.nextInt(999999)),
                roundToCents(offer),
                payout,
                condition,
                notes,
                Instant.now().plus(3, ChronoUnit.DAYS)
        );
    }
}
