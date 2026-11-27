---
read_when:
  - reviewing the Agent E2E MCP, skill, workspace, or artifact baseline
---

# MCP, skills, and workspace — 2026-07-30

The comparison baseline was the tranche 5 audit (removed 2026-11-27). It used ordinary business requests
with GPT-5.6 Terra where possible and observed managed-tool use, revoked
access, skill-backed work, durable workspace files, and shared workspace
artifacts.

Stable gates use exact fixture facts rather than model narration:

- a granted Server-owned MCP connection supplies one private record through one
  upstream call;
- revocation makes a new unseen record unavailable without a false successful
  lookup;
- a skill import settles before it is expected on the next turn;
- a later turn reads exact Agent-owned workspace content;
- a shared workspace target opens the exact Agent and path in the App.

Exact error wording, spontaneous tool or skill choice, prose style, and
unprompted artifact sharing remain observations.

The first executable slice is `mcp-access.spec.ts`. It uses a loopback remote
MCP fixture, changes the connection grant through the real Agent profile, and
sends both requests through the real App composer.

The live Haus run passed:

- with the grant enabled, the Agent made exactly one upstream lookup and
  returned the fixture-only title and owner;
- after revocation, a request for a different unseen record made zero upstream
  calls and returned none of its fixture-only facts.

The skills and workspace slice uses a disposable Terra Agent:

- importing `decision-helper` through the Agent profile affected the next turn;
- the Agent created a file containing a private generated token, then recovered
  that exact token after a session reset without the token appearing in Chat;
- the Agent created the requested HTML and emitted a valid artifact fence, but
  the task Thread rendered that fence as code instead of a clickable artifact
  card. The executable M5 scenario remains quarantined on this App gap.

The imported shared skill is useful live corroboration, not a permanent exact
prose contract. A purpose-built isolated fixture skill should replace it before
M3 becomes a release-critical content assertion.

Verification:

```text
HAUS_DEV_STACK_ID=agent-e2e bun run eval:agents -- mcp-access.spec.ts
2 passed (52.0s)
```

Deterministic Server tests remain responsible for call-time grant races,
timeout classes, and upstream failure injection.
