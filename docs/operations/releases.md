---
summary: Haus release targets, artifact publication, prerequisite ordering, and production promotion boundaries.
read_when:
  - cutting, publishing, or monitoring a Haus release
  - deciding which Haus release targets changed
  - changing release records, target jobs, or production promotion
---

# Releases

Use the [Haus release skill](../../.agents/skills/release-haus/SKILL.md) for the recurring
release procedure: target decisions, the release record, the release PR, workflow monitoring, and
the operator handoff. This document keeps the durable target and promotion contract.

## One release, five targets

Each new release has one public Haus SemVer, one append-only `releases.json` record, and one release
PR. Merging that PR starts one `Release` workflow. The top-level `version` is the public product
version even when only one component publishes. Every new entry contains all five target keys: a
published target carries its independent artifact version, while an unchanged target is `null` and
is skipped rather than rebuilt. iOS publication carries both its version and build number.
Historical versionless Computer-only records remain unchanged; the non-null product-version contract
starts with this unified release model.

`releases.json` is the only version decision. After completing the newest entry, run `bun run
release:sync-versions` to project the public version into the Haus product manifest and each
component version into its owned build metadata: the App and Computer packages, Haus Agent
manifest, iOS project defaults, and Bun workspace lock metadata. Do not assign versions by editing
those files directly. `release:check` and the Release workflow reject drift between the record and
the projected files.

| Target | Publish when |
| --- | --- |
| `server` | Hosted API, persistence, Server behavior, or the web Haus App artifact changes |
| `app` | Electron shell, preload bridge, native desktop behavior, or installed desktop artifact changes |
| `ios` | Native iPhone code, metadata, entitlements, dependencies, or assets change |
| `computer` | Computer execution, lifecycle, human CLI, updater, embedded managed CLI, bootstrap/ordinary protocol, or a required Computer dependency changes |
| `agent` | Haus-owned Agent instructions, actions, recipes, Harness behavior, or factory guidance changes |

The top-level Haus version and all five component versions evolve independently. The hosted web
App remains part of the Server artifact; `app` names the installed desktop artifact. An iOS
publication also records a new positive build number. A target that is unchanged keeps its latest
published version through carry-forward resolution; do not copy the Haus version into it.

Release publication resolves the ledger entry into a canonical snapshot containing the public
Haus version and the effective Server, App, iOS, Computer, and Agent versions. Consumers use that
snapshot at `https://releases.haus.chat/haus/latest.json` to describe one Haus release without
pretending every component rebuilt. Finalization verifies both the immutable versioned snapshot and
the promoted `latest` snapshot through the public host; storage-only verification is not sufficient
release evidence.

Operators can repeat that read-only public check with
`bun run release:verify-snapshot -- --version X.Y.Z --source-revision <full sha>`. The command
resolves one canonical snapshot from `releases.json`, follows redirects, disables caches, and checks
both public endpoints with bounded pair retries. Exit status `0` means both final responses were
2xx and both parsed JSON payloads exactly match the expected version, date, schema, source revision,
and effective component versions. A non-zero status identifies the immutable or latest endpoint
when a request, redirect result, payload shape, or exact value check fails.

Haus Agent has independent SemVer but no standalone artifact. Its behavior package is embedded in
Server and Computer, so publishing Haus Agent always publishes both targets. Server advertises
the current version; Computer records it only after an Agent successfully completes a turn with
that version. The App therefore distinguishes current, pending, and failed application.

The `Release` workflow builds, signs, publishes, and records evidence for selected artifact targets.
Haus Agent publication is proven by the matching Server and Computer artifacts. When
Server publishes, the same graph promotes the exact artifact through the protected `production`
Environment and verifies the public Server and hosted Haus App. Reviewing and merging the release
PR is the release's only human authorization gate; selected target jobs run to completion without a
second approval.

The installed App icon source is `assets/mac-icon.icon`. It is three stacked layers — Liquid Glass
on a translucent white ghost body over `Assets/mesh-gradient.png`, a ghost-shaped render of the
product mark's own color mesh (the azure, violet, and rose blobs, the side fade, the rim mask that
pushes color out to the contour, and the colored rim, all read off
`apps/website/src/components/haus-ghost-palette.ts`), with the eyes on top.
`apps/website/scripts/render-icon-mesh.ts` is that render: `bun run icons:render-mesh` rebuilds the
PNG from the mark's own palette and silhouette, then `node scripts/build-macos-app-icon.mjs`
recompiles the icon. Re-render it rather than flattening the stack or retouching a layer. The
script's `ICON_PROFILE` holds the only differences between the tile and the sidebar mark — a softer
colored rim, the azure core that lights the body from behind the eyes, and the white edge veil that
pools opaque white along the right and lower-right silhouette so the tile reads as thick glass lit
from the left — so tune the icon there; the sidebar mark never reads that profile. The App release job uses GitHub's `xcode-27` image
because older Xcode versions cannot compile the current Icon Composer 2 source.
`assets/halloween-icon.icon` is the Halloween theme's pumpkin tile. The same script compiles it
with the same `actool` flow into `electron/icons/AppIcon-pumpkin.png` only (no `Assets.car`/ICNS);
electron-builder ships it as `Resources/app-icons/AppIcon-pumpkin.png`, and
`electron/dock-app-icon.cjs` swaps it into the running App's Dock. `release:check-desktop-artifacts`
asserts the packaged copy matches the build.
The web favicon set in `apps/website/public/` (`favicon.svg`, `favicon-32.png`,
`favicon-192.png`, `apple-touch-icon.png`) is generated the same way, from the mark itself:
`bun run icons:render-favicon` renders `HausGhost` to a standalone SVG and its rasters. The same
run renders every other theme app icon's set with the same names under
`apps/website/public/app-icons/<icon>/` (today `pumpkin`, from `HausPumpkin`), which
`useThemeAppIcon` swaps in while that theme is active; commit both sets together.
The iOS app commits the full-fidelity compiled catalog under `assets/ios-icon`. It carries the ghost
as the primary icon and `assets/halloween-icon.icon` as the `halloween-icon` alternate that iOS
Settings' App icon picker selects. Its manifest binds the catalog to both canonical `.icon` sources,
exact Xcode build, and output checksums. When either icon source changes, regenerate the catalog with `bun run ios:prepare-icon` under the Xcode build named
in the manifest and commit both changes. Routine releases do not compile it again.

The stable Xcode 26.6 job validates the committed artifact, rejects catalogs where either icon lacks
light, dark, tinted, specular, or 1024px renditions, verifies that each checksum-bound Icon Composer
source keeps an active refractive layer, then archives without recompiling the `.icon`.
It installs the verified catalog before code signing and confirms that archive and export preserve
its exact bytes. This split is required while App Store Connect rejects archives built entirely by
preview Xcode 27. Keep the `.icon` canonical and do not flatten or remove its Icon Composer 2
effects.

## Target impact

Release preparation starts with `bun run release:collect-changelog-context`, before versions or the
new ledger entry are chosen. The helper resolves each target's latest recorded release source and
compares its owned shipping inputs with the candidate. It uses target tags when available and the
recorded release commit for legacy entries that predate reliable tagging. Direct target changes are
`required`; shared, generated, or dependency inputs are `review`; targets without owned changes are
`unchanged`.

Required impact is a floor, not a suggestion. `release:check` and the Release workflow reject a
ledger entry that marks a required target `null`. For every review file, the release agent traces the
changed export, dependency, or generated input to each named target and records `affects` or `does
not affect` with a reason. Files may share one disposition only when the same evidence applies. The
agent may widen the release for compatibility or an explicit operational reason. Because every
target uses its own published baseline, an incorrect earlier `null` cannot hide pending changes from
later release preparation.

The same target-scoped evidence feeds changelog writing. Programmatic scope determines what ships;
agent judgment assigns versions, groups commits into user-facing outcomes, and removes internal
churn and filler before the release PR.

## Prerequisites

When a Server change raises the required Computer protocol, the compatible Computer artifact must
be published and publicly verified before the Server is promoted. Use the
[Computer release and update spec](../../specs/raft-alignment/computer-release-and-update.md) for
the signed standalone artifact, descriptor, updater, rollback, and acceptance contract.

Use the [Computer login cutover](computer-login-cutover.md) for the expanded-Server → Computer →
final-Server sequence. Each distinct checkpoint follows the one-PR/one-workflow release procedure;
the sequence and rollback order are not replaced by ordinary target selection.

Use [iOS TestFlight](ios-testflight.md) for App Store Connect setup, build-number continuity,
processing, automatic internal distribution, and real-device smoke. The release workflow records
the exact Apple processing state. A processed TestFlight build is published evidence; internal
distribution is automatic, while tester invitation and production App Store promotion are separate
actions.

## Production Server promotion

The Server and web Haus App are one atomic production artifact with one Server SemVer.
A push to `main` without a release record does not deploy. A selected Server release queues
production promotion through the `production` Environment after the release PR merges. The
deployment workflow also keeps its manual entry point for recovery: `deploy` downloads, verifies,
installs, and activates a published artifact; `activate` verifies and switches to an already
installed release.

The selected `server` target publishes a deployable artifact, then calls the reusable `Deploy
Haus Server` workflow with the exact version and source identity. The production Environment
isolates deployment credentials and permits only `main`; it has no required reviewers because the
reviewed release PR is the human gate. The Release workflow cannot finalize until deployment
finishes successfully.

Read [Haus Server deployment](haus-server-deploy.md) for artifact verification, migrations,
activation, health checks, and rollback. A release is production-ready only after the protected
deployment succeeds and public health is healthy. A merged PR, a published artifact, or a started
deployment alone is not deployment evidence.

The Server deployment path preserves the full source SHA and content digest as deployment identity.
It runs the candidate migration program before activation; application rollback does not reverse a
database migration. Urgent production changes use a new patch release.

## Release evidence

The record and handoff distinguish these states:

- planned target decision;
- published target artifact;
- protected Server deployment and database result;
- target-specific smoke and public health;
- failed, skipped, pending, and recovered work.

The release skill sends one operator-facing handoff after the selected target jobs and any required
Server promotion reach a terminal or explicitly pending state. It lists all five target
states, names only actionable updates, links the PR/workflow/deployment evidence, and reports gaps
instead of inferring success from changed files.

Release credentials and environment ownership remain in [Environment](environment.md). Do not put
secrets in `releases.json`, release metadata, workflow inputs, changelog text, or the handoff.
