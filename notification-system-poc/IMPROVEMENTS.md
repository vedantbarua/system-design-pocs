# Improvements

## Production Gaps

- Move queues, templates, and delivery history into durable storage and a real broker.
- Add provider fallback routing, region awareness, and channel policy controls.
- Add user preferences, opt-out enforcement, and compliance-aware delivery rules.

## Reliability Improvements

- Add an outbox or delivery-confirmation flow so retries survive process crashes.
- Add dead-letter handling for permanently failed notifications.
- Add provider health scoring so unhealthy downstreams are avoided automatically.

## Scaling Improvements

- Partition queues by tenant or campaign to avoid global hotspots.
- Add worker pools and batch dispatch for high-volume channels.
- Add adaptive rate control based on provider error feedback and throughput.

## Security Improvements

- Add authentication and authorization for template management and dispatch controls.
- Encrypt sensitive template variables and redact message previews in the dashboard.
- Add request validation and rate limiting for notification creation endpoints.

## Testing Improvements

- Add unit tests for priority ordering, token-bucket behavior, and dedupe suppression.
- Add integration tests for retry flow, pause/resume, and rate-limit updates.
- Add simulation tests for burst traffic and provider degradation scenarios.
