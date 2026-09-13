---
summary: Ownership, dependency, navigation, and rendering boundaries for the native Haus iPhone app.
read_when:
  - changing the iPhone app, mobile navigation, or native rendering architecture
  - deciding whether mobile behavior belongs in shared logic, native UI, or an artifact web canvas
  - adding a dependency to apps/ios-swift
---

# Haus for iPhone

`apps/ios-swift` is Haus's native iPhone client. It is a SwiftUI application, not a wrapper around
the website. Android is not a supported target. The app reuses the same production Haus Server,
Computer, Clerk instance, and tRPC procedures; it does not add a mobile backend.

## Architecture

The app is split into four focused layers:

- `HausModels` owns small Codable projections of the existing first-party wire contracts.
- `HausTransport` owns authenticated tRPC HTTP operations, SSE subscriptions, app protocol headers,
  and Clerk session-token access.
- `HausUI` owns reusable SwiftUI shell, Chat, thread, and settings presentation with stock semantic
  controls.
- `HausApp` composes authentication, Server state, event streams, cache-like snapshots, navigation,
  and presentation adapters.

The transport intentionally calls the existing tRPC procedures directly rather than introducing an
OpenAPI mirror or community Swift tRPC dependency. The app uses the official Clerk iOS SDK and
the production-authorized `haus://sso-callback` OAuth return. Chat history remains canonical Server
state. Agent lifecycle events project `working`, `reading`, and `sending` to the same yellow working
presence used by the desktop App; `settled` immediately projects the terminal idle, error, or stopped
state. The app separately subscribes to semantic Agent activity and presents current plus recent work
from the existing `agent.activeActivity`, `agent.onActivity`, and `agent.activityHistory` contracts.

Debug builds mirror the web App's local authentication flow. When launched with
`HAUS_DEV_SERVER_ORIGIN` and `HAUS_CLERK_PUBLISHABLE_KEY`, the app requests the existing
localhost-only `dev.createClerkSignInToken` ticket, activates it through Clerk's native SDK, and calls
the idempotent `server.developmentBootstrap` procedure before loading the ordinary Server list. This
avoids a browser dependency in Simulator without adding fixture auth or shipping a development path in
Release builds. A Debug build remembers the last validated localhost configuration so Simulator,
preview, and rebuild launchers that omit process environment still use the same development Clerk
instance and Server. A later explicit environment replaces that local cache.
The Debug authentication boundary validates that a persisted Clerk session can still issue a token
before loading Server-backed UI. If it cannot, the app renews the session through the same localhost
ticket procedure. A configured local build never falls back to browser OAuth.

Swift settings use one native sheet with one `NavigationStack`. Focused screens push within that
sheet, single-line identity values edit inline, and long-form values use a dedicated editor. All
profile values and avatars originate from Server records; the app must not create mobile-only identity
state. On startup, iOS reports the signed-in Clerk name and email through `member.syncIdentity` before
loading the Server snapshot, matching the web app's default-handle bootstrap. A human edits their
Server-scoped handle alongside their display name. Native validation mirrors
the shared handle grammar for immediate feedback, while `member.updateProfile` carries the active
`serverId` and Server remains authoritative for cross-human/Agent uniqueness. The app also reads
Computers through the existing `computer.list`
contract; an unavailable or role-denied Computer snapshot does not block the rest of Settings.
Server-provided relative avatar URLs resolve against the configured Server origin, including local
development; no Swift surface hardcodes the production host or substitutes local seeded artwork.
An avatar URL names immutable bytes, and `AvatarImageCache` treats it that way twice over: decoded
images live in a process-wide `NSCache`, and the bytes behind them persist across launches in the
cache's own `URLSession`/`URLCache` on disk, fetched with `returnCacheDataElseLoad`. Immutability is
the license to ignore the Server's freshness headers — nothing the Server says can make a stored
avatar wrong — so a cold launch paints identities the human has already seen instead of holding
initials until the network answers.
An ordinary Agent's profile may call the same Server-owned `avatar.generate` procedure as the desktop
App with one short concept, from a capsule directly under the avatar it changes. A factory Agent does
not offer it: the Server refuses to replace Cove's product-owned artwork, so `SettingsAgent` carries
`canGenerateAvatar` from the Agent's `factoryKind` and the App and the phone gate the entry the same
way. Swift keeps the returned image only in the generation sheet until the human taps Save, which
applies it through the ordinary `avatar.set` contract; dismissal discards the preview, and the
existing native photo picker remains the manual-upload path.

The generation sheet leads with the preview at the size and circular shape the product actually draws
an avatar, so what the human approves is what every surface will show. It is an ordinary scrolling
sheet: Cancel and Save are the navigation bar's own actions, Generate is one button inline under the
concept field, and the keyboard toolbar carries Done because a vertical-axis field spends Return on a
newline. Nothing is pinned above the keyboard, so raising it never buries a control. Concept
suggestions live inside the concept card and appear only while the field is empty, so the layout below
the card never shifts, and the only prose under the preview is the wait itself — the screen does not
narrate controls that are already on it. Drawing one avatar takes the image provider tens of seconds: the operation carries its
own request timeout well past `URLSession`'s 60-second default, the wait is marked on the preview
itself, and Cancel stays live for the whole generation — only the save that writes the avatar holds
the sheet open. No Server failure reaches a human as a tRPC string; `AvatarGenerationFailure` maps each
documented outcome — unconfigured provider, capacity, authorization, missing owner, provider failure,
unreachable Server — onto one sentence that says what to do next.

Channel appearance is Server state the iPhone app only renders. A channel's `icon` and `color` reach
`ChatSummary` unchanged, and `ChannelIconBox` draws the chosen glyph in its tinted box everywhere a
channel glyph appears: the sidebar, the chat header, the chat details hero, chat search results, and
the archived list. There is no appearance editor on iPhone. The color presets live in
`ChannelColorPalette` and mirror the App's `channel-color-options.ts`, which stays the source of
truth; a channel stores the preset id, so an unknown id renders the muted default rather than an
invented tint. The glyph geometry is a bundled JSON resource,
`Sources/HausUI/Resources/channel-icons.json`, regenerated with
`bun apps/ios-swift/scripts/generate-channel-icon-paths.ts`. That script reads the icon *names* back
out of the App's generated catalog rather than re-curating, so the two clients cannot drift apart;
it converts hugeicons' SVG elements into path data, and `SVGPathData` parses that into a SwiftUI
`Path` normalized from the 24x24 viewBox. `ChannelIconCatalog` decodes the resource once off the
main actor and caches each glyph's parsed `Path` on first use. Until it lands — and for any name the
catalog does not carry — the box renders the hash, so the glyph never changes size or position.

A stored body's edge whitespace is never layout. `MessagePresentation.body(content:)`
is the single presentation boundary that decides what a row says, and it trims leading and trailing
whitespace and newlines there, so both the row's `content` and its `richSegments` derive from the
same trimmed body — an Agent reply ending in a newline no longer pays a blank text line of gap
before the next row or before its thread card. The persisted Markdown is untouched, and interior
blank lines stay exactly as written.

Image attachments render inline as media tiles rather than file rows: the timeline downloads
through the same authenticated attachment route Quick Look uses, decodes a downsampled ImageIO
thumbnail off the main actor, and keeps the result in an in-memory `AttachmentImageCache` keyed by
attachment id so scrolling and re-renders don't re-download or re-decode; `body` reads the cache
synchronously so a recycled tile renders fully formed on its first frame. The bytes underneath
outlive the process in `AttachmentFileCache`, a disk cache in the user Caches directory keyed by
`(serverID, attachmentID)`, one directory per attachment holding the sanitized display filename
Quick Look derives its title and type from. A Server attachment is an immutable record, so a hit is
answered from disk with no revalidation, and only a miss reaches the transport's temporary download.
The returned URL is cache-owned: consumers render or preview it and never delete it. That inverts
`TRPCClient.downloadAttachment`'s caller-owned temporary file, which the cache takes over on the way
in — the transport still hands out a temp directory, and the cache is now the caller that owns it.
Concurrent opens of one attachment share a single download, and the finished file is moved into
place so a partial write is never observable at the cache path. The cache bounds itself to roughly
256 MB, evicting least-recently-used attachments after inserts; a hit stamps the file's date, so
attachments people reopen outlive ones nobody returns to, and a system purge of Caches costs only
the next open a download. It lives in `HausTransport` beside the filename sanitizer and download
it wraps, while `HausStore` owns the instance: what to cache and when to consult it is app state.
An async decode that lands
after first paint must arrive through `@State` the body actually reads — SwiftUI invalidates a view
only for state its body reads, so bumping a side-channel marker leaves a finished decode painted as
the placeholder forever. `AvatarView`, `AttachmentImageTile`, and `LocalAttachmentImage` all render
from such landed state, with the shared cache as the recycled-view fast path.

How many images a message carries decides its shape (`MessageAttachmentLayout`). One image is the
subject and takes the hero tile. Two or more are a set, and a set reads as one horizontal strip of
uniform fill-cropped squares (`MessageImageStrip`) rather than a stack of heroes that would eat the
screen. The square follows the message column — about three across it with the strip's 6pt gap,
bounded at both ends (`AttachmentImageStripSize`) — and anything past three scrolls sideways inside
a row that is never more than one square tall. Non-image attachments keep their file rows, below the
pictures. The strip is safe inside the transcript for the same structural reason the viewer's zoom is
safe inside its pager: with `scrollBounceBehavior(.basedOnSize)` a strip that fits does not bounce, so
its pan never begins and the table's vertical drag and long-press menu see an untouched hierarchy. The
cell's content view is flipped on Y, which leaves horizontal direction, momentum, and hit-testing
exactly as they are.

The hero tile is the picture at its own size. `AttachmentImageTileSize.fitted` takes the image's
native point size — source pixels ÷ the display's scale — fits it inside 240x180 and never enlarges
it past that, then floors each side at 96pt so a tiny icon keeps a comfortable tap target; the bitmap
fill-crops wherever a floor or the width cap changed the aspect, which is also what keeps a panorama a
readable band instead of a 24pt sliver. Native size has to be measured against the source, not the
bitmap: every decode here is downsampled to a display budget, so `DecodedAttachmentBitmap` carries the
source's pixel size beside the decode, and a 4032-pixel photograph is not mistaken for a 480-pixel
one. A Server attachment record carries no pixel size, so a downloaded image's box is only knowable
with its bitmap: the tile reserves the largest box until then, and an image smaller than it settles to
its own box once, on its first decode. A staged local file has no such gap — it is decoded before its
row lays out — so pending uploads render through the same tile and strip from `LocalAttachmentImageCache`,
which also serves the composer strip and the attachment morph, and the retired pending row's
replacement adopts the identical bitmap by filename and byte size, so a send never reflows.

Transparent images sit on the transparency grid in the transcript too, inside the tile's rounded rect
rather than full-bleed, at a finer 6pt square (`AttachmentImageCheckerboard.thumbnailSquare`) because
the viewer's 12pt grid inside a 96pt thumbnail is wallpaper rather than texture. The tone rule is the
viewer's, from the same `AttachmentImageBackdrop` classification. That classification is stored beside
the decode in `AttachmentImageCache`, so the grid arrives with the bitmap and never on its own: a
recycled tile reads both synchronously and a first decode brings both at once, and there is no frame
on which a transparent image is painted without its ground.

Tapping an image opens the attachment viewer, presented by the screen rather than the row.
Transcript rows are hosted in `UIHostingConfiguration` cells, which own no view controller, so a row
writes an `AttachmentPreview` request into a screen-owned binding and `MessageTimelineView` and
`ThreadDetailView` present from there. The card's motion is UIKit's zoom transition
(`preferredTransition = .zoom`): it grows out of the tapped tile, follows a finger anywhere over the
still-visible Chat as a rounding, shrinking card, and springs back or falls into its tile on
release — interruptible, retargetable, and Reduce Motion aware because UIKit drives it. That
transition needs a live `UIView` for its source, which SwiftUI's `matchedTransitionSource` cannot
reach across a hosting configuration, so each tile publishes an inert anchor into a screen-owned
`AttachmentImageTileRegistry` keyed by attachment id and wearing the tile's own corner radius. The
registry is asked again at dismissal, so a viewer paged to another image collapses into *that*
image's tile — a strip square exactly as a hero tile. A tile that scrolled away answers nil and takes
the system's fade, and so does a strip square scrolled out of its own row: it is still in the window,
just clipped, and the registry judges visibility against every ancestor that clips rather than against
the window alone, because a card growing out of a place nobody can see is worse than no card growing.

The transition's ground is the viewer's ground. For the whole open — including the interruptible
settle that runs on for about a second after the card looks full-screen — the card is a layer
clipped to the display's corner curve, and UIKit paints the still-lit Chat behind it. The default
dim is translucent, so wherever the card's corner fell short of the display's own, a wedge a couple
of points wide low on both sides and along the bottom edge, the Chat leaked through as a grey
hairline that vanished only when the transition ended and the clip came off. The viewer is a dark
room, so `UIViewController.Transition.ZoomOptions.dimmingColor` is opaque black: the gap can only
ever show the viewer's own backdrop. Nothing is delayed or hidden to achieve it, and the Chat is
still visible behind the growing card for the first part of the open.

The viewer opens on the frame of the tap, with no download step: the tile has already cached the
bytes and a decoded bitmap, so the first page paints `AttachmentImageCache`'s thumbnail
synchronously and replaces it with a full-resolution decode — sized to the display's longest side in
pixels — when that lands, held in the bounded LRU `AttachmentFullImageCache` and prefetched for the
adjacent pages. The replacement is a straight swap, not a crossfade: the two are the same picture,
and dissolving one over the other double-composites every partly transparent pixel. Pages are every
image the screen's transcript holds in transcript order, excluding pending messages, and horizontal
paging moves between them. Each page carries its own ground, decided by `AttachmentImageBackdrop`
from a downsampled scan of the pixels rather than from an alpha channel's presence — encoders emit
unused alpha channels routinely. An image with no visible transparency sits on black; one with
transparency sits on a full-bleed checkerboard whose tone is chosen against the artwork's own mean
luminance, so light artwork gets the deep grid and dark artwork the pale one. Chrome is a close
control and a share control over a scrim, and nothing else. Quick Look now serves only non-image
attachments.

Each page zooms. The zoomed view is a `UIImageView` inside a per-page `UIScrollView`
(`AttachmentImageZoomView`) rather than hosted SwiftUI, because a scroll view zooms by transforming
its zoomed view's layer: an image view's layer *is* the decode, so the GPU resamples the bitmap and
the picture stays sharp, where a hosting view rasterizes once at fit and every zoom past that
magnifies the rasterization. `AttachmentThumbnail`, `AttachmentFullImage`, and
`LocalAttachmentImageEntry` therefore carry the `CGImage` beside the SwiftUI `Image` drawn from it.
The full decode replaces the tile's bitmap inside the live scroll view and the reader's zoom and
position survive it: the two are the same picture, and the fitted box is compared with a
point of tolerance (`AttachmentImageZoom.needsRelayout`) so the rounding difference between a
480-pixel thumbnail and a display-sized decode does not reset the page. `AttachmentImageZoom` owns
the arithmetic — the fitted box, the ceiling (always 3x, more for a panorama that a 3x cap would
still leave a sliver, hard-capped at 8x), the double-tap target (fill, never below 2x, never past
the ceiling) and the rect that keeps the tapped point under the finger. Reduce Motion keeps the
zoom and drops the travel to it.

Gesture arbitration is explicit, and it is two rules rather than a pile of recognizer delegates. The
zoom transition installs `_UIContentSwipeDismissGestureRecognizer`,
`_UIParallaxTransitionPanGestureRecognizer` and `_UITransformGestureRecognizer` directly on the
presented hosting view. First, at fit the page's scroll view has content exactly its own bounds and
does not bounce, so its pan refuses to begin: the transition's drag-to-dismiss and the pager's swipe
see an untouched hierarchy and behave exactly as they did before zoom existed. Zoomed, it bounces
and its pan wins. Second, `UIViewController.Transition.ZoomOptions.interactiveDismissShouldBegin`
returns false while any page is zoomed, which is the transition's own door — a drag across a zoomed
image and a pinch back toward fit are the reader's gestures, not a dismissal, and the scroll view
never has to out-argue UIKit's recognizers to keep them. The close control is unaffected because it
dismisses programmatically. The session owns one `AttachmentImageZoomClaim` so a neighbouring page
laying out at fit cannot clear the zoom of the page in hand.

What that buys, in the reader's terms: at fit a pinch out zooms and a pinch in still dismisses
through the transition, because the scroll view is already at its minimum and only rubber-bands
while UIKit's pinch dismissal runs. Zoomed, pans scroll the image with rubber-banding and nothing
dismisses; a pinch back past fit returns to fit rather than dismissing. Paging is Photos': a
horizontal pan scrolls the zoomed image, and only once it is against its edge does a further swipe
page to the next image, which arrives at fit with dismissal live again.

A ```` ```visual ```` fence renders inline, the way it does on the web. `VisualFence` is a literal
port of the shared grammar in `packages/haus-api/src/widgets/visual/contracts.ts` — the same two
patterns, matched over UTF-16 so cursor arithmetic lands where JavaScript's does — and it runs once
per message, in `MessagePresentation`'s initializer. A message therefore carries two bodies: `prose`,
every text segment concatenated and trimmed into the one block that sits above the cards, and
`visuals`, the fences in the order they were written. `richSegments` parse from `prose`, so a fence
can never leak into the transcript as raw HTML, and neither can it leak into a preview line —
`RichMessageParser.oneLinePreview` substitutes each fence with its fallback text (explicit title,
else the document `<title>`, else the first heading, else "Visual"). The Nth fence is a visual's
identity; content only ever appends while a reply streams, so ordinals never reorder.

`VisualSandboxDocument` is the same document the web builds: the same CSP with the same pinned
Chart.js CDN entry, the same base stylesheet that gives bare `<table>` markup the app's table look,
the same host-owned size reporter, and the model body last so a partial one still parses. The
opaque origin the web gets from a sandboxed iframe comes from `loadHTMLString(_, baseURL: nil)` on a
non-persistent data store; the main frame scrolls nothing, previews no links, and its navigation
delegate allows the one load it started and cancels everything else — an http(s) link the model
wrote opens in the system browser instead. Because the frame cannot scroll, the shared size reporter
wraps every `<table>` in an `overflow-x: auto` scroller before its first report, on both platforms:
inner overflow elements still scroll in WKWebView with `scrollView.isScrollEnabled = false`, so a
wide table pans horizontally inside its card while a vertical drag still scrolls the transcript.
Table layout itself is untouched, so a narrow table still spans the card, and the caption sticks to
the scroller's left edge — shrunk to its content, because a table-wide caption box has nothing to
hold on to — so a table's label stays readable while its columns pan. There is no browser to snapshot tokens off, so the published list
(`apps/website/src/agent-html/tokens.ts`) is resolved from the app's own stylesheets at build time:
`bun run gen:ios-tokens` walks `global.css`'s token-declaring imports in their import order —
the three feature sheets (`slot-text`, `chat.css`, `shell.css`) declare no published token and are
named as exclusions in the generator — folds `var()`, `oklch()`,
`color-mix()` and `calc()` down to literal values, and writes `AgentHtmlTokens.generated.swift` —
40 entries per scheme, the 38 published names plus the two derived chart-chrome declarations, with
the host-role remaps already applied. A bun test regenerates in memory and fails on any drift,
so the table cannot fall behind the stylesheets unnoticed. The card picks its scheme from
`@Environment(\.colorScheme)`, so a theme flip rebuilds the document and the frame reloads.

One of those 40 values is then deliberately overridden, and it is the only place the iOS card
diverges from the web's. The web ties `--app-ui-font-size` to the web chat's own 14px body, so a
card reads at the size of the transcript around it; the iOS transcript is SF `.body`, 17pt at the
default Dynamic Type size, and the snapshotted 14px reads visibly small beside it. So
`VisualTypography` resolves `--app-ui-font-size` from `UIFont.preferredFont(forTextStyle: .body)`
for the card's current `dynamicTypeSize`, and `VisualSandboxDocument` emits it after the generated
table so source order settles the conflict. An accessibility size therefore scales the card with the
transcript, and changing it rebuilds the document and reloads the frame the same way a theme flip
does.

Height is the screen's, not the card's. Transcript rows are hosted in `UIHostingConfiguration` cells
inside the flipped table, which re-hosts a row only when state above the table changes
(`TranscriptListView.reconfigureVisibleRows`, driven from `updateUIView`) — a height measured inside
a cell has nowhere to go. So `VisualHeightRegistry` holds measured heights and collapse state keyed
by message id and fence ordinal, exactly as `AttachmentImageTileRegistry` holds tile anchors, and
`MessageTimelineView` and `ThreadDetailView` each own one. The screen's own body reads the
registry's `revision`, which is what turns a frame's report into a re-render, a reconfigure, and a
row at its new height. The clamps are the web's: 240pt reserved until the first report, [120, 1600]
after it, collapse past 420pt behind a fade and a Show all footer. The first measurement is never
animated — it is layout, not a transition — and later ones ease over 200ms.

An Agent-created Agent reaches the transcript as the creating Agent's own sentence and nothing else.
The `--say` text is the Message body, so every surface that renders a body — the Chat transcript and
a Thread's anchor — reads the same trimmed text with the ordinary mention resolver, and the `@handle`
the announcement is required to carry resolves through `RichMessageParser` into the same reference
chip any other Agent mention gets. There is no provenance row and no `Open` control: the way to the
new Agent is its mention, and an Agent profile on the phone is reached through that Agent's own Chat,
whose details sheet pushes the profile.

The `.agentCreated` body case stays as provenance, and `HausStoreMessageLoading` uses it to notice
an Agent the directory does not list yet and refetch. Transcript rows are hosted in
`UIHostingConfiguration` cells, which do not inherit the enclosing SwiftUI hierarchy's custom
environment values, so row-level actions travel as explicit closures through `MessageTimelineView`
and `ThreadMessageRow`, never through `@Environment`.

The app deploys to iOS 18 and progressively adopts iOS 26 Liquid Glass for functional
chrome. System navigation and sheet controls inherit the platform treatment; custom menu, search,
and composer controls use native glass only on iOS 26 and retain an opaque semantic fallback on older
systems. Transcript rows, Thread previews, Task metadata, sidebars, and settings groups stay opaque.
Glass is a navigation hierarchy, not a general content-card material.

Every touch answers. On iOS 26 a live glass surface owns its whole press response — fill, rim, and
the press-driven bloom — so nothing is ever drawn over glass: an overlaid stroke or shadow cannot
travel with a flexing shape, and every past radius or stranded-rim bug came from trying. Controls
that draw their own content instead of wearing glass — drawn circles, cards, list rows — take
`PressableButtonStyle`: compact controls scale toward the finger and full-width rows highlight,
because a row that shrinks reads as breakage. `.plain` on an interactive element is a defect, not a
neutral default. The chat transcript passes under the chrome at both ends — beneath the composer's
glass via a bottom safe-area inset, and beneath the `ChromeHeader` row via a top safe-area *bar* —
and dissolves toward the top so iOS 26 chrome stays legible over moving content.

That dissolve is product-owned: `transcriptTopDissolve` in `ChromeHeader.swift` masks the
transcript's rows out across the reserved top region, at roughly a seventh of their contrast behind
the chrome row and gone by the status bar. The system's `scrollEdgeEffectStyle` cannot do this job
for the transcript, because the transcript is not a SwiftUI scroll view: `TranscriptListView` wraps
a flipped `UITableView`, and the system effect derives its paint region from safe areas the flipped
table does not carry — enabling it washed the entire viewport, so the list hides both UIKit edge
effects explicitly. A mask keeps the one property the system effect was prized for: it dissolves
rows to transparency over the real backdrop, so dark mode needs no re-tuning. The ramp still runs
across `HausChrome.scrollEdgeRunway` below the chrome row — the runway is tuned so the first row
below the chrome stays fully crisp. `chromeBar` remains the one place that decides bar-versus-inset
for the chrome itself (`safeAreaBar` on iOS 26, a plain inset before it) and other scrolling
surfaces still earn the system effect through it.

The composer keeps the plain inset and a hard edge on purpose: the clearance it reserves is the
transcript's own scroll bound, so no sharp row ever reaches past it, and the rows that reach its
glass are already being refracted. `HausChrome.transcriptBottomRunway` is the breathing room the
transcript holds above that clearance — a scroll bound too, not composer padding — and it runs wider
than the inter-message rhythm because the composer's glass rim sits inside the region it reserves. The Thread transcript wears the same mask under its system
navigation bar.

Every floating chrome control is one control. `GlassChromeButton` owns the 44-point circle, the
22-point app icon, and the glass or material treatment, and `ChromeHeader` owns the 56-point
chrome row that positions leading, centered, and trailing chrome. Call sites choose a glyph and a
label; they do not restyle the control or set their own geometry. The sidebar and the Chat canvas
both open with that same row, so a chrome button in either pane lands on one centerline. A
fixed-size chrome circle must not be placed in a system navigation bar, which compresses it into an
ellipse: a screen that wants the chrome circle supplies its own `ChromeHeader` and hides the
navigation bar, as the Chat shell root does. Pushed screens keep the standard navigation bar with
its system back button and text actions.

One navigation stack answers to one bar decision, and inside a sheet that is not a preference. A
stack whose root hides the bar and whose pushed screens show it lays the incoming screen out against
the pre-push top safe area: the pushed bar and its content drew a grabber-height too high for the
whole transition, then dropped into place a frame after it ended. The Chat shell survives the same
toggle only because a full-screen root's top inset does not change when the bar appears. A sheet's
stack therefore keeps the system bar on every screen, root included — the Settings root carries an
inline "Settings" title with a trailing close button, which lands on the same rail and centerline as
the back chevron of every screen it pushes.

App iconography is hugeicons stroke-rounded, the same family the App's React surfaces import, so the
two clients draw one vocabulary. It renders through the machinery the channel glyphs already used:
`hugeicon-paths.ts` converts a family's SVG elements to path data, `HausIcon` draws a name at a
point size, and `HugeiconGlyph` strokes or fills the normalized unit square. The two resources differ
only in family and in which names they ask for. `generate-ui-icon-paths.ts` reads the names the App
imports *and* the raw values of `HausIconName`, and fails if a name the phone asks for is not in
the family — without that check a typo renders an invisible icon. `ui-icons.json` is small enough to
decode on first use, unlike the 1.8 MiB channel catalog, so an icon never appears after its row has
drawn.

The Haus ghost is the brand mark, and the App owns its artwork. `HausGhostPaths` parses the App's
own `BODY_PATH` and `EYES_PATH` strings character for character through the same `SVGPathData`
reader the channel glyphs use, `HausGhostPalette` carries its colors and stop tables, and
`HausGhostCanvas` paints the faux-glass stack — halo, interior scatter, drifting color mesh, colored
rim, white dome, speculars, hairline edge, eyes — into a `Canvas`. `HausGhost` is the view, with the
App component's API: `fill` (`.solid` tints the body in the current foreground with the eyes punched
out even-odd; `.iridescent` is the glass), `animated`, `tempo`, and `size` as the rendered height.
It is drawn three places: the sidebar's Inbox row, the sign-in screen, and the opening frame the app
holds while authentication resolves. The retired `HausBrandMark` and its `HausMark` imageset are
gone — that asset was an older eyeless silhouette from a different viewBox.

Two things in the port are carried differently from the App's SVG, and only these two. SVG masks by
luminance and `Canvas` masks by compositing, so each mask is drawn into its own layer and punched
through with `destinationIn`, its gray ramp read as alpha. That is the same number the browser
arrives at for an opaque neutral ramp, so only the mechanism differs. And `feGaussianBlur`'s
`stdDeviation` is passed straight to `GraphicsContext.Filter.blur(radius:)`, which takes a standard
deviation too; every radius scales with the mark, so a 22-point row blurs by 22/204ths of what a
full-size mark does.

Only the three mesh blobs move, each on an elliptical loop stepped onto one shared 0.3-second grid
(`HausGhostDrift`) — 6s/5 steps, 8.4s/7 reversed, 4.8s/4, and `lively` scales the periods and the
grid together. The grid is the whole performance story: the blobs drift inside a Gaussian blur
nested in two masks and a clip, so what costs is the number of frames the mark redraws on, not how
many blobs moved in one. `TimelineView` ticks the canvas on exactly that grid and emits a single
entry when the drift is stopped, which it is under Reduce Motion and whenever the scene is not
active. Every offset is a pure function of elapsed seconds, so a pause freezes the mark where it
stands instead of snapping it back to the loop's start. The drawer is the third pause, beside
Reduce Motion and the scene phase: the sidebar stays mounted behind the canvas, so the shell hands
the row `ghostPaused` whenever no sliver of the drawer is showing — mid-drag counts as visible —
and `HausGhostDriftClock` subtracts the slept stretch so reopening resumes the held frame.

SF Symbols stay wherever the system owns the grammar: inside `ContentUnavailableView`, `Menu` labels,
and `Label`, and for navigation backs, disclosure chevrons, picker chevrons, and selection
checkmarks. Those read as platform affordances rather than product iconography, and a custom glyph
among a system menu's own rows looks foreign. Two things an SF Symbol does for free that a path does
not: track the text baseline, and scale with Dynamic Type. `HausIcon` does neither, so every caller
hands it a box, and that box is what aligns it beside text.

A hugeicons name describes a shape, not a concept, and does not map onto an SF Symbol name — the
family numbers its arrows by form, so `ArrowUp01Icon` is a bare chevron and only `ArrowUp02Icon`
carries a shaft. Match a replacement by looking at it. The family also draws at a 1.5 stroke on its
24pt grid, which reads thinner than the medium-weight symbols it replaced, so call sites pass a
heavier weight; that weight is the knob to reach for when an icon looks faint.

On iOS 26 that circle is the system glass button style, which owns the press treatment end to end.
The control draws no rim or shadow of its own there: a hand-drawn edge does not travel with the
glass as it answers a touch, so a press left the stroke stranded inside the pressed shape and the
shadow pinned to the resting size. The style also owns its padding, so the label is inset by that
amount to land the drawn circle back on the shared diameter. The pre-26 fallback is
`.regularMaterial`, which has neither an edge nor a lift of its own, and still draws both.

A chrome button's shadow spills past the edges of whatever contains it. The sidebar is composited
with `.mask()`, which rasterizes into a buffer sized to the sidebar's own resolved height, so that
spill survives only inside real layout height: `ChatSidebarView` reserves `shadowBleedHeight` of
inert space at both ends and `HausShellView` grows and re-anchors the proposed height to match.
Without the leading reservation the search button's shadow ended at a hard line on the sidebar's
top edge.

Dismiss controls follow one vocabulary. A form that creates or edits a draft uses Cancel plus a
confirming verb (Create, Save); an informational sheet with nothing to confirm uses Done; the
Settings sheet root uses an X in its navigation bar, which the system draws as the same glass circle
it gives the back chevron; and a pushed screen uses the system back chevron rather than an explicit
control.

Dark mode cannot use the canvas shadow to separate an open drawer from the sidebar, because a black
canvas over a black sidebar has no edge. The veil painted over the slid-aside canvas therefore
reverses by scheme: light mode fades the canvas toward the background and reads its edge from the
shadow, while dark mode lifts the canvas to an elevated surface so the sidebar stays the recessed
plane. `HausDrawerVeil` owns that rule.

The sidebar drawer tracks the finger. A horizontal drag anywhere on the Chat canvas attaches the
canvas to the finger, moves it one to one inside its travel, and stops at both ends because nothing
sits behind the canvas past either edge; `DrawerInteraction` owns that math and its release decision,
so a flick settles the drawer by velocity and a slow drag settles it by position. The drag uses a UIKit pan recognizer so it can claim
only horizontal movement, cancel an in-flight vertical timeline scroll once it begins, and leave
horizontally scrollable content such as staged attachments alone. There is no edge-only hit zone and
no all-or-nothing open. Selecting a Chat is the only action that closes the drawer; every sidebar
entry point that presents another surface — Search, Tasks, Settings, Archived, New channel — leaves
the drawer open behind it, so dismissing returns to the open drawer and no presentation ever runs
against the closing spring.

The Chat canvas is keyed by the selected destination: a Chat switch remounts the screen, so each
Chat lays out bottom-anchored and fully formed before the drawer reveals it, and no scroll offset or
screen-local state crosses between Chats. The swap and the closing slide are two events and must land
in two frames. The drawer's geometry — offset, corner radius, veil, shadow, and the pan — belongs to a
container that outlives the keyed screen, because a view that did not exist a frame ago has no offset
to animate from. That container is not enough on its own: SwiftUI places a view inserted *inside* an
animating transaction at that animation's destination rather than at its in-flight geometry, so
selecting a Chat and closing the drawer in the same turn pinned the incoming transcript at the closed
position while the canvas frame slid over it — a wipe across a stationary Chat, with each line
uncovered from its right end. `selectDestination` therefore commits the selection and defers
`setDrawer(open:)` to the next main-actor turn, so the spring animates a screen that is already there
and the Chat travels with the drawer, its leading edge fixed to the canvas's. That hop is the
earliest legal one — SwiftUI merges every mutation made in one turn into a single transaction — so
the hold is one frame plus the new screen's first layout and cannot go lower. What keeps it from
reading as a beat is the veil: the veil leaves by removal, never by animating to clear, so which
transaction the removal lands in decides what the user sees. An interactive close (drag, veil tap,
header button) removes it inside the closing spring — the fade that reads as the canvas lifting off
the same Chat — while a Chat selection drops it unanimated in the frame the new screen mounts, so
the incoming Chat arrives fully lit and the slide is the whole transition. `HausDrawerClose`
carries that distinction and `HausDrawerVeil.isPainted` applies it. Anything that must survive a switch — the composer draft,
the staged attachments and their in-flight preparation, a pending message reveal — is owned by the
shell per destination and reaches the screen as a binding or by reference; a remount resets only
presentation state (an open portal, a frozen keyboard inset, an error notice). A page arriving for a Chat that was showing nothing is that Chat's first paint and settles
at the bottom without animation; only genuine appends animate.

Both transcripts — the Chat timeline and a Thread's replies — sit on `TranscriptListView`, the
flipped-table substrate in `HausUI/Platform`: a `UITableView` scaled by `-1` vertically, each
cell's `contentView` scaled back, data reversed so the newest item is row zero. This is the
mechanism production chat clients use instead of SwiftUI's scroll-position primitives, and it was
adopted after those primitives lost three device regressions in a row. SwiftUI's
`defaultScrollAnchor(.bottom)` + `ScrollPosition(edge:)` resolve the bottom against numbers that
are still moving on a first layout — `LazyVStack`'s estimated content height and the anchor's
inflated top inset — and every corrective assertion re-enters the same moving layout: the
transcript stranded blank until dragged, strobed at frame rate while a rescue fought the
estimation, and stranded again when the rescue was deferred and retried. Inversion removes the
contract those heuristics were compensating for: the resting state is the scroll view's own clamped
origin (`contentOffset == -contentInset.top`), so a stranded viewport is unrepresentable, a first
page lands settled with no assertion, measurement error is pushed to the far (visually top) end
where it is invisible, history prepends grow the table beyond the viewport without moving it, and a
transcript shorter than the screen sits on the composer because rows stack from the table's origin.
A growing bottom inset — the composer expanding, the keyboard rising — lifts a resting viewport
with the newest message still visible, which is the keyboard behavior the product wants, for free.

What remains above the substrate is intent, not position management. `TranscriptListUpdate`
classifies each snapshot change exactly (refresh, append, prepend, reset — pinned in
`TranscriptListUpdateTests`), `MessageTimelineTailScroll` / `ThreadReplyReveal` still decide what an
append may do to the viewport, and reveals arrive as one-shot `TranscriptReveal` tokens. The list
passes the previous snapshot to append policy: a Thread's anchor and task metadata are not prior
replies, so its first fetched reply page settles immediately rather than animating through history.

Whether the newest item is on screen — the answer behind the scroll-to-latest chevron — is published
only from settled geometry. A landing transcript passes through intermediate offsets inside one
runloop turn: an inset grows before the resting offset is reapplied, an append jumps the viewport
before releasing it toward rest. Every trigger therefore coalesces into a single deferred reading per
turn, taken after that turn's geometry stands, and deduped against the coordinator's own last report
rather than the SwiftUI binding — the binding write is asynchronous, so a second reading in the same
turn would compare against a value the first has not delivered and swallow its own correction. A
programmatic settle reports its destination, not the offsets it is travelling through, and the rule
itself is `TranscriptNearNewest`, pure so the UIKit path and its tests share one definition. That
destination is the coordinator's own answer too: while a settle is in flight the transcript counts
as showing its newest item, so an inset write landing mid-travel re-rests the viewport and an
append still animates rather than reading the offset it is passing through as scrolled away. The
travel itself stays the scroll view's own `setContentOffset(_:animated:)`, because that is what lays
the table out frame by frame; a `UIView.animate` block on `contentOffset` looks identical, writes the
destination offset immediately, and leaves everything the viewport passes over blank. Each settle
therefore holds a single-use `SettleTicket`, closed by whichever arrives first —
`scrollViewDidEndScrollingAnimation`, or a deferred fallback armed just past UIKit's own duration for
the flights that never report one, such as a mid-flight inset write cancelling the travel — while a
drag closes it on the spot and orphans both. Without that guarantee a cancelled settle would keep
publishing "showing the newest item" over a viewport stranded anywhere, which is the stale chevron
this contract exists to prevent.

The flip has known UIKit seams, all owned inside `TranscriptListView`: the system scroll edge effects are
hidden (they compute their region from safe areas the flipped table lacks and wash the viewport —
the dissolve is `transcriptTopDissolve`), the opening entrance runs as a UIKit animation because a
SwiftUI opacity animation over a platform view can freeze mid-flight, hosting-configuration cells
carry `minSize` zero so continuation rows keep their tight rhythm, and long-press menus are the
table delegate's, with an upright `layer.render` snapshot as the lifted preview, because a
context-menu lift of a flipped cell renders upside down.

Cloud agents use the same Server records as the web App. Settings → Cloud agents lets an Owner or
Admin inspect, connect, or disconnect Cursor on a selected Computer. Connecting opens the provider's
sign-in browser on that Computer, not on the phone; iOS never receives the credential.

Each delegation's typed Message body supplies its inline cloud-agent card in a Chat or Thread.
The parent Chat's preview lists the Thread's cloud agents from `cloudAgentWork.listForChat`; the
whole preview opens the Thread. Cards show status, repository, branch, available PR/diff evidence,
external links, and cancellation inside the Thread for Owners/Admins. Missing diff evidence stays absent, not zero.
`cloud-agent-work.updated` refreshes the loaded Thread and parent Chat through the normal durable
event/reconnect path. Cards scroll with their Messages and follow-ups update the same card.

An anchor message owns one unboxed Thread ingress, joined to its avatar rail by a rounded connector.
The reply count and chevron lead, followed by the latest Server-projected reply's avatar, author,
and one-line snippet. Task status and cloud-agent status remain secondary notes. The whole ingress
opens the Thread, including before a Task's first reply. Every row uses an 18pt identity mark.
Reply, Task, and cloud-agent rows enter, exit, and swap with a 220ms slide/fade; Reduce Motion uses
a 150ms crossfade. Cloud-agent activity timestamps do not trigger swaps. The count stays in place. The anchor
message remains the task title and is never duplicated inside the ingress.

Chat honors the App's own task visibility rule (`TaskVisibility.visibleInChat` in `HausModels`,
applied through `ThreadPreviewProjection.ingressTask`). A task an Agent claimed for itself states
nothing in Chat unless the reader asked for it: no note, no ingress, no reserved space. A Thread
that filled up under a hidden claim keeps its ingress and reads as the ordinary conversation it is,
and a task a human composed or converted always states itself. The preference is per device, like
appearance — `@AppStorage` under the App's own `haus.chat.showTasks` key — and Settings →
Preferences → **Show tasks in chat** is the switch.

The Task list reads the Store's own Server-wide lens rather than a second copy of the same query,
so a durable `task.created` or `task.updated` repaints it without a pull to refresh; only the
widened background lens is the screen's, because it is a different question the reader asked for a
moment (`@State`, not a route). Its one control states what the default lens hid — `N background` —
and stays away on a Server with no background claims; widened, it states what it is showing and
keeps stating it at zero, because on iPhone it is the only way back out. Background rows there wear
a muted `background` word rather than a chip.

Tasks are Server work, not a settings screen. The sidebar opens the Task list as a push on the root
navigation stack, and opening a Task row pushes its Thread on top of that list, so Back walks Thread
→ Task list → Chat canvas. Opening a Task leaves the canvas selection alone — its route carries the
parent Chat id and the Task carries the child Chat id, so selecting the parent would mark a channel
the user never visited as read and strand them there once the Tasks list pops. A pushed Thread owns
the open Chat while it is on screen, and the shell's Chat selection resumes ownership when it pops;
the covered canvas Chat stays named so its page keeps refreshing underneath, but read
acknowledgements belong to the deepest surface alone.

The Inbox is the phone's landing screen and the sidebar's anchor. It mirrors the App page section
for section — header, **Active this week**, **Needs you**, **Conversations**, **Happening now** —
because [that page's order is the contract](../features/inbox.md), and it renders from the Store
snapshots below rather than from reads of its own: `HausUI/Inbox` owns the row projections and the
page, and `HausApp/InboxPresentationAdapters.swift` is the only place the Store's records become
them. A section renders nothing at all until its read lands, so an unsettled section is blank rather
than an empty box that fills a moment later; **Needs you** waits for both the Asks and the Tasks,
which is the same pair the sidebar badge waits for.

It is the canvas itself, not a push on the root stack. A cold start shows the Inbox page as the
shell's canvas — no navigation bar, no title, no Back chevron, because there is nothing behind a
landing screen to go back to — and the page's greeting and date are its first content. The Chat
canvas and the Inbox take turns in the one canvas slot, so the drawer belongs to the slot rather
than to either of them: the leading chrome button sits where it sits on a Chat screen, and the veil
and the edge pan are the same ones. `showsInbox` is App-owned state (`AuthenticatedHausView`) and
the shell clears it whenever a Chat is selected; the sidebar's Inbox row sets it back. The last-open
Chat is still restored for the drawer's selection, and selecting one swaps the canvas the way it
always did. `HausRootRoute` therefore carries only `.tasks` and `.thread`. An Ask row and a Cloud
Agent work row each push the Thread they hang off, carrying the conversation's Chat id and the anchor Message — the same pair a Thread
composer sends to — and leaving the canvas selection alone for the same reason a Task does. Two rows
land somewhere the App does not send them, because the phone has nowhere else: a stalled claim opens
the Task list rather than the task, since the native lens has no per-task focus, and an Agent in
**Happening now** opens that Agent's DM rather than a profile page. The sidebar's first row is the
Inbox, wearing the iridescent Haus ghost at 26 points in the same glyph
column every other row uses — a deliberate exception to the column's 26-point boxed glyphs, because
this mark is the logo rather than a screen's icon, and it grows inside the shared column so the
`Inbox` label stays on the `Tasks` label's edge. It marks
`needsYouCount` with the unread dot the Chat rows wear — absent at zero, which is also
what it reads while the count is still unknown. Its mesh drifts, and drifts quicker while an Agent
on this Server is working: `HausStore.agentActivityGhostTempo` resolves the App's own rule through
`HausGhostTempo.resolve`, and reads one stored bit rather than the activity dictionary
`agent.onActivity` rewrites on every tool call, so a busy Server does not invalidate the shell.

What the Inbox stands on is Server-wide and Store-owned rather than screen-owned. `HausStoreInbox`
holds four reads — the viewer's open Asks (`ask.listOpen`), the default Server-wide Task lens
(`task.list`), the Cloud Agent work running right now (`cloudAgentWork.listActive`), and the
Server's token-usage snapshot (`stats.live`) — and each stays nil until its first load. That nil is
load-bearing: `needsYouCount` answers zero until both the Asks and the Tasks have landed, because a
badge that counted Asks now and Tasks a moment later would tick upward in front of the reader; ask
`isNeedsYouCountReady` to tell "nothing waiting" from "not yet known". The count is the App's own
selector ported whole (`InboxNeedsYou` in `HausModels`): every open Ask addressed to this human,
plus every stalled claim — `claimed`, `in_progress`, `tracked`, and not `live`, each clause
load-bearing. Durable events refresh only what this client already holds, the way the App's
invalidation only refetches a live query: `ask.updated` reloads the open Asks beside the transcripts
naming the Ask and its parent, `task.created` and `task.updated` reload the Server Task lens beside
the affected Chat page, and `cloud-agent-work.updated` reloads the active work list beside its own.
A failed Inbox read keeps the previous snapshot and is logged — a stale row is honest, while a
Chat-level send alert raised by a background read is not.

An Ask is answered exactly as the App answers one, so there is no answer procedure: an ordinary
`chat.send` carrying the chosen option, addressed to the conversation's Chat id and to
`OpenAsk.threadAnchor`, which is the shared `openAskThreadAnchor` rule — the Thread's own anchor
when the Ask was posted inside one, and the Ask's own Message when it was not. `OpenAsk` names the
Channel or DM, never a Thread, so a row carries the same pair a Thread composer sends. An Ask's
`options` are up to four short replies, the first the Agent's recommendation, and no options at all
is an open question whose answer is whatever the human writes. The Ask reaches a transcript as the
`ask` Message body beside that row.

That contract is why the phone has no Ask screen: opening an Ask is opening the Thread its answer
is written in. `HausStore.threadSelection(openAsk:)` is the one entry point a surface that lists
open Asks pushes, and it builds the ordinary `.thread` route out of `AskAnswerRoute` — the
conversation's Chat id and the Ask's Thread anchor, never the Thread's own Chat. The Thread
composer already sends exactly that pair, so the offered options ride the send the screen has: the
open Ask's options sit as capsule buttons directly above the composer (`AskOptionsRow`), in the
order the Agent wrote them with the recommendation first and prominent, and pressing one sends its
text verbatim as the human's own reply. One press spends the whole row, because the Ask leaves only
when `ask.updated` refetches `ask.listOpen` — nothing here is optimistic — while a failed send
spends nothing. An Ask with no options offers no buttons at all; the composer is the whole answer.
The options row is a sibling above the composer, never a control inside it: the composer is a
custom surface with its own glass and attachment portal.

The Ask itself reads on its Message as `AskMark`, one fact per line: while the Ask is open, the Ask
glyph, the word `Ask`, the addressee's face and name, and the open ring; once it is settled, the
glyph, the green check, and `Answered by <name>` alone, because two names on one phone line truncate
both and the reader learns neither. It is drawn in the same annotation grammar as the task chip,
under the body in both the Chat timeline and the Thread. It is
projected from the `ask` Message body through the one actor resolver every other row already reads
(`HausStore.askPresentation`), so an answered Ask still reads correctly long after its options
stopped mattering.

In the Chat timeline the marker is also the way in, taking the Thread ingress card's own press
feedback and route. An Ask nobody has replied to yet shows no ingress card, so without that the
Inbox was the only surface that could open it. Inside a Thread the marker is inert: the screen it
would open is the screen it is on.

A Task lens widens through `loadTasks(includeBackground:)`, and
a Server-wide read keeps `task.list`'s `backgroundCount` on the Store so a surface can say "N
background" without a second round trip. The week behind "Active this week" is sliced per Agent out
of that one usage snapshot (`AgentTokenUsage.summarize`, the App's `summarizeAgentTokenUsage`) on
UTC days, because ranking a week is a question about every Agent at once and a per-Agent read was
never its shape. A Chat row's quoted last line is Server's own `lastMessage` projection and stays
raw Markdown; collapsing it to one plain line is the reader's job.

Swift optimistic Chat and Thread rows remain app-local and keyed by the client nonce. Thread replies
use the canonical parent Chat plus anchor-message contract. A failed mutation removes its optimistic
row and restores the exact draft, while a successful row remains pending until a refreshed Server
page contains the matching nonce. On returning to the foreground, the app keeps cached presentation
visible, refetches its Server snapshot in one gathered pass — applied as a single repaint, with
every Chat surface on the stack refetched eagerly: the deepest open Chat first, then the canvas Chat
underneath it, so popping a Thread reveals a parent that is already fresh instead of one round trip
stale; the event walk and `openChat` cover the rest — then restarts live Chat and Agent lifecycle
streams. A voluntary refresh keeps the connected state;
offline is what a failed refresh or a broken stream reports. Live SSE Chat events coalesce for a
short window (`ChatEventCoalescer`) before the existing batch applier runs, so a burst lands as one
refetch fan-out rather than one per frame.

The Chat projections the shell renders every frame — message rows and the destination list — are
memoized in the Store behind a structural invalidation contract: their input fields are stored
privately in `HausStore` and published through accessors whose setters drop equal-value writes and
retire exactly the cached projections that field feeds. A new field a projection reads must join
that "Projected Server state" block, and a projection must read its observable inputs before its
cache check so a cached answer leaves the calling view subscribed to exactly what a rebuilt one
would. Optimistic rows adopt the canonical Server message id from the send receipt, so a pending
row's presentation id is a real Server id from that moment and its ForEach identity never changes
when the durable row arrives. Chat and Thread timelines page older history through the existing
`beforeSequence` cursor, merge overlapping pages by message id in Server sequence order, and preserve
the prior top row as the scroll anchor. The Swift prototype keeps one in-memory cursor per active
Server, walks `chat.events` from that cursor on reconnect, and refetches loaded affected Chat pages.
The SSE connection is established before recovery, while buffered live events are consumed only after
the walk completes, so events arriving during recovery are not missed. A cold start seeds the cursor
from `chat.eventHead` after refreshing the Server snapshot;
cursor state is intentionally process-memory only for this prototype.

Agent creation stays inside that same canonical message pipeline. `HausModels` decodes the
`agent-created` body on each message, but the timelines draw nothing for it: the announcement's own
`@handle` mention is the way to the new Agent, so the body is provenance and a directory-refresh
trigger. There is no review sheet and no client-side creation: the Agent already exists by the time
the message arrives. An unknown body kind degrades to `.unsupported` and reads as its plain content.

The directory refresh is the one place the phone differs from the App. This client subscribes to
`chat.onEvent`, `agent.onLifecycle`, and `agent.onActivity` only — it has never consumed
`server.updated`, so the event the App uses to invalidate `agent.list` after a creation does not
reach it. The body itself is the notice instead: `message.created` refetches the affected loaded
page, and `applyChatEvents` then scans those pages for an `agent-created` body naming an Agent the
directory does not hold and refetches the directory once when it finds one
(`HausStoreMessageLoading.swift`). What keeps that from becoming a standing refetch is that a body
reading retired is skipped: the body is projected from the live `agents` row on every message read,
and the pages scanned here were refetched moments earlier in the same batch, so a retired Agent's
body already says retired and is never mistaken for a stale directory. The one case that does repeat
is an Agent whose Computer was removed — `computers/service.ts` nulls `computerId` without retiring,
which drops the Agent from `agent.list` while it is still live — and that costs one extra directory
read per batch touching its Chat until the Computer returns.

The mark reads from whichever of its two sources currently knows the Agent. Server projects the live
`agents` row into the body on every message read, so the body is true when the page is fetched and
then ages with it; the directory is refetched on its own schedule. `PresentationAdapters` therefore
prefers the directory entry for the name, the face, and liveness, and falls back to the body when the
directory does not hold the Agent — absence is not evidence of retirement, for the removed-Computer
reason above.

Utility navigation stays on the same Server contracts and Store cache. One search surface serves the
active Server, reachable from the Chat header and from the sidebar's own chrome button. Like the
desktop command menu, it unifies in the UI rather than in the API: chats match locally against the
Store's chat directory and appear immediately, while messages resolve through `chat.search` behind a
debounce and each result is resolved against the canonical chat directory. A Server search failure
degrades the message section alone and leaves chat matches usable. Selecting a message result selects
its Chat, scrolls the loaded page to that message, and highlights it briefly; a result whose Chat has
left the directory reports a failure alert in the sheet instead of dismissing into an unrelated Chat,
and a message outside the loaded pages is not chased with a speculative fetch. Archived channels load
through `chat.listArchived` and restore through `chat.unarchiveChannel`, and a successful restore
dismisses the sheet and selects the restored channel through the same pending-selection wait a newly
created channel uses, because both reappear only on the next Server chat list. Channel creation uses
the live Agent directory and `chat.createChannel`. These sheets receive narrow async closures from
`HausApp` so `HausUI` remains independent of tRPC and does not invent mobile-only ids or records.

Swift Chat and Thread composers use the system inline Photos picker and Files importer plus a focused
AVFoundation camera surface on physical iPhones. Photos and Camera expand from the composer into one
rounded, local attachment portal; they do not create routes or full-screen covers. The portal card is
painted to the true screen bottom and the keyboard simply stays up *behind* it — the portal never
dismisses it, so nothing behind the card resettles while a portal is open. The portal also never
changes the composer's shape: the plus button on a collapsed composer opens the source menu over the
pill without expanding it, and the composer expands only on direct focus — the user's intent to type —
or when an attachment lands in its strip. What can still pull the keyboard out mid-portal is a system
surface, such as a first-run Photos or Camera permission alert; for that case the Chat screen freezes
the keyboard bottom inset it lays out against (`ComposerPortalFreeze`), so the transcript and composer
stay pixel-static for the portal's whole lifecycle and the keyboard is restored on close only if it
was up when the portal opened.

The Chat canvas answers the keyboard by hand, and hand-applied insets must run the keyboard's own
curve. The shell ignores the keyboard safe area and re-applies the height as a bottom padding read
from a `GeometryReader` — plain data that never inherits the keyboard's animation transaction, so
without an explicit animation the transcript and composer teleported to the keyboard-up layout
while the keyboard was still sliding in beneath them. `ComposerKeyboardMotion.travel` is the spring
UIKit drives the keyboard with, and the canvas animates its manual inset on it
(`ChatScreenView`), which is what keeps the composer riding the keyboard's top edge through the
rise and the interactive dismissal. A pushed screen such as Thread keeps the system bar and native
keyboard avoidance, and needs none of this.

The card overlaps the keyboard because it is drawn in a window of its own. The keyboard is not part of
the app's window — iOS paints it in `UIRemoteKeyboardWindow`, above everything the app draws — so a
portal layered inside the app window is cut off wherever the two meet, whatever its z-order. The
screen still owns the state: `ComposerInteraction` stays the single source of truth and the screen
registers itself with `ComposerPortalPresenter` on appear and resigns on disappear (Chat and Thread
both host portals, never at once, and a leaving screen only clears a registration still its own).
`ComposerPortalWindowController` mounts one `ComposerAttachmentPortal` from that registration in a
full-screen overlay window whose level is overridden on the *getter*, because UIKit clamps an assigned
`windowLevel` back below the keyboard's. That window is never made key — the text field's first
responder, and so the keyboard itself, must stay with the app window — and it passes every touch
straight through unless a portal is actually open (`ComposerPortalWindowRule`); a card that is only
leaving, or a media card collapsing into its landing tile, hands taps back to the composer underneath.
Because the portal now measures against the display rather than against the screen that opened it, the
composer reports `composerSurfaceFrame` and `morphDestinationFrame` in `.global` — window coordinates,
which the two windows share exactly, the app being portrait-only and full-screen.

The media card is inset a uniform 12pt from the display on both sides and the floor
(`ComposerPortalGeometry.nestingInset`), and rounds its corners with a fixed *number*
(`ComposerPortalGeometry.mediaCornerRadius`, an approximation of the display's rounding minus the
inset) — never with a concentric *shape*. SwiftUI resolves `.concentric` against settled layout,
not against each frame of an animation, so a card clipped with it kept a square corner for the
whole menu-to-media morph and only rounded once its frame arrived; and the resolved concentric
value cannot be read back as a number on iOS 26 (a UIKit `containerConcentric` probe leaves
`layer.cornerRadius` at 0, and `GeometryProxy.concentricCornerRadii` arrives only in iOS 27). The
card therefore clips with one continuous rounded rectangle at every overlay: the source menu keeps
30 (it floats mid-screen with no bezel relationship), and the menu-to-media morph interpolates the
radius alongside the frame, so the corner travels with the card instead of arriving after it.

The source menu that opens the portal is placed on the composer input it came
from: its bottom edge centres the card on the input, never sinking below the composer's own bottom
edge and never rising off the top of the screen (`ComposerPortalGeometry.sourceMenuBottomPadding`), so
the card overlaps the composer rather than standing on it. It pops out of the plus button — a scale
from the button's position in the card's unit space, no offset travel — and leaves flatter and faster
than it arrives. The card wears the portal's one interactive glass surface for the card's whole
life, never per overlay: mounting or unmounting glass at the menu-to-media flip left the plate
fading on the system's own schedule, a second stretched outline lingering over the arriving media
card. Only the menu rows are ever glass *content*, and everything media-related — the black
backdrop and the media views — crossfades in a plain sibling layer outside the
`GlassEffectContainer`, clipped to the same morphing shape. On device the container composites its
glass layer above plain views inside it, so media content placed inside the container rendered as
a blank black card under the plate; the Simulator renders glass flat and never shows this class of
bug, so glass layering changes are device-verified, never sim-verified. A single outline at every
frame is what makes the menu read as transforming into the media card. The rows carry plain fills,
because glass cannot sample glass. A drag on the open menu carries it a few points toward
the finger on UIScrollView's rubber-band curve and springs it back on release
(`ComposerPortalRubberBand`), and Reduce Motion replaces the pop and the pull with a plain fade. That
portal returns along the same bottom-leading path into the attachment
preview area so source, selection, and staged result remain spatially continuous; that return flight
is one interruptible spring that retargets as the landing tile settles, and the composer stays live
beneath it — a new portal, a send, or a Chat switch mid-flight abandons the flight rather than
waiting on it. The composer itself
is a floating interactive glass surface — the system's press bloom, with no overlay of any kind on
iOS 26 — and the transcript scrolls to the screen bottom and passes beneath it via a
bottom safe-area inset rather than ending above an opaque band. Opening the source menu also warms
`ComposerPhotoLibrary`, the picker's session object: an already-authorized library fetches its most
recent 400 image assets and starts caching thumbnails at the grid's cell size off the main actor, so
the card's morph into the photo grid paints an already-filled grid rather than a blank one during the
morph. Warming never itself requests authorization — an undecided or denied library still asks only
when the user actually opens Photos — and the picker's own mount-time load reuses whatever warming
already fetched. `PHImageManager`'s opportunistic delivery paints the fast, degraded decode first and
upgrades each cell in place when the full-quality result lands, instead of holding a cell blank until
the slower decode finishes. Selected files stay in a composer-owned temporary directory
until the message succeeds, and imported security-scoped URLs are copied while access is active rather
than retained or buffered into memory. Chat-canvas staging belongs to the Chat, not the screen: it
survives a Chat switch and a push-over, and is discarded only by a successful send, by removing the
tile, or by the destination leaving the Server list. A Thread composer is screen-owned, so a popped
Thread abandons its staged files to the temporary directory. Sending reserves each file
through the existing `attachment.reserve` procedure, uploads bytes through the authenticated raw
attachment route, then associates the returned attachment ids through `chat.send`; no native-only
attachment record exists. A file is reserved in the Chat its composer is anchored in, which for a
Thread reply is the parent Chat — a first reply has no Thread chat id yet, and Server re-homes the
attachment to the Thread the reply lands in. A Thread with no replies therefore accepts an attachment
on its first reply, exactly as the web composer does. Pending rows show the selected files while
upload is unresolved, failures
restore the exact text and files for retry, and successful Server attachments render identically in
main timelines and Thread replies. Opening an image attachment opens the attachment viewer described
above; every other kind resolves its cached file and presents the native Quick Look surface. The
client enforces the Server's 50 MiB limit before reservation.

## Ownership

Haus Server remains the canonical owner of collaboration state. Haus Computer does not know whether
a request came from desktop or iPhone. The iPhone app owns only presentation state, settings, optimistic
UI, and its in-memory Store cache. When connectivity is lost, persistent UI renders only server data
already present in that cache.

Shared wire contracts and model projections belong in `HausModels`; authenticated operations,
realtime delivery, and recovery belong in `HausTransport`. `HausUI` receives narrow models and
closures from `HausApp` rather than owning Server transport or inventing mobile-only records.

The Chat timeline uses cursor-based pages. Reconnect catch-up walks missed Server events before live
delivery continues, and loaded affected Chat pages are refetched in sequence order. Optimistic sends
remain app-local and are keyed by the client nonce. A pending row retires only after the canonical
Server message arrives; a failed send restores its content to the composer for an explicit retry.
Optimistic rows never patch durable history.

The native Chat shell navigates over a typed destination rather than assuming every sidebar row is a
persisted Chat. A durable destination carries a Server Chat id; an implicit Agent-DM destination carries
only the Agent id. Every active Agent therefore appears in the sidebar before a DM exists. Its first
text send uses `chat.send` with `targetKind: agent-dm`, then adopts the Chat id from the receipt and never
creates a placeholder record. Materialized Agent and human DMs remain durable destinations; human peers
resolve their current name, handle, and avatar from the member directory, with a former-member fallback
when the directory no longer carries them.

Native composers query `chat.mentionOptions` against either that durable Chat or the implicit Agent-DM
target. `@` offers Agents and humans, `#` offers channels, and `$` offers the Skills the chat's Agents
carry; selecting one writes the shared `agent://`, `user://`, `chat://`, or `skill://` markdown
reference into the draft. The Server sends a Skill's `insertText` bare where every other kind arrives
with its sigil, so the composer adds the `$` and a Skill selection serializes as
`[$agent-browser](skill://agent-browser)`, matching what the App compiles at submit. An option whose
kind this build does not model drops that single row rather than failing the whole roster's decode.
The iPhone picker is a card standing on the composer input — the composer's own glass and horizontal
inset, its resting corner, and rows grouped under a muted header naming the kind (Agents, then Humans,
then Channels, then Skills) so no row has to caption itself. A Skill row wears the sparkles glyph in
the transcript chip's own purple ink, inside the neutral box and `box / 3` corner a channel row's
`ChannelIconBox` uses. The first row carries a soft highlight, the list caps at four and a half rows
and dissolves its bottom edge over the cut row, and the whole card springs up out of the composer
edge on arrival and fades quickly on the way out (opacity only under Reduce Motion). Chat and Thread rows parse that
markdown into chips and resolve live identity by immutable id — an Agent or human by avatar and current
name, a channel by its `ChannelIconBox` glyph and configured color from the Chat list — falling back to
the persisted label when the target is unresolvable. Chip and picker labels carry no `@`, `#`, or `$`: the mark
already says what the reference is, so `ReferenceLabel` strips the sigil from resolved and fallback labels
alike and reads a channel's stored slug as a title, `onboarding-owner` as `Onboarding Owner`. The inserted
markdown and the reference target are untouched, and a one-line chat or thread preview reads its
references through the same labels — `Product` and `Agent Browser`, never `#product` or
`$agent-browser` — while an ordinary web link keeps its own link text. Human references remain visual and do not create
attention or notification behavior.

The phone chips every kind the App chips, not just the three the picker offers. `RichReferenceWireForm`
reads a link target in the App's own precedence — `agent://`, `user://`, `chat://`, `plugin://`,
`app://computer-use/`, `skill://`, then a leading-`/` path split into a file or a directory by its final
segment, then an `http(s)` link read as a pull request when the URL names one and as an ordinary site
otherwise — and a target that matches none of them is still a link. The App renders one as an ordinary
anchor, so the phone does too: `[report.html](haus://workspace/out/report.html)`, the form the Agent
system prompt tells Agents to write, reads as `report.html` underlined in the system link ink, never as
its raw Markdown. A bare address in prose is chipped too, because the App's Markdown autolinks one
before its chip renderer ever sees it; only explicit `http`/`https` addresses qualify, so a `www.`
prefix or an email address stays prose on the phone where the App would link it. A leading `/` is the
shared contract's whole path test, so a protocol-relative `//host` target reads as a path reference on
both clients rather than as an address. `RichReferencePresentation.mark` names what a reference draws before its
label — an
avatar, a Channel's colored box, or a flat `HausIconName` glyph (sparkles for a Skill, a plug for an
app or plugin, a file, a folder, a pull request, a globe) — and `ReferenceLabel` shapes what it says:
a Skill id through the App's `formatSkillName` rules, a pull request as `#<n>`, a web link as its own
words or, when those words are the URL, as its host. Agent labels take the App's accent — its
Agent chip is the only one the App colors, `chipColor === 'accent'`, which resolves to
`--accent-soft-foreground`, the accent mixed with the page's own foreground (70/30 in light, 80/30 in dark). Skill labels take
the App's `--skill-reference`
purple; every other kind that carries no identity color reads in foreground ink, which is what the
App's default chip foreground resolves to in both themes. `ReferenceLabel` also carries the label half
of the App's `skillAppearanceOverrides` and `capabilityAppearanceOverrides` — `gh-issues` reads as
`GitHub Issues`, `github` as `GitHub`, and every Chrome key as `Chrome` — read before the skill-name
formatter, the way `getMentionDisplayLabel` reads them, and keyed the way `getMentionLookupKeys` keys
them: a Mac app on its label alone, so `app://computer-use/com.google.Chrome` written as `Chrome` takes
the Chrome name and mark while the same bundle id written as `Google Chrome` keeps its words and the
plug; every other kind on its own target ahead of its words. The Skill mark is drawn smaller than the rest,
mirroring the App's 16px against 18px.

The glyph half of those overrides carries over with the labels: a GitHub Skill wears the GitHub mark
in the Skill's own purple, and every Chrome key wears the Chrome mark in the App's `--success` brand
ink. A brand ink takes the whole chip foreground, mark and label both, because the App's `brandColor`
lands on `--chip-fg`. A picker row shows only the marks the composer's own triggers reach, which for an
override means a Skill, and no Skill override names a brand ink: a `$gh-issues` row swaps the sparkles
for the GitHub mark and keeps the Skill's purple, as it does on the App.

Two gaps are deliberate. The App fetches a favicon for a web link and a bundled icon for a Mac app,
and the wire form carries neither, so the phone draws the globe and the plug instead. And the App's
`image` kind has no wire scheme at all — it is a composer attachment there — so nothing can persist one
and the phone does not model it.

A chip is not a hover surface, so activation is the phone's only interaction and it is deliberately
narrow. What opens is a real `.link` attribute, written by `RichMessageAttributedText` over a link
run's words and over a chip's whole run, the mark's spacer included, so the mark opens the reference
rather than sitting in a dead margin before it. Only the schemes the system routes qualify, which is `http`, `https`, `mailto`,
and `tel`: a website or pull-request chip opens its address, a `haus://` resource draws as a link
and stays inert because nothing on the phone routes one yet, and an Agent or Channel chip carries no
`.link` at all, where the App opens a profile or a channel. UIKit's own link machinery decides the
tap, and `RichMessageLinkCoordinator` — the representable's `UITextViewDelegate` — decides only what
it means: `textView(_:primaryActionFor:defaultAction:)` returns a `UIAction` that hands the address
to `UIApplication.open`, and `textView(_:menuConfigurationFor:defaultMenu:)` returns nil so a link
offers no menu of its own against the row's. The long press still belongs to the row's context menu,
which this view refuses for `UILongPressGestureRecognizer`; word selection, its handles, and its
edit menu are the text view's own and untouched, which is what a recognizer of ours could not manage
— UITextView's word selection is a `UITextMultiTapRecognizer`, not a `UITapGestureRecognizer`, so
`require(toFail:)` never bound to it and a double-tap on a link opened it instead of selecting the
word. A run's ink and underline are its own: the text view clears `linkTextAttributes` rather than
setting them, because an anchor draws in the App's link color and a chip in its own tint, and one
overlay dictionary cannot say both. Being real links is also the accessibility route — VoiceOver
lists them in the links rotor, which a private attribute gave nothing to.

A chip is a run inside the message body, not a box beside it, and not a picture of one — and it has
no ground, because the App's has none either: its chip is the transparent `tertiary` shell at
`padding: 0` and `font-size: inherit`, so a reference is enhanced inline text rather than a badge
sitting in a sentence. The phone draws the same two enhancements. The label is
set in the body's own font at the body's own point size on the body's own baseline; the identity
mark is painted at the run's leading edge, and a dotted rule under the label's own glyphs. So the
words after a mention keep their rhythm, a selection
drags straight through it, and a line carrying a mention keeps the pitch of a line of plain words —
asserted directly, as identical line-fragment heights for a wrapped paragraph with and without a
mention. The body is a non-editable, non-scrolling `UITextView` (`RichMessageTextView`) over a
TextKit 1 stack the app builds by hand rather than letting `UITextView` pick one, and
`RichReferenceLayoutManager` paints in `drawBackground(forGlyphRange:at:)`, the hook the engine
already calls with the text container's origin in view coordinates. `RichReferenceMarkGeometry`
owns the arithmetic, all of it a fraction of the line's own box — the font's ascent above the
baseline and its descent below. The mark is four fifths of that box, centered on it, which leaves a
~16pt mark inside 17pt body text; the Channel glyph's box keeps the `box / 3` corner `ChannelIconBox`
gives it, taken from the mark's own edge. The gap after the
mark is a quarter of the point size, the App's own `--spacing` step beside its body text. So the
whole reference scales with Dynamic Type.

The dotted rule is the App's, in the label's ink: a dot every other dot's width, tiled from the
label's leading edge with each dot centered in its tile, under the label's glyphs alone and never
under the mark. Two things about it are the phone's own. The dot is a shade thinner than the App's
`0.12em`, and it hangs on the line's floor rather than below it, because the App spends its
paragraph's `1.6` leading on the room under its words and the phone has none to spend: the text view
clips to the height the row was measured at, so a rule below the line's descent would be cut in half
on the last line of a message. A dot that would not fit whole inside the label is dropped rather
than drawn clipped. Both ends of the rule are the label's own selection geometry — the rects
`NSLayoutManager.enumerateEnclosingRects` reports for those characters — rather than a union of the
label's per-glyph boxes, because a glyph's box is measured to wherever the next glyph starts, and
across a bidi level boundary that is the neighbouring word: a Latin name inside a Hebrew sentence
drew a rule running from the word before the mention, under the mark, and into the word after it.

The mark's horizontal room is bought in the text itself. `RichMessageAttributedText` writes the
reference as a run of two pieces — a zero-height `NSTextAttachment` wide enough for the mark and the
gap after it, then the label — both
carrying one `.hausReference` attribute. Zero height is what keeps the line box untouched, and
the attachment is held against the label by a word joiner because an attachment character is
otherwise a line-break opportunity and a label may not come away from its own mark. Nothing is
bought after the label, mirroring the App's `padding: 0`: punctuation hugs the last word and a
following word is separated by its own space, exactly as in plain prose.

The label itself is written verbatim, spaces and hyphens intact, and whether its words may come
apart is decided per break opportunity by `RichReferenceLineBreaking` through the layout manager's
delegate. A label keeps together whenever the whole run — the spacer and the label — fits within
the container's usable width, so a mention moves whole to the next line rather than splitting. Only
a run too wide for any line may break, and then only at the label's own word boundaries; it is never
hyphenated. Sealing those boundaries shut instead — the non-breaking spaces and joiners this
replaced — made a long label one unbreakable token, and at an accessibility Dynamic Type size a
token wider than the column left the engine nothing to do but wrap it by character, rendering
"Product Design Team" as "Product Desig" / "n Team". A run that does break wears one dotted rule per
line fragment, and the mark is drawn only on the fragment carrying the run's first glyph — which is
also the only fragment whose rule starts past the mark's spacer. Copying
resolves all of it back to the sentence: the spacer and joiner come out, and a chip or a link
contributes the words it draws, never its target — which is what copying the App's own anchor text
yields. The mark is a channel's glyph in its `ChannelIconBox`
colors from `ChannelIconCatalog`, or an Agent's or human's avatar from `AvatarImageCache` over
`AvatarView`'s initials.

Two things drive relayout, and they are deliberately separate. The attributed body is rebuilt only
when its segments, text style, Dynamic Type size, or Bold Text setting change — attachments and
dynamic colors compare by identity, so handing the text view a freshly built but identical string
would throw its layout away on every SwiftUI update. A mark arriving asynchronously — avatar bytes,
or the one-time channel glyph load — changes no text at all, so it bumps a revision that repaints
without relaying out. Avatar presence is `AvatarImageCache`'s answer alone, never a per-view set:
the cache restores an evicted avatar from its disk bytes and only reports absence once those are
gone too, so a recycled row cannot flip a drawn avatar back to initials. Row height comes from the
representable's `sizeThatFits` at the proposed width, which is what `UIHostingConfiguration` asks
for inside the self-sizing transcript cells. A long press belongs to the row, not the text: the text
view refuses its own long-press recognizers so `TranscriptListView`'s context menu wins, leaving
double-tap word selection intact. The body carries an accessibility label naming each reference's
kind, and the text view's value is suppressed so VoiceOver reads the sentence once, as
`Agent reference, Marlow`.

The open native Chat and Thread surfaces acknowledge the latest loaded message sequence through
`chat.markRead`. Identical Server/Chat/sequence acknowledgements are deduplicated in memory. The
durable `chat.read` event — which Server writes only when the read moved and addresses to the reader
alone — owns the `chat.list` refresh, exactly as the web App's `useChatRead` does, so one
acknowledgement produces one list refresh and unread counts remain Server projections rather than
local durable state.

Native Thread routes are anchored by the parent message id, which exists before the child Chat is
created. The route also carries the parent Chat id and may carry a resolved Thread Chat id. Opening an
unthreaded message therefore needs no speculative Server write: the first reply sends the parent Chat
id plus the anchor message id, adopts the returned child Chat id, and continues on the same screen.
Thread optimistic rows stay keyed by the anchor across that transition. Existing Threads reuse the
same route and shared timeline presentation with their child Chat id already resolved. If another
client creates the Thread while that route is open, the refreshed parent summary supplies the child
Chat id and the native screen adopts it without remounting. Back navigation carries the parent Chat id
explicitly so app reloads cannot return to a default Chat, while ordinary stack navigation preserves
the mounted parent timeline and scroll position. Task metadata renders on its canonical anchor message;
the native timeline does not invent a second task receipt row.

A Thread screen carries the App's follow action on its navigation bar's trailing rail
(`ThreadFollowControl`). The App keeps the same action in the Thread header's name dropdown, where two
other actions keep it company; a pushed phone screen has no such menu, so the action is the bar item
itself and it wears the same words and the same pair of bells — **Follow thread** with
`Notification01Icon`, **Stop following thread** with `NotificationOff01Icon`, both stating what a press
will do. Follow state lives on the parent page's `ThreadSummary` (ADR 0013), so a Thread Server has not
created yet has no summary and shows no control until its first reply lands.

`HausStoreThreads` owns the write. `setThreadFollow` patches that summary optimistically through
`ThreadFollowPatch` in `HausModels`, sends `thread.setFollow`, keeps whatever the receipt says, and on
failure rolls the summary back to the value the press replaced and logs the error. It keeps no second
copy of the state: the durable `thread.follow.updated` event already refetches the parent Chat page and
the Chat list, which is what converges this client with every other one.

Clerk owns native authentication. The production instance uses Google as its only sign-in strategy, so
Haus starts Clerk's direct Google SSO flow from a native SwiftUI action instead of routing through the
hosted Account Portal. The provider browser returns through the production-authorized
`haus://sso-callback` product URL. `HausTransport` asks the native Clerk session for a fresh token
for every request, while `HausStore` keeps the active user's in-memory Server snapshots. A user
change therefore discards the previous user's cache. Cold-start offline access needs an explicit secure
auth bootstrap contract before persisted query data can be enabled safely.

## Native surface

The app shell, navigation, chat timeline, composer, and threads are native SwiftUI. An interactive
artifact may use an isolated web canvas inside a native route when the artifact runtime requires
browser APIs; that canvas would receive a narrow serialized contract and would not own authentication,
navigation, Server queries, or durable app state. No artifact route is wired into the current app —
this remains future work.

Settings stay inside one native sheet and `NavigationStack`. Settings is entered from the sidebar's
floating gear control, pinned bottom-trailing over the scrolling chat list. The sidebar navigation
carries the App's own order: Server-wide destinations lead — the Inbox row first, then Tasks — then
Channels, then DMs. The sidebar's
Server header is the Server menu; archived chats open from there
rather than spending a navigation row. That header carries the Server's name and nothing else —
Agent and member counts are a Settings readout, not standing sidebar chrome — so `ServerPresentation`
carries only the identity the Chat surfaces render.

Every line in that sidebar starts on one rail: the Server identity, the section labels, and each
row's glyph share a single left edge, and one glyph box size puts the labels behind them on a single
column too. A row's selection capsule is the only thing outside the rail — it bleeds into the margin,
so the scrolling list is inset by the difference and each row re-adds it. Sections are plain labels,
not disclosures: a phone sidebar holds few enough rows that folding one saves nothing, and the caret
it would need is the one element that cannot sit on the rail with the rest.

An unread chat hangs a disc off the sidebar's leading edge and lets that edge cut it in half, so
what shows is a nub in the margin. The clip is load-bearing, which is why the rail inset rides on
the scrolling list rather than on the scroll view: the scroll view has to reach the sidebar's own
leading edge, or its bounds cut the marker away before the sidebar edge can halve it. That disc is
the phone's whole unread vocabulary: `UnreadDot` owns it, the drawer's Inbox row and every Chat row
hang it off the edge together, and the Inbox's Conversations rows and Search show the same disc
whole beside the row's time. The phone never counts — a number a reader cannot act on is not worth a
chip beside the fact it repeats — so no surface here carries an unread badge. The Chat
details sheet pushes a read-only Agent profile on its own `NavigationStack` — the chevron row is a
real push, and the sheet grows to the large detent for it — so inspection never leaves the sheet.
Editing does: the pushed profile's "Manage in Settings" row is the one details-to-Settings hop, and
it keeps the original choreography — the two sheets are mutually exclusive, so details dismisses
first and Settings presents from its dismissal, seeded to that Agent's Settings profile. A deep link
seeds the Settings sheet's navigation path, so the hub stays behind the pushed screen and the system
back button returns to it. The Settings
hub reads lightweight Server, Agent, member, and Computer projections; profile screens own focused
identity mutations; and long-form values use dedicated editors. Appearance is app-local presentation state and never creates or updates
Server state. Desktop-only operational surfaces remain out of the iPhone information architecture until
a concrete mobile workflow needs them.

The Swift client uses Apple platform frameworks for photos, camera, files, and Quick Look, plus the
official Clerk iOS SDK. It does not carry a second web or JavaScript UI system.
