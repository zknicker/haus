# Delayed Claude Cloud input prototype

Throwaway integration proof. Uses a disposable PostgreSQL cluster and real Haus
Server, Trigger, inbox, Computer WebSocket start/ack, and scoped runner credentials.
No production schema, cloud adapter, Computer runtime, settings, or card changes.

Run the deterministic proof:

```sh
bun test apps/server/test/prototypes/claude-input/proof.test.ts
```

For a hosted trial, expose only the loopback callback bridge on `dev-port 1`
through a temporary HTTPS tunnel. Add that exact hostname to the existing Claude
Cloud environment's Custom network allowlist. The environment must already have
the approved read-only Development bootstrap. Do not expose the Haus Server.

```sh
bun apps/server/test/prototypes/claude-input/main.ts https://CALLBACK-HOST 120000
```

The driver prints a temporary Git fixture directory. In that directory launch
`claude --cloud` with a task asking one two-option alpha/beta route question via
AskUserQuestion. Instruct it to stop when Haus reports Pending input, await
HAUS_RESUME, then reissue the question and write/read back its supplied answer.
Save the launcher-returned hosted `session_...` identifier into
`cloud-session.txt` in that fixture directory before the delay expires.

The driver restarts Haus with its Computer offline while the input is pending.
After the delay it attaches the prototype Computer, receives and acknowledges the
real inbox start frame, and passes that frame plus original task context to a
bounded Claude invocation. The driver submits that decision under the actual
Agent runner credential and sends the native CLI continuation. This substitutes
a small Computer driver for the full Haus Computer turn runner; it does not prove
that runner's production tool wiring or human escalation path.

The cloud hook does not block waiting for the human. It persists the original
native question, denies that tool once, and lets the original turn end. A later
UserPromptSubmit validates the stored request; PreToolUse supplies the original
questions and answer to a new AskUserQuestion; PostToolUse reports consumption.
Saving the answer or the CLI delivery acknowledgment never resolves the request.

Native hook `session_id` is a runtime UUID. The CLI hosted identifier is a separate
`session_...` identity. Preserve both in the real adapter. Native prompt and tool
IDs distinguish original and resumed executions.

`proof.json` records synthetic requests, inbox frames, and native receipts without
credentials. Confirm the completed tool result and proof-file output in Claude's
UI as well. Stop the driver and temporary tunnel, and remove the callback hostname
when finished. The fixture and callback identity are disposable.

Prototype authentication derives a job-specific HMAC in memory from the existing
approved bootstrap; that bootstrap is neither transmitted nor written into the
fixture. The real integration needs a dedicated work-scoped callback credential,
atomic question/inbox registration, durable continuation dispatch and ambiguous-send
reconciliation, cancellation, and recovery after VM/environment reclamation. This
prototype is evidence for the mediation protocol, not a production service.
