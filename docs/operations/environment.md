---
summary: How every Haus environment value is declared, stored, resolved, and delivered — the .env.schema contract, its 1Password sources, and the four venues that read it.
read_when:
  - adding, renaming, rotating, or removing an environment variable
  - wiring a new consumer (script, workflow, cloud agent, service) to a credential
  - a value resolves empty, a deploy refuses to run, or `env:contract` fails
---

# Environment and secrets

Haus has no `.env` step. The committed root [`.env.schema`](../../.env.schema)
is the contract — canonical names, types, sensitivity, and the exact 1Password
reference each lifecycle resolves — and [Varlock](https://varlock.dev) is the
only loader. Nothing else reads an environment file, in development or in
production.

## The three lifecycles

`VARLOCK_ENV` selects one, and it is a fail-loud enum: any other value,
including lifecycles Varlock can infer for itself in CI, is rejected at load
rather than quietly riding each value's development arm.

| Lifecycle | Resolves from | Used by |
| --- | --- | --- |
| `development` | `Development` vault | the dev stack, Cursor cloud agents, operator commands |
| `production` | `Production` vault | the Mac mini deploy job only |
| `test` | fake-but-shaped literals in the schema | every test lane and `env:check` — fully offline, no 1Password access |

Sensitivity fails safe: an item with no explicit `@sensitive` or `@public`
resolves as sensitive. `env:contract` rejects an item that states neither, and
rejects any `VITE_` item marked sensitive — those are inlined into the public
Haus App bundle at build time.

## Where values live

1Password account `knickerbockerventures.1password.com`. Lifecycle vaults are
the access boundary.

| Item | Vault | Holds |
| --- | --- | --- |
| `Clerk - Haus` | `Development`, `Production` | Haus's own Clerk tenancy — backend key, publishable key, issuer |
| `Dev Sign-In User - Haus` | `Development` | the Clerk user the local auto sign-in signs in as |
| `Google MCP OAuth - Haus` | `Development` | OAuth client for the Google Calendar MCP connection |
| `OpenAI API - Haus` | `Development`, `Production` | Server-owned transient Agent avatar generation; one independently rotated key per lifecycle |
| `Axiom Development OTLP - Haus` | `Development` | Development OTLP ingestion for the shared operations and metrics datasets |
| `Axiom Production OTLP - Haus` | `Production` | Hosted Server OTLP ingestion for the shared operations and metrics datasets |
| `Postgres - Haus` | `Production` | runtime URL, migration URL, container admin password |
| `HugeIcons Pro - Merchbase` | `Development` | shared licensed registry key (adopted, not copied) |
| `HeroUI Pro CICD - Merchbase` | `Development` | shared licensed artifact token (adopted, not copied) |
| `Apple Notarization - Merchbase` | `Tooling` | shared notarization identity (adopted, not copied) |
| `S3 Release - Merchbase Desktop` | `Tooling` | shared release-bucket IAM key (adopted, not copied) |
| `Computer Release Signing - Haus` | `Tooling` | Ed25519 keypair that signs Computer releases |

Local release operators read `Tooling` through desktop authorization. The
GitHub Release workflow uses a separate read-only service identity scoped to
that vault; no deploy, Quality, Cursor, or product runtime identity can read it.

Transient avatar generation uses `HAUS_OPENAI_API_KEY`. Development and production each resolve
their own `OpenAI API - Haus` credential because Agent creation cards and profile generation use
the real Server-owned provider in both lifecycles. Production requires its item before promotion;
normal development startup resolves the Development item through its own identity. Release jobs
deliberately suppress both runtime credentials. There is no App setting for this Server deployment
capability. Test fixtures never need the key and never call the provider.

`CURSOR_API_KEY` is deliberately absent. It is Cursor's own variable, read by `@cursor/sdk` on a
Haus Computer alongside that SDK's credential store at `~/.cursor/sdk/auth.json`. Haus never
mints, delivers, or stores it: the Computer settings **Connect** action runs Cursor's browser
sign-in on the machine, and the key stays in Cursor's store. Nothing in this contract resolves it,
so it has no 1Password item and no schema arm.

The local `gh` CLI token is absent for the same reason. A Computer reads a Cloud Agent Run's pull
request from GitHub using whatever token `gh auth token` already resolves on that machine, held in
memory for the life of the process and never logged, stored, or reported to Server. It is a
host-native credential, not a Haus variable: it has no 1Password item, no schema arm, and a
Computer without `gh` reads public pull requests unauthenticated instead.

The opt-in live Cursor Cloud Agent smoke reads `HAUS_RUN_LIVE_CURSOR_TEST=1` and
`HAUS_LIVE_CURSOR_REPOSITORY=owner/name`. Both are declared and both resolve `undefined` in every
lifecycle: the run spends a real Cursor allowance against a real repository, so an operator sets
them by hand and every automated lane runs against recorded provider responses instead.

The opt-in Cove Agent E2E scenario can set `HAUS_AGENT_E2E_AVATAR_FIXTURE=1`,
an absolute `HAUS_AGENT_E2E_AVATAR_FIXTURE_PATH`, and an absolute
`HAUS_AGENT_E2E_AVATAR_REQUEST_LOG` path. The Server honors these only when
`HAUS_DEV_STACK=1`, reads the operator-selected stable PNG, and logs request
metadata without the concept or image bytes. The fixture path is runtime input,
so the PNG is not bundled into the Server artifact. Do not enable the fixture in
a released Server environment.

## Who is allowed to read

Humans and supervised local agents authorize through the 1Password desktop app.
Unattended consumers each hold their own read-only identity, and the schema
names four bootstrap slots for them:

| Slot | Filled by | Reads |
| --- | --- | --- |
| `DEPLOY_AGENT_PRODUCTION_OP_TOKEN` | the `GH_DEPLOY_AGENT_PRODUCTION_OP_TOKEN` repository secret, on the mini's self-hosted runner | `Production` + `Development` |
| `CURSOR_CLOUD_AGENTS_DEVELOPMENT_OP_TOKEN` | a Cursor account-level Runtime Secret, fleet-wide | `Development` |
| `CI_OP_TOKEN` | the same GitHub repository secret, mapped only by Quality | `Development` |
| `RELEASE_AGENT_TOOLING_OP_TOKEN` | the `GH_RELEASE_AGENT_TOOLING_OP_TOKEN` repository secret, mapped only by Release target jobs | `Tooling` |

All are `@internal`, so ordinary `varlock run` never passes them to a child
process. GitHub holds two bootstraps: the existing deploy identity and a
separate read-only Tooling identity for releases. `env:contract` rejects any
other workflow secret or any mapping outside its named consumer.

## Context switches

Machinery credentials resolve only behind an explicit switch, so the Vite
build, the dev stack, the Server, and the test lanes never contact 1Password —
and a cloud agent that can reach none of them still passes `check`.

- `HAUS_RESOLVE_INSTALL_TOKENS` — the licensed registry credentials, set by
  `scripts/setup-worktree.mjs` and the Quality workflow.
- `HAUS_RESOLVE_RELEASE_TOKENS` — Apple, S3, and Computer signing
  credentials, set by the `release:*`, `computer:release`, and `publish:desktop`
  scripts.

Release commands run `varlock run --include-internal`, because `varlock run`
strips `@internal` items by default and every release credential is one.
The release switch also leaves Clerk, Google, OpenAI, and OTLP runtime credentials
undefined and disables schema-provided OTLP endpoints. This keeps GitHub release jobs on their Tooling-only identity instead
of making an unrelated Development-vault read part of signing or publication.

## Source → delivery → runtime

```
                    .env.schema  (the contract; committed)
                          │
        ┌─────────────────┼──────────────────┬───────────────────┐
        │                 │                  │                   │
   varlock run       varlock printenv   deploy job          test lifecycle
   (dev stack,       (install tokens,   (VARLOCK_ENV=          (literals,
    build, release)   under a switch)    production)            offline)
        │                 │                  │                   │
   process env        process env      config/server.env     process env
                                        (0600 + one ACL)
                                              │
                                    operations/run-server
                                              │
                                    launchd com.haus.server
```

The hosted Server never invokes Varlock. `config/server.env` is the delivered
runtime copy, rendered fresh on every deploy by
`scripts/render-server-env.ts` from exactly the names the Server's typed env
module validates — the delivered set — then read back names-only by
`scripts/verify-deployed-secrets.ts` against that same set, which both derive
from `deliveredEnvironmentNames` in `scripts/lib/env-schema.ts`. A deploy-time
credential such as `HAUS_DATABASE_MIGRATION_URL` is production-required in the
schema and deliberately outside the delivered set: the deploy job resolves it
for itself and the running Server never receives it. The contract comes from the deploy
workflow's own revision rather than the released artifact — see
[the deployment doc](haus-server-deploy.md#where-the-contract-comes-from) for
why, and for the guard that keeps the two from drifting apart silently. A launchd job stores a command line, so
`run-server` invokes the Server binary directly — a job that re-entered Varlock
would resolve the schema again at boot, under the development lifecycle.

## Commands

| Command | Does |
| --- | --- |
| `bun run env:check` | validates the schema in the `test` lifecycle, fully offline |
| `bun run env:contract` | name-only drift check across schema, Server, release scripts, launchd, and workflows |
| `bun run env:load` | resolves the current lifecycle and prints it with secrets masked |
| `bun run dev` | the dev stack under `varlock run` |

## Rules

- Add a variable by adding it to `.env.schema` with an explicit sensitivity
  marker and an arm for every lifecycle — including a fake-but-shaped `test`
  arm, or the offline lanes break.
- A value the dev stack derives per worktree (ports, state roots) is a process
  contract between our own processes, not a schema item. It resolves to
  `undefined` in the schema's development arm, never `""`: the Server's zod
  schema treats an empty string as present and would reject it instead of
  applying its default.
- Never commit a `.env`. The deploy job refuses to run when one exists in the
  workspace or the deploy root: Varlock loads it above the schema, and a `$` in
  any of its values is parsed as an expression.
- Rotate at the provider, update the 1Password item, redeploy, verify, revoke.
  Stable names mean no repository change.

## Semantic channel addressing

Semantic channel addressing runs for every Server when `HAUS_TYPESAFE_API_KEY` is
configured; there is no per-Server flag or allowlist. Development resolves
`op://Development/TypeSafe AI - Merchbase/credential`; Production resolves
`op://Production/TypeSafe AI - Haus/credential`. The production item currently holds
an operator-requested copy of the development credential, so both share provider
quota and revocation. Test/release lifecycles resolve no credential. The existing
environment renderer delivers the credential only to Server. Without a credential,
normal deterministic delivery remains available.

See [ADR 0030](../adr/0030-semantic-channel-addressing.md) for context disclosure and routing limits.
