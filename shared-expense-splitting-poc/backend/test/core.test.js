import assert from "node:assert/strict";
import test from "node:test";
import { ExpenseStore, calculateSplits, simplifyBalances } from "../src/core.js";

test("equal split allocates every cent deterministically", () => {
  assert.deepEqual(calculateSplits(1000, "equal", [
    { userId: "a" },
    { userId: "b" },
    { userId: "c" }
  ]), [
    { userId: "a", amountCents: 334 },
    { userId: "b", amountCents: 333 },
    { userId: "c", amountCents: 333 }
  ]);
});

test("percentage split validates total and preserves cents", () => {
  assert.deepEqual(calculateSplits(999, "percentage", [
    { userId: "a", value: 60 },
    { userId: "b", value: 40 }
  ]), [
    { userId: "a", amountCents: 599 },
    { userId: "b", amountCents: 400 }
  ]);
  assert.throws(() => calculateSplits(1000, "percentage", [{ userId: "a", value: 80 }]), /total 100/);
});

test("multi-payer expense produces balanced immutable ledger entries", () => {
  const store = new ExpenseStore();
  store.users = [{ id: "a" }, { id: "b" }, { id: "c" }];
  store.groups = [{ id: "g", memberIds: ["a", "b", "c"] }];
  const expense = store.createExpense({
    groupId: "g",
    description: "Dinner",
    amountCents: 9000,
    paidBy: [{ userId: "a", amountCents: 6000 }, { userId: "b", amountCents: 3000 }],
    splitType: "equal",
    splits: [{ userId: "a" }, { userId: "b" }, { userId: "c" }]
  });
  const entries = store.ledger.filter((entry) => entry.referenceId === expense.id);
  assert.equal(entries.reduce((sum, entry) => sum + entry.amountCents, 0), 0);
  assert.deepEqual(store.balances("g"), { a: 3000, b: 0, c: -3000 });
});

test("editing reverses original ledger and posts replacement version", () => {
  const store = new ExpenseStore();
  store.users = [{ id: "a" }, { id: "b" }];
  store.groups = [{ id: "g", memberIds: ["a", "b"] }];
  const original = store.createExpense({
    groupId: "g",
    description: "Taxi",
    amountCents: 2000,
    paidBy: [{ userId: "a", amountCents: 2000 }],
    splitType: "equal",
    splits: [{ userId: "a" }, { userId: "b" }]
  });
  const replacement = store.editExpense(original.id, {
    description: "Taxi corrected",
    amountCents: 3000,
    paidBy: [{ userId: "a", amountCents: 3000 }],
    splitType: "equal",
    splits: [{ userId: "a" }, { userId: "b" }]
  });
  assert.equal(original.status, "reversed");
  assert.equal(replacement.version, 2);
  assert.equal(replacement.replacesExpenseId, original.id);
  assert.equal(store.ledger.filter((entry) => entry.reversalOf).length, 3);
  assert.deepEqual(store.balances("g"), { a: 1500, b: -1500 });
});

test("settlement simplification produces a minimal greedy plan", () => {
  assert.deepEqual(simplifyBalances({ a: 7000, b: -4000, c: -3000, d: 0 }), [
    { fromUserId: "b", toUserId: "a", amountCents: 4000 },
    { fromUserId: "c", toUserId: "a", amountCents: 3000 }
  ]);
});

test("repayment reduces debtor and creditor balances", () => {
  const store = new ExpenseStore();
  store.users = [{ id: "a" }, { id: "b" }];
  store.groups = [{ id: "g", memberIds: ["a", "b"] }];
  store.createExpense({
    groupId: "g",
    description: "Rent",
    amountCents: 10000,
    paidBy: [{ userId: "a", amountCents: 10000 }],
    splitType: "equal",
    splits: [{ userId: "a" }, { userId: "b" }]
  });
  store.recordRepayment({ groupId: "g", fromUserId: "b", toUserId: "a", amountCents: 5000 });
  assert.deepEqual(store.balances("g"), { a: 0, b: 0 });
});

test("recurring run creates one expense and advances next date", () => {
  const store = new ExpenseStore();
  store.users = [{ id: "a" }, { id: "b" }];
  store.groups = [{ id: "g", memberIds: ["a", "b"] }];
  store.recurring = [{
    id: "r",
    groupId: "g",
    description: "Internet",
    amountCents: 6000,
    paidBy: [{ userId: "a", amountCents: 6000 }],
    splitType: "equal",
    splits: [{ userId: "a" }, { userId: "b" }],
    nextRunDate: "2026-06-01",
    active: true
  }];
  assert.equal(store.runRecurring("2026-06-01").length, 1);
  assert.equal(store.recurring[0].nextRunDate, "2026-07-01");
  assert.equal(store.runRecurring("2026-06-01").length, 0);
});

test("reminders target members with balances beyond threshold", () => {
  const store = new ExpenseStore();
  store.users = [{ id: "a" }, { id: "b" }];
  store.groups = [{ id: "g", memberIds: ["a", "b"] }];
  store.createExpense({
    groupId: "g",
    description: "Utilities",
    amountCents: 12000,
    paidBy: [{ userId: "a", amountCents: 12000 }],
    splitType: "equal",
    splits: [{ userId: "a" }, { userId: "b" }]
  });
  const reminders = store.createReminders("g", 5000);
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].userId, "b");
  assert.equal(store.createReminders("g", 5000).length, 0);
});
