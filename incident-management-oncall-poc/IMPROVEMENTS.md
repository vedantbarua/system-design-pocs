# Improvements

## Alert Intake

- Add source-specific webhook adapters for metrics, logs, traces, and synthetic checks.
- Add alert authentication and source signing.
- Add maintenance windows and alert suppression.
- Add grouping rules beyond exact fingerprints.
- Add noisy-alert detection and automatic action item generation.

## On-Call

- Add rotating schedules with time zones and overrides.
- Add escalation handoff acknowledgements.
- Add notification channels for phone, SMS, email, Slack, and Teams.
- Add fallback routing when a responder is out of office.
- Add team-specific escalation delays by severity.

## Incident Response

- Add incident roles such as commander, scribe, and communications lead.
- Add status pages and customer-impact updates.
- Add linked runbooks and service dependency graphs.
- Add impact assessment and affected regions.
- Add live incident rooms with timeline synchronization.

## Postmortems

- Add postmortem document templates.
- Add contributing-factor classification.
- Add action item due dates and reminders.
- Add review and approval workflow.
- Add recurring-incident detection.

## Metrics

- Track mean time to acknowledge.
- Track mean time to mitigate.
- Track mean time to resolve.
- Track escalation rate by service and team.
- Track action item completion rate.

## Distributed Systems

- Add queue-backed alert ingestion.
- Add idempotency keys for webhook retries.
- Add event-sourced timeline storage.
- Add multi-region incident replication.
- Add read-model projections for dashboards and analytics.
