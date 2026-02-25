---
name: validate-api
description: Validate the Agent Manager REST API endpoints return correct responses. Checks health, sessions, and events endpoints. Use after backend changes or to verify the API is working.
---

# Validate API

## Instructions

1. **Health endpoint:**
   ```bash
   curl -sf http://localhost:3001/api/health
   ```
   Expected: `{"status":"ok"}` with HTTP 200.
   If unreachable: stop early, report server is down, suggest `/health-check`.

2. **Sessions endpoint:**
   ```bash
   curl -sf 'http://localhost:3001/api/sessions?hours=4'
   ```
   Expected: JSON array. Each session object should have at minimum: `id` (string), `status` (one of "active", "idle", "ended"), `first_seen` (ISO timestamp), `last_seen` (ISO timestamp).
   An empty array `[]` is valid (no recent sessions).

3. **Events endpoint:**
   ```bash
   curl -sf 'http://localhost:3001/api/events?limit=10'
   ```
   Expected: JSON array. Each event should have: `id` (number), `session_id` (string), `event_type` (string), `created_at` (ISO timestamp).
   An empty array `[]` is valid.

4. **Session events endpoint (if sessions exist):**
   Pick the first session ID from step 2 and fetch its events:
   ```bash
   curl -sf 'http://localhost:3001/api/sessions/<id>/events?limit=10'
   ```
   Expected: JSON array of events belonging to that session.

5. **Report results:**
   - For each endpoint: pass/fail, HTTP status, response time (note if slow > 1s)
   - If failed: show the actual response or error
   - Summary: N/4 endpoints passing (or N/3 if no sessions exist to test step 4)
   - If any endpoint unreachable: suggest `/health-check`
