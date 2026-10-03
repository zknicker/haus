---
summary: Authentication boundaries for humans, Computer attachments, managed Agents, and providers.
read_when:
  - changing Clerk identity, Server authorization, Computer credentials, or Agent runner access
  - changing secret custody or provider-session behavior
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
