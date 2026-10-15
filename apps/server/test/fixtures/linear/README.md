# Linear webhook fixtures

**Provisional.** Every file here is built from Linear's documented webhook shapes
([webhooks](https://linear.app/developers/webhooks),
[agent interaction](https://linear.app/developers/agent-interaction)), not captured from a
live delivery. A public receiver was not reachable when they were written: the Haus Dev app's
webhook pointed at an endpoint that did not exist yet, and Linear disabled it after about 15
failed (404/DNS) deliveries. Linear's app settings page keeps a "Webhook delivery failures" log,
and re-enabling a disabled webhook is manual.

Replace each file with a real capture (secrets and personal data removed) from probes 10, 12,
13, 15, 16, 17, 18, and 20 in [specs/linear-app.md](../../../../../specs/linear-app.md#test-plan)
once a development Server is exposed through the Tailscale Funnel. Then drop "provisional" from
this README and re-check the readers in `src/linear/delivery-payload.ts` against the captures.

| File | Linear-Event | Notes |
| --- | --- | --- |
| `agent-session-created.json` | `AgentSessionEvent` | mention-created session with `promptContext` and `guidance` |
| `agent-session-prompted.json` | `AgentSessionEvent` | follow-up prompt; `agentActivity.body` shape unconfirmed |
| `issue-label-update.json` | `Issue` | `Agent` label moved; `updatedFrom.labelIds` shape unconfirmed |
| `permission-change.json` | `PermissionChange` | team access changed |
| `oauth-app-revoked.json` | `OAuthApp` | app uninstalled |

The stop signal (Q9) has no fixture: its shape is unknown, and an unrecognised session action is
recorded `ignored` with `unsupported_event`.
