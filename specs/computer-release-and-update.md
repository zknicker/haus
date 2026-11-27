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

The production artifact is `Haus Computer.app`, an Apple Silicon macOS app bundle whose only
executable, `Contents/MacOS/haus-computer`, is the compiled Computer. It ships as a zip. There is
no Intel (x64) build: the embedded agent-desktop binaries are `darwin-arm64` only, and the
installer exits with a clear message on any other machine. The bundle exists so macOS charges
Accessibility and Screen Recording to a named app ([Computer use](computer-use.md#macos-permissions)):
its id is `chat.haus.computer`, it carries the App's `AppIcon.icns`, and `LSUIElement` keeps it
out of the Dock.

The artifact is:

- signed as a bundle with the Haus Apple Developer ID, hardened runtime, and
  `scripts/release/computer-entitlements.plist`
- notarized by Apple and stapled
- distributed from the public Haus release host
- verified against a signed release descriptor and SHA-256 before replacement
- installed at `~/.local/share/haus-computer/Haus Computer.app`, with `~/.local/bin/haus-computer`
  a symlink to its executable

Builds that are not production releases (`computer:release -- --dry-run`) use the bundle id
`chat.haus.computer.dev` and the name "Haus Computer Dev", so they never hold or replace the
release grant.

The executable embeds the managed Agent-facing `haus` CLI and the Ed25519 public key used to
verify Computer release descriptors. Normal installation and setup do not require npm, Homebrew,
Bun, or a public-key environment variable. The Ed25519 private key, Apple credentials, and
release-storage credentials remain release secrets.

The installed app is disposable. `~/.haus` remains the stable Computer data root and is
never part of an install, update, rollback, or release artifact.

## Release descriptor

`https://releases.haus.chat/computer/latest.json` is the single production pointer:

```json
{
  "release": {
    "artifactUrl": "https://releases.haus.chat/computer/1.2.3/haus-computer-aarch64-apple-darwin.zip",
    "protocolVersion": 7,
    "sha256": "<lowercase sha256 of the zip>",
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
4. Compile the Apple Silicon executable with its package metadata and managed CLI assets into
   `Haus Computer.app` with its `Info.plist` and icon.
5. Developer-ID sign the bundle, notarize it, staple the ticket, and require Gatekeeper to accept
   it as a notarized Developer ID app.
6. Verify the signature, bundle id, notarization result, executable identity, version, protocol,
   and source revision from the built artifact, then zip the stapled bundle.
7. Compute its SHA-256 and create the Ed25519-signed descriptor.
8. Upload the executable and a versioned copy of the descriptor to immutable versioned S3 keys.
9. Fetch both through their public URLs and repeat signature, digest, identity, and executable
   checks.
10. Atomically publish `computer/latest.json` only after every immutable object is verified.
11. Re-fetch and verify `latest.json`.
12. Push the annotated Computer tag and create the matching GitHub Release with the zip,
    descriptor, and installer.

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

1. Fetches the production descriptor and zip over HTTPS.
2. Verifies the descriptor SHA-256 and unpacks the zip.
3. Verifies the app's exact bundle id, Apple Developer ID, and Team ID before execution; the
   publisher has already verified Apple's notarization result.
4. Installs the app at `~/.local/share/haus-computer/Haus Computer.app`, keeping the app it
   replaces as `Haus Computer.app.prev`.
5. Runs the app's `install`, which stops running attachment daemons, points
   `~/.local/bin/haus-computer` at the app executable, and loads the resident service. The
   separately copied setup command attaches the selected Server; a legacy combined invocation also
   runs setup directly.

Setup reuses or refreshes the machine-local Computer login session. When login is needed, it opens
the complete device URL in the default browser, always prints that URL and the short code for manual
entry, and lets an interactive operator press Enter to retry the handoff. The command continues
polling after Cloudflare-backed human approval, attaches the selected Server with a persisted idempotency key,
and completes automatically. The browser distinguishes **Finishing the connection**
from the final **Computer connected** state.

The installed app then uses its embedded Ed25519 key for every later update. Reinstalling
code never deletes or adopts `~/.haus`.

The resident service is the LaunchAgent `com.haus.computer`. Its program is the app executable
itself, never the symlink, and it names the app in `AssociatedBundleIdentifiers` so Login Items
shows Haus Computer. CLI commands outside the job (`setup`, `start`, `restart`) load or kickstart
it and let the resident spawn attachment daemons, so every daemon runs inside the job and macOS
charges its permissions to the app.

## Transition from the bare executable

Computers through 23.x ran as a bare executable at `~/.local/bin/haus-computer`. Their updater
expects an executable artifact: it downloads the zip, the digest matches, and `codesign --verify`
on the zip fails, so **Update** and `haus-computer upgrade` end `failed` at verifying, install
nothing, and leave the bare executable running. The first app release also moves the Computer
protocol to 47, so once its Server is promoted, a bare 23.x Computer attaches `update-required`
until it is reinstalled. Each such Mac reruns the install command once:

```sh
curl -fsSL https://releases.haus.chat/computer/install.sh | sh
```

The installer replaces the bare executable with the symlink, drops its `.prev`, rewrites the
LaunchAgent to run the app, and keeps `~/.haus` and every attachment. Rollback cannot return to the
bare executable. macOS never moves a grant to a new holder, so the Device page asks for
Accessibility and Screen Recording again ([Computer use](computer-use.md#macos-permissions)).

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

Once an attachment daemon begins the update restart drain, shutdown is terminal. The new
executable is already installed by then, so a drain or service restart error is logged as a
shutdown failure, not an update failure: the record stays `restarting`, and the daemon releases the
update lock before exiting with an error. The resident Computer replaces the exited daemon using
the installed executable. A disposed runtime must never remain alive in the reconnect loop;
recovery does not claim that the failed shutdown saved every session checkpoint.

The service restart depends on where it runs. An attachment daemon runs inside the
`com.haus.computer` launchd job's process group (launchd names it through `XPC_SERVICE_NAME`), so
it restarts the job with `launchctl kickstart -k`, which also ends the daemon. It must never
`bootout` its own job: launchd reaps the process group before `bootstrap` runs and leaves the
service unloaded. A rewritten plist takes effect at the job's next load. CLI `upgrade`, rollback,
and `install` run outside the job and reload the definition with `bootout` plus `bootstrap`.
Whichever process starts first after the restart, the resident or an attachment daemon, settles
`restarting`: `complete` when it runs the target version, otherwise `failed` at `restarting`
naming the version that came up. The next bootstrap handshake reports the result.

Shutdown drains accepted writers before saving parked Agent sessions, with a separate 20-second
deadline for each stage. A completed writer cannot consume the session checkpoint deadline.
Coordination cleanup has its own three-second deadline; telemetry flush uses the bounded
finalizers owned by the telemetry layer. Timeout errors identify the stage that actually failed.
The process controller waits up to 60 seconds for these stages before refusing a replacement;
it never force-kills the attachment daemon to satisfy that deadline.

The progress surface must feel live, not like a submitted form:

- Computer reports downloaded bytes and expected total throughout the transfer.
- Server relays progress to every observing App and retains the latest phase across navigation or
  reload.
- The initiating App enters `requested` optimistically while waiting for Computer acknowledgement.
- Determinate progress never invents percentages. If total bytes are unavailable, the bar becomes
  indeterminate and still reports downloaded bytes.
- Restart remains visibly active through disconnect and reconnect; disconnect is expected during
  this phase and is not rendered as a generic failure.
- If an active update is offline two minutes after its last progress report, Settings and the
  sidebar stop showing live progress and say its outcome is unconfirmed. Reconnecting the Computer
  supplies the installed version and actual update result; an offline App does not infer that
  installation failed. Server requires a live Computer attachment before accepting a check or
  update request. The sidebar does not retry an unconfirmed offline Computer.
- Progress labels are announced accessibly. Determinate bars expose current/min/max values;
  indeterminate motion honors reduced-motion preferences.

This interaction should match Raft Computer's responsiveness: immediate acknowledgement, truthful
download progress, readable phase changes, and unmistakable activity during restart.

## Compatibility and recovery

The stable authenticated bootstrap protocol carries product version, protocol version, signed
update command, downloaded bytes, total bytes, phase, detail, and update result. An incompatible
ordinary protocol connects in `update-required` mode: ordinary controls, delivery, and Agent
execution pause, but update control and progress remain available.

`computerProtocolVersion` gates the bootstrap handshake itself, not every payload shape Server and
Computer exchange over it or over the Agent API. A field a release additively adds to an existing
payload — a new key on `work`, a run, or another record carried over the bootstrap connection or
`/api/agent/*` — never bumps the protocol version and never waits for a Computer release: Computers
do not auto-upgrade, so every such release would otherwise strand whichever Computer has not
updated yet until a human does. The receiving side parses that payload tolerant of a field it
predates (an unknown key passes through unparsed rather than failing validation) and only bumps
`computerProtocolVersion` for a change the old shape cannot represent at all, such as a renamed or
removed required field. See [Haus CLI §8](haus-cli.md#8-server-api-apiagent) for the Agent
API's version of this rule and `cloud-agent-work-response-schema.ts` for a worked Computer-side
implementation.

A Computer too old for the bootstrap protocol requires local recovery:

```sh
haus-computer upgrade
```

The updater downloads the zip, verifies its digest, unpacks it, verifies the app's signature,
bundle id, and executable identity, stages a copy beside the installed app, and swaps the bundle
directories. It keeps exactly one previously verified app at
`~/.local/share/haus-computer/Haus Computer.app.prev`. A failed swap restores the prior app. The
app path never changes, so the LaunchAgent and the symlink keep pointing at it, and the bundle id
and Developer ID requirement it is granted under stay the same: grants survive updates and
rollbacks. After a successful update, explicit local recovery may restore the previous app:

```sh
haus-computer upgrade --rollback
```

Rollback swaps the two app bundles, restores only code, and restarts the managed service. It never rolls back or snapshots the
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
