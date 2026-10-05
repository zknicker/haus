---
summary: Authentication boundaries for humans, Computer attachments, managed Agents, and providers.
read_when:
  - changing Clerk identity, Server authorization, Computer credentials, or Agent runner access
  - changing secret custody or provider-session behavior
  - changing desktop Clerk loading, the sign-in gate, or how a new desktop window starts signed in
---

# Auth

| Boundary | Credential and authority |
| --- | --- |
| Human App → Server | Clerk-authenticated User plus Server membership and role checks |
| Computer management → Server | Machine-local Computer login session; setup authority only |
| Computer attachment → Server | Revocable credential scoped to one Server Computer |
| Computer runner → Server | Per-launch Agent runner credential, held behind the localhost proxy |
| Managed Agent → Computer | Per-launch local proxy token file; never valid at Server |
| Computer → provider | Native Codex, Claude Code, Grok Build, or Pi login owned by that runtime |

Server stores Computer, runner, MCP, and hosted OAuth secrets. Computer stores attachment
credentials and local proxy tokens in private files. Operators authenticate through each execution
runtime's native flow; provider credentials never reach Server or App.

Claude's isolated Agent home cannot read the host's macOS Keychain login directly. At each native
start, Computer resolves the current host-owned login and supplies its access token only in the
Claude bridge process environment. It never writes the token into Agent files or persisted bridge
turn settings, and it leaves explicit native environment authentication intact. Missing native
credentials fail with a sign-in instruction. Other runtimes reference their native credential
files while preserving separate Agent homes and sessions.

Do not place secrets in Messages, prompts, logs, execution reports, e2e fixtures, checked-in env
files, or App cache. Every Server route rechecks the authority required by its product operation.

## Desktop session handoff

The desktop App runs Clerk natively: main holds Clerk's client JWT in `safeStorage`, and each
window's renderer loads its own Clerk and mints short-lived session tokens. A new window does not
wait for Clerk's `/v1/environment` and `/v1/client` before rendering signed in when another window
already holds a live session token.

- Every App window shares each session token Clerk hands it (`desktop:auth:session-share`), and
  shares null when its loaded Clerk has no session. Main keeps one token in memory only: the
  newest by `iat`. An older share is ignored, and a share for a different `sid` must be strictly
  newer, so a stale window still on the previous account cannot replace the current one. A
  sign-out clear always applies and keeps the `iat` floor.
- A booting window peeks it synchronously (`desktop:auth:session-peek`). Shares and peeks are
  accepted only from an App window's own main frame (matched by `frameTreeNodeId`; a missing
  frame fails closed), never a subframe or a browser page that visits the App origin.
- One expiry rule covers both sides: a handed-off token is used only while it has at least
  15 seconds left. Main hands it out under that rule, and the renderer stops using it at the
  same point, so a slow request cannot reach the Server expired. Native Clerk runs no token
  poller, so each window refreshes its shared token 25 seconds before expiry
  (`getToken({ leewayInSeconds: 25 })`) and shares the new one; main always holds a token a
  booting window can use.
- The renderer seeds `ClerkProvider initialState` (Clerk's supported pre-load auth state) from the
  token's `sub` and `sid` claims, and uses the token for Server calls until Clerk loads or the
  token reaches that 15-second margin; later reads wait for Clerk. The sign-in gate keeps its session subtree at one
  position, so Clerk finishing for the same session changes nothing on screen.

Security: the handoff grants nothing new. The token is the same bearer credential any App window
already reads from Clerk, lives no longer than Clerk's own token, and stays in main memory. Claims
are read unverified only to choose the first render; Server verifies every request and socket, so
no private data renders without a token the Server accepted. If Clerk loads signed out, as a
different session, or fails, the gate falls back to the normal flow and the per-user Server
provider remounts. A session revoked elsewhere stays usable until its token expires, exactly as in
an already-open window.
