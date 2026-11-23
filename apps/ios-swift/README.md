# Haus iPhone

The native SwiftUI client of Haus Server. It uses the existing Server,
Cloudflare Access Google sign-in, and tRPC API; there is no mobile backend.
[`specs/ios-app.md`](../../specs/ios-app.md) is the app contract, and
[the rearchitecture plan](../../docs/plans/ios-rearchitecture.md) orders the
work in flight.

The package targets iOS 26 (macOS 26 for `swift test`) and uses Swift 6.2. The
XcodeGen app specification uses Apple AuthenticationServices and Keychain APIs
for native OAuth and secure credential storage. It does not add an OpenAPI
generator or a community tRPC client: `HausTransport` sends the app protocol
headers and performs typed tRPC HTTP operations and SSE subscriptions directly.

## Architecture

| Target | Owns |
| --- | --- |
| `HausModels` | Wire models, procedure descriptors, the transcript cache (`TranscriptStore`), realtime reconciliation, and the per-Server launch snapshot (`LaunchSnapshotStore`). |
| `HausTransport` | Native auth, the tRPC client, and SSE subscriptions. |
| `HausAppModel` | App state by product noun: `ChatsModel`, `TasksModel`, `CaptainsModel`, `WorkersModel`, `DriveModel`, `SettingsModel`, plus the Server lifecycle (`ServerScope`, `ServerLifecycle`) and `ComposerDraftStore`. Tested in `HausAppModelTests`. |
| `HausUI` | Screens and components. It knows nothing of the network. |
| `Sources/HausApp` | The app target. `HausStore` is the composition root: it owns the models, the shared `TRPCClient` and transcripts, the realtime streams, and the memoized Chat projections, and adapts them to `HausUI`. |

- **Models.** Each model owns its reads and applies the realtime effects of
  the events it cares about. A read begins under a `ServerTicket` and lands only
  while that ticket is current and no newer read of the same thing has landed,
  so a late answer after a Server switch writes nothing. Models report writes
  that feed the Chat projections back to `HausStore` through `onChange`.
- **Server lifecycle.** `activeServerID` is persisted per user
  (`ActiveServerPreference`); the active Server is never list order. Each Server
  keeps its own launch snapshot, and a cold launch paints only the active
  Server's. `HausStore.switchServer(_:)` stops the old Server's streams and
  reads, paints the new Server's snapshot, and loads it live. Membership loss
  clears that Server's snapshot and drafts; sign-out clears every Server's.
- **Drafts.** `ComposerDraftStore` keeps drafts and staged attachments above
  every screen, keyed by Server and destination (Chat, Task, or Worker).
- **Not yet split.** Transcripts, history, sends, reactions, and profiles still
  live in `HausStore` extensions, and the realtime streams start from one place
  (`HausStoreEventStreams.swift`) and route each event type to its model.

## Run in Simulator

A Debug build signs in automatically through the local Haus Server's fixture
endpoint, so Simulator needs no Google account. See
[Haus For iPhone In Simulator](../../docs/operations/development.md#haus-for-iphone-in-simulator)
for the stack, build, install, and launch commands. Release builds always use the
production Server and its Google sign-in.

## Local checks

Run the complete package test suite from this directory:

```bash
swift test
```

UIKit rendering checks run in Simulator, because `swift test` on macOS excludes that code:

```bash
xcodebuild -project Haus.xcodeproj -scheme Haus -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:HausRenderingTests -parallel-testing-enabled NO test
```

When `xcodebuild test` hangs (seen with Xcode 27 betas), build the bundle with `build-for-testing`
and run it in the booted Simulator through the platform's `xctest` agent:

```bash
xcodebuild -project Haus.xcodeproj -scheme Haus -destination "id=$UDID" -derivedDataPath "$DD" -only-testing:HausRenderingTests build-for-testing CODE_SIGNING_ALLOWED=NO
PLAT=$(xcrun --sdk iphonesimulator --show-sdk-platform-path)
PROD="$DD/Build/Products/Debug-iphonesimulator"
SIMCTL_CHILD_DYLD_FRAMEWORK_PATH="$PROD:$PLAT/Developer/Library/Frameworks" \
SIMCTL_CHILD_DYLD_LIBRARY_PATH="$PROD:$PLAT/Developer/usr/lib" \
xcrun simctl spawn "$UDID" "$PLAT/Developer/Library/Xcode/Agents/xctest" "$PROD/HausRenderingTests.xctest"
```

`SimulatorTests` covers text measurement invalidation, shared avatar decoding, code-block row
layout, the transcript substrate's update cost and resting positions, and repeatable transcript
rendering benchmarks. The benchmarks use 24 fixed Markdown messages and measure ten
transcript remounts or forty scroll-layout steps per sample. They isolate native layout work from
authentication and network latency; they do not measure device frame rate. The long-history fixture
uses 1,000 variable-length Markdown messages and renders 200 at a time, checking cell reuse while
switching windows and scrolling. Separate tests verify pixel anchoring and a direct distant-message
lookup. Pure model tests traverse all 1,000 messages in both directions and check cursor recovery,
cache eviction, and stale-request rejection. Compare the same
Simulator, build configuration, and fixture before and after a change.

`HausJSON.decoder()` and `HausJSON.encoder()` are the production coding
factories. Haus timestamps are ISO-8601 strings with an explicit offset and
optional fractional seconds; the custom strategy accepts both forms and emits
UTC timestamps with fractional seconds.

Generate the app project with:

```bash
xcodegen generate --spec project.yml
```

`Haus.xcodeproj/project.pbxproj` is checked in and the iOS release lane fails
when a fresh generation does not match it. XcodeGen derives its reference IDs
from element names, so regeneration is byte-identical from any checkout or
worktree and a diff always means a real `project.yml` change worth committing.
Keep it that way: a target source outside this directory must set
`createIntermediateGroups: false`, or XcodeGen synthesizes a navigator group
named after the checkout directory and every ID under it churns per worktree.

## Generated resources

`Sources/HausUI/Resources/channel-icons.json` carries the channel icon
geometry and `ui-icons.json` carries the app icon set. Regenerate them after the
App's icon catalog changes, or after adding a `HausIconName` case:

```bash
bun apps/ios-swift/scripts/generate-channel-icon-paths.ts
```

```bash
bun apps/ios-swift/scripts/generate-ui-icon-paths.ts
```

Both share the converter in `scripts/hugeicon-paths.ts` and differ only in which
hugeicons family and which names they ask for. The channel script reads its
names from `apps/website/src/components/chats/channel-icon-catalog.generated.ts`
and the app icon script reads the names the App's own source imports plus the
raw values of `HausIconName`, so the curation lives in one place and the two
clients cannot offer different icons. The app icon script fails if a name
`HausIconName` asks for is not in the stroke-rounded family.

SwiftUI previews use `HausPreviewFixtures` and `SettingsFixtures`, which
mirror the demo Server's Captains, without a Server or app session.
