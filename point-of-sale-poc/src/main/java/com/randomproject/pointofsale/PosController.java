package com.randomproject.pointofsale;

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
public class PosController {
    private final PosService service;

    public PosController(PosService service) {
        this.service = service;
    }

    @GetMapping("/")
    public String home(@RequestParam(value = "message", required = false) String message, Model model) {
        List<CatalogItem> catalog = service.allCatalog().stream()
                .sorted(Comparator.comparing(CatalogItem::getUpdatedAt).reversed())
                .toList();
        CartSummary cart = service.cartSummary();
        List<Sale> sales = service.allSales();
        model.addAttribute("catalog", catalog);
        model.addAttribute("cart", cart);
        model.addAttribute("sales", sales);
        model.addAttribute("message", message);
        model.addAttribute("taxRate", service.taxRate().multiply(new BigDecimal("100")));
        model.addAttribute("defaultPrice", new BigDecimal("4.99"));
        model.addAttribute("defaultQuantity", 1);
        model.addAttribute("defaultTendered", new BigDecimal("20.00"));
        return "index";
    }

    @PostMapping("/catalog")
    public String upsertCatalog(@RequestParam("id") String id,
                                @RequestParam("name") String name,
                                @RequestParam(value = "category", required = false) String category,
                                @RequestParam("price") BigDecimal price,
                                RedirectAttributes redirectAttributes) {
        try {
            CatalogItem item = service.upsertCatalog(id, name, category, price);
            redirectAttributes.addAttribute("message", "Saved item " + item.getId() + ".");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/catalog/{id}/delete")
    public String deleteCatalog(@PathVariable String id, RedirectAttributes redirectAttributes) {
        boolean removed = service.deleteCatalog(id);
        redirectAttributes.addAttribute("message", removed ? "Deleted item " + id + "." : "Item not found: " + id);
        return "redirect:/";
    }

    @PostMapping("/cart/add")
    public String addToCart(@RequestParam("itemId") String itemId,
                            @RequestParam("quantity") int quantity,
                            RedirectAttributes redirectAttributes) {
        try {
            service.addToCart(itemId, quantity);
            redirectAttributes.addAttribute("message", "Added " + quantity + " x " + itemId + " to cart.");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/cart/update")
    public String updateCart(@RequestParam("itemId") String itemId,
                             @RequestParam("quantity") int quantity,
                             RedirectAttributes redirectAttributes) {
        try {
            service.setCartQuantity(itemId, quantity);
            redirectAttributes.addAttribute("message", "Updated " + itemId + " to qty " + quantity + ".");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/cart/{id}/remove")
    public String removeFromCart(@PathVariable("id") String itemId, RedirectAttributes redirectAttributes) {
        service.removeFromCart(itemId);
        redirectAttributes.addAttribute("message", "Removed " + itemId + " from cart.");
        return "redirect:/";
    }

    @PostMapping("/cart/clear")
    public String clearCart(RedirectAttributes redirectAttributes) {
        service.clearCart();
        redirectAttributes.addAttribute("message", "Cart cleared.");
        return "redirect:/";
    }

    @PostMapping("/checkout")
    public String checkout(@RequestParam("paymentMethod") String paymentMethod,
                           @RequestParam("amountTendered") BigDecimal amountTendered,
                           RedirectAttributes redirectAttributes) {
        try {
            Sale sale = service.checkout(paymentMethod, amountTendered);
            redirectAttributes.addAttribute("message", "Sale completed: " + sale.getId() + ".");
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/api/catalog")
    @ResponseBody
    public ResponseEntity<CatalogItemResponse> apiUpsertCatalog(@Valid @RequestBody CatalogItemRequest request) {
        try {
            CatalogItem item = service.upsertCatalog(request.id(), request.name(), request.category(), request.price());
            return ResponseEntity.status(201).body(toResponse(item));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/catalog")
    @ResponseBody
    public List<CatalogItemResponse> apiCatalog() {
        return service.allCatalog().stream().map(this::toResponse).toList();
    }

    @GetMapping("/api/catalog/{id}")
    @ResponseBody
    public ResponseEntity<CatalogItemResponse> apiCatalogItem(@PathVariable String id) {
        return service.getCatalogItem(id)
                .map(item -> ResponseEntity.ok(toResponse(item)))
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/api/catalog/{id}")
    @ResponseBody
    public ResponseEntity<Void> apiDeleteCatalog(@PathVariable String id) {
        boolean removed = service.deleteCatalog(id);
        return removed ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }

    @GetMapping("/api/cart")
    @ResponseBody
    public CartSummaryResponse apiCart() {
        return toResponse(service.cartSummary());
    }

    @PostMapping("/api/cart/items")
    @ResponseBody
    public ResponseEntity<CartSummaryResponse> apiAddToCart(@Valid @RequestBody CartItemRequest request) {
        try {
            CartSummary summary = service.addToCart(request.itemId(), request.quantity());
            return ResponseEntity.ok(toResponse(summary));
        } catch (IllegalArgumentException ex) {
            if (ex.getMessage() != null && ex.getMessage().startsWith("Unknown item")) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/api/cart/items/{id}")
    @ResponseBody
    public ResponseEntity<CartSummaryResponse> apiUpdateCart(@PathVariable("id") String itemId,
                                                             @Valid @RequestBody CartItemRequest request) {
        if (!itemId.equals(request.itemId())) {
            return ResponseEntity.badRequest().build();
        }
        try {
            CartSummary summary = service.setCartQuantity(itemId, request.quantity());
            return ResponseEntity.ok(toResponse(summary));
        } catch (IllegalArgumentException ex) {
            if (ex.getMessage() != null && ex.getMessage().startsWith("Unknown item")) {
                return ResponseEntity.notFound().build();
            }
            return ResponseEntity.badRequest().build();
        }
    }

    @DeleteMapping("/api/cart/items/{id}")
    @ResponseBody
    public CartSummaryResponse apiRemoveFromCart(@PathVariable("id") String itemId) {
        return toResponse(service.removeFromCart(itemId));
    }

    @DeleteMapping("/api/cart")
    @ResponseBody
    public CartSummaryResponse apiClearCart() {
        return toResponse(service.clearCart());
    }

    @PostMapping("/api/checkout")
    @ResponseBody
    public ResponseEntity<SaleResponse> apiCheckout(@Valid @RequestBody CheckoutRequest request) {
        try {
            Sale sale = service.checkout(request.paymentMethod(), request.amountTendered());
            return ResponseEntity.status(201).body(toResponse(sale));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/sales")
    @ResponseBody
    public List<SaleResponse> apiSales() {
        return service.allSales().stream().map(this::toResponse).toList();
    }

    @GetMapping("/api/sales/{id}")
    @ResponseBody
    public ResponseEntity<SaleResponse> apiSale(@PathVariable String id) {
        return service.getSale(id)
                .map(sale -> ResponseEntity.ok(toResponse(sale)))
                .orElse(ResponseEntity.notFound().build());
    }

    private CatalogItemResponse toResponse(CatalogItem item) {
        return new CatalogItemResponse(
                item.getId(),
                item.getName(),
                item.getCategory(),
                item.getPrice(),
                item.getCreatedAt(),
                item.getUpdatedAt());
    }

    private CartSummaryResponse toResponse(CartSummary summary) {
        return new CartSummaryResponse(
                summary.getLines(),
                summary.getSubtotal(),
                summary.getTax(),
                summary.getTotal(),
                summary.getItemCount());
    }

    private SaleResponse toResponse(Sale sale) {
        return new SaleResponse(
                sale.getId(),
                sale.getLines(),
                sale.getSubtotal(),
                sale.getTax(),
                sale.getTotal(),
                sale.getAmountTendered(),
                sale.getChangeDue(),
                sale.getPaymentMethod(),
                sale.getCreatedAt());
    }
}
