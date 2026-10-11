---
summary: Decision to replace the GitHub OAuth App with one Haus-registered GitHub App, making GitHub the first built-in connection — sign-in plus owner-proven installations, GitHub's hosted MCP as the only tools, and a `github` Trigger kind fed by one app webhook. Amends ADR 0017 and ADR 0027.
read_when:
  - changing the GitHub connection, its sign-in, installation, permissions, or tools
  - adding a `github` Trigger, the GitHub webhook endpoint, or GitHub event routing
  - deciding whether a new service integration is a built-in connection, a custom MCP connection, or a webhook Trigger
  - changing which side owns payload interpretation for a Trigger kind
---

# ADR 0042: GitHub Is a Built-in Connection

## Status

Accepted 2026-10-11; implementation pending (see
[GitHub App Connection](../../specs/github-app-connection.md#implementation-plan)). Amends
[ADR 0017](0017-integrations-are-mcp-servers.md) and
[ADR 0027](0027-triggers-are-the-inbound-stimulus-primitive.md); neither is superseded as a whole.

## Context

The GitHub preset was an MCP connection signed in through a Haus-owned GitHub OAuth App. That gave
Agents GitHub's hosted MCP tools and nothing else. Agents waiting on GitHub (CI finished, a review
landed) had to use a generic webhook Trigger, which meant minting a bearer secret and getting it
into GitHub. One Agent pasted that secret into a Chat to hand it over.

An OAuth App acts only as a user, has no installation, receives no app-level webhooks, and uses
broad classic scopes. A GitHub App has fine-grained permissions, per-org installations with chosen
repositories, expiring user tokens, and one webhook for every installation.

## Decision

Haus registers one GitHub App per lifecycle and deletes the GitHub OAuth App path. GitHub becomes
the first **built-in connection**: a connection where Haus owns the relationship with the service
and integrates beyond MCP tools. Custom MCP connections stay tools-only, and the generic `webhook`
Trigger stays for everything else.

The GitHub connection does three things:

1. **Install, not just sign-in.** Signing in yields a GitHub App user token for one GitHub account.
   Binding attaches an App installation (an org or account and its repository selection) to one
   Haus Server. Binding needs authority on both sides: a Server Owner or Admin acting through
   Server-held state or an authenticated call, and the signed-in GitHub user's ownership of the
   installation's account (org admin, or the account itself). Seeing an installation is not
   authority.
2. **Agent tools stay the hosted MCP.** The user token powers GitHub's hosted MCP, and the
   connection grant is the only Agent access switch. v1 adds no Haus-owned tools. Actions secret
   management is cut because a secret literal would pass through Agent tool arguments and
   execution journals, which ADR 0017's custody rule forbids.
3. **Events become Triggers.** One public Haus endpoint receives the App's webhooks for every
   installation, verifies one HMAC secret, dedupes on the delivery id, routes by installation id to
   the owning Haus Server, and fires Triggers of a new `github` kind. A `github` Trigger is
   configured from pickers (installation or repositories, event types, a few field filters), has
   no URL and no secret, and sees only repositories its connection's GitHub user can access.

## What this amends

ADR 0017: GitHub keeps the generic MCP storage, OAuth, grant, and invocation path for its hosted
MCP, and adds Server-owned installation state and an app webhook. Its configured client is the
GitHub App's. GitHub-specific Server code lives in `apps/server/src/github/`. Other presets and
custom connections are unchanged.

ADR 0027: `github` is a second kind over the same Trigger rows, fire records, rate limiter,
envelope, provenance, and fire history. For that kind only, the Server parses the delivery,
matches it against a closed, typed event allowlist and filter vocabulary, and stores a trimmed
projection instead of the verbatim body, and the owning Agent must hold the GitHub connection
grant. There is still no general provider registry or predicate language; another provider is a
new ADR.

## Consequences

- Existing GitHub connections lose their tokens and Agent grants on migration. Users sign in again
  and regrant Agents. There is no compatibility path.
- GitHub's notifications API accepts only classic tokens, so the `notifications` MCP toolset goes
  away with the OAuth App. GitHub Triggers cover the need.
- Haus owns a public webhook endpoint, an App private key, and a webhook secret per lifecycle. The
  operator registers each App on GitHub and stores its values in 1Password; no agent can.
- GitHub does not retry failed deliveries. The Server recovers every delivery it has not finished
  from the App's delivery log since a persisted watermark, and raises an operator-visible gap when
  the watermark falls outside GitHub's three-day retention. Development stacks pull the same log
  and need no tunnel or public relay.
- The hosted MCP writes as the human, so Haus cannot tell an Agent's own GitHub actions apart.
  Trigger wakes count toward the Agent chain budget, and comment events are not offered in v1.
- A Trigger can now be degraded (installation removed or suspended, repositories unavailable,
  permissions missing, Agent access revoked, sign-in required). Degraded is visible on the Trigger
  and told to the owning Agent once, never silent.
- Agents never post a secret in a Chat. A `github` Trigger needs none; for the generic webhook, the
  human reveals the secret in the App, or the Agent installs it at the destination with a tool.
