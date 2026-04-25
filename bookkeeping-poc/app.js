const storageKey = "ledgerflow-bookkeeping-poc";

const categories = [
  "Sales",
  "Software",
  "Rent",
  "Payroll",
  "Marketing",
  "Meals",
  "Travel",
  "Contractors",
  "Office Supplies",
  "Taxes"
];

const today = new Date("2026-04-24T12:00:00");

const seedState = {
  invoices: [
    {
      id: "INV-1042",
      customer: "Ridgeway Dental",
      service: "Website maintenance",
      dueDate: "2026-04-29",
      amount: 2850,
      status: "open"
    },
    {
      id: "INV-1041",
      customer: "Evergreen Market",
      service: "Spring campaign",
      dueDate: "2026-04-18",
      amount: 6125,
      status: "overdue"
    },
    {
      id: "INV-1040",
      customer: "Beacon Fitness",
      service: "Landing page build",
      dueDate: "2026-04-08",
      amount: 3400,
      status: "paid"
    }
  ],
  transactions: [
    {
      id: "TX-8101",
      date: "2026-04-23",
      merchant: "Beacon Fitness",
      category: "Sales",
      type: "income",
      amount: 3400,
      status: "matched"
    },
    {
      id: "TX-8100",
      date: "2026-04-22",
      merchant: "Adobe",
      category: "Software",
      type: "expense",
      amount: 240,
      status: "matched"
    },
    {
      id: "TX-8099",
      date: "2026-04-21",
      merchant: "North Loop Office",
      category: "Rent",
      type: "expense",
      amount: 2100,
      status: "unmatched"
    },
    {
      id: "TX-8098",
      date: "2026-04-20",
      merchant: "Acme Contractors",
      category: "Contractors",
      type: "expense",
      amount: 1450,
      status: "unmatched"
    },
    {
      id: "TX-8097",
      date: "2026-04-18",
      merchant: "Ridgeway Dental",
      category: "Sales",
      type: "income",
      amount: 2850,
      status: "pending"
    }
  ],
  bills: [
    {
      id: "BILL-431",
      vendor: "North Loop Office",
      category: "Rent",
      dueDate: "2026-04-30",
      amount: 2100,
      status: "scheduled"
    },
    {
      id: "BILL-430",
      vendor: "Acme Contractors",
      category: "Contractors",
      dueDate: "2026-04-25",
      amount: 1450,
      status: "open"
    },
    {
      id: "BILL-429",
      vendor: "Adobe",
      category: "Software",
      dueDate: "2026-04-22",
      amount: 240,
      status: "paid"
    }
  ],
  audit: [
    "Invoice INV-1040 matched to Beacon Fitness deposit.",
    "Adobe subscription categorized as Software.",
    "Rent bill scheduled for month-end payment.",
    "Evergreen Market invoice flagged as overdue."
  ]
};

let state = loadState();
let invoiceFilter = "all";
let transactionQuery = "";

const refs = {
  pageTitle: document.querySelector("#pageTitle"),
  bankBalance: document.querySelector("#bankBalance"),
  metricGrid: document.querySelector("#metricGrid"),
  cashChart: document.querySelector("#cashChart"),
  cashRange: document.querySelector("#cashRange"),
  queueList: document.querySelector("#queueList"),
  auditTimeline: document.querySelector("#auditTimeline"),
  invoiceTable: document.querySelector("#invoiceTable"),
  transactionTable: document.querySelector("#transactionTable"),
  billTable: document.querySelector("#billTable"),
  reconcileSummary: document.querySelector("#reconcileSummary"),
  matchList: document.querySelector("#matchList"),
  insightList: document.querySelector("#insightList"),
  profitReport: document.querySelector("#profitReport"),
  categoryReport: document.querySelector("#categoryReport"),
  agingReport: document.querySelector("#agingReport"),
  toast: document.querySelector("#toast"),
  categorySelect: document.querySelector("#categorySelect")
};

document.addEventListener("DOMContentLoaded", () => {
  initializeDates();
  initializeCategories();
  bindEvents();
  render();
});

function loadState() {
  const stored = localStorage.getItem(storageKey);
  if (!stored) return structuredClone(seedState);

  try {
    return JSON.parse(stored);
  } catch {
    return structuredClone(seedState);
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function initializeDates() {
  const dueDateInputs = document.querySelectorAll("input[type='date']");
  dueDateInputs.forEach((input, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + 7 + index);
    input.value = toInputDate(date);
  });
}

function initializeCategories() {
  refs.categorySelect.innerHTML = categories
    .map((category) => `<option>${category}</option>`)
    .join("");
}

function bindEvents() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  document.querySelector("#seedButton").addEventListener("click", () => {
    state = structuredClone(seedState);
    saveState();
    render();
    showToast("Demo data reset.");
  });

  document.querySelector("#quickActionButton").addEventListener("click", () => switchView("invoices"));
  refs.cashRange.addEventListener("change", renderCashChart);
  window.addEventListener("resize", renderCashChart);

  document.querySelector("#invoiceForm").addEventListener("submit", handleInvoiceSubmit);
  document.querySelector("#transactionForm").addEventListener("submit", handleTransactionSubmit);
  document.querySelector("#billForm").addEventListener("submit", handleBillSubmit);
  document.querySelector("#reconcileButton").addEventListener("click", handleReconcile);
  document.querySelector("#transactionSearch").addEventListener("input", (event) => {
    transactionQuery = event.target.value.trim().toLowerCase();
    renderTransactions();
  });

  document.querySelectorAll("[data-invoice-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      invoiceFilter = button.dataset.invoiceFilter;
      document
        .querySelectorAll("[data-invoice-filter]")
        .forEach((item) => item.classList.toggle("active", item === button));
      renderInvoices();
    });
  });
}

function switchView(viewName) {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === viewName);
  });
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("active", view.id === `${viewName}View`);
  });

  const title = {
    dashboard: "Dashboard",
    invoices: "Invoices",
    transactions: "Transactions",
    bills: "Bills",
    reconcile: "Reconcile",
    reports: "Reports"
  }[viewName];

  refs.pageTitle.textContent = title;
  document.querySelector("#quickActionButton").textContent =
    viewName === "invoices" ? "New invoice" : "New invoice";
}

function handleInvoiceSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const invoice = {
    id: nextId("INV", state.invoices),
    customer: form.get("customer"),
    service: form.get("service"),
    amount: Number(form.get("amount")),
    dueDate: form.get("dueDate"),
    status: isPastDue(form.get("dueDate")) ? "overdue" : "open"
  };

  state.invoices.unshift(invoice);
  state.audit.unshift(`Invoice ${invoice.id} sent to ${invoice.customer}.`);
  persistAndRender("Invoice created.");
}

function handleTransactionSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const transaction = {
    id: nextId("TX", state.transactions),
    date: toInputDate(today),
    merchant: form.get("merchant"),
    category: form.get("category"),
    type: form.get("type"),
    amount: Number(form.get("amount")),
    status: "unmatched"
  };

  state.transactions.unshift(transaction);
  state.audit.unshift(`${transaction.merchant} transaction posted to ${transaction.category}.`);
  persistAndRender("Transaction posted.");
}

function handleBillSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const bill = {
    id: nextId("BILL", state.bills),
    vendor: form.get("vendor"),
    category: form.get("category"),
    amount: Number(form.get("amount")),
    dueDate: form.get("dueDate"),
    status: "open"
  };

  state.bills.unshift(bill);
  state.audit.unshift(`Bill ${bill.id} added for ${bill.vendor}.`);
  persistAndRender("Bill scheduled.");
}

function handleReconcile() {
  const checked = [...document.querySelectorAll("[data-match-id]:checked")].map(
    (item) => item.dataset.matchId
  );

  if (!checked.length) {
    showToast("Select at least one transaction to match.");
    return;
  }

  state.transactions = state.transactions.map((transaction) =>
    checked.includes(transaction.id) ? { ...transaction, status: "matched" } : transaction
  );
  state.audit.unshift(`${checked.length} bank feed item${checked.length > 1 ? "s" : ""} reconciled.`);
  persistAndRender("Selected transactions matched.");
}

function persistAndRender(message) {
  saveState();
  render();
  showToast(message);
}

function render() {
  renderMetrics();
  renderCashChart();
  renderQueue();
  renderAudit();
  renderInvoices();
  renderTransactions();
  renderBills();
  renderReconcile();
  renderReports();
}

function renderMetrics() {
  const openReceivables = sum(
    state.invoices.filter((invoice) => invoice.status !== "paid"),
    "amount"
  );
  const overdue = sum(state.invoices.filter((invoice) => invoice.status === "overdue"), "amount");
  const pendingBills = sum(state.bills.filter((bill) => bill.status !== "paid"), "amount");
  const balance = bankBalance();
  refs.bankBalance.textContent = money(balance);

  refs.metricGrid.innerHTML = [
    ["Bank balance", money(balance), "Live balance after posted transactions"],
    ["Open receivables", money(openReceivables), `${countOpenInvoices()} invoices need collection`],
    ["Upcoming bills", money(pendingBills), `${countOpenBills()} vendor payments pending`],
    ["Overdue risk", money(overdue), "Customers past due today"]
  ]
    .map(
      ([label, value, detail]) => `
        <article class="metric-card">
          <span>${label}</span>
          <strong>${value}</strong>
          <small>${detail}</small>
        </article>
      `
    )
    .join("");
}

function renderCashChart() {
  const canvas = refs.cashChart;
  const panel = canvas.closest(".panel");
  const width = Math.max(320, panel.clientWidth - 40);
  const height = 300;
  const scale = window.devicePixelRatio || 1;
  canvas.width = width * scale;
  canvas.height = height * scale;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.clearRect(0, 0, width, height);

  const range = Number(refs.cashRange.value);
  const allMonths = [
    ["Nov", 9500, 6200],
    ["Dec", 11200, 7800],
    ["Jan", 12800, 8400],
    ["Feb", 10900, 9100],
    ["Mar", 14200, 9900],
    ["Apr", monthlyIncome(), monthlyExpenses()]
  ].slice(-range);
  const maxValue = Math.max(...allMonths.flatMap((month) => [month[1], month[2]]), 1);
  const chartTop = 28;
  const chartBottom = height - 42;
  const groupWidth = width / allMonths.length;
  const barWidth = Math.min(28, groupWidth / 5);

  ctx.strokeStyle = "#dce5dc";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#637066";
  ctx.font = "12px system-ui";

  for (let i = 0; i <= 4; i += 1) {
    const y = chartTop + ((chartBottom - chartTop) / 4) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  allMonths.forEach(([label, income, expense], index) => {
    const center = groupWidth * index + groupWidth / 2;
    drawBar(ctx, center - barWidth - 4, chartBottom, barWidth, income, maxValue, chartTop, "#176b4f");
    drawBar(ctx, center + 4, chartBottom, barWidth, expense, maxValue, chartTop, "#2e6d9f");
    ctx.fillStyle = "#637066";
    ctx.textAlign = "center";
    ctx.fillText(label, center, height - 18);
  });

  ctx.textAlign = "left";
  ctx.fillStyle = "#176b4f";
  ctx.fillText("Income", 8, 18);
  ctx.fillStyle = "#2e6d9f";
  ctx.fillText("Expenses", 72, 18);
}

function drawBar(ctx, x, baseline, width, value, maxValue, chartTop, color) {
  const height = ((baseline - chartTop) * value) / maxValue;
  ctx.fillStyle = color;
  roundRect(ctx, x, baseline - height, width, height, 6);
  ctx.fill();
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function renderQueue() {
  const unmatched = state.transactions.filter((transaction) => transaction.status === "unmatched").length;
  const overdue = state.invoices.filter((invoice) => invoice.status === "overdue").length;
  const dueBills = state.bills.filter((bill) => bill.status !== "paid" && isWithinDays(bill.dueDate, 7)).length;

  refs.queueList.innerHTML = [
    [unmatched, "Unmatched bank transactions", "Review suggested matches in reconciliation."],
    [overdue, "Overdue customer invoices", "Send reminders or record payments."],
    [dueBills, "Bills due this week", "Approve scheduled vendor payments."]
  ]
    .map(
      ([count, title, detail]) => `
        <div class="queue-item">
          <div class="queue-badge">${count}</div>
          <div>
            <strong>${title}</strong>
            <div class="muted">${detail}</div>
          </div>
        </div>
      `
    )
    .join("");
}

function renderAudit() {
  refs.auditTimeline.innerHTML = state.audit
    .slice(0, 6)
    .map(
      (event, index) => `
        <div class="timeline-item">
          <strong>${event}</strong>
          <span class="muted">${index + 1} activity event${index === 0 ? " just now" : "s ago"}</span>
        </div>
      `
    )
    .join("");
}

function renderInvoices() {
  const invoices = state.invoices.filter((invoice) => {
    if (invoiceFilter === "all") return true;
    if (invoiceFilter === "open") return invoice.status === "open";
    return invoice.status === "overdue";
  });

  refs.invoiceTable.innerHTML = invoices
    .map(
      (invoice) => `
        <tr>
          <td><strong>${invoice.customer}</strong><div class="muted">${invoice.id}</div></td>
          <td>${invoice.service}</td>
          <td>${formatDate(invoice.dueDate)}</td>
          <td><span class="status-pill ${invoice.status}">${capitalize(invoice.status)}</span></td>
          <td class="num">${money(invoice.amount)}</td>
          <td class="num">
            ${
              invoice.status === "paid"
                ? ""
                : `<button class="small-button" data-pay-invoice="${invoice.id}" type="button">Record payment</button>`
            }
          </td>
        </tr>
      `
    )
    .join("");

  document.querySelectorAll("[data-pay-invoice]").forEach((button) => {
    button.addEventListener("click", () => recordInvoicePayment(button.dataset.payInvoice));
  });
}

function recordInvoicePayment(id) {
  const invoice = state.invoices.find((item) => item.id === id);
  if (!invoice) return;

  invoice.status = "paid";
  state.transactions.unshift({
    id: nextId("TX", state.transactions),
    date: toInputDate(today),
    merchant: invoice.customer,
    category: "Sales",
    type: "income",
    amount: invoice.amount,
    status: "matched"
  });
  state.audit.unshift(`Payment recorded for ${invoice.id}.`);
  persistAndRender("Payment recorded.");
}

function renderTransactions() {
  const transactions = state.transactions.filter((transaction) => {
    const haystack = `${transaction.merchant} ${transaction.category} ${transaction.status}`.toLowerCase();
    return haystack.includes(transactionQuery);
  });

  refs.transactionTable.innerHTML = transactions
    .map(
      (transaction) => `
        <tr>
          <td>${formatDate(transaction.date)}</td>
          <td><strong>${transaction.merchant}</strong><div class="muted">${transaction.id}</div></td>
          <td>
            <select data-category="${transaction.id}" aria-label="Change category for ${transaction.id}">
              ${categories
                .map(
                  (category) =>
                    `<option ${category === transaction.category ? "selected" : ""}>${category}</option>`
                )
                .join("")}
            </select>
          </td>
          <td><span class="status-pill ${transaction.status}">${capitalize(transaction.status)}</span></td>
          <td class="num">${transaction.type === "expense" ? "-" : ""}${money(transaction.amount)}</td>
          <td class="num">
            ${
              transaction.status === "matched"
                ? ""
                : `<button class="small-button" data-match-transaction="${transaction.id}" type="button">Match</button>`
            }
          </td>
        </tr>
      `
    )
    .join("");

  document.querySelectorAll("[data-category]").forEach((select) => {
    select.addEventListener("change", () => {
      const transaction = state.transactions.find((item) => item.id === select.dataset.category);
      transaction.category = select.value;
      state.audit.unshift(`${transaction.merchant} recategorized as ${select.value}.`);
      persistAndRender("Category updated.");
    });
  });

  document.querySelectorAll("[data-match-transaction]").forEach((button) => {
    button.addEventListener("click", () => {
      const transaction = state.transactions.find((item) => item.id === button.dataset.matchTransaction);
      transaction.status = "matched";
      state.audit.unshift(`${transaction.merchant} transaction matched.`);
      persistAndRender("Transaction matched.");
    });
  });
}

function renderBills() {
  refs.billTable.innerHTML = state.bills
    .map(
      (bill) => `
        <tr>
          <td><strong>${bill.vendor}</strong><div class="muted">${bill.id}</div></td>
          <td>${bill.category}</td>
          <td>${formatDate(bill.dueDate)}</td>
          <td><span class="status-pill ${bill.status}">${capitalize(bill.status)}</span></td>
          <td class="num">${money(bill.amount)}</td>
          <td class="num">
            ${
              bill.status === "paid"
                ? ""
                : `<button class="small-button" data-pay-bill="${bill.id}" type="button">Pay</button>`
            }
          </td>
        </tr>
      `
    )
    .join("");

  document.querySelectorAll("[data-pay-bill]").forEach((button) => {
    button.addEventListener("click", () => payBill(button.dataset.payBill));
  });
}

function payBill(id) {
  const bill = state.bills.find((item) => item.id === id);
  if (!bill) return;

  bill.status = "paid";
  state.transactions.unshift({
    id: nextId("TX", state.transactions),
    date: toInputDate(today),
    merchant: bill.vendor,
    category: bill.category,
    type: "expense",
    amount: bill.amount,
    status: "matched"
  });
  state.audit.unshift(`Bill ${bill.id} paid to ${bill.vendor}.`);
  persistAndRender("Bill paid.");
}

function renderReconcile() {
  const unmatched = state.transactions.filter((transaction) => transaction.status === "unmatched");
  const matched = state.transactions.filter((transaction) => transaction.status === "matched");
  const totalUnmatched = sum(unmatched, "amount");

  refs.reconcileSummary.innerHTML = [
    ["Matched", matched.length, "Posted to books"],
    ["Needs review", unmatched.length, "Awaiting match"],
    ["Unmatched total", money(totalUnmatched), "Bank feed variance"]
  ]
    .map(
      ([label, value, detail]) => `
        <div class="metric-card">
          <span>${label}</span>
          <strong>${value}</strong>
          <small>${detail}</small>
        </div>
      `
    )
    .join("");

  refs.matchList.innerHTML = unmatched.length
    ? unmatched
        .map(
          (transaction) => `
            <label class="match-item">
              <input type="checkbox" data-match-id="${transaction.id}" />
              <span>
                <strong>${transaction.merchant}</strong>
                <span class="muted">${formatDate(transaction.date)} - ${transaction.category}</span>
              </span>
              <span class="num">${transaction.type === "expense" ? "-" : ""}${money(transaction.amount)}</span>
            </label>
          `
        )
        .join("")
    : `<div class="match-item"><span></span><strong>All bank feed items are matched.</strong><span></span></div>`;

  refs.insightList.innerHTML = suggestedMatches()
    .map(
      (insight) => `
        <div class="insight-item">
          <strong>${insight.title}</strong>
          <span class="muted">${insight.detail}</span>
        </div>
      `
    )
    .join("");
}

function renderReports() {
  const income = monthlyIncome();
  const expenses = monthlyExpenses();
  const profit = income - expenses;

  refs.profitReport.innerHTML = [
    ["Income", money(income)],
    ["Expenses", money(expenses)],
    ["Net profit", money(profit)]
  ]
    .map(([label, value]) => `<div class="report-line"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");

  const expenseGroups = categories
    .map((category) => ({
      category,
      total: sum(
        state.transactions.filter(
          (transaction) => transaction.type === "expense" && transaction.category === category
        ),
        "amount"
      )
    }))
    .filter((group) => group.total > 0)
    .sort((a, b) => b.total - a.total);

  const maxExpense = Math.max(...expenseGroups.map((group) => group.total), 1);
  refs.categoryReport.innerHTML = expenseGroups
    .map(
      (group) => `
        <div class="bar-row">
          <strong>${group.category}</strong>
          <div class="bar-track"><div class="bar-fill" style="width:${(group.total / maxExpense) * 100}%"></div></div>
          <span class="num">${money(group.total)}</span>
        </div>
      `
    )
    .join("");

  const receivables = sum(state.invoices.filter((invoice) => invoice.status !== "paid"), "amount");
  const payables = sum(state.bills.filter((bill) => bill.status !== "paid"), "amount");
  const overdue = sum(state.invoices.filter((invoice) => invoice.status === "overdue"), "amount");

  refs.agingReport.innerHTML = [
    ["Current receivables", money(receivables - overdue), "Expected customer collections"],
    ["Overdue receivables", money(overdue), "Collection follow-up needed"],
    ["Open payables", money(payables), "Vendor obligations not paid"]
  ]
    .map(
      ([label, value, detail]) => `
        <div class="report-line">
          <span>${label}</span>
          <strong>${value}</strong>
          <small class="muted">${detail}</small>
        </div>
      `
    )
    .join("");
}

function suggestedMatches() {
  const insights = [];
  state.transactions
    .filter((transaction) => transaction.status === "unmatched")
    .forEach((transaction) => {
      const bill = state.bills.find(
        (item) => item.vendor === transaction.merchant && item.amount === transaction.amount
      );
      if (bill) {
        insights.push({
          title: `${transaction.merchant} likely matches ${bill.id}`,
          detail: `Same vendor and ${money(transaction.amount)} amount.`
        });
      }
    });

  if (!insights.length) {
    insights.push({
      title: "No high-confidence exceptions",
      detail: "The remaining items need manual review or more bank details."
    });
  }

  return insights;
}

function monthlyIncome() {
  return sum(
    state.transactions.filter((transaction) => transaction.type === "income"),
    "amount"
  );
}

function monthlyExpenses() {
  return sum(
    state.transactions.filter((transaction) => transaction.type === "expense"),
    "amount"
  );
}

function bankBalance() {
  return 24800 + monthlyIncome() - monthlyExpenses();
}

function countOpenInvoices() {
  return state.invoices.filter((invoice) => invoice.status !== "paid").length;
}

function countOpenBills() {
  return state.bills.filter((bill) => bill.status !== "paid").length;
}

function sum(items, key) {
  return items.reduce((total, item) => total + Number(item[key] || 0), 0);
}

function nextId(prefix, collection) {
  const numbers = collection
    .map((item) => Number(String(item.id).replace(`${prefix}-`, "")))
    .filter(Number.isFinite);
  return `${prefix}-${Math.max(...numbers, 1000) + 1}`;
}

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(`${value}T12:00:00`));
}

function toInputDate(date) {
  return date.toISOString().slice(0, 10);
}

function isPastDue(dateValue) {
  return new Date(`${dateValue}T12:00:00`) < today;
}

function isWithinDays(dateValue, days) {
  const due = new Date(`${dateValue}T12:00:00`);
  const diff = due.getTime() - today.getTime();
  return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000;
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function showToast(message) {
  refs.toast.textContent = message;
  refs.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => refs.toast.classList.remove("show"), 2200);
}
