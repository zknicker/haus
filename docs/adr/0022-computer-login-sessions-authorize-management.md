---
summary: Decision to give Haus Computer a reusable human login session for management while keeping execution on Server-scoped Computer credentials.
read_when:
  - changing Haus Computer login, logout, attachment, setup, or status
  - changing device authorization, Computer management credentials, or Clerk account switching
  - changing first-Computer onboarding or Computer attachment recovery
---

# ADR 0022: Computer Login Sessions Authorize Management

## Status

Accepted 2026-08-09. This supersedes ADR 0019's decision that every new Server attachment uses an
independent inline browser approval and that Haus Computer stores no human session. It preserves
ADR 0019's Server/Computer ownership and execution boundaries.

## Decision

Haus Computer stores one active, revocable **Computer login session** per Computer data root,
bound to one Haus origin. It contains a short-lived access token and rotating refresh token in a
mode-`0600` record. The session identifies one Haus User and authorizes only Computer management:
identity, Server and role discovery, Computer attachment and recovery, and Computer lifecycle
records. It cannot read Chats, act as an Agent, or authenticate execution. Every attached Server still issues an
independent Computer credential used by its runner, Agents, workspaces, queues, and outbound socket.

The human Computer CLI matches Raft's lifecycle: `login`, `logout`, `attach`, `setup`, and `status`.
`setup` logs in when needed, attaches the requested Server, and starts the resident service;
`attach` requires a usable login. A valid or refreshable session makes later Server attachments
browserless. An unauthorized saved account fails with the current identity and directs the operator
to `login` and **Use another account** instead of silently replacing it.

Haus owns the device authorization protocol because Clerk does not provide OAuth Device
Authorization Grant. Clerk authenticates the approving browser User and handles sign-in and account
switching. Haus issues the human-readable device code, complete and manual verification URLs,
expiry and polling interval, one-time exchange, rotating refresh-token family, and revocation.
Approval alone produces **Finishing the connection**; a setup page says **Computer connected**
only after the attachment is durably recoverable locally.
A standalone login ends at **Haus Computer signed in**. Completed pages offer a best-effort
**Close this page** button while remaining understandable when the browser refuses scripted close.

In-flight device grants are not resumed after an abandoned CLI process; a retry creates a new code.
Attachment issuance is stronger than Raft's observed client: a locally persisted idempotency key
closes the crash window between Server issuance and local credential storage, so retries recover the
same attachment instead of duplicating it. Existing attachment credentials and workspaces require
no migration or forced login. Logout revokes the Computer login session, removes it locally, and
stops the resident service while preserving every Server attachment and workspace; those attachment
credentials remain sufficient for an explicit local start.
