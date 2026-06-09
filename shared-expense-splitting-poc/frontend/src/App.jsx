import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  Bell,
  CalendarClock,
  Check,
  ChevronDown,
  CircleDollarSign,
  CreditCard,
  History,
  LayoutDashboard,
  Plus,
  ReceiptText,
  RefreshCw,
  Repeat2,
  Scale,
  Send,
  Users,
  WalletCards,
  X
} from "lucide-react";

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "expenses", label: "Expenses", icon: ReceiptText },
  { id: "balances", label: "Balances", icon: Scale },
  { id: "recurring", label: "Recurring", icon: Repeat2 },
  { id: "ledger", label: "Ledger", icon: History }
];

const CATEGORIES = ["Housing", "Food", "Utilities", "Transport", "Entertainment", "Other"];

function money(cents) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function shortDate(value) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

async function request(url, options) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed: ${response.status}`);
  return body;
}

function Avatar({ user, small = false }) {
  return (
    <span className={`avatar ${small ? "small" : ""}`} style={{ background: user?.color || "#52606d" }}>
      {user?.name?.slice(0, 1) || "?"}
    </span>
  );
}

function StatusPill({ children, tone = "neutral" }) {
  return <span className={`status-pill ${tone}`}>{children}</span>;
}

function ExpenseModal({ snapshot, onClose, onCreated }) {
  const users = snapshot.users;
  const [form, setForm] = useState({
    description: "",
    amount: "",
    category: "Food",
    payer1: users[0]?.id || "",
    payer2: "",
    payer2Amount: "",
    splitType: "equal",
    selected: Object.fromEntries(users.map((user) => [user.id, true])),
    values: Object.fromEntries(users.map((user) => [user.id, "1"])),
    expenseDate: new Date().toISOString().slice(0, 10)
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const amountCents = Math.round(Number(form.amount || 0) * 100);
  const selectedUsers = users.filter((user) => form.selected[user.id]);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    const payer2Cents = form.payer2 ? Math.round(Number(form.payer2Amount || 0) * 100) : 0;
    const payer1Cents = amountCents - payer2Cents;
    const paidBy = [{ userId: form.payer1, amountCents: payer1Cents }];
    if (form.payer2 && payer2Cents > 0) paidBy.push({ userId: form.payer2, amountCents: payer2Cents });
    let splits;
    if (form.splitType === "equal") {
      splits = selectedUsers.map((user) => ({ userId: user.id }));
    } else if (form.splitType === "exact") {
      splits = selectedUsers.map((user) => ({
        userId: user.id,
        amountCents: Math.round(Number(form.values[user.id] || 0) * 100)
      }));
    } else {
      splits = selectedUsers.map((user) => ({ userId: user.id, value: Number(form.values[user.id] || 0) }));
    }
    try {
      setSaving(true);
      await request("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId: snapshot.group.id,
          description: form.description,
          category: form.category,
          amountCents,
          paidBy,
          splitType: form.splitType,
          splits,
          expenseDate: form.expenseDate
        })
      });
      await onCreated();
      onClose();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div>
            <span className="eyebrow">New expense</span>
            <h2>Split a shared cost</h2>
          </div>
          <button className="icon-button ghost" type="button" onClick={onClose} title="Close">
            <X size={19} />
          </button>
        </div>

        <div className="form-grid">
          <label className="wide">
            Description
            <input required value={form.description} onChange={(event) => update("description", event.target.value)} placeholder="Dinner, groceries, rent..." />
          </label>
          <label>
            Amount
            <div className="money-input"><span>$</span><input required min="0.01" step="0.01" type="number" value={form.amount} onChange={(event) => update("amount", event.target.value)} /></div>
          </label>
          <label>
            Category
            <select value={form.category} onChange={(event) => update("category", event.target.value)}>
              {CATEGORIES.map((category) => <option key={category}>{category}</option>)}
            </select>
          </label>
          <label>
            Date
            <input type="date" value={form.expenseDate} onChange={(event) => update("expenseDate", event.target.value)} />
          </label>
          <label>
            Primary payer
            <select value={form.payer1} onChange={(event) => update("payer1", event.target.value)}>
              {users.map((user) => <option value={user.id} key={user.id}>{user.name}</option>)}
            </select>
          </label>
          <label>
            Additional payer
            <select value={form.payer2} onChange={(event) => update("payer2", event.target.value)}>
              <option value="">None</option>
              {users.filter((user) => user.id !== form.payer1).map((user) => <option value={user.id} key={user.id}>{user.name}</option>)}
            </select>
          </label>
          <label>
            Their contribution
            <div className="money-input"><span>$</span><input disabled={!form.payer2} min="0" step="0.01" type="number" value={form.payer2Amount} onChange={(event) => update("payer2Amount", event.target.value)} /></div>
          </label>
        </div>

        <div className="split-section">
          <div className="section-line">
            <div>
              <strong>Split method</strong>
              <span>{selectedUsers.length} participants</span>
            </div>
            <div className="segmented">
              {["equal", "percentage", "shares", "exact"].map((type) => (
                <button type="button" key={type} className={form.splitType === type ? "active" : ""} onClick={() => update("splitType", type)}>
                  {type}
                </button>
              ))}
            </div>
          </div>
          <div className="member-splits">
            {users.map((user) => (
              <div className="member-split" key={user.id}>
                <label className="member-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(form.selected[user.id])}
                    onChange={(event) => setForm((current) => ({ ...current, selected: { ...current.selected, [user.id]: event.target.checked } }))}
                  />
                  <Avatar user={user} small />
                  <span>{user.name}</span>
                </label>
                {form.splitType !== "equal" && form.selected[user.id] && (
                  <div className="split-value">
                    {form.splitType === "exact" && <span>$</span>}
                    <input
                      type="number"
                      min="0"
                      step={form.splitType === "exact" ? "0.01" : "1"}
                      value={form.values[user.id]}
                      onChange={(event) => setForm((current) => ({ ...current, values: { ...current.values, [user.id]: event.target.value } }))}
                    />
                    {form.splitType === "percentage" && <span>%</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          <button type="submit" disabled={saving || selectedUsers.length === 0 || amountCents <= 0}>
            <Check size={18} /> {saving ? "Adding..." : "Add expense"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function App() {
  const [snapshot, setSnapshot] = useState(null);
  const [groupId, setGroupId] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load(nextGroupId = groupId) {
    try {
      const query = nextGroupId ? `?groupId=${encodeURIComponent(nextGroupId)}` : "";
      const data = await request(`/api/snapshot${query}`);
      setSnapshot(data);
      setGroupId(data.group.id);
      setError("");
    } catch (caught) {
      setError(caught.message);
    }
  }

  useEffect(() => { load(); }, []);

  const userMap = useMemo(
    () => Object.fromEntries((snapshot?.users || []).map((user) => [user.id, user])),
    [snapshot]
  );

  async function perform(action) {
    setBusy(true);
    setError("");
    try {
      await action();
      await load();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setBusy(false);
    }
  }

  async function recordSettlement(settlement) {
    await perform(() => request("/api/repayments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId, ...settlement, note: "Recorded from settlement suggestion" })
    }));
  }

  if (!snapshot) {
    return <main className="loading-screen"><RefreshCw className="spin" /> <span>{error || "Loading shared ledger..."}</span></main>;
  }

  const maxBalance = Math.max(1, ...Object.values(snapshot.balances).map(Math.abs));

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><WalletCards size={22} /></span>
          <div><strong>Common Cents</strong><span>Shared ledger</span></div>
        </div>
        <div className="group-picker">
          <span>Current group</span>
          <label>
            <select value={groupId} onChange={(event) => { setGroupId(event.target.value); load(event.target.value); }}>
              {snapshot.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
            <ChevronDown size={16} />
          </label>
        </div>
        <nav>
          {TABS.map(({ id: tabId, label, icon: Icon }) => (
            <button key={tabId} className={activeTab === tabId ? "active" : ""} onClick={() => setActiveTab(tabId)}>
              <Icon size={18} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="members">
          <div className="sidebar-label"><span>Members</span><span>{snapshot.users.length}</span></div>
          {snapshot.users.map((user) => (
            <div className="member-row" key={user.id}><Avatar user={user} small /><span>{user.name}</span></div>
          ))}
        </div>
        <div className="sidebar-foot">
          <CircleDollarSign size={19} />
          <div><strong>{money(snapshot.metrics.unsettledCents)}</strong><span>still unsettled</span></div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <span className="eyebrow">{snapshot.group.name}</span>
            <h1>{TABS.find((tab) => tab.id === activeTab)?.label}</h1>
          </div>
          <div className="top-actions">
            <button className="icon-button secondary" onClick={() => load()} title="Refresh"><RefreshCw size={18} /></button>
            <button onClick={() => setModalOpen(true)}><Plus size={18} /> Add expense</button>
          </div>
        </header>

        {error && <div className="error-banner">{error}</div>}

        {activeTab === "overview" && (
          <>
            <section className="metric-grid">
              <div className="metric"><span>Total group spend</span><strong>{money(snapshot.metrics.totalSpentCents)}</strong><small>{snapshot.metrics.expenseCount} posted expenses</small></div>
              <div className="metric"><span>Unsettled balance</span><strong>{money(snapshot.metrics.unsettledCents)}</strong><small>Across {snapshot.settlements.length} suggested payments</small></div>
              <div className="metric"><span>Recurring costs</span><strong>{snapshot.recurring.length}</strong><small>Next run {snapshot.recurring[0]?.nextRunDate || "not scheduled"}</small></div>
              <div className="metric"><span>Payment reminders</span><strong>{snapshot.metrics.pendingReminderCount}</strong><small>Pending delivery</small></div>
            </section>
            <div className="overview-grid">
              <section className="panel balances-panel">
                <div className="panel-heading">
                  <div><span className="eyebrow">Net position</span><h2>Member balances</h2></div>
                  <button className="text-button" onClick={() => setActiveTab("balances")}>View details <ArrowRight size={16} /></button>
                </div>
                <div className="balance-list">
                  {snapshot.users.map((user) => {
                    const balance = snapshot.balances[user.id] || 0;
                    return (
                      <div className="balance-row" key={user.id}>
                        <Avatar user={user} />
                        <div className="balance-person"><strong>{user.name}</strong><span>{balance >= 0 ? "is owed" : "owes the group"}</span></div>
                        <div className="balance-track"><span className={balance >= 0 ? "positive" : "negative"} style={{ width: `${Math.max(5, Math.abs(balance) / maxBalance * 100)}%` }} /></div>
                        <strong className={balance >= 0 ? "amount positive-text" : "amount negative-text"}>{balance >= 0 ? "+" : "-"}{money(Math.abs(balance))}</strong>
                      </div>
                    );
                  })}
                </div>
              </section>
              <section className="panel settle-panel">
                <div className="panel-heading"><div><span className="eyebrow">Suggested</span><h2>Settle up</h2></div><Scale size={20} /></div>
                <div className="settlement-list">
                  {snapshot.settlements.map((settlement) => (
                    <div className="settlement-row" key={`${settlement.fromUserId}-${settlement.toUserId}`}>
                      <div className="settlement-people">
                        <Avatar user={userMap[settlement.fromUserId]} small />
                        <ArrowRight size={15} />
                        <Avatar user={userMap[settlement.toUserId]} small />
                      </div>
                      <div><strong>{userMap[settlement.fromUserId]?.name} pays {userMap[settlement.toUserId]?.name}</strong><span>{money(settlement.amountCents)}</span></div>
                      <button className="icon-button secondary" disabled={busy} onClick={() => recordSettlement(settlement)} title="Record repayment"><Check size={17} /></button>
                    </div>
                  ))}
                  {snapshot.settlements.length === 0 && <div className="empty-state"><Check size={20} /> Everyone is settled up.</div>}
                </div>
              </section>
            </div>
            <section className="panel recent-panel">
              <div className="panel-heading"><div><span className="eyebrow">Latest activity</span><h2>Recent expenses</h2></div><button className="text-button" onClick={() => setActiveTab("expenses")}>All expenses <ArrowRight size={16} /></button></div>
              <ExpenseTable expenses={snapshot.expenses.slice(0, 5)} userMap={userMap} />
            </section>
          </>
        )}

        {activeTab === "expenses" && (
          <section className="panel page-panel">
            <div className="panel-heading"><div><span className="eyebrow">Group ledger</span><h2>All expenses</h2></div><StatusPill>{snapshot.expenses.length} posted</StatusPill></div>
            <ExpenseTable expenses={snapshot.expenses} userMap={userMap} />
          </section>
        )}

        {activeTab === "balances" && (
          <div className="two-column">
            <section className="panel page-panel">
              <div className="panel-heading"><div><span className="eyebrow">Current</span><h2>Balances by member</h2></div><CircleDollarSign size={20} /></div>
              <div className="member-balance-cards">
                {snapshot.users.map((user) => {
                  const value = snapshot.balances[user.id] || 0;
                  return <div className="member-balance-card" key={user.id}><Avatar user={user} /><div><strong>{user.name}</strong><span>{user.email}</span></div><strong className={value >= 0 ? "positive-text" : "negative-text"}>{value >= 0 ? "+" : "-"}{money(Math.abs(value))}</strong></div>;
                })}
              </div>
            </section>
            <section className="panel page-panel">
              <div className="panel-heading"><div><span className="eyebrow">Optimized</span><h2>Settlement plan</h2></div><CreditCard size={20} /></div>
              <div className="settlement-list expanded">
                {snapshot.settlements.map((settlement) => (
                  <div className="settlement-row" key={`${settlement.fromUserId}-${settlement.toUserId}`}>
                    <div><strong>{userMap[settlement.fromUserId]?.name} → {userMap[settlement.toUserId]?.name}</strong><span>One payment clears this balance</span></div>
                    <strong>{money(settlement.amountCents)}</strong>
                    <button disabled={busy} onClick={() => recordSettlement(settlement)}><Check size={16} /> Record</button>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {activeTab === "recurring" && (
          <div className="two-column">
            <section className="panel page-panel">
              <div className="panel-heading"><div><span className="eyebrow">Scheduled</span><h2>Recurring expenses</h2></div><CalendarClock size={20} /></div>
              {snapshot.recurring.map((item) => (
                <div className="recurring-row" key={item.id}>
                  <span className="category-icon"><Repeat2 size={18} /></span>
                  <div><strong>{item.description}</strong><span>{item.frequency} · next {shortDate(item.nextRunDate)}</span></div>
                  <strong>{money(item.amountCents)}</strong>
                  <StatusPill tone={item.active ? "success" : "neutral"}>{item.active ? "Active" : "Paused"}</StatusPill>
                </div>
              ))}
              <button disabled={busy} onClick={() => perform(() => request("/api/recurring/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ runDate: "2026-07-01" }) }))}>
                <RefreshCw size={17} /> Run July schedule
              </button>
            </section>
            <section className="panel page-panel">
              <div className="panel-heading"><div><span className="eyebrow">Collections</span><h2>Payment reminders</h2></div><Bell size={20} /></div>
              <div className="reminder-list">
                {snapshot.reminders.map((item) => <div className="reminder-row" key={item.id}><Send size={17} /><div><strong>{userMap[item.userId]?.name}</strong><span>{money(item.amountCents)} outstanding · {item.channel}</span></div><StatusPill tone="warning">{item.status}</StatusPill></div>)}
                {snapshot.reminders.length === 0 && <div className="empty-state">No reminders queued.</div>}
              </div>
              <button className="secondary" disabled={busy} onClick={() => perform(() => request("/api/reminders/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ groupId, thresholdCents: 5000 }) }))}>
                <Bell size={17} /> Queue reminders
              </button>
            </section>
          </div>
        )}

        {activeTab === "ledger" && (
          <section className="panel page-panel">
            <div className="panel-heading"><div><span className="eyebrow">Immutable entries</span><h2>Ledger history</h2></div><StatusPill>{snapshot.ledger.length} entries</StatusPill></div>
            <div className="ledger-list">
              {snapshot.ledger.map((entry) => (
                <div className="ledger-row" key={entry.id}>
                  <span className={`ledger-direction ${entry.amountCents >= 0 ? "credit" : "debit"}`}>{entry.amountCents >= 0 ? <ArrowDownLeft size={16} /> : <ArrowRight size={16} />}</span>
                  <div><strong>{userMap[entry.userId]?.name}</strong><span>{entry.kind.replaceAll("_", " ")} · {entry.referenceId}</span></div>
                  <strong className={entry.amountCents >= 0 ? "positive-text" : "negative-text"}>{entry.amountCents >= 0 ? "+" : "-"}{money(Math.abs(entry.amountCents))}</strong>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
      {modalOpen && <ExpenseModal snapshot={snapshot} onClose={() => setModalOpen(false)} onCreated={() => load()} />}
    </div>
  );
}

function ExpenseTable({ expenses, userMap }) {
  return (
    <div className="expense-table">
      <div className="expense-table-head"><span>Expense</span><span>Paid by</span><span>Split</span><span>Amount</span></div>
      {expenses.map((expense) => (
        <div className="expense-row" key={expense.id}>
          <span className="category-icon"><ReceiptText size={18} /></span>
          <div className="expense-name"><strong>{expense.description}</strong><span>{expense.category} · {shortDate(expense.expenseDate)}</span></div>
          <div className="payer-stack">
            {expense.paidBy.slice(0, 2).map((payer) => <Avatar key={payer.userId} user={userMap[payer.userId]} small />)}
            <span>{expense.paidBy.map((payer) => userMap[payer.userId]?.name).join(" + ")}</span>
          </div>
          <StatusPill>{expense.splitType}</StatusPill>
          <strong className="expense-amount">{money(expense.amountCents)}</strong>
        </div>
      ))}
    </div>
  );
}
