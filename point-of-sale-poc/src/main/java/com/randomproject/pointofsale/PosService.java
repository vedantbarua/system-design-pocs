package com.randomproject.pointofsale;

import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicLong;

@Service
public class PosService {
    private static final BigDecimal TAX_RATE = new BigDecimal("0.0825");
    private static final String ID_PATTERN = "^[A-Za-z0-9._:-]+$";
    private final Map<String, CatalogItem> catalog = new ConcurrentHashMap<>();
    private final Map<String, Integer> cart = new ConcurrentHashMap<>();
    private final List<Sale> sales = new CopyOnWriteArrayList<>();
    private final AtomicLong saleSequence = new AtomicLong(1000);

    public BigDecimal taxRate() {
        return TAX_RATE;
    }

    public List<CatalogItem> allCatalog() {
        return new ArrayList<>(catalog.values());
    }

    public Optional<CatalogItem> getCatalogItem(String id) {
        return Optional.ofNullable(catalog.get(id));
    }

    public CatalogItem upsertCatalog(String id, String name, String category, BigDecimal price) {
        validateId(id);
        String normalizedName = validateName(name, "Item name");
        String normalizedCategory = normalizeOptional(category, 80, "Category");
        BigDecimal normalizedPrice = validateMoney(price, "Price");

        CatalogItem existing = catalog.get(id);
        Instant now = Instant.now();
        CatalogItem item = new CatalogItem(
                id,
                normalizedName,
                normalizedCategory,
                normalizedPrice,
                existing == null ? now : existing.getCreatedAt(),
                now);
        catalog.put(id, item);
        return item;
    }

    public boolean deleteCatalog(String id) {
        boolean removed = catalog.remove(id) != null;
        if (removed) {
            cart.remove(id);
        }
        return removed;
    }

    public CartSummary addToCart(String itemId, int quantity) {
        validateId(itemId);
        validateQuantity(quantity);
        ensureCatalog(itemId);
        cart.merge(itemId, quantity, Integer::sum);
        return buildCartSummary();
    }

    public CartSummary setCartQuantity(String itemId, int quantity) {
        validateId(itemId);
        validateQuantity(quantity);
        ensureCatalog(itemId);
        cart.put(itemId, quantity);
        return buildCartSummary();
    }

    public CartSummary removeFromCart(String itemId) {
        cart.remove(itemId);
        return buildCartSummary();
    }

    public CartSummary clearCart() {
        cart.clear();
        return buildCartSummary();
    }

    public CartSummary cartSummary() {
        return buildCartSummary();
    }

    public Sale checkout(String paymentMethod, BigDecimal amountTendered) {
        String normalizedMethod = validateName(paymentMethod, "Payment method");
        BigDecimal tendered = validateMoney(amountTendered, "Amount tendered");
        CartSummary summary = buildCartSummary();
        if (summary.getLines().isEmpty()) {
            throw new IllegalArgumentException("Cart is empty.");
        }
        if (tendered.compareTo(summary.getTotal()) < 0) {
            throw new IllegalArgumentException("Amount tendered is below total.");
        }

        List<SaleLine> saleLines = summary.getLines().stream()
                .map(line -> new SaleLine(
                        line.getItemId(),
                        line.getName(),
                        line.getUnitPrice(),
                        line.getQuantity(),
                        line.getLineTotal()))
                .toList();

        BigDecimal changeDue = scaleMoney(tendered.subtract(summary.getTotal()));
        Sale sale = new Sale(
                "sale_" + saleSequence.incrementAndGet(),
                saleLines,
                summary.getSubtotal(),
                summary.getTax(),
                summary.getTotal(),
                tendered,
                changeDue,
                normalizedMethod,
                Instant.now());
        sales.add(0, sale);
        cart.clear();
        return sale;
    }

    public List<Sale> allSales() {
        return new ArrayList<>(sales);
    }

    public Optional<Sale> getSale(String id) {
        return sales.stream().filter(sale -> sale.getId().equals(id)).findFirst();
    }

    private CartSummary buildCartSummary() {
        List<CartLine> lines = new ArrayList<>();
        BigDecimal subtotal = BigDecimal.ZERO;
        int itemCount = 0;

        List<String> invalidIds = new ArrayList<>();
        for (Map.Entry<String, Integer> entry : cart.entrySet()) {
            CatalogItem item = catalog.get(entry.getKey());
            if (item == null) {
                invalidIds.add(entry.getKey());
                continue;
            }
            int quantity = entry.getValue();
            BigDecimal lineTotal = scaleMoney(item.getPrice().multiply(BigDecimal.valueOf(quantity)));
            lines.add(new CartLine(item.getId(), item.getName(), item.getPrice(), quantity, lineTotal));
            subtotal = subtotal.add(lineTotal);
            itemCount += quantity;
        }
        invalidIds.forEach(cart::remove);

        lines.sort(Comparator.comparing(CartLine::getName));
        subtotal = scaleMoney(subtotal);
        BigDecimal tax = scaleMoney(subtotal.multiply(TAX_RATE));
        BigDecimal total = scaleMoney(subtotal.add(tax));

        return new CartSummary(lines, subtotal, tax, total, itemCount);
    }

    private void ensureCatalog(String itemId) {
        if (!catalog.containsKey(itemId)) {
            throw new IllegalArgumentException("Unknown item: " + itemId);
        }
    }

    private void validateId(String id) {
        if (id == null || id.isBlank()) {
            throw new IllegalArgumentException("Item id is required.");
        }
        if (id.length() > 64 || !id.matches(ID_PATTERN)) {
            throw new IllegalArgumentException("Item id must be <= 64 chars and use letters, numbers, . _ - : only.");
        }
    }

    private String validateName(String value, String field) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " is required.");
        }
        String trimmed = value.trim();
        if (trimmed.length() > 120) {
            throw new IllegalArgumentException(field + " must be <= 120 chars.");
        }
        return trimmed;
    }

    private String normalizeOptional(String value, int max, String field) {
        if (value == null || value.isBlank()) {
            return "";
        }
        String trimmed = value.trim();
        if (trimmed.length() > max) {
            throw new IllegalArgumentException(field + " must be <= " + max + " chars.");
        }
        return trimmed;
    }

    private BigDecimal validateMoney(BigDecimal amount, String field) {
        if (amount == null) {
            throw new IllegalArgumentException(field + " is required.");
        }
        if (amount.compareTo(new BigDecimal("0.01")) < 0) {
            throw new IllegalArgumentException(field + " must be greater than zero.");
        }
        return scaleMoney(amount);
    }

    private void validateQuantity(int quantity) {
        if (quantity < 1 || quantity > 999) {
            throw new IllegalArgumentException("Quantity must be between 1 and 999.");
        }
    }

    private BigDecimal scaleMoney(BigDecimal value) {
        return value.setScale(2, RoundingMode.HALF_UP);
    }
}
