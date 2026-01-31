package com.randomproject.pointofsale;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public class Sale {
    private final String id;
    private final List<SaleLine> lines;
    private final BigDecimal subtotal;
    private final BigDecimal tax;
    private final BigDecimal total;
    private final BigDecimal amountTendered;
    private final BigDecimal changeDue;
    private final String paymentMethod;
    private final Instant createdAt;

    public Sale(String id,
                List<SaleLine> lines,
                BigDecimal subtotal,
                BigDecimal tax,
                BigDecimal total,
                BigDecimal amountTendered,
                BigDecimal changeDue,
                String paymentMethod,
                Instant createdAt) {
        this.id = id;
        this.lines = lines;
        this.subtotal = subtotal;
        this.tax = tax;
        this.total = total;
        this.amountTendered = amountTendered;
        this.changeDue = changeDue;
        this.paymentMethod = paymentMethod;
        this.createdAt = createdAt;
    }

    public String getId() {
        return id;
    }

    public List<SaleLine> getLines() {
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

    public BigDecimal getAmountTendered() {
        return amountTendered;
    }

    public BigDecimal getChangeDue() {
        return changeDue;
    }

    public String getPaymentMethod() {
        return paymentMethod;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
