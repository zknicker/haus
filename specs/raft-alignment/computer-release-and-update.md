# Haus Computer release and update

This is the normative product, release, and UX contract for installing and updating Haus
Computer. It applies to the release publisher, Server bootstrap protocol, Computer updater,
Computer settings, and local recovery CLI.

## Product contract

Haus Computer is a separately versioned part of one Haus product. Every Haus release
decision assesses the Server, App, iOS, and Computer targets together.
Targets may remain unchanged, but the decision must be explicit. Releases are ordered:
a compatible Computer release is published and publicly verified before a Server release
that requires its protocol.

Computer has independent SemVer and annotated `computer-vX.Y.Z` tags. It has one production
stream. Haus does not expose alpha channels, version pins, automatic startup updates, or
arbitrary downgrade selection.

The production artifact is a standalone Apple Silicon macOS executable:

- signed with the Haus Apple Developer ID
- notarized by Apple
- distributed from the public Haus release host
- verified against a signed release descriptor and SHA-256 before replacement
- installed at `~/.local/bin/haus-computer`

The executable embeds the managed Agent-facing `haus` CLI and the Ed25519 public key used to
verify Computer release descriptors. Normal installation and setup do not require npm, Homebrew,
Bun, or a public-key environment variable. The Ed25519 private key, Apple credentials, and
release-storage credentials remain release secrets.

The installed executable is disposable. `~/.haus` remains the stable Computer data root and is
never part of an install, update, rollback, or release artifact.

## Release descriptor

`https://releases.haus.chat/computer/latest.json` is the single production pointer:

```json
{
  "release": {
    "artifactUrl": "https://releases.haus.chat/computer/1.2.3/haus-computer-aarch64-apple-darwin",
    "protocolVersion": 7,
    "sha256": "<lowercase artifact sha256>",
    "sourceRevision": "<full lowercase git sha>",
    "version": "1.2.3"
  },
  "signature": "<base64 Ed25519 signature>"
}
```

The signature covers the compact JSON `release` object with keys in the documented order.
Consumers reject unknown or malformed values, invalid signatures, digest mismatches, unsupported
platforms, and non-newer versions.

The public key is compiled into the executable. Rotation requires a transition release signed by
the old key that trusts both the old and new public keys. A later release may remove the old key.

## Publishing

The `computer` target job in the single `Release` workflow is the Computer publisher. It runs from
the merged release commit in the approved release environment and follows the same trust model as
the other target jobs.

The publisher must:

1. Require a clean expected release diff and an exact source commit.
2. Validate the Computer SemVer and unused `computer-vX.Y.Z` tag.
3. Run the focused Computer, contract, and artifact checks.
4. Compile the Apple Silicon executable with its package metadata and managed CLI assets.
5. Developer-ID sign and notarize the executable.
6. Verify the signature, notarization result, executable identity, version, protocol, and source
   revision from the built artifact.
7. Compute its SHA-256 and create the Ed25519-signed descriptor.
8. Upload the executable and a versioned copy of the descriptor to immutable versioned S3 keys.
9. Fetch both through their public URLs and repeat signature, digest, identity, and executable
   checks.
10. Atomically publish `computer/latest.json` only after every immutable object is verified.
11. Re-fetch and verify `latest.json`.
12. Push the annotated Computer tag and create the matching GitHub Release with the executable
    and descriptor.

Failure before step 10 leaves the current production pointer unchanged. Failure after it leaves a
promoted artifact with an unfinished step 12, so the publisher is resumable: when the production
descriptor already names the candidate's exact version, source revision, and digest, it recovers
that artifact, skips steps 3 through 11, and only ensures the annotated tag and GitHub Release
exist. Every other candidate still has to be newer than production and still requires an unused
tag. The publisher never builds from a branch name, mutable remote ref, or dirty worktree.

Before every Haus release, the release record requires an explicit target decision:

| Target | Publish when |
| --- | --- |
| Server | Haus App React UI, hosted API, persistence, or Server behavior changes |
| App | The Electron shell or installed desktop artifact changes |
| iOS | The native iPhone app or its release metadata, entitlements, dependencies, or assets change |
| Computer | Computer execution, lifecycle, local CLI, updater, embedded managed CLI, bootstrap or ordinary protocol, or required shared Computer dependencies change |

A Server protocol-floor increase cannot be promoted until the signed production Computer descriptor
reports a compatible protocol. Computer-only repairs are allowed, but the release record still
marks Server and App unchanged.

## Initial installation

Computer setup presents two copyable commands for the selected Server:

```sh
curl -fsSL https://releases.haus.chat/computer/install.sh | sh
$HOME/.local/bin/haus-computer setup /<server-slug>
```

The split keeps installation independently repeatable and makes Server attachment explicit. For
compatibility with previously published App builds, the installer still accepts an optional
`/<server-slug>` argument and runs setup after installation when it is present. The installer:

1. Fetches the production descriptor and artifact over HTTPS.
2. Verifies the artifact's exact Apple Developer ID and Team ID before execution; the publisher
   has already verified Apple's notarization result.
3. Verifies the descriptor SHA-256.
4. Installs the executable atomically at `~/.local/bin/haus-computer`.
5. Installs the resident service. The separately copied setup command attaches the selected
   Server; a legacy combined invocation also runs setup directly.

Setup reuses or refreshes the machine-local Computer login session. When login is needed, it opens
the complete device URL in the default browser, always prints that URL and the short code for manual
entry, and lets an interactive operator press Enter to retry the handoff. The command continues
polling after Clerk-backed approval, attaches the selected Server with a persisted idempotency key,
and completes automatically. The browser distinguishes **Finishing the connection**
from the final **Computer connected** state.

The installed executable then uses its embedded Ed25519 key for every later update. Reinstalling
code never deletes or adopts `~/.haus`.

## Transition from the pre-publisher build

The existing 1.0.0 development Computer predates a production publisher and understands only the
abandoned npm descriptor. It does not receive a compatibility release or npm bridge.

Its one-time transition uses the new install command followed by Server setup. The installer
replaces only code at `~/.local/bin/haus-computer`; setup validates and reuses the existing
`~/.haus` identity, attachments, queues, and Agent workspaces. Arbitrary credential rejection
fails closed. When Server explicitly reports `computer_machine_unlinked`, Computer records that
terminal state and parks the attachment instead of retrying. A later setup first proves a current
Server exists at the requested address, then archives only the obsolete `attachment.json` and
enters normal approval. Agent workspaces and all other Server-partition files remain recoverable.
After this transition, every update uses the standalone release contract.

## App update flow

The browser talks only to Haus Server through tRPC. It never calls Computer or the release host
directly. An Owner or Admin chooses **Check** or **Update** in Computer settings. Server fetches
the production descriptor and sends the signed update command through the authenticated bootstrap
connection. Computer independently verifies every release field, signature, Apple signature, and
digest.

Every attachment observes the shared resident Computer's update state. Other Servers do not
receive the initiating Server, User, or slug.

The UI uses these user-visible phases:

| Phase | Required presentation |
| --- | --- |
| `requested` | Appears immediately after the click as **Download requested**; controls cannot submit a duplicate request. |
| `downloading` | Shows **Downloading Haus Computer X.Y.Z** and a large determinate progress bar based on downloaded and total bytes. |
| `verifying` | Shows signature and integrity verification with an indeterminate progress bar. Turns continue. |
| `waiting-for-agents` | Shows which active Agent count is still draining. New turns wait; active turns are never killed by a hidden timeout. |
| `installing` | Shows **Installing update** with an indeterminate progress bar. Durable Computer data is untouched. |
| `restarting` | Shows **Restarting Haus Computer** with a prominent back-and-forth indeterminate bar until the new bootstrap handshake arrives. |
| `complete` | Shows the installed version and restored connection. Queued work resumes. |
| `failed` | Names the failed stage in plain language, preserves the last trustworthy progress, and presents the exact local recovery command. |

The progress surface must feel live, not like a submitted form:

- Computer reports downloaded bytes and expected total throughout the transfer.
- Server relays progress to every observing App and retains the latest phase across navigation or
  reload.
- The initiating App enters `requested` optimistically while waiting for Computer acknowledgement.
- Determinate progress never invents percentages. If total bytes are unavailable, the bar becomes
  indeterminate and still reports downloaded bytes.
- Restart remains visibly active through disconnect and reconnect; disconnect is expected during
  this phase and is not rendered as a generic failure.
- Progress labels are announced accessibly. Determinate bars expose current/min/max values;
  indeterminate motion honors reduced-motion preferences.

This interaction should match Raft Computer's responsiveness: immediate acknowledgement, truthful
download progress, readable phase changes, and unmistakable activity during restart.

## Compatibility and recovery

The stable authenticated bootstrap protocol carries product version, protocol version, signed
update command, downloaded bytes, total bytes, phase, detail, and update result. An incompatible
ordinary protocol connects in `update-required` mode: ordinary controls, delivery, and Agent
execution pause, but update control and progress remain available.

A Computer too old for the bootstrap protocol requires local recovery:

```sh
haus-computer upgrade
```

The updater keeps exactly one previously verified executable at
`~/.local/bin/haus-computer.prev`. A failed atomic swap restores the prior executable. After a
successful update, explicit local recovery may restore it:

```sh
haus-computer upgrade --rollback
```

Rollback restores only code and restarts the managed service. It never rolls back or snapshots the
Computer data root. There is no remote rollback button, version browser, or automatic semantic
health heuristic that silently changes versions.

## Implementation slices

Implement the contract in this order:

1. **Release contract** — replace `tarballUrl` with the standalone artifact fields, add protocol
   and source revision, embed the public trust anchor, and extend bootstrap progress with byte
   counts and the complete phase union.
2. **Artifact builder** — compile the Computer and managed CLI, stamp version/protocol/source
   identity, sign, notarize, and verify a local artifact.
3. **Updater and recovery** — download with byte progress, verify both trust layers, stage beside
   the executable, drain turns, atomically swap, retain `.prev`, restart, and implement explicit
   rollback.
4. **Publisher** — create the signed descriptor, upload immutable objects, verify them publicly,
   atomically promote `latest.json`, and create the annotated tag and GitHub Release.
5. **Installer** — verify Apple identity and the descriptor digest, atomically install into
   `~/.local/bin`, and reuse existing `~/.haus` state.
6. **Server coordination** — validate descriptors, enforce protocol release ordering, preserve
   progress across reconnect, and expose the shared state through the existing tRPC surface.
7. **App experience** — implement the large determinate download bar, phase copy, drain count,
   indeterminate verification/install/restart motion, expected-disconnect handling, recovery
   copy, accessibility, and responsive layout.
8. **Release integration** — make the holistic target decision mandatory in release guidance,
   changelog context, and release checks.

## Acceptance

Release evidence proves:

- the artifact is compiled, executable, Developer-ID signed, notarized, and reports exact version,
  protocol, and source revision
- descriptor signature and digest verification fail closed
- failed publication never moves `latest.json`
- a protocol-floor increase cannot publish before its Computer prerequisite
- initial installation and reinstall preserve the Computer data root
- the one-time 1.0.0 transition reuses existing attachments and Agent workspaces without an npm
  compatibility release
- active turns continue during download, drain before replacement, and are never force-killed
- all Server attachment daemons reconnect after update
- explicit rollback restores the one previous verified executable
- two attached Servers observe the same progress without cross-Server initiator identity
- the App shows truthful determinate download progress and indeterminate restart progress through
  disconnect and successful reconnect
