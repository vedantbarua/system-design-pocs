import React, { useEffect, useMemo, useState } from "react";

const API_BASE = "http://localhost:8121/api";

const statusPalette = {
  EN_ROUTE: "status enroute",
  BOARDING: "status boarding",
  DELAYED: "status delayed",
  ARRIVED: "status arrived",
  CANCELLED: "status cancelled"
};

const statusOptions = ["ALL", "EN_ROUTE", "BOARDING", "DELAYED", "ARRIVED", "CANCELLED"];

const formatTime = (value) => {
  if (!value) return "--";
  const date = new Date(value);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const formatDate = (value) => {
  if (!value) return "--";
  const date = new Date(value);
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
};

const formatNumber = (value, suffix) => {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  return `${value}${suffix || ""}`;
};

export default function App() {
  const [airports, setAirports] = useState([]);
  const [flights, setFlights] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [track, setTrack] = useState(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [loadingFlights, setLoadingFlights] = useState(false);
  const [traceId, setTraceId] = useState("");

  const createTraceId = () => {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID().replace(/-/g, "");
    }
    return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  };

  const fetchWithTrace = async (url, options = {}) => {
    const nextTraceId = createTraceId();
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        "X-Trace-ID": nextTraceId
      }
    });
    const responseTraceId = response.headers.get("x-trace-id") || nextTraceId;
    setTraceId(responseTraceId);
    return response;
  };

  const airportMap = useMemo(() => {
    const map = new Map();
    airports.forEach((airport) => map.set(airport.code, airport));
    return map;
  }, [airports]);

  const selectedFlight = useMemo(() => {
    if (!selectedId) return null;
    return flights.find((flight) => flight.id === selectedId) || null;
  }, [flights, selectedId]);

  useEffect(() => {
    const loadAirports = async () => {
      const response = await fetchWithTrace(`${API_BASE}/airports`);
      const data = await response.json();
      setAirports(data);
    };
    loadAirports();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const loadFlights = async () => {
      setLoadingFlights(true);
      const params = new URLSearchParams();
      if (query.trim()) params.set("query", query.trim());
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      const response = await fetchWithTrace(`${API_BASE}/flights?${params.toString()}`, {
        signal: controller.signal
      });
      const data = await response.json();
      setFlights(data);
      if (!selectedId && data.length > 0) {
        setSelectedId(data[0].id);
      }
      if (selectedId && !data.some((flight) => flight.id === selectedId)) {
        setSelectedId(data[0]?.id ?? null);
      }
      setLoadingFlights(false);
    };
    loadFlights();
    return () => controller.abort();
  }, [query, statusFilter]);

  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    const loadTrack = async () => {
      const response = await fetchWithTrace(`${API_BASE}/flights/${selectedId}/track`);
      const data = await response.json();
      if (active) {
        setTrack(data);
      }
    };
    loadTrack();
    const interval = setInterval(loadTrack, 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [selectedId]);

  const progress = track?.progress ?? 0;
  const planeOffset = 50 - Math.sin(progress * Math.PI) * 25;
  const planeStyle = {
    left: `${progress * 100}%`,
    top: `${planeOffset}%`
  };

  const originAirport = selectedFlight ? airportMap.get(selectedFlight.origin) : null;
  const destinationAirport = selectedFlight ? airportMap.get(selectedFlight.destination) : null;

  return (
    <div className="app">
      <div className="glow" />
      <header className="hero">
        <div>
          <p className="eyebrow">SkyTrace Network Ops</p>
          <h1>Live Flight Tracking Control</h1>
          <p className="subtitle">
            Monitor live flight positions, ETAs, and operational status from a single command view.
          </p>
        </div>
        <div className="status-panel">
          <div>
            <span className="metric-label">Active flights</span>
            <h2>{flights.length}</h2>
          </div>
          <div>
            <span className="metric-label">Selected</span>
            <h2>{selectedFlight ? selectedFlight.flightNumber : "--"}</h2>
          </div>
          <div>
            <span className="metric-label">Next update</span>
            <h2>5s</h2>
          </div>
          <div>
            <span className="metric-label">Trace ID</span>
            <p className="trace-id">{traceId || "--"}</p>
          </div>
        </div>
      </header>

      <main className="layout">
        <section className="panel flights">
          <div className="panel-header">
            <div>
              <h3>Flight Feed</h3>
              <p className="panel-subtitle">Filter by route, city, or status.</p>
            </div>
            <div className="search">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search UA 241, SFO, New York"
              />
            </div>
          </div>

          <div className="filters">
            {statusOptions.map((status) => (
              <button
                key={status}
                className={statusFilter === status ? "filter active" : "filter"}
                onClick={() => setStatusFilter(status)}
              >
                {status.replace("_", " ")}
              </button>
            ))}
          </div>

          <div className="flight-list">
            {loadingFlights && <div className="loading">Refreshing feed...</div>}
            {!loadingFlights && flights.length === 0 && (
              <div className="empty">No flights match that filter.</div>
            )}
            {flights.map((flight) => {
              const statusClass = statusPalette[flight.status] || "status";
              const origin = airportMap.get(flight.origin);
              const destination = airportMap.get(flight.destination);
              const isSelected = flight.id === selectedId;
              return (
                <button
                  key={flight.id}
                  className={isSelected ? "flight-card active" : "flight-card"}
                  onClick={() => setSelectedId(flight.id)}
                >
                  <div className="flight-row">
                    <div>
                      <h4>{flight.flightNumber}</h4>
                      <p className="muted">{flight.airline}</p>
                    </div>
                    <span className={statusClass}>{flight.status.replace("_", " ")}</span>
                  </div>
                  <div className="route">
                    <div>
                      <span>{flight.origin}</span>
                      <p className="muted">{origin?.city || "--"}</p>
                    </div>
                    <div className="route-line" />
                    <div>
                      <span>{flight.destination}</span>
                      <p className="muted">{destination?.city || "--"}</p>
                    </div>
                  </div>
                  <div className="flight-times">
                    <span>Dep {formatTime(flight.estimatedDeparture)}</span>
                    <span>Arr {formatTime(flight.estimatedArrival)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="panel detail">
          {!selectedFlight && <div className="empty">Select a flight to view tracking.</div>}
          {selectedFlight && (
            <>
              <div className="detail-header">
                <div>
                  <p className="eyebrow">Flight Detail</p>
                  <h3>{selectedFlight.flightNumber}</h3>
                  <p className="subtitle">
                    {selectedFlight.airline} · {selectedFlight.aircraft}
                  </p>
                </div>
                <div className="status-stack">
                  <span className={statusPalette[selectedFlight.status] || "status"}>
                    {selectedFlight.status.replace("_", " ")}
                  </span>
                  <span className="muted">
                    Gate {selectedFlight.gate} · Terminal {selectedFlight.terminal}
                  </span>
                </div>
              </div>

              <div className="map">
                <div className="radar">
                  <div className="ring" />
                  <div className="ring" />
                  <div className="ring" />
                </div>
                <div className="route-track">
                  <div className="route-line" />
                  <div className="plane" style={planeStyle}>
                    <span>✈</span>
                  </div>
                  <div className="route-node origin">
                    <span>{selectedFlight.origin}</span>
                  </div>
                  <div className="route-node destination">
                    <span>{selectedFlight.destination}</span>
                  </div>
                </div>
                <div className="map-footer">
                  <div>
                    <span className="metric-label">Origin</span>
                    <p>{originAirport?.name || "--"}</p>
                  </div>
                  <div>
                    <span className="metric-label">Destination</span>
                    <p>{destinationAirport?.name || "--"}</p>
                  </div>
                  <div>
                    <span className="metric-label">Distance remaining</span>
                    <p>{formatNumber(track?.distanceRemainingMiles, " mi")}</p>
                  </div>
                </div>
              </div>

              <div className="stats-grid">
                <div className="stat">
                  <span className="metric-label">Altitude</span>
                  <h4>{formatNumber(track?.currentPosition?.altitudeFeet, " ft")}</h4>
                </div>
                <div className="stat">
                  <span className="metric-label">Speed</span>
                  <h4>{formatNumber(track?.currentPosition?.speedKts, " kts")}</h4>
                </div>
                <div className="stat">
                  <span className="metric-label">Heading</span>
                  <h4>{formatNumber(track?.currentPosition?.heading, "°")}</h4>
                </div>
                <div className="stat">
                  <span className="metric-label">ETA</span>
                  <h4>{formatTime(selectedFlight.estimatedArrival)}</h4>
                  <p className="muted">{formatDate(selectedFlight.estimatedArrival)}</p>
                </div>
              </div>

              <div className="timeline">
                <div>
                  <span className="metric-label">Scheduled Departure</span>
                  <p>{formatTime(selectedFlight.scheduledDeparture)}</p>
                  <p className="muted">{formatDate(selectedFlight.scheduledDeparture)}</p>
                </div>
                <div>
                  <span className="metric-label">Estimated Departure</span>
                  <p>{formatTime(selectedFlight.estimatedDeparture)}</p>
                  <p className="muted">{formatDate(selectedFlight.estimatedDeparture)}</p>
                </div>
                <div>
                  <span className="metric-label">Estimated Arrival</span>
                  <p>{formatTime(selectedFlight.estimatedArrival)}</p>
                  <p className="muted">{formatDate(selectedFlight.estimatedArrival)}</p>
                </div>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
