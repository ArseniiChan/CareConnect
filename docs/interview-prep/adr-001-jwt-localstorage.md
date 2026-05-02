# ADR-001: JWT Storage Strategy — localStorage over httpOnly Cookies

| | |
|---|---|
| **Status** | Accepted |
| **Date** | May 2 2026 |
| **Author** | Arsenii Chan |
| **Reviewers** | — (solo decision; documented for team and portfolio) |

## Context

CareConnect uses JWT-based authentication. Each successful login or registration returns:

- An **access token** (15-minute expiry, 60-minute override for the demo). Used as `Authorization: Bearer <jwt>` on every API request.
- A **refresh token** (7-day expiry). Posted to `/api/v1/auth/refresh` to mint a new access token.

The frontend (Vite + React 19, deployed to Vercel) needs to:

1. Persist tokens after login so the user does not re-authenticate on every page reload.
2. Attach the access token to every fetch call to the API (Express on Railway).
3. Pass the access token to the Socket.io connection's `auth.token` field for the chat handshake.

The decision: **where do these tokens live in the browser?**

The two standard options are:

- **A. Browser `localStorage`** — JS-readable, persists across sessions, simple to implement.
- **B. httpOnly cookies** — JS cannot read them, automatically sent on same-origin requests, immune to XSS exfiltration.

A modern hybrid (in-memory access token + httpOnly refresh cookie) is the production best practice but materially more complex to ship.

## Decision

**Store both the access token and the refresh token in `localStorage`.**

```js
// On login (frontend/src/auth/AuthContext.jsx)
const { accessToken, refreshToken, user } = await auth.login(email, password);
localStorage.setItem('token', accessToken);
localStorage.setItem('refresh', refreshToken);
localStorage.setItem('user', JSON.stringify(user));

// On every API call (frontend/src/api/client.js)
headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }

// On Socket.io connection
io(API_URL, { auth: { token: localStorage.getItem('token') } });
```

## Consequences

### Positive

1. **Zero CORS friction.** Cookie-based auth across the Vercel↔Railway boundary requires `credentials: 'include'` on the client, `Access-Control-Allow-Credentials: true` on the server, removal of wildcard origins, and `SameSite=None; Secure` on the cookie. Bearer tokens from `localStorage` work over plain CORS without any of that.
2. **Socket.io compatibility.** The Socket.io handshake reads from `socket.handshake.auth.token`, which we populate from `localStorage`. Cookies cannot be passed into the handshake from JS.
3. **Stateless backend.** No `cookie-parser` middleware, no session store, no opaque cookie-set side effects. The backend's auth middleware (`src/middleware/auth.js`) only inspects the `Authorization` header.
4. **Explicit refresh-token rotation.** The frontend posts the refresh token to `/auth/refresh` and receives a new pair. The flow is visible in code, easy to demo, and easy to debug.
5. **Demo-day reliability.** Fewer moving pieces means fewer failure modes on stage. Cookie-based auth has more "works on my machine, fails on Vercel preview" gotchas.

### Negative

1. **XSS exposure.** A successful XSS injection on the frontend can read both tokens from `localStorage` and exfiltrate them. httpOnly cookies prevent this entirely.
2. **No automatic logout on tab/browser close.** Tokens persist until they expire or the user explicitly logs out.

### Mitigations

1. **Stored-XSS sanitization at the API boundary.** All string fields in incoming request bodies are HTML-encoded by `src/utils/sanitize.js` before they hit the database. This neutralizes the primary attack vector that would put hostile script into the rendered DOM.
2. **Helmet.js Content Security Policy.** Restricts script sources, inline event handlers, and `eval`. Reduces the surface for reflected XSS.
3. **Short access-token lifetime.** Default 15 minutes. Demo override is 60 minutes. Compromise window is bounded.
4. **No token logging.** Backend logs (morgan + custom error handler) do not include `Authorization` header values.
5. **React 19 rendering safety.** JSX escapes by default; only `dangerouslySetInnerHTML` would expose raw markup, and we don't use it anywhere.

## Alternatives Considered

### Alternative A — httpOnly cookies for both tokens

**Rejected for v1.** Required changes to ship this:

- Backend: install `cookie-parser`, replace `res.json({ accessToken })` with `res.cookie('token', accessToken, { httpOnly: true, secure: true, sameSite: 'none', maxAge: 60*60*1000 })` plus add a CSRF token mechanism (because cookies are auto-attached to every request, including forged cross-site requests).
- CORS: explicit `credentials: true` on both client and server, remove wildcard origins, ensure every preview URL is added to the allowlist.
- Socket.io: re-architect the handshake to extract the token from the `Cookie` request header server-side, which requires the client to send credentials with the upgrade request.
- Frontend: remove all `Authorization` header logic and rely on the browser to attach the cookie automatically.

**Estimated cost:** one full working day plus integration testing across Vercel preview / production / localhost. Buys real XSS resistance, introduces CSRF risk that needs its own token mechanism, and fights the cross-origin model. Net security improvement: comparable for our threat model. Net schedule cost: blocks the Tuesday gate.

### Alternative B — In-memory access token + httpOnly refresh cookie (industry best practice)

**Rejected for v1.** This is the pattern used by Auth0, Clerk, and most modern auth SDKs:

- Access token lives only in JavaScript memory (a React Context value or module-level variable).
- It is lost on page reload and recovered by silently posting the refresh token.
- The refresh token is in an httpOnly cookie, immune to XSS exfiltration.

**Estimated cost:** ~1.5 working days. Adds a "silent refresh on app boot" loading state, a refresh-failure-redirect-to-login flow, and the Socket.io reconnection edge case where the access token has rotated mid-session. Worth doing for production. Not worth doing before demo day.

### Alternative C — Server sessions, no JWT

**Rejected.** Requires Redis or DB-backed session storage. Adds infrastructure dependency and breaks the "stateless backend, horizontal scale" story we tell on the architecture slide. JWT was already the pitched stack.

## Revisit Trigger

Migrate to Alternative B (in-memory + httpOnly refresh) before any of the following:

- The platform reaches 1,000 active users.
- The product handles HIPAA-eligible PHI (we currently store name + appointment notes; medical-record-grade data would change the threat model).
- Any third-party-script integration is added to the frontend (analytics, embeds), which expands the XSS surface.
- A formal penetration test or security review is contracted.

## References

- **Code:**
  - `src/middleware/auth.js` — backend JWT verification
  - `src/services/auth.service.js` — token issuance + refresh rotation
  - `src/utils/sanitize.js` — XSS sanitization that mitigates the localStorage risk
  - `src/config/socket.js` — Socket.io handshake reads `socket.handshake.auth.token`
  - `frontend/src/api/client.js` — token attachment on every fetch (per `PROJECT_PLAN.md` §13.0)
  - `frontend/src/auth/AuthContext.jsx` — token persistence and rehydration
- **External:**
  - OWASP Top 10 2021 — A07: Identification & Authentication Failures
  - RFC 7519 — JSON Web Token
  - https://owasp.org/www-community/attacks/xss/

## Reviewer notes

This document is the canonical answer when an interviewer asks "Why localStorage and not httpOnly cookies for JWT?" The answer is not "cookies are inconvenient." The answer is: we evaluated three options, weighed them against our threat model, schedule, and architecture (cross-origin Vercel↔Railway with Socket.io handshake), chose the one that fit, and documented the trigger conditions for revisiting.
