# Project Status

## Overview
Freebox Heartbeat Monitor is a Node.js script that authenticates against the Freebox local API, polls connection status, and forwards the data to a remote monitoring endpoint at a configurable interval. The runtime configuration (VPS URL, shared secret, Freebox API base URL, and polling interval) is pulled from environment variables with sensible defaults. The monitoring loop runs immediately on startup, then continues on a timer until shutdown signals trigger a logout.

## Freebox API Usage
- Authentication uses the documented challenge flow: the monitor fetches `/login/` to retrieve the challenge, builds the HMAC-SHA1 password with the stored `app_token`, and posts to `/login/session/` with the configured `app_id` to obtain a `session_token`. The same token is reused across iterations until an auth-related error occurs.
- Connection details are read from `/connection/` using the `X-Fbx-App-Auth` header. The response feeds the heartbeat payload fields (IP, connection state, media, and bandwidth figures) before sending to the VPS endpoint.
- Logout posts to `/login/logout/` with the active session token during graceful shutdown; failures are logged but ignored to avoid blocking exit.
- The `authorize.js` script covers initial pairing via `/login/authorize/` and tracks validation until it receives an `app_token`, saving it to `token.json` with restrictive permissions.

## Current Observations
- The core monitor duplicates utility logic (token reading, Freebox login/logout, connection fetch, heartbeat retry logic) already present in `lib/freebox-api.js`, `lib/heartbeat.js`, and `lib/utils.js`, so the shared modules are unused in production. This increases maintenance overhead and makes test coverage less representative of the executed code.
- The monitoring loop keeps a session token indefinitely and only forces re-authentication when certain substrings appear in error messages. If the Freebox expires sessions silently, heartbeats could fail repeatedly before recovery.
- Configuration validation is minimal; missing required environment variables will fall back to placeholder defaults, which could cause the service to silently report to the wrong endpoint or with an incorrect secret.
- Logging and retry behavior are inlined in `monitor.js`, while the test suite focuses on the modular implementations. This gap makes it harder to evolve error handling consistently across the codebase.

## Recommendations
- Refactor `monitor.js` to reuse the exported helpers (`readAppToken`, `loginToFreebox`, `getConnectionInfo`, `logoutFromFreebox`, `sendHeartbeat`, and config utilities) from the `lib` modules. This will align runtime behavior with the tested code and remove duplication.
- Refresh the session token proactively (e.g., at a fixed cadence or when `getConnectionInfo` returns specific errors) instead of only on string-matched failures, reducing the risk of extended downtime after a token expiry.
- Enforce configuration validation on startup using the existing `validateConfig` helper, and fail fast when required fields are missing or still set to defaults. Emit clear log messages so operators can correct `.env` values quickly.
- Expand coverage to the actual monitoring loop, including interval scheduling, payload generation, and shutdown/logout behavior. Consider extracting the loop control into a testable module.
- Normalize logging via the shared `log` utility and ensure retries and backoff settings are centralized so changes apply uniformly to the monitor and any future components.
