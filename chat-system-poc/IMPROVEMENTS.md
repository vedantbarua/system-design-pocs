# Improvements and Next Steps: Chat System POC

## Core Behavior
- Add persistence (H2/Postgres) so rooms and messages survive restarts.
- Support editing/deleting messages and room topics.
- Add paging or time-based retention instead of a simple message cap.
- Enable room access rules (public/private, invite-only).

## Realtime & UX
- Switch to WebSockets/SSE for live updates without manual refresh.
- Typing indicators and presence (who is currently viewing a room).
- Markdown rendering with sanitization for messages.
- Toasts/inline errors instead of redirect query messages.

## API & Integrations
- Pagination and cursor params for `/api/rooms/{room}/messages`.
- Webhook or outbound event stream when new messages arrive.
- Search endpoint across messages per room.

## Reliability & Ops
- Dockerfile and CI workflow to build and run tests.
- Health check endpoint and basic metrics (message counts per room).
- Rate limiting or CAPTCHA on room/message creation to curb spam.

## Security
- AuthN/AuthZ for room membership and message posting.
- Content filtering or moderation hooks (bans, keyword blocks).
- Audit log for edits/deletes once supported.

## Testing
- Unit tests for `ChatRoomService` covering limits, ordering, and validation.
- MVC tests for page controllers (redirect flows, error handling).
- API contract tests for JSON endpoints and validation failures.
