---
name: validate-ui
description: Smoke test the Agent Manager UI at localhost:3002 using browser automation. Verifies page loads, key elements render, and no console errors. Use after UI changes or to verify the frontend is working. Pass 'headed' argument to run with visible browser.
---

# Validate UI

## Arguments

- `headed` (optional) — Run with visible browser instead of headless

## Instructions

1. **Pre-check:** Run `curl -sf http://localhost:3002 > /dev/null` to verify the UI server is reachable. If not, tell the user the UI is not running and suggest `/health-check`.

2. **Open the page:** Navigate to `http://localhost:3002` using agent-browser. If the `headed` argument was passed, run in headed/visible mode.

3. **Check page load:** Verify the page title or header contains "Agent Manager". If the page is blank or returns an error, report failure and check `docker compose logs agent-manager-ui --tail=20`.

4. **Check console errors:** Read browser console messages. Flag any JavaScript errors or Vue warnings. Ignore routine network errors if the backend is known to be down.

5. **Verify key UI elements exist on the page:**
   - Connection status indicator (green or red dot — element with classes `w-2 h-2 rounded-full`)
   - Time range selector (`<select>` with options "Last 1h", "Last 4h", "Last 12h", "Last 24h")
   - "Agents" sidebar heading (text "Agents" in the aside)
   - "Timeline" section heading (text "Timeline")

6. **If sessions exist:** Verify at least one agent card renders with:
   - Session ID (short 8-char hash in `font-mono` text)
   - Status indicator (colored dot: green=active, yellow=idle, gray=ended)
   - If no sessions visible: that is fine, just note "no active sessions"

7. **Take a screenshot** and show it to the user as proof of the UI state.

8. **Report results:**
   - Pass/fail for each check (page load, console errors, UI elements, agent cards)
   - Screenshot
   - If failures: diagnose — is it a build issue? JS error? Backend down?
   - If the page does not load at all: suggest running `/health-check`
