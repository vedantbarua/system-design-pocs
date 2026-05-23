# Technical README

## Architecture

The POC is a single-process incident management system backed by SQLite.

- `IncidentManager` owns services, escalation policies, alerts, incidents, timelines, and action items.
- `ApiHandler` exposes a small JSON API and HTML dashboard through `http.server`.
- Alert ingestion either creates a new incident or deduplicates into an existing alert fingerprint.
- Incident transitions write timeline events so the response path is auditable.

## Data Model

### Services

Services define operational ownership.

- `service_name`
- `owner_team`
- `escalation_policy`
- `slo_minutes`
- `metadata_json`

The SLO window is used to flag open incidents that have exceeded the expected response or resolution window.

### Escalation Policies

Escalation policies define responder levels and escalation timing.

- `policy_id`
- `levels_json`
- `page_after_minutes`

The first level is paged when an incident is created. Unacknowledged incidents move to later levels when escalation checks run.

### Alerts

Alerts are deduplicated by fingerprint.

- `fingerprint`
- `service_name`
- `severity`
- `summary`
- `status`
- `occurrence_count`
- `first_seen`
- `last_seen`
- `incident_id`
- `labels_json`

Repeated alerts increment `occurrence_count` and update `last_seen` instead of creating duplicate incidents.

### Incidents

Incidents track the human response lifecycle.

- `incident_id`
- `fingerprint`
- `service_name`
- `severity`
- `summary`
- `status`
- `owner_team`
- `current_responder`
- `escalation_level`
- `acknowledged_at`
- `mitigated_at`
- `resolved_at`
- `breach_at`

### Timeline Events

Timeline events are append-only response history.

- `IncidentCreated`
- `ResponderPaged`
- `AlertDeduplicated`
- `Acknowledged`
- `Mitigated`
- `Resolved`
- `Escalated`
- `Note`
- `ActionItemCreated`
- `ActionItemCompleted`

### Action Items

Action items represent postmortem follow-up work.

- `description`
- `owner`
- `status`
- `created_at`
- `completed_at`

## Alert Flow

1. Validate service, severity, summary, and labels.
2. Compute or accept an alert fingerprint.
3. If an unresolved alert with the same fingerprint exists:
   - increment occurrence count
   - update `last_seen`
   - append a timeline deduplication event
4. If no unresolved alert exists:
   - create an incident
   - create an alert linked to that incident
   - page the primary responder
   - append timeline events

## Incident Lifecycle

Incidents move through:

```text
OPEN -> ACKNOWLEDGED -> MITIGATED -> RESOLVED
```

The POC permits direct transitions for demo simplicity, but every transition records timestamp fields and timeline events.

Resolving an incident also resolves linked alerts.

## Escalation Logic

Escalation checks scan open incidents only. Acknowledged, mitigated, and resolved incidents do not escalate.

For each open incident:

```text
due_at = created_at + page_after_minutes * 60 * next_level
```

When due, the incident moves to the next responder level and records an `Escalated` event.

## SLO Breach Logic

Each service defines `slo_minutes`. New incidents compute:

```text
breach_at = created_at + slo_minutes * 60
```

Snapshots mark an unresolved incident as breached when current time is greater than `breach_at`.

## Production Considerations

A production version would add:

- alert source authentication
- notification integrations
- schedule rotations and overrides
- incident commander assignment
- Slack or Teams incident channels
- alert suppression and maintenance windows
- postmortem templates and review workflow
- metrics for MTTA, MTTR, escalation rate, and noisy alerts
- durable event streaming for audit and analytics
