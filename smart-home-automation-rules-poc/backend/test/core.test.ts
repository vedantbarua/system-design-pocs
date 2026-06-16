import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSeededAutomation, eventKey } from "../src/core.js";

describe("SmartHomeAutomation", () => {
  it("seeds devices and automation rules", () => {
    const automation = createSeededAutomation();
    assert.equal(automation.devices.length, 6);
    assert.equal(automation.rules.length, 4);
    const snapshot = automation.snapshot() as { metrics: { enabledRules: number } };
    assert.equal(snapshot.metrics.enabledRules, 4);
  });

  it("uses event type and event id as the stable idempotency key", () => {
    assert.equal(eventKey({ type: "water.leak", eventId: "abc", value: "critical" }), "water.leak:abc");
  });

  it("deduplicates replayed home events", () => {
    const automation = createSeededAutomation();
    const first = automation.ingestEvent({ eventId: "leak-1", type: "water.leak", value: "critical", at: "2026-06-16T14:05:00Z" });
    const second = automation.ingestEvent({ eventId: "leak-1", type: "water.leak", value: "critical", at: "2026-06-16T14:05:00Z" });
    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, true);
    assert.equal(automation.events.length, 1);
  });

  it("triggers a critical water valve command", () => {
    const automation = createSeededAutomation();
    const result = automation.ingestEvent({ eventId: "leak-2", type: "water.leak", value: "critical", at: "2026-06-16T14:05:00Z" });
    assert.equal(result.triggered, 1);
    assert.equal(automation.commands[0].deviceId, "device-water-valve");
    assert.equal(automation.commands[0].command, "close");
  });

  it("dispatches and acknowledges a command into device state", () => {
    const automation = createSeededAutomation();
    automation.ingestEvent({ eventId: "leak-3", type: "water.leak", value: "critical", at: "2026-06-16T14:05:00Z" });
    const dispatch = automation.dispatchNextCommand();
    assert.equal(dispatch.command?.status, "SENT");
    automation.acknowledgeCommand(dispatch.command!.id);
    assert.equal(automation.commands[0].status, "ACKED");
    assert.equal(automation.device("device-water-valve").state.open, false);
  });

  it("retries device command failures", () => {
    const automation = createSeededAutomation();
    automation.ingestEvent({ eventId: "leak-4", type: "water.leak", value: "critical", at: "2026-06-16T14:05:00Z" });
    automation.failNextCommand = true;
    const failed = automation.dispatchNextCommand();
    assert.equal(failed.command?.status, "RETRY");
    const recovered = automation.dispatchNextCommand();
    assert.equal(recovered.command?.status, "SENT");
  });

  it("drains queued commands and acks successful sends", () => {
    const automation = createSeededAutomation();
    automation.ingestEvent({ eventId: "leak-5", type: "water.leak", value: "critical", at: "2026-06-16T14:05:00Z" });
    const result = automation.drainCommands();
    assert.equal(result.processed, 1);
    assert.equal(result.acked, 1);
    assert.equal(automation.commands[0].status, "ACKED");
  });

  it("applies cooldown suppression", () => {
    const automation = createSeededAutomation();
    automation.ingestEvent({ eventId: "spike-1", type: "energy.spike", value: 4, at: "2026-06-16T19:00:00Z" });
    const second = automation.ingestEvent({ eventId: "spike-2", type: "energy.spike", value: 5, at: "2026-06-16T19:05:00Z" });
    assert.equal(second.suppressed, 1);
    assert.equal(automation.commands[0].status, "SUPPRESSED");
  });

  it("lets critical safety commands bypass manual override", () => {
    const automation = createSeededAutomation();
    automation.setManualOverride(30);
    const routine = automation.ingestEvent({ eventId: "spike-3", type: "energy.spike", value: 4, at: "2026-06-16T19:00:00Z" });
    const critical = automation.ingestEvent({ eventId: "leak-6", type: "water.leak", value: "critical", at: "2026-06-16T19:01:00Z" });
    assert.equal(routine.suppressed, 1);
    assert.equal(critical.triggered, 1);
  });

  it("toggles rules off", () => {
    const automation = createSeededAutomation();
    automation.toggleRule("rule-water-leak", false);
    const result = automation.ingestEvent({ eventId: "leak-7", type: "water.leak", value: "critical", at: "2026-06-16T14:05:00Z" });
    assert.equal(result.triggered, 0);
  });

  it("updates home mode from presence events", () => {
    const automation = createSeededAutomation();
    automation.ingestEvent({ eventId: "presence-1", type: "presence.home", value: true, at: "2026-06-16T14:05:00Z" });
    assert.equal(automation.homeMode, "home");
  });

  it("fires away cooling thermostat rule", () => {
    const automation = createSeededAutomation();
    const result = automation.ingestEvent({ eventId: "presence-2", type: "presence.empty", value: true, at: "2026-06-16T14:05:00Z" });
    assert.equal(result.triggered, 1);
    assert.equal(automation.commands[0].deviceId, "device-thermostat");
  });

  it("replays events without duplicating command dedupe keys", () => {
    const automation = createSeededAutomation();
    automation.ingestEvent({ eventId: "leak-8", type: "water.leak", value: "critical", at: "2026-06-16T14:05:00Z" });
    const result = automation.replayEvents("2026-06-16T14:00:00Z", "2026-06-16T14:10:00Z");
    assert.equal(result.replayed, 1);
    assert.equal(result.commandsBefore, result.commandsAfter);
  });

  it("exports and imports state", () => {
    const automation = createSeededAutomation();
    automation.ingestEvent({ eventId: "leak-9", type: "water.leak", value: "critical", at: "2026-06-16T14:05:00Z" });
    const restored = createSeededAutomation();
    restored.importState(automation.exportState());
    assert.equal(restored.events.length, 1);
    assert.equal(restored.commands.length, 1);
    assert.equal(restored.processedEvents.has("water.leak:leak-9"), true);
  });
});
