import crypto from "node:crypto";

export type DeviceType = "thermostat" | "valve" | "garage" | "light" | "outlet" | "notification";
export type DeviceStatus = "ONLINE" | "OFFLINE";
export type RuleStatus = "ENABLED" | "DISABLED";
export type CommandStatus = "QUEUED" | "SENT" | "RETRY" | "ACKED" | "DEAD" | "SUPPRESSED";
export type EventSource = "seed" | "api" | "kafka" | "replay";

export type Device = {
  id: string;
  label: string;
  room: string;
  type: DeviceType;
  status: DeviceStatus;
  state: Record<string, string | number | boolean>;
  lastSeenAt: string;
};

export type HomeEvent = {
  id: string;
  eventId: string;
  eventKey: string;
  type: string;
  deviceId: string | null;
  value: string | number | boolean;
  at: string;
  receivedAt: string;
  source: EventSource;
};

export type Condition = {
  field: "event.type" | "event.value" | "device.type" | "home.mode" | "time.hour" | "device.state.cooling" | "device.state.open";
  op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "between";
  value: string | number | boolean | [number, number];
};

export type RuleAction = {
  deviceId: string;
  command: string;
  payload: Record<string, string | number | boolean>;
};

export type Rule = {
  id: string;
  name: string;
  description: string;
  status: RuleStatus;
  conditions: Condition[];
  action: RuleAction;
  cooldownSeconds: number;
  lastTriggeredAt: string | null;
  fireCount: number;
  safetyLevel: "routine" | "guarded" | "critical";
};

export type DeviceCommand = {
  id: string;
  dedupeKey: string;
  ruleId: string;
  sourceEventId: string;
  deviceId: string;
  command: string;
  payload: Record<string, string | number | boolean>;
  status: CommandStatus;
  attempts: number;
  maxAttempts: number;
  queuedAt: string;
  sentAt: string | null;
  ackedAt: string | null;
  lastError: string | null;
};

export type AuditEvent = {
  id: string;
  action: string;
  actor: string;
  details: Record<string, unknown>;
  at: string;
};

export type IngestEventInput = {
  eventId?: string;
  type: string;
  deviceId?: string | null;
  value: string | number | boolean;
  at?: string;
  source?: EventSource;
};

export function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function id(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function iso(value: string | number | Date = new Date()): string {
  const parsed = new Date(value);
  assertCondition(!Number.isNaN(parsed.getTime()), "invalid timestamp");
  return parsed.toISOString();
}

export function eventKey(input: IngestEventInput): string {
  return input.eventId ? `${input.type}:${input.eventId}` : `${input.type}:${iso(input.at || new Date())}:${input.value}`;
}

function hourOfDay(value: string): number {
  return new Date(iso(value)).getUTCHours();
}

function compare(left: string | number | boolean, op: Condition["op"], right: Condition["value"]): boolean {
  if (op === "between") {
    assertCondition(Array.isArray(right), "between condition requires tuple value");
    return Number(left) >= right[0] && Number(left) <= right[1];
  }
  if (op === "eq") return left === right;
  if (op === "neq") return left !== right;
  if (op === "gt") return Number(left) > Number(right);
  if (op === "gte") return Number(left) >= Number(right);
  if (op === "lt") return Number(left) < Number(right);
  if (op === "lte") return Number(left) <= Number(right);
  return false;
}

export class SmartHomeAutomation {
  devices: Device[] = [];
  rules: Rule[] = [];
  events: HomeEvent[] = [];
  commands: DeviceCommand[] = [];
  audit: AuditEvent[] = [];
  processedEvents = new Set<string>();
  failNextCommand = false;
  homeMode: "home" | "away" | "night" = "home";
  manualOverrideUntil: string | null = null;

  seed(): void {
    const now = "2026-06-16T14:00:00.000Z";
    this.homeMode = "away";
    this.manualOverrideUntil = null;
    this.devices = [
      { id: "device-thermostat", label: "Hallway thermostat", room: "Hallway", type: "thermostat", status: "ONLINE", state: { temperature: 72, cooling: true, setpoint: 72 }, lastSeenAt: now },
      { id: "device-water-valve", label: "Main water valve", room: "Utility room", type: "valve", status: "ONLINE", state: { open: true }, lastSeenAt: now },
      { id: "device-garage-door", label: "Garage door", room: "Garage", type: "garage", status: "ONLINE", state: { open: false }, lastSeenAt: now },
      { id: "device-living-lights", label: "Living room lights", room: "Living room", type: "light", status: "ONLINE", state: { on: false }, lastSeenAt: now },
      { id: "device-office-outlet", label: "Office smart outlet", room: "Office", type: "outlet", status: "ONLINE", state: { on: true, watts: 420 }, lastSeenAt: now },
      { id: "device-household-alerts", label: "Household alert channel", room: "Cloud", type: "notification", status: "ONLINE", state: { enabled: true }, lastSeenAt: now }
    ];
    this.rules = [
      {
        id: "rule-energy-spike",
        name: "Cut nonessential outlet on energy spike",
        description: "Turns off the office outlet when whole-home usage spikes after 6 PM.",
        status: "ENABLED",
        conditions: [
          { field: "event.type", op: "eq", value: "energy.spike" },
          { field: "event.value", op: "gte", value: 3 },
          { field: "time.hour", op: "between", value: [18, 23] }
        ],
        action: { deviceId: "device-office-outlet", command: "turn_off", payload: { on: false } },
        cooldownSeconds: 900,
        lastTriggeredAt: null,
        fireCount: 0,
        safetyLevel: "routine"
      },
      {
        id: "rule-water-leak",
        name: "Close valve on leak alert",
        description: "Closes the main water valve when a critical leak signal arrives.",
        status: "ENABLED",
        conditions: [
          { field: "event.type", op: "eq", value: "water.leak" },
          { field: "event.value", op: "eq", value: "critical" }
        ],
        action: { deviceId: "device-water-valve", command: "close", payload: { open: false } },
        cooldownSeconds: 60,
        lastTriggeredAt: null,
        fireCount: 0,
        safetyLevel: "critical"
      },
      {
        id: "rule-away-cooling",
        name: "Raise thermostat while away",
        description: "Raises the cooling setpoint when nobody is home and AC is running.",
        status: "ENABLED",
        conditions: [
          { field: "event.type", op: "eq", value: "presence.empty" },
          { field: "home.mode", op: "eq", value: "away" },
          { field: "device.state.cooling", op: "eq", value: true }
        ],
        action: { deviceId: "device-thermostat", command: "set_temperature", payload: { setpoint: 78 } },
        cooldownSeconds: 1800,
        lastTriggeredAt: null,
        fireCount: 0,
        safetyLevel: "guarded"
      },
      {
        id: "rule-garage-night",
        name: "Notify when garage is open late",
        description: "Sends a household notification if the garage opens after 10 PM.",
        status: "ENABLED",
        conditions: [
          { field: "event.type", op: "eq", value: "garage.opened" },
          { field: "time.hour", op: "between", value: [22, 23] }
        ],
        action: { deviceId: "device-household-alerts", command: "send_alert", payload: { channel: "push", severity: "warning" } },
        cooldownSeconds: 600,
        lastTriggeredAt: null,
        fireCount: 0,
        safetyLevel: "guarded"
      }
    ];
    this.events = [];
    this.commands = [];
    this.audit = [];
    this.processedEvents = new Set();
    this.createAudit("DEMO_SEEDED", "system", { devices: this.devices.length, rules: this.rules.length });
  }

  device(deviceId: string): Device {
    const device = this.devices.find((item) => item.id === deviceId);
    assertCondition(device, "device not found");
    return device;
  }

  rule(ruleId: string): Rule {
    const rule = this.rules.find((item) => item.id === ruleId);
    assertCondition(rule, "rule not found");
    return rule;
  }

  createAudit(action: string, actor: string, details: Record<string, unknown>): AuditEvent {
    const event = { id: id("audit"), action, actor, details, at: iso() };
    this.audit.unshift(event);
    return event;
  }

  setHomeMode(mode: SmartHomeAutomation["homeMode"], actor = "user"): void {
    this.homeMode = mode;
    this.createAudit("HOME_MODE_CHANGED", actor, { mode });
  }

  setManualOverride(minutes: number, actor = "user"): void {
    this.manualOverrideUntil = minutes > 0 ? iso(Date.now() + minutes * 60_000) : null;
    this.createAudit(minutes > 0 ? "MANUAL_OVERRIDE_ENABLED" : "MANUAL_OVERRIDE_CLEARED", actor, { until: this.manualOverrideUntil });
  }

  toggleRule(ruleId: string, enabled: boolean, actor = "user"): Rule {
    const rule = this.rule(ruleId);
    rule.status = enabled ? "ENABLED" : "DISABLED";
    this.createAudit("RULE_TOGGLED", actor, { ruleId, enabled });
    return rule;
  }

  ingestEvent(input: IngestEventInput): { duplicate: boolean; event?: HomeEvent; triggered: number; suppressed: number } {
    assertCondition(input.type, "event type is required");
    assertCondition(input.value !== undefined, "event value is required");
    const key = eventKey(input);
    if (this.processedEvents.has(key)) return { duplicate: true, triggered: 0, suppressed: 0 };
    const at = iso(input.at || new Date());
    const event: HomeEvent = {
      id: id("event"),
      eventId: input.eventId || key,
      eventKey: key,
      type: input.type,
      deviceId: input.deviceId || null,
      value: input.value,
      at,
      receivedAt: iso(),
      source: input.source || "api"
    };
    this.events.push(event);
    this.processedEvents.add(key);
    this.applyEventState(event);
    const result = this.evaluateRules(event);
    this.createAudit("EVENT_INGESTED", "event-ingest", { type: event.type, eventId: event.eventId, triggered: result.triggered, suppressed: result.suppressed });
    return { duplicate: false, event, ...result };
  }

  applyEventState(event: HomeEvent): void {
    if (event.type === "presence.empty") this.homeMode = "away";
    if (event.type === "presence.home") this.homeMode = "home";
    if (event.deviceId) {
      const device = this.devices.find((item) => item.id === event.deviceId);
      if (device) {
        device.lastSeenAt = event.at;
        if (event.type === "garage.opened") device.state.open = true;
        if (event.type === "garage.closed") device.state.open = false;
        if (event.type === "energy.spike" && device.type === "outlet") device.state.watts = Number(event.value) * 100;
      }
    }
  }

  evaluateRules(event: HomeEvent): { triggered: number; suppressed: number } {
    let triggered = 0;
    let suppressed = 0;
    for (const rule of this.rules) {
      if (rule.status !== "ENABLED") continue;
      if (!this.matchesRule(rule, event)) continue;
      const command = this.enqueueCommand(rule, event);
      if (command.status === "SUPPRESSED") suppressed += 1;
      else triggered += 1;
    }
    return { triggered, suppressed };
  }

  matchesRule(rule: Rule, event: HomeEvent): boolean {
    return rule.conditions.every((condition) => {
      const value = this.conditionValue(condition.field, event, rule);
      return compare(value, condition.op, condition.value);
    });
  }

  conditionValue(field: Condition["field"], event: HomeEvent, rule: Rule): string | number | boolean {
    if (field === "event.type") return event.type;
    if (field === "event.value") return event.value;
    if (field === "home.mode") return this.homeMode;
    if (field === "time.hour") return hourOfDay(event.at);
    const target = this.device(rule.action.deviceId);
    if (field === "device.type") return target.type;
    if (field === "device.state.cooling") return Boolean(target.state.cooling);
    if (field === "device.state.open") return Boolean(target.state.open);
    return "";
  }

  enqueueCommand(rule: Rule, event: HomeEvent): DeviceCommand {
    const now = iso();
    const manualOverrideActive = this.manualOverrideUntil ? this.manualOverrideUntil > now : false;
    const cooledDown = !rule.lastTriggeredAt || (new Date(event.at).getTime() - new Date(rule.lastTriggeredAt).getTime()) / 1000 >= rule.cooldownSeconds;
    const dedupeKey = `${rule.id}:${event.eventId}:${rule.action.deviceId}:${rule.action.command}`;
    const existing = this.commands.find((command) => command.dedupeKey === dedupeKey);
    if (existing) return existing;
    if (!cooledDown || (manualOverrideActive && rule.safetyLevel !== "critical")) {
      const command = this.createCommand(rule, event, dedupeKey, "SUPPRESSED");
      this.createAudit("COMMAND_SUPPRESSED", "rule-engine", { ruleId: rule.id, reason: !cooledDown ? "cooldown" : "manual_override" });
      return command;
    }
    const command = this.createCommand(rule, event, dedupeKey, "QUEUED");
    rule.lastTriggeredAt = event.at;
    rule.fireCount += 1;
    this.createAudit("RULE_TRIGGERED", "rule-engine", { ruleId: rule.id, commandId: command.id, eventId: event.eventId });
    return command;
  }

  createCommand(rule: Rule, event: HomeEvent, dedupeKey: string, status: CommandStatus): DeviceCommand {
    const command: DeviceCommand = {
      id: id("command"),
      dedupeKey,
      ruleId: rule.id,
      sourceEventId: event.eventId,
      deviceId: rule.action.deviceId,
      command: rule.action.command,
      payload: structuredClone(rule.action.payload),
      status,
      attempts: 0,
      maxAttempts: 3,
      queuedAt: iso(),
      sentAt: null,
      ackedAt: null,
      lastError: null
    };
    this.commands.unshift(command);
    return command;
  }

  dispatchNextCommand(): { processed: boolean; command?: DeviceCommand } {
    const command = this.commands.find((item) => item.status === "QUEUED" || item.status === "RETRY");
    if (!command) return { processed: false };
    command.attempts += 1;
    command.sentAt = iso();
    if (this.failNextCommand) {
      this.failNextCommand = false;
      command.lastError = "simulated device timeout";
      command.status = command.attempts >= command.maxAttempts ? "DEAD" : "RETRY";
      this.createAudit("COMMAND_RETRY", "worker:commands", { commandId: command.id, attempts: command.attempts });
      return { processed: true, command };
    }
    command.status = "SENT";
    command.lastError = null;
    this.createAudit("COMMAND_SENT", "worker:commands", { commandId: command.id, deviceId: command.deviceId });
    return { processed: true, command };
  }

  acknowledgeCommand(commandId: string, actor = "device-gateway"): DeviceCommand {
    const command = this.commands.find((item) => item.id === commandId);
    assertCondition(command, "command not found");
    if (command.status === "ACKED") return command;
    command.status = "ACKED";
    command.ackedAt = iso();
    const device = this.device(command.deviceId);
    device.state = { ...device.state, ...command.payload };
    device.lastSeenAt = command.ackedAt;
    this.createAudit("COMMAND_ACKED", actor, { commandId: command.id, deviceId: command.deviceId });
    return command;
  }

  drainCommands(max = 50): { processed: number; acked: number } {
    let processed = 0;
    let acked = 0;
    while (processed < max) {
      const result = this.dispatchNextCommand();
      if (!result.processed || !result.command) break;
      processed += 1;
      if (result.command.status === "SENT") {
        this.acknowledgeCommand(result.command.id);
        acked += 1;
      }
    }
    return { processed, acked };
  }

  replayEvents(from: string, to: string): { replayed: number; commandsBefore: number; commandsAfter: number } {
    const events = this.events.filter((event) => event.at >= iso(from) && event.at <= iso(to)).sort((a, b) => a.at.localeCompare(b.at));
    const commandsBefore = this.commands.length;
    for (const event of events) this.evaluateRules({ ...event, source: "replay" });
    this.createAudit("EVENTS_REPLAYED", "worker:replay", { from: iso(from), to: iso(to), events: events.length });
    return { replayed: events.length, commandsBefore, commandsAfter: this.commands.length };
  }

  snapshot(): Record<string, unknown> {
    return {
      homeMode: this.homeMode,
      manualOverrideUntil: this.manualOverrideUntil,
      devices: this.devices,
      rules: this.rules,
      events: this.events.slice(-80).reverse(),
      commands: this.commands,
      audit: this.audit,
      metrics: {
        devices: this.devices.length,
        onlineDevices: this.devices.filter((device) => device.status === "ONLINE").length,
        enabledRules: this.rules.filter((rule) => rule.status === "ENABLED").length,
        events: this.events.length,
        queuedCommands: this.commands.filter((command) => command.status === "QUEUED" || command.status === "RETRY").length,
        ackedCommands: this.commands.filter((command) => command.status === "ACKED").length,
        suppressedCommands: this.commands.filter((command) => command.status === "SUPPRESSED").length,
        deadCommands: this.commands.filter((command) => command.status === "DEAD").length
      }
    };
  }

  exportState(): Record<string, unknown> {
    return {
      devices: this.devices,
      rules: this.rules,
      events: this.events,
      commands: this.commands,
      audit: this.audit,
      processedEvents: [...this.processedEvents],
      failNextCommand: this.failNextCommand,
      homeMode: this.homeMode,
      manualOverrideUntil: this.manualOverrideUntil
    };
  }

  importState(state: Record<string, unknown>): void {
    this.devices = state.devices as Device[];
    this.rules = state.rules as Rule[];
    this.events = state.events as HomeEvent[];
    this.commands = state.commands as DeviceCommand[];
    this.audit = state.audit as AuditEvent[];
    this.processedEvents = new Set(state.processedEvents as string[]);
    this.failNextCommand = Boolean(state.failNextCommand);
    this.homeMode = state.homeMode as SmartHomeAutomation["homeMode"];
    this.manualOverrideUntil = state.manualOverrideUntil as string | null;
  }
}

export function createSeededAutomation(): SmartHomeAutomation {
  const automation = new SmartHomeAutomation();
  automation.seed();
  return automation;
}
