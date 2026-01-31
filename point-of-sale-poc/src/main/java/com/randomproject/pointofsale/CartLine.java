package com.randomproject.pointofsale;

import java.math.BigDecimal;

public class CartLine {
    private final String itemId;
    private final String name;
    private final BigDecimal unitPrice;
    private final int quantity;
    private final BigDecimal lineTotal;

    public CartLine(String itemId, String name, BigDecimal unitPrice, int quantity, BigDecimal lineTotal) {
        this.itemId = itemId;
        this.name = name;
        this.unitPrice = unitPrice;
        this.quantity = quantity;
        this.lineTotal = lineTotal;
    }

    public String getItemId() {
        return itemId;
    }

    public String getName() {
        return name;
    }

    public BigDecimal getUnitPrice() {
        return unitPrice;
    }

    public int getQuantity() {
        return quantity;
    }

    public BigDecimal getLineTotal() {
        return lineTotal;
    }
}
