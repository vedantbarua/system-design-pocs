import { useEffect, useMemo, useState } from "react";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2
});

const formatMoney = (cents) => currencyFormatter.format((cents || 0) / 100);

const toIso = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const buildQuery = ({ groupBy, interval, from, to }) => {
  const params = new URLSearchParams();
  if (groupBy) params.set("groupBy", groupBy);
  if (interval) params.set("interval", interval);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  return params.toString();
};

const fetchJson = async (url, options) => {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Request failed");
  }
  return response.json();
};

export default function App() {
  const [overview, setOverview] = useState(null);
  const [summary, setSummary] = useState([]);
  const [timeseries, setTimeseries] = useState([]);
  const [groupBy, setGroupBy] = useState("campaign");
  const [interval, setInterval] = useState("hour");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("Ready");
  const [formData, setFormData] = useState({
    adId: "AD-001",
    campaignId: "CMP-ALPHA",
    publisherId: "PUB-NORTH",
    occurredAt: "",
    costCents: 25
  });

  const queryArgs = useMemo(() => {
    return {
      groupBy,
      interval,
      from: toIso(from),
      to: toIso(to)
    };
  }, [groupBy, interval, from, to]);

  const loadData = async () => {
    setStatus("Loading metrics...");
    try {
      const [overviewData, summaryData, timeseriesData] = await Promise.all([
        fetchJson(`/api/overview?${buildQuery(queryArgs)}`),
        fetchJson(`/api/summary?${buildQuery(queryArgs)}`),
        fetchJson(`/api/timeseries?${buildQuery(queryArgs)}`)
      ]);
      setOverview(overviewData);
      setSummary(summaryData);
      setTimeseries(timeseriesData);
      setStatus("Live");
    } catch (error) {
      setStatus(error.message || "Unable to load data");
    }
  };

  useEffect(() => {
    loadData();
  }, [queryArgs]);

  const onSeed = async () => {
    setStatus("Seeding clicks...");
    try {
      await fetchJson("/api/clicks/seed?count=120", { method: "POST" });
      await loadData();
    } catch (error) {
      setStatus(error.message || "Seed failed");
    }
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setStatus("Ingesting click...");
    try {
      await fetchJson("/api/clicks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          costCents: Number(formData.costCents),
          occurredAt: formData.occurredAt ? toIso(formData.occurredAt) : null
        })
      });
      await loadData();
      setFormData((prev) => ({ ...prev, occurredAt: "" }));
    } catch (error) {
      setStatus(error.message || "Ingest failed");
    }
  };

  return (
    <div className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">Ad Click Aggregator</p>
          <h1>Track clicks, spend, and campaign velocity in one console.</h1>
          <p className="subhead">
            This POC ingests ad-click events, aggregates across campaigns, and
            returns time-bucketed rollups for monitoring spend drift and
            publisher quality.
          </p>
        </div>
        <div className="hero-panel">
          <div className="status">{status}</div>
          <div className="cta-row">
            <button type="button" className="primary" onClick={onSeed}>
              Seed 120 clicks
            </button>
            <button type="button" className="ghost" onClick={loadData}>
              Refresh
            </button>
          </div>
        </div>
      </header>

      <section className="grid">
        <div className="card span-7">
          <h2>Ingest a click</h2>
          <form className="form" onSubmit={onSubmit}>
            <label>
              Ad ID
              <input
                value={formData.adId}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, adId: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Campaign ID
              <input
                value={formData.campaignId}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    campaignId: event.target.value
                  }))
                }
                required
              />
            </label>
            <label>
              Publisher ID
              <input
                value={formData.publisherId}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    publisherId: event.target.value
                  }))
                }
                required
              />
            </label>
            <label>
              Occurred At (optional)
              <input
                type="datetime-local"
                value={formData.occurredAt}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    occurredAt: event.target.value
                  }))
                }
              />
            </label>
            <label>
              Cost (cents)
              <input
                type="number"
                min="0"
                value={formData.costCents}
                onChange={(event) =>
                  setFormData((prev) => ({
                    ...prev,
                    costCents: event.target.value
                  }))
                }
                required
              />
            </label>
            <button type="submit" className="primary">
              Send click
            </button>
          </form>
        </div>

        <div className="card span-5">
          <h2>Filters</h2>
          <div className="filters">
            <label>
              Group by
              <select value={groupBy} onChange={(event) => setGroupBy(event.target.value)}>
                <option value="campaign">Campaign</option>
                <option value="ad">Ad</option>
                <option value="publisher">Publisher</option>
              </select>
            </label>
            <label>
              Interval
              <select value={interval} onChange={(event) => setInterval(event.target.value)}>
                <option value="minute">Minute</option>
                <option value="hour">Hour</option>
                <option value="day">Day</option>
              </select>
            </label>
            <label>
              From (local)
              <input type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} />
            </label>
            <label>
              To (local)
              <input type="datetime-local" value={to} onChange={(event) => setTo(event.target.value)} />
            </label>
          </div>
          {overview && (
            <div className="overview">
              <div>
                <span>Total clicks</span>
                <strong>{overview.totalClicks}</strong>
              </div>
              <div>
                <span>Total spend</span>
                <strong>{formatMoney(overview.totalSpendCents)}</strong>
              </div>
              <div>
                <span>Unique ads</span>
                <strong>{overview.uniqueAds}</strong>
              </div>
              <div>
                <span>Unique campaigns</span>
                <strong>{overview.uniqueCampaigns}</strong>
              </div>
              <div>
                <span>Unique publishers</span>
                <strong>{overview.uniquePublishers}</strong>
              </div>
            </div>
          )}
        </div>

        <div className="card span-6">
          <h2>Summary</h2>
          <div className="table">
            <div className="table-head">
              <span>{groupBy.toUpperCase()}</span>
              <span>Clicks</span>
              <span>Spend</span>
              <span>Unique publishers</span>
              <span>Unique ads</span>
            </div>
            {summary.length === 0 ? (
              <div className="empty">No data yet. Seed clicks to explore aggregates.</div>
            ) : (
              summary.map((row) => (
                <div className="table-row" key={row.groupKey}>
                  <span>{row.groupKey}</span>
                  <span>{row.clicks}</span>
                  <span>{formatMoney(row.spendCents)}</span>
                  <span>{row.uniquePublishers}</span>
                  <span>{row.uniqueAds}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card span-6">
          <h2>Time series</h2>
          <div className="table compact">
            <div className="table-head">
              <span>Bucket</span>
              <span>{groupBy.toUpperCase()}</span>
              <span>Clicks</span>
              <span>Spend</span>
            </div>
            {timeseries.length === 0 ? (
              <div className="empty">No buckets yet.</div>
            ) : (
              timeseries.map((row, index) => (
                <div className="table-row" key={`${row.groupKey}-${row.bucketStart}-${index}`}>
                  <span>{new Date(row.bucketStart).toLocaleString()}</span>
                  <span>{row.groupKey}</span>
                  <span>{row.clicks}</span>
                  <span>{formatMoney(row.spendCents)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
