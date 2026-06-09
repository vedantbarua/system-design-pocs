import crypto from "node:crypto";

const DAY_MS = 24 * 60 * 60 * 1000;

function id(prefix) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function dateOnly(value = new Date()) {
  return new Date(value).toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + Number(days));
  return dateOnly(next);
}

function daysBetween(from, to) {
  return Math.floor((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / DAY_MS);
}

function integer(value, field, min = 0) {
  const parsed = Number(value);
  assert(Number.isInteger(parsed) && parsed >= min, `${field} must be an integer >= ${min}`);
  return parsed;
}

export function taskStatus(task, asOf = dateOnly()) {
  if (task.manualStatus === "SKIPPED") return "SKIPPED";
  if (task.scheduleType === "usage") {
    const remaining = task.nextDueUsage - task.currentUsage;
    if (remaining < 0) return "OVERDUE";
    if (remaining <= task.usageLead) return "DUE";
    return "UPCOMING";
  }
  const remainingDays = daysBetween(asOf, task.nextDueDate);
  if (remainingDays < 0) return "OVERDUE";
  if (remainingDays <= task.leadDays) return "DUE";
  return "UPCOMING";
}

export function nextRecurringDate(completedOn, intervalDays) {
  return addDays(completedOn, integer(intervalDays, "intervalDays", 1));
}

export class MaintenanceStore {
  constructor() {
    this.properties = [];
    this.rooms = [];
    this.assets = [];
    this.tasks = [];
    this.serviceHistory = [];
    this.reminders = [];
    this.activity = [];
  }

  seed() {
    this.properties = [
      {
        id: "property-maple",
        name: "Maple Street Home",
        address: "1428 Maple Street, Chicago, IL",
        type: "Single-family home",
        yearBuilt: 1987,
        createdAt: Date.now()
      },
      {
        id: "property-lake",
        name: "Lake Cabin",
        address: "71 Shoreline Road, Lake Geneva, WI",
        type: "Cabin",
        yearBuilt: 2004,
        createdAt: Date.now()
      }
    ];
    this.rooms = [
      { id: "room-utility", propertyId: "property-maple", name: "Utility room", floor: "Basement" },
      { id: "room-kitchen", propertyId: "property-maple", name: "Kitchen", floor: "Main" },
      { id: "room-exterior", propertyId: "property-maple", name: "Exterior", floor: "Outdoor" },
      { id: "room-hall", propertyId: "property-maple", name: "Hallway", floor: "Main" },
      { id: "room-cabin-main", propertyId: "property-lake", name: "Main room", floor: "Main" }
    ];
    this.assets = [
      {
        id: "asset-hvac",
        propertyId: "property-maple",
        roomId: "room-utility",
        name: "Carrier HVAC",
        category: "Climate",
        installedOn: "2021-04-18",
        warrantyEndsOn: "2031-04-18",
        model: "Infinity 24",
        serialNumber: "CAR-2404-1182",
        documents: [
          { id: "doc-hvac-warranty", name: "HVAC warranty", type: "Warranty", expiresOn: "2031-04-18" },
          { id: "doc-hvac-manual", name: "Owner manual", type: "Manual", expiresOn: null }
        ]
      },
      {
        id: "asset-water-heater",
        propertyId: "property-maple",
        roomId: "room-utility",
        name: "Water heater",
        category: "Plumbing",
        installedOn: "2018-09-10",
        warrantyEndsOn: "2026-07-02",
        model: "Performance Plus",
        serialNumber: "WH-89110",
        documents: [{ id: "doc-water-warranty", name: "Water heater warranty", type: "Warranty", expiresOn: "2026-07-02" }]
      },
      {
        id: "asset-fridge",
        propertyId: "property-maple",
        roomId: "room-kitchen",
        name: "Refrigerator",
        category: "Appliance",
        installedOn: "2023-02-14",
        warrantyEndsOn: "2028-02-14",
        model: "Counter Depth 500",
        serialNumber: "RF-500-221",
        documents: [{ id: "doc-fridge-receipt", name: "Purchase receipt", type: "Receipt", expiresOn: null }]
      },
      {
        id: "asset-generator",
        propertyId: "property-lake",
        roomId: "room-cabin-main",
        name: "Portable generator",
        category: "Electrical",
        installedOn: "2022-06-03",
        warrantyEndsOn: "2027-06-03",
        model: "GP6500",
        serialNumber: "GEN-6500-72",
        documents: []
      }
    ];
    this.tasks = [
      {
        id: "task-hvac-filter",
        propertyId: "property-maple",
        assetId: "asset-hvac",
        roomId: "room-utility",
        title: "Replace HVAC filter",
        category: "Climate",
        scheduleType: "date",
        intervalDays: 90,
        nextDueDate: "2026-06-05",
        leadDays: 7,
        estimatedCostCents: 2800,
        assignedTo: "Vedant",
        instructions: "Use a 16x25x1 MERV 11 filter.",
        manualStatus: null
      },
      {
        id: "task-smoke-detectors",
        propertyId: "property-maple",
        assetId: null,
        roomId: "room-hall",
        title: "Test smoke detectors",
        category: "Safety",
        scheduleType: "date",
        intervalDays: 30,
        nextDueDate: "2026-06-09",
        leadDays: 3,
        estimatedCostCents: 0,
        assignedTo: "Household",
        instructions: "Test each alarm and inspect battery indicator.",
        manualStatus: null
      },
      {
        id: "task-gutters",
        propertyId: "property-maple",
        assetId: null,
        roomId: "room-exterior",
        title: "Clean gutters",
        category: "Exterior",
        scheduleType: "date",
        intervalDays: 180,
        nextDueDate: "2026-06-21",
        leadDays: 14,
        estimatedCostCents: 18500,
        assignedTo: "Northside Home Care",
        instructions: "Clear debris and check downspout flow.",
        manualStatus: null
      },
      {
        id: "task-water-flush",
        propertyId: "property-maple",
        assetId: "asset-water-heater",
        roomId: "room-utility",
        title: "Flush water heater",
        category: "Plumbing",
        scheduleType: "date",
        intervalDays: 365,
        nextDueDate: "2026-07-08",
        leadDays: 14,
        estimatedCostCents: 16500,
        assignedTo: "Lakeview Plumbing",
        instructions: "Drain sediment and inspect anode rod.",
        manualStatus: null
      },
      {
        id: "task-generator-service",
        propertyId: "property-lake",
        assetId: "asset-generator",
        roomId: "room-cabin-main",
        title: "Generator oil service",
        category: "Electrical",
        scheduleType: "usage",
        intervalUnits: 100,
        currentUsage: 92,
        nextDueUsage: 100,
        usageUnit: "hours",
        usageLead: 10,
        estimatedCostCents: 6200,
        assignedTo: "Owner",
        instructions: "Change oil, inspect plug, and run under load.",
        manualStatus: null
      }
    ];
    this.serviceHistory = [
      {
        id: "history-hvac-tuneup",
        propertyId: "property-maple",
        assetId: "asset-hvac",
        taskId: null,
        title: "Spring HVAC tune-up",
        completedOn: "2026-04-12",
        costCents: 12900,
        vendor: "Comfort Air",
        notes: "Cleaned condenser and verified refrigerant.",
        outcome: "COMPLETED",
        createdAt: Date.now()
      },
      {
        id: "history-fridge",
        propertyId: "property-maple",
        assetId: "asset-fridge",
        taskId: null,
        title: "Replace water filter",
        completedOn: "2026-02-15",
        costCents: 4200,
        vendor: "DIY",
        notes: "Installed OEM filter.",
        outcome: "COMPLETED",
        createdAt: Date.now()
      }
    ];
  }

  log(type, message, payload = {}) {
    this.activity.unshift({ id: id("act"), type, message, payload, at: Date.now() });
    this.activity = this.activity.slice(0, 100);
  }

  property(propertyId) {
    const property = this.properties.find((item) => item.id === propertyId);
    assert(property, "property not found");
    return property;
  }

  asset(assetId) {
    const asset = this.assets.find((item) => item.id === assetId);
    assert(asset, "asset not found");
    return asset;
  }

  addAsset(input) {
    this.property(input.propertyId);
    assert(input.name?.trim(), "asset name is required");
    const asset = {
      id: id("asset"),
      propertyId: input.propertyId,
      roomId: input.roomId || null,
      name: input.name.trim(),
      category: input.category || "Other",
      installedOn: input.installedOn || null,
      warrantyEndsOn: input.warrantyEndsOn || null,
      model: input.model || "",
      serialNumber: input.serialNumber || "",
      documents: []
    };
    this.assets.push(asset);
    this.log("asset_added", `${asset.name} added`, { assetId: asset.id });
    return asset;
  }

  addDocument(assetId, input) {
    const asset = this.asset(assetId);
    assert(input.name?.trim(), "document name is required");
    const document = {
      id: id("doc"),
      name: input.name.trim(),
      type: input.type || "Document",
      expiresOn: input.expiresOn || null
    };
    asset.documents.push(document);
    this.log("document_added", `${document.name} added to ${asset.name}`, { assetId, documentId: document.id });
    return document;
  }

  createTask(input) {
    this.property(input.propertyId);
    assert(input.title?.trim(), "task title is required");
    const scheduleType = input.scheduleType || "date";
    assert(["date", "usage"].includes(scheduleType), "scheduleType must be date or usage");
    const task = {
      id: id("task"),
      propertyId: input.propertyId,
      assetId: input.assetId || null,
      roomId: input.roomId || null,
      title: input.title.trim(),
      category: input.category || "General",
      scheduleType,
      intervalDays: scheduleType === "date" ? integer(input.intervalDays, "intervalDays", 1) : null,
      nextDueDate: scheduleType === "date" ? input.nextDueDate : null,
      leadDays: scheduleType === "date" ? integer(input.leadDays ?? 7, "leadDays") : null,
      intervalUnits: scheduleType === "usage" ? integer(input.intervalUnits, "intervalUnits", 1) : null,
      currentUsage: scheduleType === "usage" ? integer(input.currentUsage || 0, "currentUsage") : null,
      nextDueUsage: scheduleType === "usage" ? integer(input.nextDueUsage, "nextDueUsage", 1) : null,
      usageUnit: scheduleType === "usage" ? input.usageUnit || "hours" : null,
      usageLead: scheduleType === "usage" ? integer(input.usageLead ?? 10, "usageLead") : null,
      estimatedCostCents: integer(input.estimatedCostCents || 0, "estimatedCostCents"),
      assignedTo: input.assignedTo || "Household",
      instructions: input.instructions || "",
      manualStatus: null
    };
    assert(scheduleType !== "date" || task.nextDueDate, "nextDueDate is required");
    this.tasks.push(task);
    this.log("task_created", `${task.title} scheduled`, { taskId: task.id });
    return this.taskView(task);
  }

  updateUsage(taskId, currentUsage) {
    const task = this.tasks.find((item) => item.id === taskId);
    assert(task, "task not found");
    assert(task.scheduleType === "usage", "task is not usage based");
    task.currentUsage = integer(currentUsage, "currentUsage");
    task.manualStatus = null;
    this.log("usage_updated", `${task.title} usage updated`, { taskId, currentUsage: task.currentUsage });
    return this.taskView(task);
  }

  completeTask(taskId, input = {}) {
    const task = this.tasks.find((item) => item.id === taskId);
    assert(task, "task not found");
    const completedOn = input.completedOn || dateOnly();
    const history = {
      id: id("history"),
      propertyId: task.propertyId,
      assetId: task.assetId,
      taskId: task.id,
      title: task.title,
      completedOn,
      costCents: integer(input.costCents ?? task.estimatedCostCents, "costCents"),
      vendor: input.vendor || task.assignedTo || "DIY",
      notes: input.notes || "",
      outcome: "COMPLETED",
      createdAt: Date.now()
    };
    this.serviceHistory.push(history);
    if (task.scheduleType === "date") {
      task.nextDueDate = nextRecurringDate(completedOn, task.intervalDays);
    } else {
      task.nextDueUsage = task.currentUsage + task.intervalUnits;
    }
    task.lastCompletedOn = completedOn;
    task.manualStatus = null;
    this.log("task_completed", `${task.title} completed`, { taskId, historyId: history.id });
    return { task: this.taskView(task), history };
  }

  skipTask(taskId, input = {}) {
    const task = this.tasks.find((item) => item.id === taskId);
    assert(task, "task not found");
    const skippedOn = input.skippedOn || dateOnly();
    this.serviceHistory.push({
      id: id("history"),
      propertyId: task.propertyId,
      assetId: task.assetId,
      taskId: task.id,
      title: task.title,
      completedOn: skippedOn,
      costCents: 0,
      vendor: "",
      notes: input.notes || "Skipped",
      outcome: "SKIPPED",
      createdAt: Date.now()
    });
    if (task.scheduleType === "date") task.nextDueDate = nextRecurringDate(skippedOn, task.intervalDays);
    else task.nextDueUsage += task.intervalUnits;
    task.manualStatus = "SKIPPED";
    this.log("task_skipped", `${task.title} skipped`, { taskId });
    return this.taskView(task);
  }

  runReminders(propertyId, asOf = dateOnly(), warrantyWindowDays = 30) {
    this.property(propertyId);
    const existing = new Set(this.reminders.filter((item) => item.status === "PENDING").map((item) => item.dedupeKey));
    const created = [];
    for (const task of this.tasks.filter((item) => item.propertyId === propertyId)) {
      const status = taskStatus(task, asOf);
      if (["DUE", "OVERDUE"].includes(status)) {
        const dedupeKey = `task:${task.id}:${task.scheduleType === "date" ? task.nextDueDate : task.nextDueUsage}`;
        if (!existing.has(dedupeKey)) {
          created.push(this.addReminder({
            propertyId,
            targetType: "TASK",
            targetId: task.id,
            title: `${status === "OVERDUE" ? "Overdue" : "Due"}: ${task.title}`,
            channel: "email",
            dueOn: task.nextDueDate,
            dedupeKey
          }));
          existing.add(dedupeKey);
        }
      }
    }
    for (const asset of this.assets.filter((item) => item.propertyId === propertyId)) {
      const warrantyDocumentExists = asset.documents.some(
        (document) => document.type === "Warranty" && document.expiresOn === asset.warrantyEndsOn
      );
      const expiring = [
        ...(asset.warrantyEndsOn && !warrantyDocumentExists
          ? [{ id: `warranty-${asset.id}`, name: `${asset.name} warranty`, expiresOn: asset.warrantyEndsOn }]
          : []),
        ...asset.documents.filter((document) => document.expiresOn)
      ];
      for (const document of expiring) {
        const remaining = daysBetween(asOf, document.expiresOn);
        if (remaining >= 0 && remaining <= warrantyWindowDays) {
          const dedupeKey = `document:${document.id}:${document.expiresOn}`;
          if (!existing.has(dedupeKey)) {
            created.push(this.addReminder({
              propertyId,
              targetType: "DOCUMENT",
              targetId: document.id,
              title: `${document.name} expires in ${remaining} day${remaining === 1 ? "" : "s"}`,
              channel: "email",
              dueOn: document.expiresOn,
              dedupeKey
            }));
            existing.add(dedupeKey);
          }
        }
      }
    }
    if (created.length) this.log("reminders_generated", `${created.length} reminder(s) generated`, { propertyId });
    return created;
  }

  addReminder(reminder) {
    const item = { id: id("rem"), status: "PENDING", createdAt: Date.now(), ...reminder };
    this.reminders.push(item);
    return item;
  }

  taskView(task, asOf = dateOnly()) {
    return {
      ...task,
      status: taskStatus(task, asOf),
      asset: task.assetId ? this.assets.find((asset) => asset.id === task.assetId) || null : null,
      room: task.roomId ? this.rooms.find((room) => room.id === task.roomId) || null : null
    };
  }

  assetHealth(assetId, asOf = dateOnly()) {
    const asset = this.asset(assetId);
    const tasks = this.tasks.filter((task) => task.assetId === assetId).map((task) => this.taskView(task, asOf));
    let score = 100;
    score -= tasks.filter((task) => task.status === "OVERDUE").length * 25;
    score -= tasks.filter((task) => task.status === "DUE").length * 10;
    if (asset.warrantyEndsOn && daysBetween(asOf, asset.warrantyEndsOn) < 0) score -= 5;
    return {
      score: Math.max(0, score),
      status: score >= 85 ? "GOOD" : score >= 65 ? "WATCH" : "NEEDS_ATTENTION",
      overdueTasks: tasks.filter((task) => task.status === "OVERDUE").length,
      dueTasks: tasks.filter((task) => task.status === "DUE").length
    };
  }

  calendar(propertyId, month) {
    this.property(propertyId);
    return this.tasks
      .filter((task) => task.propertyId === propertyId && task.scheduleType === "date" && task.nextDueDate.startsWith(month))
      .map((task) => this.taskView(task))
      .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));
  }

  yearlySpend(propertyId, year) {
    return this.serviceHistory
      .filter((entry) => entry.propertyId === propertyId && entry.completedOn.startsWith(String(year)))
      .reduce((sum, entry) => sum + entry.costCents, 0);
  }

  snapshot(propertyId = this.properties[0]?.id, asOf = dateOnly()) {
    const property = this.property(propertyId);
    const tasks = this.tasks.filter((task) => task.propertyId === propertyId).map((task) => this.taskView(task, asOf));
    const assets = this.assets
      .filter((asset) => asset.propertyId === propertyId)
      .map((asset) => ({ ...asset, health: this.assetHealth(asset.id, asOf) }));
    const statusCounts = tasks.reduce((result, task) => {
      result[task.status] = (result[task.status] || 0) + 1;
      return result;
    }, {});
    return {
      property,
      properties: this.properties,
      rooms: this.rooms.filter((room) => room.propertyId === propertyId),
      assets,
      tasks: tasks.sort((a, b) => {
        const rank = { OVERDUE: 0, DUE: 1, UPCOMING: 2, SKIPPED: 3 };
        return rank[a.status] - rank[b.status] || (a.nextDueDate || "").localeCompare(b.nextDueDate || "");
      }),
      calendar: this.calendar(propertyId, asOf.slice(0, 7)),
      serviceHistory: this.serviceHistory.filter((entry) => entry.propertyId === propertyId).sort((a, b) => b.completedOn.localeCompare(a.completedOn)),
      reminders: this.reminders.filter((item) => item.propertyId === propertyId).slice().reverse(),
      activity: this.activity.slice(0, 20),
      metrics: {
        statusCounts,
        assetCount: assets.length,
        averageHealth: assets.length ? Math.round(assets.reduce((sum, asset) => sum + asset.health.score, 0) / assets.length) : 100,
        yearlySpendCents: this.yearlySpend(propertyId, Number(asOf.slice(0, 4))),
        pendingReminderCount: this.reminders.filter((item) => item.propertyId === propertyId && item.status === "PENDING").length,
        expiringDocumentCount: assets.flatMap((asset) => asset.documents).filter((document) => document.expiresOn && daysBetween(asOf, document.expiresOn) >= 0 && daysBetween(asOf, document.expiresOn) <= 30).length
      }
    };
  }
}

export function createSeededStore() {
  const store = new MaintenanceStore();
  store.seed();
  return store;
}

export { addDays, dateOnly, daysBetween };
