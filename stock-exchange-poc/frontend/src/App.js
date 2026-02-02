import React, { useEffect, useMemo, useState } from "react";
import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";

const API_BASE = "http://localhost:8080/api";
const WS_URL = "http://localhost:8080/ws";

const emptyBook = { bids: [], asks: [], sequence: 0 };

export default function App() {
  const [symbol, setSymbol] = useState("ACME");
  const [side, setSide] = useState("BUY");
  const [price, setPrice] = useState("100");
  const [quantity, setQuantity] = useState("10");
  const [book, setBook] = useState(emptyBook);
  const [trades, setTrades] = useState([]);
  const [connected, setConnected] = useState(false);

  const stompClient = useMemo(() => {
    const client = new Client({
      webSocketFactory: () => new SockJS(WS_URL),
      reconnectDelay: 1000,
      onConnect: () => setConnected(true),
      onDisconnect: () => setConnected(false)
    });
    return client;
  }, []);

  useEffect(() => {
    stompClient.activate();
    return () => stompClient.deactivate();
  }, [stompClient]);

  useEffect(() => {
    if (!connected) {
      return;
    }
    const subscription = stompClient.subscribe(`/topic/market/${symbol}`, (message) => {
      const payload = JSON.parse(message.body);
      if (payload.snapshot) {
        setBook(payload.snapshot);
      }
      if (payload.trades && payload.trades.length > 0) {
        setTrades((prev) => {
          const merged = [...payload.trades, ...prev];
          return merged.slice(0, 20);
        });
      }
    });
    return () => subscription.unsubscribe();
  }, [connected, stompClient, symbol]);

  useEffect(() => {
    fetch(`${API_BASE}/market/${symbol}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.snapshot) {
          setBook(data.snapshot);
        }
        if (data.recentTrades) {
          setTrades(data.recentTrades);
        }
      })
      .catch(() => {});
  }, [symbol]);

  const submitOrder = async (event) => {
    event.preventDefault();
    const payload = {
      symbol,
      side,
      price: Number(price),
      quantity: Number(quantity)
    };
    await fetch(`${API_BASE}/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  };

  return (
    <div className="app">
      <header>
        <h1>Stock Exchange POC</h1>
        <p>Matching Engine with sequenced ring buffer, REST + WebSocket market data.</p>
      </header>

      <section className="panel">
        <h2>Submit Order</h2>
        <form onSubmit={submitOrder} className="order-form">
          <label>
            Symbol
            <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} />
          </label>
          <label>
            Side
            <select value={side} onChange={(e) => setSide(e.target.value)}>
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
            </select>
          </label>
          <label>
            Price
            <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
          </label>
          <label>
            Quantity
            <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </label>
          <button type="submit">Send</button>
        </form>
      </section>

      <section className="grid">
        <div className="panel">
          <h2>Order Book (Seq {book.sequence})</h2>
          <div className="book">
            <div>
              <h3>Bids</h3>
              <ul>
                {book.bids.map((level) => (
                  <li key={`b-${level.price}`}>
                    <span>{level.price}</span>
                    <span>{level.quantity}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Asks</h3>
              <ul>
                {book.asks.map((level) => (
                  <li key={`a-${level.price}`}>
                    <span>{level.price}</span>
                    <span>{level.quantity}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="panel">
          <h2>Recent Trades</h2>
          <table>
            <thead>
              <tr>
                <th>Trade</th>
                <th>Price</th>
                <th>Qty</th>
                <th>Seq</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade) => (
                <tr key={trade.tradeId + trade.sequence}>
                  <td>{trade.tradeId}</td>
                  <td>{trade.price}</td>
                  <td>{trade.quantity}</td>
                  <td>{trade.sequence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
