---
summary: Decision to ship Haus Computer as an independently versioned, signed standalone executable within one coordinated Haus release process.
read_when:
  - changing Computer packaging, installation, updates, rollback, or release publishing
  - changing Computer update UI or bootstrap progress
  - cutting a release that changes Computer or the Computer protocol
---

# ADR 0020: Computer Ships as a Signed Standalone Release

## Status

Accepted 2026-07-28. Supersedes the npm artifact, environment-provided update key, and
no-rollback portions of ADR 0019.

**Amended 2026-11-21.** The executable now ships inside a signed, notarized, stapled
`Haus Computer.app` (`chat.haus.computer`) distributed as a zip, installed at
`~/.local/share/haus-computer/`, with `~/.local/bin/haus-computer` a symlink to it. macOS charges
Accessibility and Screen Recording to the responsible process, and a bare executable has no name
or icon in System Settings and no bundle for agent-desktop's guide to offer
([Computer use](../../specs/computer-use.md#macos-permissions)). Updates and rollback swap whole
bundles and keep one `.prev`. Computers that ran the bare executable reinstall once with the install
command and grant the permissions again.

## Context

WS6 implemented signed Computer update commands, graceful turn draining, shared progress, and a
stable bootstrap protocol, but did not implement the production Computer publisher. The documented
descriptor URL returned 404, `apps/computer` remained at 1.0.0, and a Server release required
a newer Computer protocol without publishing a compatible Computer artifact.

The prior design used an npm tarball while Raft's proven production path uses a signed standalone
Computer executable, an atomic binary swap, and one previous executable for recovery. npm adds a
second runtime and package-manager dependency to the most important recovery path.

## Decision

Haus Computer ships as an independently versioned Apple Silicon macOS executable. The executable
is compiled, Developer-ID signed, notarized, distributed from Haus's public release storage, and
verified using both SHA-256 and an Ed25519-signed release descriptor. Its Ed25519 public trust
anchor is compiled into the executable.

The executable installs at `~/.local/bin/haus-computer`; npm and Homebrew do not own it.
`~/.haus` remains stable, version-independent data. The updater atomically swaps code and retains
exactly one previous verified executable for explicit `haus-computer upgrade --rollback`.

Computer retains independent SemVer and `computer-vX.Y.Z` tags, but release planning is holistic.
Every Haus release explicitly assesses Server, App, and Computer. A compatible Computer
release must be published and publicly verified before a Server release that requires its
protocol.

Production Computer publishing uses a dedicated local macOS command, matching the existing
Server release authority. It uploads immutable versioned objects before atomically promoting
the one production `latest.json` pointer.

The App keeps Raft's responsive update interaction: immediate requested state, real byte-based
download progress, explicit verification/drain/install phases, and indeterminate back-and-forth
progress through service restart and reconnect. Browser communication remains Server-mediated
through tRPC.

The unshipped 1.0.0 npm-based development install receives no compatibility artifact. Its one-time
transition runs the standalone installer, which replaces code and reuses the existing
`~/.haus` data root.

The full normative contract is
[Haus Computer release and update](../../specs/raft-alignment/computer-release-and-update.md).

## Consequences

- Computer installation and recovery no longer depend on npm, Homebrew, Bun, or a configured
  public-key environment variable.
- The release environment must protect Apple, Ed25519, S3, Git, and GitHub credentials.
- Key rotation requires a transition release that trusts the old and new Ed25519 public keys.
- Computer protocol changes become explicit release prerequisites rather than post-deploy repair.
- The updater and bootstrap protocol must report byte progress and enough phase detail for a
  truthful realtime UI.
- Exactly one local code rollback is available. Computer state and Agent workspaces are never
  snapshotted or rolled back.
- The pre-publisher 1.0.0 install requires one explicit local transition; no temporary npm
  compatibility lane remains afterward.
- Haus continues to omit channels, pins, automatic startup updates, arbitrary downgrades, and
  remote rollback.
