package com.randomproject.onlineshopping;

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
public class OnlineShoppingService {
    private static final double TAX_RATE = 0.0825;
    private static final double STANDARD_SHIPPING = 4.99;
    private static final double EXPRESS_SHIPPING = 12.99;
    private static final double FREE_SHIPPING_THRESHOLD = 50.0;

    private final Map<Long, Product> products = new ConcurrentHashMap<>();
    private final Map<Long, CartItem> cart = new ConcurrentHashMap<>();
    private final List<Order> orders = new CopyOnWriteArrayList<>();
    private final AtomicLong orderSeq = new AtomicLong(4000);
    private final Random random = new Random();

    public OnlineShoppingService() {
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
                    product.rating(),
                    product.reviewCount(),
                    product.stock() - line.quantity(),
                    product.primeEligible(),
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
                new Product(1001, "EchoBeat Wireless Headphones", "Electronics",
                        "Noise-canceling over-ear headset with 40-hour battery.", 129.99, 4.6, 1842, 42, true,
                        "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=600&q=80"),
                new Product(1002, "LumenSmart LED Desk Lamp", "Home",
                        "Adjustable LED lamp with warm/cool modes and USB-C.", 59.0, 4.4, 622, 75, true,
                        "https://images.unsplash.com/photo-1481277542470-605612bd2d61?auto=format&fit=crop&w=600&q=80"),
                new Product(1003, "AeroBlend Portable Blender", "Kitchen",
                        "Rechargeable smoothie blender with travel lid.", 74.5, 4.2, 311, 18, false,
                        "https://images.unsplash.com/photo-1528825871115-3581a5387919?auto=format&fit=crop&w=600&q=80"),
                new Product(1004, "SummitTrail Hiking Backpack", "Outdoors",
                        "35L waterproof pack with ventilated back panel.", 88.75, 4.7, 955, 27, true,
                        "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=600&q=80"),
                new Product(1005, "Nimbus Cotton Sheets Set", "Home",
                        "400-thread-count percale sheets with cooling weave.", 96.0, 4.5, 1388, 36, true,
                        "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?auto=format&fit=crop&w=600&q=80"),
                new Product(1006, "StudioPro Webcam 2K", "Electronics",
                        "2K streaming webcam with ring light and mic.", 79.99, 4.3, 508, 51, false,
                        "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=600&q=80"),
                new Product(1007, "CityRide Commuter Helmet", "Sports",
                        "Lightweight helmet with magnetic buckle and vents.", 44.25, 4.1, 214, 63, true,
                        "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=600&q=80"),
                new Product(1008, "TerraCeramic Plant Pots", "Garden",
                        "Set of 3 matte ceramic pots with drainage tray.", 34.99, 4.8, 402, 82, true,
                        "https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=600&q=80"),
                new Product(1009, "GlowForge Soy Candles", "Lifestyle",
                        "Set of 4 soy candles with cedar + citrus scents.", 28.5, 4.0, 190, 120, false,
                        "https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&w=600&q=80"),
                new Product(1010, "NimbusTrail Running Shoes", "Sports",
                        "Neutral running shoes with responsive foam.", 118.0, 4.6, 1280, 24, true,
                        "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=600&q=80"),
                new Product(1011, "RidgeLine Stainless Bottles", "Outdoors",
                        "Insulated bottles, 24oz, keep cold 24h.", 26.0, 4.4, 733, 96, true,
                        "https://images.unsplash.com/photo-1526401485004-46910ecc8e51?auto=format&fit=crop&w=600&q=80"),
                new Product(1012, "Morning Brew Starter Kit", "Kitchen",
                        "Pour-over kit with kettle, dripper, and filters.", 84.5, 4.7, 610, 33, true,
                        "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=600&q=80")
        );

        for (Product product : seeded) {
            products.put(product.id(), product);
        }

        for (int i = 0; i < 4; i++) {
            long id = 2000 + i;
            Product product = new Product(
                    id,
                    "Limited Drop Item " + (i + 1),
                    "Collectibles",
                    "Seasonal capsule product with limited inventory.",
                    42 + random.nextInt(60),
                    3.8 + random.nextDouble() * 1.0,
                    40 + random.nextInt(160),
                    12 + random.nextInt(18),
                    random.nextBoolean(),
                    "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=600&q=80"
            );
            products.put(product.id(), product);
        }
    }
}
