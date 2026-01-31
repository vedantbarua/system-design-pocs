package com.randomproject.pointofsale;

import java.math.BigDecimal;
import java.util.List;

public class CartSummary {
    private final List<CartLine> lines;
    private final BigDecimal subtotal;
    private final BigDecimal tax;
    private final BigDecimal total;
    private final int itemCount;

    public CartSummary(List<CartLine> lines, BigDecimal subtotal, BigDecimal tax, BigDecimal total, int itemCount) {
        this.lines = lines;
        this.subtotal = subtotal;
        this.tax = tax;
        this.total = total;
        this.itemCount = itemCount;
    }

    public List<CartLine> getLines() {
        return lines;
    }

    public BigDecimal getSubtotal() {
        return subtotal;
    }

    public BigDecimal getTax() {
        return tax;
    }

    public BigDecimal getTotal() {
        return total;
    }

    public int getItemCount() {
        return itemCount;
    }
}
