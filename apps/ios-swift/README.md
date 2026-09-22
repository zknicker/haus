# Haus iPhone — SwiftUI prototype

This directory is the native SwiftUI prototype for the iPhone client. It keeps
the existing Haus Server, Computer, Clerk instance, and tRPC API intact. It
does not introduce a mobile backend.

The prototype currently proves production Google sign-in, Server discovery,
channels and Agent DMs, real message history, live Chat event refresh, Agent
lifecycle presence, optimistic Chat and Thread sends with draft recovery,
bounded bidirectional history loading, foreground snapshot recovery, Server-backed
People and Computers, the native sidebar and composer, and one sheet-local
settings navigation stack backed by Server profile data.

The package targets iOS 18 and uses Swift 6. The XcodeGen app specification
adds the official Clerk iOS package at the exact, reviewed `1.2.0` release and
links only `ClerkKit` into the application target. It intentionally does not
add an OpenAPI generator or a community tRPC client. `HausTransport` sends
the existing app protocol headers and performs typed tRPC HTTP operations and
SSE subscriptions directly.

## Run in Simulator

A Debug build signs in automatically against a local Haus Server, so Simulator
needs no browser OAuth. See
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

`SimulatorTests` covers text measurement invalidation, shared avatar decoding, and repeatable
transcript rendering benchmarks. The benchmarks use 24 fixed Markdown messages and measure ten
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

The application target under `Sources/HausApp` consumes the local
`HausModels`, `HausTransport`, and `HausUI` products. SwiftUI previews can
use `HausPreviewFixtures` and `SettingsFixtures` without a Server or Clerk
session.
