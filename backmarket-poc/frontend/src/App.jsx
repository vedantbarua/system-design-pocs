import { useEffect, useMemo, useState } from "react";

const API_BASE = "http://localhost:8121/api";

const formatMoney = (value) => `$${value.toFixed(2)}`;
const formatPercent = (value) => `${Math.round(value * 100)}%`;
const formatDate = (iso) => {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString();
};

export default function App() {
  const [products, setProducts] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [cart, setCart] = useState(null);
  const [orders, setOrders] = useState([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [shippingSpeed, setShippingSpeed] = useState("STANDARD");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tradeQuote, setTradeQuote] = useState(null);
  const [tradeLoading, setTradeLoading] = useState(false);
  const [tradeForm, setTradeForm] = useState({
    deviceType: "Phone",
    brand: "Nova",
    model: "NovaPhone 12",
    condition: "B",
    storageGb: 256
  });

  const categories = useMemo(() => {
    const values = new Set(products.map((product) => product.category));
    return ["All", ...Array.from(values).sort()];
  }, [products]);

  const loadProducts = async () => {
    setError("");
    const params = new URLSearchParams();
    if (query.trim()) params.set("query", query.trim());
    if (category !== "All") params.set("category", category);
    const res = await fetch(`${API_BASE}/products?${params.toString()}`);
    if (!res.ok) {
      throw new Error("Failed to load devices");
    }
    const data = await res.json();
    setProducts(data);
  };

  const loadRecommendations = async () => {
    const res = await fetch(`${API_BASE}/recommendations`);
    if (!res.ok) {
      throw new Error("Failed to load recommendations");
    }
    const data = await res.json();
    setRecommendations(data);
  };

  const loadCart = async () => {
    const res = await fetch(`${API_BASE}/cart?shippingSpeed=${shippingSpeed}`);
    if (!res.ok) {
      throw new Error("Failed to load cart");
    }
    const data = await res.json();
    setCart(data);
  };

  const loadOrders = async () => {
    const res = await fetch(`${API_BASE}/orders`);
    if (!res.ok) {
      throw new Error("Failed to load orders");
    }
    const data = await res.json();
    setOrders(data);
  };

  const refreshAll = async () => {
    setBusy(true);
    setError("");
    try {
      await Promise.all([loadProducts(), loadRecommendations(), loadCart(), loadOrders()]);
    } catch (err) {
      setError(err.message || "Unable to connect to the backend.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    refreshAll();
  }, []);

  useEffect(() => {
    loadProducts().catch((err) => setError(err.message));
  }, [query, category]);

  useEffect(() => {
    loadCart().catch((err) => setError(err.message));
  }, [shippingSpeed]);

  const addToCart = async (productId) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/cart/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity: 1 })
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Unable to add to cart");
      }
      await loadCart();
    } catch (err) {
      setError(err.message || "Unable to add to cart");
    } finally {
      setBusy(false);
    }
  };

  const updateCartQty = async (productId, quantity) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/cart/items/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity })
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Unable to update cart");
      }
      await loadCart();
    } catch (err) {
      setError(err.message || "Unable to update cart");
    } finally {
      setBusy(false);
    }
  };

  const removeCartItem = async (productId) => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/cart/items/${productId}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error("Unable to remove item");
      }
      await loadCart();
    } catch (err) {
      setError(err.message || "Unable to remove item");
    } finally {
      setBusy(false);
    }
  };

  const checkout = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/orders/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shippingSpeed })
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Checkout failed");
      }
      await Promise.all([loadCart(), loadOrders(), loadProducts()]);
    } catch (err) {
      setError(err.message || "Checkout failed");
    } finally {
      setBusy(false);
    }
  };

  const requestTradeInQuote = async () => {
    setTradeLoading(true);
    setTradeQuote(null);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/trade-in/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tradeForm)
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Unable to fetch trade-in quote");
      }
      const data = await res.json();
      setTradeQuote(data);
    } catch (err) {
      setError(err.message || "Unable to fetch trade-in quote");
    } finally {
      setTradeLoading(false);
    }
  };

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Backmarket POC</p>
          <h1>Refurbished tech marketplace with warranty, trade-in, and savings.</h1>
          <p className="subtitle">
            Browse certified devices, compare condition grades, and model a trade-in offer
            alongside a fast checkout flow.
          </p>
        </div>
        <div className="hero-actions">
          <button className="ghost" onClick={refreshAll} disabled={busy}>
            Refresh data
          </button>
          <button className="primary" onClick={checkout} disabled={busy || !cart?.items?.length}>
            Checkout
          </button>
        </div>
      </header>

      {error && <div className="banner error">{error}</div>}

      <section className="layout">
        <aside className="filters">
          <div className="panel">
            <p className="panel-title">Search</p>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search phones, tablets, laptops..."
            />
          </div>
          <div className="panel">
            <p className="panel-title">Categories</p>
            <div className="chip-list">
              {categories.map((item) => (
                <button
                  key={item}
                  className={item === category ? "chip active" : "chip"}
                  onClick={() => setCategory(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <div className="panel">
            <p className="panel-title">Shipping</p>
            <div className="toggle">
              <button
                className={shippingSpeed === "STANDARD" ? "toggle-btn active" : "toggle-btn"}
                onClick={() => setShippingSpeed("STANDARD")}
              >
                Standard
              </button>
              <button
                className={shippingSpeed === "EXPRESS" ? "toggle-btn active" : "toggle-btn"}
                onClick={() => setShippingSpeed("EXPRESS")}
              >
                Express
              </button>
            </div>
          </div>
          <div className="panel highlight">
            <p className="panel-title">Cart total</p>
            <h2>{cart ? formatMoney(cart.pricing.total) : "$0.00"}</h2>
            <p className="meta">Items: {cart ? cart.itemCount : "--"}</p>
            <button className="primary" onClick={checkout} disabled={busy || !cart?.items?.length}>
              Place order
            </button>
          </div>
          <div className="panel trade">
            <p className="panel-title">Trade-in quote</p>
            <div className="trade-grid">
              <input
                value={tradeForm.deviceType}
                onChange={(event) =>
                  setTradeForm((prev) => ({ ...prev, deviceType: event.target.value }))
                }
                placeholder="Device type"
              />
              <input
                value={tradeForm.brand}
                onChange={(event) => setTradeForm((prev) => ({ ...prev, brand: event.target.value }))}
                placeholder="Brand"
              />
              <input
                value={tradeForm.model}
                onChange={(event) => setTradeForm((prev) => ({ ...prev, model: event.target.value }))}
                placeholder="Model"
              />
              <select
                value={tradeForm.condition}
                onChange={(event) =>
                  setTradeForm((prev) => ({ ...prev, condition: event.target.value }))
                }
              >
                <option value="A">A - Like new</option>
                <option value="B">B - Good</option>
                <option value="C">C - Fair</option>
              </select>
              <input
                type="number"
                min="64"
                max="1024"
                value={tradeForm.storageGb}
                onChange={(event) =>
                  setTradeForm((prev) => ({ ...prev, storageGb: Number(event.target.value) }))
                }
                placeholder="Storage (GB)"
              />
            </div>
            <button className="ghost" onClick={requestTradeInQuote} disabled={tradeLoading}>
              Get quote
            </button>
            {tradeQuote && (
              <div className="trade-result">
                <div>
                  <p className="eyebrow">Quote {tradeQuote.quoteId}</p>
                  <h3>{formatMoney(tradeQuote.offerAmount)} offer</h3>
                  <p className="meta">Estimated payout: {formatMoney(tradeQuote.estimatedPayout)}</p>
                </div>
                <div className="trade-meta">
                  <span>Condition {tradeQuote.condition}</span>
                  <span>Expires {formatDate(tradeQuote.expiresAt)}</span>
                </div>
                <p className="meta">{tradeQuote.inspectionNotes}</p>
              </div>
            )}
          </div>
        </aside>

        <main className="catalog">
          <div className="section-head">
            <h2>Refurbished catalog</h2>
            <p>{products.length} devices in circulation</p>
          </div>
          <div className="product-grid">
            {products.map((product) => {
              const savings = 1 - product.price / product.originalPrice;
              return (
                <article key={product.id} className="product-card">
                  <div className="product-image">
                    <img src={product.imageUrl} alt={product.name} />
                    <span className="condition">Grade {product.conditionGrade}</span>
                  </div>
                  <div className="product-body">
                    <p className="product-category">{product.category}</p>
                    <h3>{product.name}</h3>
                    <p className="product-desc">{product.description}</p>
                    <div className="product-meta">
                      <span>{formatMoney(product.price)}</span>
                      <span className="strike">{formatMoney(product.originalPrice)}</span>
                      <span className="pill">Save {formatPercent(savings)}</span>
                    </div>
                    <div className="product-attrs">
                      <span>Warranty {product.warrantyMonths} mo</span>
                      <span>Seller {product.sellerName}</span>
                      <span>{product.ecoSavingsKg.toFixed(1)}kg CO₂ saved</span>
                    </div>
                    <div className="product-stock">
                      {product.stock > 0 ? `${product.stock} available` : "Out of stock"}
                      <span>{product.rating.toFixed(1)} ★ ({product.reviewCount})</span>
                    </div>
                    <button
                      className="primary"
                      onClick={() => addToCart(product.id)}
                      disabled={busy || product.stock === 0}
                    >
                      Add to cart
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </main>

        <aside className="cart">
          <div className="section-head">
            <h2>Your cart</h2>
            <p>{cart ? `${cart.itemCount} items` : "--"}</p>
          </div>
          <div className="cart-list">
            {cart?.items?.length ? (
              cart.items.map((item) => (
                <div key={item.productId} className="cart-item">
                  <img src={item.imageUrl} alt={item.name} />
                  <div className="cart-info">
                    <h4>{item.name}</h4>
                    <p>{formatMoney(item.price)}</p>
                    <p className="meta">
                      Grade {item.conditionGrade} · {item.warrantyMonths}mo · {item.sellerName}
                    </p>
                    <div className="qty">
                      <button
                        onClick={() => updateCartQty(item.productId, Math.max(0, item.quantity - 1))}
                        disabled={busy}
                      >
                        -
                      </button>
                      <span>{item.quantity}</span>
                      <button
                        onClick={() => updateCartQty(item.productId, item.quantity + 1)}
                        disabled={busy}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="cart-actions">
                    <span>{formatMoney(item.lineTotal)}</span>
                    <button className="ghost" onClick={() => removeCartItem(item.productId)}>
                      Remove
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="empty">Your cart is empty. Add a device to get started.</p>
            )}
          </div>
          <div className="cart-summary">
            <div>
              <span>Subtotal</span>
              <span>{cart ? formatMoney(cart.pricing.subtotal) : "$0.00"}</span>
            </div>
            <div>
              <span>Shipping</span>
              <span>{cart ? formatMoney(cart.pricing.shipping) : "$0.00"}</span>
            </div>
            <div>
              <span>Tax</span>
              <span>{cart ? formatMoney(cart.pricing.tax) : "$0.00"}</span>
            </div>
            <div className="total">
              <span>Total</span>
              <span>{cart ? formatMoney(cart.pricing.total) : "$0.00"}</span>
            </div>
          </div>
        </aside>
      </section>

      <section className="reco">
        <div className="section-head">
          <h2>Certified picks</h2>
          <p>Top rated refurbished inventory.</p>
        </div>
        <div className="reco-grid">
          {recommendations.map((product) => (
            <div key={product.id} className="reco-card">
              <img src={product.imageUrl} alt={product.name} />
              <div>
                <p className="product-category">{product.category}</p>
                <h4>{product.name}</h4>
                <div className="product-meta">
                  <span>{formatMoney(product.price)}</span>
                  <span>Grade {product.conditionGrade}</span>
                </div>
              </div>
              <button
                className="ghost"
                onClick={() => addToCart(product.id)}
                disabled={busy || product.stock === 0}
              >
                Quick add
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="orders">
        <div className="section-head">
          <h2>Order history</h2>
          <p>{orders.length} recent orders</p>
        </div>
        <div className="order-grid">
          {orders.length ? (
            orders.map((order) => (
              <article key={order.id} className="order-card">
                <div className="order-head">
                  <div>
                    <p className="eyebrow">Order #{order.id}</p>
                    <h3>{order.status}</h3>
                  </div>
                  <div>
                    <p className="meta">Placed {formatDate(order.createdAt)}</p>
                    <p className="meta">ETA {formatDate(order.estimatedDelivery)}</p>
                  </div>
                </div>
                <div className="order-items">
                  {order.items.map((item) => (
                    <span key={item.productId}>
                      {item.quantity}x {item.name} (Grade {item.conditionGrade})
                    </span>
                  ))}
                </div>
                <div className="order-footer">
                  <span>{order.shippingSpeed} shipping</span>
                  <strong>{formatMoney(order.pricing.total)}</strong>
                </div>
              </article>
            ))
          ) : (
            <p className="empty">No orders yet. Checkout to create your first order.</p>
          )}
        </div>
      </section>
    </div>
  );
}
