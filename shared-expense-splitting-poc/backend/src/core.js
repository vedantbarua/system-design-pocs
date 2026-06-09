import crypto from "node:crypto";

const SPLIT_TYPES = new Set(["equal", "exact", "percentage", "shares"]);

function id(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function integer(value, field, min = 0) {
  const parsed = Number(value);
  assert(Number.isInteger(parsed) && parsed >= min, `${field} must be an integer >= ${min}`);
  return parsed;
}

function allocateByWeights(total, entries, weightFor) {
  const weighted = entries.map((entry) => ({ ...entry, weight: Number(weightFor(entry)) }));
  assert(weighted.every((entry) => Number.isFinite(entry.weight) && entry.weight >= 0), "split weights must be non-negative");
  const weightTotal = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  assert(weightTotal > 0, "split weights must total more than zero");

  const raw = weighted.map((entry) => ({
    userId: entry.userId,
    exact: (total * entry.weight) / weightTotal
  }));
  const allocated = raw.map((entry) => ({
    userId: entry.userId,
    amountCents: Math.floor(entry.exact),
    remainder: entry.exact - Math.floor(entry.exact)
  }));
  let remaining = total - allocated.reduce((sum, entry) => sum + entry.amountCents, 0);
  allocated.sort((a, b) => b.remainder - a.remainder || a.userId.localeCompare(b.userId));
  for (let index = 0; index < remaining; index += 1) allocated[index].amountCents += 1;
  return allocated
    .sort((a, b) => a.userId.localeCompare(b.userId))
    .map(({ userId, amountCents }) => ({ userId, amountCents }));
}

export function calculateSplits(amountCents, splitType, splits) {
  const total = integer(amountCents, "amountCents", 1);
  assert(SPLIT_TYPES.has(splitType), "splitType must be equal, exact, percentage, or shares");
  assert(Array.isArray(splits) && splits.length > 0, "splits must not be empty");
  const userIds = splits.map((entry) => entry.userId);
  assert(new Set(userIds).size === userIds.length, "split users must be unique");

  if (splitType === "exact") {
    const result = splits.map((entry) => ({
      userId: entry.userId,
      amountCents: integer(entry.amountCents, "split amount")
    }));
    assert(result.reduce((sum, entry) => sum + entry.amountCents, 0) === total, "exact splits must equal expense amount");
    return result;
  }
  if (splitType === "equal") {
    return allocateByWeights(total, splits, () => 1);
  }
  if (splitType === "percentage") {
    const percentageTotal = splits.reduce((sum, entry) => sum + Number(entry.value), 0);
    assert(Math.abs(percentageTotal - 100) < 0.0001, "percentage splits must total 100");
    return allocateByWeights(total, splits, (entry) => entry.value);
  }
  return allocateByWeights(total, splits, (entry) => entry.value);
}

export function simplifyBalances(balances) {
  const creditors = Object.entries(balances)
    .filter(([, amount]) => amount > 0)
    .map(([userId, amount]) => ({ userId, amount }))
    .sort((a, b) => b.amount - a.amount);
  const debtors = Object.entries(balances)
    .filter(([, amount]) => amount < 0)
    .map(([userId, amount]) => ({ userId, amount: -amount }))
    .sort((a, b) => b.amount - a.amount);
  const settlements = [];
  let creditIndex = 0;
  let debtIndex = 0;

  while (creditIndex < creditors.length && debtIndex < debtors.length) {
    const amountCents = Math.min(creditors[creditIndex].amount, debtors[debtIndex].amount);
    if (amountCents > 0) {
      settlements.push({
        fromUserId: debtors[debtIndex].userId,
        toUserId: creditors[creditIndex].userId,
        amountCents
      });
    }
    creditors[creditIndex].amount -= amountCents;
    debtors[debtIndex].amount -= amountCents;
    if (creditors[creditIndex].amount === 0) creditIndex += 1;
    if (debtors[debtIndex].amount === 0) debtIndex += 1;
  }
  return settlements;
}

export class ExpenseStore {
  constructor() {
    this.users = [];
    this.groups = [];
    this.expenses = [];
    this.ledger = [];
    this.repayments = [];
    this.recurring = [];
    this.reminders = [];
    this.activity = [];
  }

  seed() {
    this.users = [
      { id: "user-maya", name: "Maya", email: "maya@example.com", color: "#146c5a" },
      { id: "user-owen", name: "Owen", email: "owen@example.com", color: "#d35d37" },
      { id: "user-priya", name: "Priya", email: "priya@example.com", color: "#3e65a8" },
      { id: "user-leo", name: "Leo", email: "leo@example.com", color: "#8b5a9f" }
    ];
    this.groups = [
      {
        id: "group-apartment",
        name: "Maple Street Apartment",
        currency: "USD",
        memberIds: this.users.map((user) => user.id),
        createdAt: Date.now()
      },
      {
        id: "group-roadtrip",
        name: "Lake Weekend",
        currency: "USD",
        memberIds: ["user-maya", "user-owen", "user-priya"],
        createdAt: Date.now()
      }
    ];

    this.createExpense({
      groupId: "group-apartment",
      description: "June rent",
      category: "Housing",
      amountCents: 280000,
      paidBy: [{ userId: "user-maya", amountCents: 280000 }],
      splitType: "equal",
      splits: this.groups[0].memberIds.map((userId) => ({ userId })),
      expenseDate: "2026-06-01"
    });
    this.createExpense({
      groupId: "group-apartment",
      description: "Electric bill",
      category: "Utilities",
      amountCents: 12480,
      paidBy: [
        { userId: "user-owen", amountCents: 8000 },
        { userId: "user-priya", amountCents: 4480 }
      ],
      splitType: "percentage",
      splits: [
        { userId: "user-maya", value: 25 },
        { userId: "user-owen", value: 25 },
        { userId: "user-priya", value: 25 },
        { userId: "user-leo", value: 25 }
      ],
      expenseDate: "2026-06-03"
    });
    this.createExpense({
      groupId: "group-apartment",
      description: "Groceries",
      category: "Food",
      amountCents: 8635,
      paidBy: [{ userId: "user-leo", amountCents: 8635 }],
      splitType: "shares",
      splits: [
        { userId: "user-maya", value: 1 },
        { userId: "user-owen", value: 1 },
        { userId: "user-priya", value: 2 },
        { userId: "user-leo", value: 1 }
      ],
      expenseDate: "2026-06-05"
    });
    this.recurring.push({
      id: "rec-internet",
      groupId: "group-apartment",
      description: "Internet",
      category: "Utilities",
      amountCents: 6500,
      paidBy: [{ userId: "user-owen", amountCents: 6500 }],
      splitType: "equal",
      splits: this.groups[0].memberIds.map((userId) => ({ userId })),
      frequency: "monthly",
      nextRunDate: "2026-07-01",
      active: true
    });
  }

  log(type, message, payload = {}) {
    this.activity.unshift({ id: id("act"), type, message, payload, at: Date.now() });
    this.activity = this.activity.slice(0, 100);
  }

  group(groupId) {
    const group = this.groups.find((item) => item.id === groupId);
    assert(group, "group not found");
    return group;
  }

  validateMembers(groupId, entries) {
    const members = new Set(this.group(groupId).memberIds);
    assert(entries.every((entry) => members.has(entry.userId)), "every payer and split user must belong to the group");
  }

  createExpense(input, options = {}) {
    const amountCents = integer(input.amountCents, "amountCents", 1);
    assert(input.description?.trim(), "description is required");
    assert(Array.isArray(input.paidBy) && input.paidBy.length > 0, "paidBy must not be empty");
    this.validateMembers(input.groupId, [...input.paidBy, ...input.splits]);
    const paidBy = input.paidBy.map((entry) => ({
      userId: entry.userId,
      amountCents: integer(entry.amountCents, "payer amount")
    }));
    assert(paidBy.reduce((sum, entry) => sum + entry.amountCents, 0) === amountCents, "payer amounts must equal expense amount");
    const calculatedSplits = calculateSplits(amountCents, input.splitType, input.splits);
    const expenseId = options.expenseId || id("exp");
    const expense = {
      id: expenseId,
      groupId: input.groupId,
      description: input.description.trim(),
      category: input.category || "Other",
      amountCents,
      paidBy,
      splitType: input.splitType,
      splits: calculatedSplits,
      expenseDate: input.expenseDate || new Date().toISOString().slice(0, 10),
      status: "posted",
      version: options.version || 1,
      replacesExpenseId: options.replacesExpenseId || null,
      recurringId: options.recurringId || null,
      createdAt: Date.now()
    };
    this.expenses.push(expense);
    for (const payer of paidBy) {
      this.ledger.push({
        id: id("led"),
        groupId: expense.groupId,
        userId: payer.userId,
        amountCents: payer.amountCents,
        kind: "expense_payment",
        referenceId: expense.id,
        createdAt: Date.now()
      });
    }
    for (const split of calculatedSplits) {
      this.ledger.push({
        id: id("led"),
        groupId: expense.groupId,
        userId: split.userId,
        amountCents: -split.amountCents,
        kind: "expense_share",
        referenceId: expense.id,
        createdAt: Date.now()
      });
    }
    this.log("expense_created", `${expense.description} added for ${amountCents} cents`, { expenseId });
    return expense;
  }

  reverseExpense(expenseId, reason = "Expense reversed") {
    const expense = this.expenses.find((item) => item.id === expenseId);
    assert(expense, "expense not found");
    assert(expense.status === "posted", "expense is already reversed");
    const originalEntries = this.ledger.filter((entry) => entry.referenceId === expenseId && !entry.reversalOf);
    for (const entry of originalEntries) {
      this.ledger.push({
        id: id("led"),
        groupId: entry.groupId,
        userId: entry.userId,
        amountCents: -entry.amountCents,
        kind: "reversal",
        referenceId: expenseId,
        reversalOf: entry.id,
        createdAt: Date.now()
      });
    }
    expense.status = "reversed";
    expense.reversalReason = reason;
    this.log("expense_reversed", `${expense.description} reversed`, { expenseId, reason });
    return expense;
  }

  editExpense(expenseId, input) {
    const original = this.expenses.find((item) => item.id === expenseId);
    assert(original, "expense not found");
    this.reverseExpense(expenseId, "Replaced by edited expense");
    return this.createExpense(
      { ...input, groupId: original.groupId },
      { version: original.version + 1, replacesExpenseId: original.id }
    );
  }

  balances(groupId) {
    this.group(groupId);
    const result = Object.fromEntries(this.group(groupId).memberIds.map((userId) => [userId, 0]));
    for (const entry of this.ledger.filter((item) => item.groupId === groupId)) {
      result[entry.userId] = (result[entry.userId] || 0) + entry.amountCents;
    }
    return result;
  }

  settlements(groupId) {
    return simplifyBalances(this.balances(groupId));
  }

  recordRepayment({ groupId, fromUserId, toUserId, amountCents, note = "" }) {
    const amount = integer(amountCents, "amountCents", 1);
    assert(fromUserId !== toUserId, "repayment users must be different");
    this.validateMembers(groupId, [{ userId: fromUserId }, { userId: toUserId }]);
    const repayment = {
      id: id("repay"),
      groupId,
      fromUserId,
      toUserId,
      amountCents: amount,
      note,
      createdAt: Date.now()
    };
    this.repayments.push(repayment);
    this.ledger.push(
      {
        id: id("led"),
        groupId,
        userId: fromUserId,
        amountCents: amount,
        kind: "repayment_sent",
        referenceId: repayment.id,
        createdAt: Date.now()
      },
      {
        id: id("led"),
        groupId,
        userId: toUserId,
        amountCents: -amount,
        kind: "repayment_received",
        referenceId: repayment.id,
        createdAt: Date.now()
      }
    );
    this.log("repayment_recorded", `Repayment recorded for ${amount} cents`, { repaymentId: repayment.id });
    return repayment;
  }

  runRecurring(runDate) {
    const generated = [];
    for (const template of this.recurring.filter((item) => item.active && item.nextRunDate <= runDate)) {
      generated.push(this.createExpense(
        { ...template, expenseDate: template.nextRunDate },
        { recurringId: template.id }
      ));
      const next = new Date(`${template.nextRunDate}T00:00:00Z`);
      next.setUTCMonth(next.getUTCMonth() + 1);
      template.nextRunDate = next.toISOString().slice(0, 10);
    }
    if (generated.length) this.log("recurring_generated", `${generated.length} recurring expense(s) generated`);
    return generated;
  }

  createReminders(groupId, thresholdCents = 5000) {
    const balances = this.balances(groupId);
    const existing = new Set(this.reminders.filter((item) => item.status === "pending").map((item) => `${item.groupId}:${item.userId}`));
    const created = [];
    for (const [userId, balance] of Object.entries(balances)) {
      if (balance <= -Math.abs(thresholdCents) && !existing.has(`${groupId}:${userId}`)) {
        const reminder = {
          id: id("rem"),
          groupId,
          userId,
          amountCents: -balance,
          channel: "email",
          status: "pending",
          createdAt: Date.now()
        };
        this.reminders.push(reminder);
        created.push(reminder);
      }
    }
    if (created.length) this.log("reminders_created", `${created.length} payment reminder(s) queued`);
    return created;
  }

  snapshot(groupId = this.groups[0]?.id) {
    const group = this.group(groupId);
    const balances = this.balances(groupId);
    const activeExpenses = this.expenses.filter((item) => item.groupId === groupId && item.status === "posted");
    return {
      group,
      users: this.users.filter((user) => group.memberIds.includes(user.id)),
      groups: this.groups,
      expenses: activeExpenses.slice().sort((a, b) => b.expenseDate.localeCompare(a.expenseDate) || b.createdAt - a.createdAt),
      expenseHistory: this.expenses.filter((item) => item.groupId === groupId).slice().reverse(),
      ledger: this.ledger.filter((item) => item.groupId === groupId).slice().reverse(),
      balances,
      settlements: simplifyBalances(balances),
      repayments: this.repayments.filter((item) => item.groupId === groupId).slice().reverse(),
      recurring: this.recurring.filter((item) => item.groupId === groupId),
      reminders: this.reminders.filter((item) => item.groupId === groupId).slice().reverse(),
      activity: this.activity.slice(0, 20),
      metrics: {
        totalSpentCents: activeExpenses.reduce((sum, expense) => sum + expense.amountCents, 0),
        expenseCount: activeExpenses.length,
        unsettledCents: Object.values(balances).filter((amount) => amount > 0).reduce((sum, amount) => sum + amount, 0),
        pendingReminderCount: this.reminders.filter((item) => item.groupId === groupId && item.status === "pending").length
      }
    };
  }
}

export function createSeededStore() {
  const store = new ExpenseStore();
  store.seed();
  return store;
}
