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

The foreground [Agent voice-call preview](../features/voice-calls.md) adds an
authenticated Server WebSocket and native audio in `HausApp/Voice`. Server owns
OpenAI access and delegation into existing Agent delivery; the phone owns audio
capture, playback, captions, and call presentation.

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

A `sending` lifecycle event also recovers committed messages when the durable message notification
was missed. Recovery refreshes the visible Chat and any covered parent transcript, the Chat list,
and active message search. Older reads cannot replace the recovered snapshot. Other lifecycle phases
only update activity; foreground and reconnect recovery remain independent fallback paths. Message
rows always come from Server reads, never from lifecycle text.

The open Chat and the open Thread show who is answering them in their header, the App's ADR
0035/0036 feature in a phone shape. `HeaderEngagement` hangs a compact row just under the title as
an overlay, never as a row in the layout, so it comes and goes without moving the transcript
scrolling beneath it; the row sits on a band of bar material so a passing message never reads
through it. In a channel the row is the working Agents' 18-point avatars, overlapped and ringed
(three at most, then "+N"), followed by the hopping dots — no visible "is typing" words. Each new
thought drops as one glass bubble (`EngagementThoughtBubble`, "**Blippy** Found a timing race…",
one line, cut at 300 points) from under the row over the oldest visible messages, and the speaking
Agent's avatar lifts slightly while it shows. In an Agent DM the title already names the Agent, so
the row is that Agent's latest thought as a one-line secondary subtitle, crossfading as thoughts
change, with the dots trailing (only the dots before a first thought). A Thread puts the same row
just under its navigation bar's subtitle, channel style in a channel and subtitle style in a DM;
there the band reaches up to the screen top, because the system bar draws no material. The band's
feathers are fixed lengths at its edges, never fractions of its height, so the row always sits on
full material. Tapping the row opens Working now (`WorkingNowSheet`); a bubble passes touches
through, so it never blocks a link or message under it. Working now is a small-detent sheet with
one live row per working Agent and its latest thought; it says "Everyone's done" and closes itself
when the last Agent finishes. It is the phone's stand-in for the App's hover recall.

Bubbles take turns through `EngagementThoughtQueue` (HausModels), a pure clock-driven state machine:
a bubble holds 2.2 seconds, yields after 1.5 seconds when another waits, and leaves 0.35 seconds
for its exit before the next drops in, so bubbles never overlap. Only an Agent's latest waiting
thought is kept, in the place its first one took, so a backlog never builds and every Agent gets
its turn. This deliberately replaces the App's single-line 5–7.5 second holds and spacing: a
bubble over the transcript should be glanceable, and the queue is what keeps several Agents fair.
The same words again from the Agent whose bubble is up add nothing. A waiting thought needs its
run still engaging the Chat, so an Agent that leaves without replying drops out of the row and
takes its waiting line with it; the bubble already up stays only while its Agent is held for a
`--done` reply.

Engagement and thoughts are Chat-scoped, so `HausStoreEngagement` subscribes to `chat.onEngagement`
and `chat.onThought` only for as long as the header row's task lives, re-reads `chat.engagements`
on every (re)connect, restarts a stream the transport will not retry with the Server-wide streams'
capped backoff, and reconnects after a background return. A newer Server never breaks the stream:
an engagement frame of an unknown type is skipped (`ChatEngagementFrame`), and an unknown end
reason reads as settled. `ChatTypingModel` keeps the App's reply hold: a `--done` reply holds its
Agent, in its place in the row, until the reply is in the transcript (two seconds at most).
VoiceOver reads the row as one element ("Blippy and Tiny are working", with a hint to open
details) and hears new thoughts as low-priority announcements, at most one every four seconds,
that never move focus. Under Reduce Motion bubbles crossfade in place with no drop and no avatar
lift. Like the header, the row stops growing past the largest standard text size; the bubble
stops at the first accessibility size. There are no haptics: this is ambient information. The
App's emoji faces are not ported.

A stopped Agent's DM says so above the composer (`StoppedAgentNotice`): one glass card on the
composer's own material with a stop glyph, "<Agent> is stopped", what that means, and a prominent Start
for Owners and Admins (`agent.start`, then an Agent directory refresh; a spinner stands in for the
label while it runs, a success haptic, and a native alert on failure). It is a deliberate product
notice, not send status: a stopped Agent will not see what is sent. An Agent
the Server paused after repeated failures (`wakePause`) explains why on its Chat-details profile,
in the App's `agent-wake-pause-model.ts` copy; the phone offers no Restart.

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
sheet, single-line identity values edit inline, and long-form values use a dedicated editor. The root
opens on a centered identity header that pushes the viewer's profile. Rows carry a short title and
show a single-line current value trailing, dropping it under the title only when it cannot fit;
long-form values such as descriptions preview as a subtitle. An up/down chevron marks an in-place
picker and a right chevron marks navigation. Explanations live in section footers. All
profile values and avatars originate from Server records; the app must not create mobile-only identity
state. On startup, iOS reports the signed-in Clerk name and email through `member.syncIdentity` before
reading the member list, matching the web app's default-handle bootstrap. The sync runs beside the
Chat and Agent list reads and is never fatal: a failure logs, the member list loads anyway, and the
sync retries with backoff, refreshing the member list once it lands. The same sync reports the device zone
(`HumanTimezone.deviceZone`, which leaves out a zone the Server would refuse, such as an offset);
the Server keeps it only while the human's timezone is blank. Profile's Timezone row pushes a
searchable list of every zone the phone knows and saves through `member.setTimezone`; Haus never
prompts when the device zone later differs. A human edits their
Server-scoped handle alongside their display name. Native validation mirrors
the shared handle grammar for immediate feedback, while `member.updateProfile` carries the active
`serverId` and Server remains authoritative for cross-human/Agent uniqueness. The app also reads
Computers through the existing `computer.list`
contract; an unavailable or role-denied Computer snapshot does not block the rest of Settings.

Owners and Admins open an Agent's Automations from its Settings profile (`AgentAutomationsView`):
scheduled Reminders, then Triggers, read through `reminder.list` and `trigger.list` and phrased by
`ReminderSchedulePresentation` and `ReminderCadence` in HausModels, ports of the App's
`reminder-schedule-presentation.ts` and `reminder-cadence.ts` with the same tests. Rows push a
Reminder detail (with `reminder.runs` and Cancel Reminder) or a read-only Trigger detail (with
`trigger.runs`). Trigger authoring and the Agent-wide history drawers stay in the App.

Owners and Admins can edit an Agent's runtime, model, and reasoning in its Settings profile through
`agent.configure`. Choices come from its assigned Computer's reported inventory. The native reasoning
contract includes `default`, `low`, `medium`, `high`, `xhigh`, and `max`; `default` means the model is
not configurable, rather than an extra automatic-effort choice. A model change keeps a supported
effort or selects the model's concrete default. The editor explains next-turn application and the
session reset required by runtime/model changes or a Grok Build reasoning change.

Cloud Agent settings use `cloudAgentProvider.get`, `.connect`, `.cancelSignIn`, and `.disconnect`.
Computer owns the Cursor sign-in attempt and credentials. The phone presents the Server-reported
sign-in link, checks progress while the screen is active, and supports cancellation and retry after
failure or expiry. Returning from the browser refreshes the attempt; leaving the screen does not
cancel it. A later visit can resume the pending attempt on the same Computer.
The screen's Model row reads `cloudAgentSettings.get` and pushes a searchable list: Auto (Cursor picks a model for each run) first, then the reported Cursor catalog in family sections (Claude, GPT, Gemini, Grok, Composer, Other) in Cursor's order. Below it, an Effort picker (a menu for five or fewer options, a pushed list for more) and a Fast toggle appear only when the chosen model offers them, starting at the saved param or the model's default. Picking a model saves `params: {}`; picking a param's default value leaves it unset; every edit saves immediately through `cloudAgentSettings.setModel` (Owners and Admins) and shows in place until the Server answers. Members read the values. An unavailable saved model, a saved param the model no longer offers, a missing catalog, and save failures are explained in the section footer. The Model row is a custom navigation row, not a stock `Picker`, so a long value stacks and wraps instead of truncating. `CloudAgentModelChoice` owns the list, control, and footer logic.

Server-provided relative avatar URLs resolve against the configured Server origin, including local
development; no Swift surface hardcodes the production host or substitutes local seeded artwork.
An avatar URL names immutable bytes, and `AvatarImageCache` treats it that way twice over: decoded
images live in a process-wide `NSCache`, and the bytes behind them persist across launches in the
cache's own `URLSession`/`URLCache` on disk, fetched with `returnCacheDataElseLoad`. Immutability is
the license to ignore the Server's freshness headers — nothing the Server says can make a stored
avatar wrong — so a cold launch paints identities the human has already seen instead of holding
initials until the network answers. A synchronous lookup that misses the decoded cache reads those
bytes from disk in the same call, so the first frame after a launch already has the face; a URL with
no stored bytes is remembered as a miss until its download lands, so it is not read twice. Concurrent loads share the complete fetch, decode, and cache
insertion, so rows awaiting one URL receive one image instance. `AvatarImageDecoder` downsamples
to at most 384 pixels on the concurrent executor, covering the 84pt profile avatar at 3x without
retaining a full-resolution source for every small identity mark. Synchronous recovery after decoded
cache eviction uses the same bounded decoder over cached bytes.
An ordinary Agent's profile may call the same Server-owned `avatar.generate` procedure as the desktop
App with one short concept, from a capsule directly under the avatar it changes. A factory Agent does
not offer it: the Server refuses to replace Cove's product-owned artwork, so `SettingsAgent` carries
`canGenerateAvatar` from the Agent's `factoryKind` and the App and the phone gate the entry the same
way. Each returned image joins an `AvatarGenerationSession` that `SettingsSheet` keeps per Agent,
not the generation sheet: closing the sheet keeps the concept, every variant, and any run in flight,
and reopening resumes it. Tapping Save applies the variant on stage through the ordinary `avatar.set`
contract, and the session resets the next time the sheet opens after that save. Run ids never repeat,
so a result from a run superseded by a newer run or a save is dropped. A successful `avatar.set` is a
successful save even when the follow-up `agent.list` refresh fails; the store logs the refresh and
returns the Agent with the saved avatar URL. The existing native photo picker remains the
manual-upload path.

The generation sheet leads with a fixed 176pt circular stage at the size and shape the product
actually draws an avatar, so what the human approves is what every surface will show. Before the
first run it shows the Agent's current avatar, dimmed. Every variant, then the latest run while it
draws or after it fails, is a page of that circle, swiped in place; with two or more pages a small
glass `2 / 3` counter sits on the stage's bottom edge, and VoiceOver pages with the adjustable
action. A failed run's message stays on its own page while earlier variants stay selectable, and
Save is disabled while that page or the pending page is shown. A save failure is a native alert,
cleared when save is retried or the page changes. It is an ordinary scrolling sheet: Cancel and Save
are the navigation bar's own actions, Generate is one button inline under the concept field and is
disabled while the trimmed concept is blank, and the keyboard toolbar carries Done because a
vertical-axis field spends Return on a newline. Nothing is pinned above the keyboard, so raising it
never buries a control. Concept suggestions live inside the concept card while the field is empty,
and their row, like the `Drawing…` wait line under the stage, stays laid out when hidden, so nothing
below the stage moves between states. Drawing one avatar takes the image provider tens of seconds:
the operation carries its own request timeout well past `URLSession`'s 60-second default, the wait
is marked on the stage by a frame-clock ring (a still rim under Reduce Motion), and Cancel stays live
for the whole generation — only the save that writes the avatar holds the sheet open. No Server
failure reaches a human as a tRPC string; `AvatarGenerationFailure` maps each documented outcome —
unconfigured provider, capacity, authorization, missing owner, provider failure, unreachable Server
— onto one sentence that says what to do next. `AvatarGenerationDebugPreview` mounts the sheet over
fixture sessions (empty, one variant, several variants, generating, failed page, save error) from a
Debug launch argument, so every state is reachable in Simulator without a Server.

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
whitespace and newlines there, so both the row's `content` and its `richBlocks` derive from the
same trimmed body — an Agent reply ending in a newline no longer pays a blank text line of gap
before the next row or before its thread card. The persisted Markdown is untouched, and interior
blank lines stay exactly as written.

A message body is Markdown, and the phone reads the block grammar the App renders for a settled
reply. `RichMessageBlockParser` splits the trimmed prose into blocks — paragraphs, ATX headings,
ordered and unordered lists with nesting, blockquotes, fenced code, thematic breaks, and GFM pipe
tables — and `RichMessageParser` still owns everything inside one, now extended with `**bold**`,
`*italic*`, `~~strikethrough~~`, and `` `code` ``. Two precedences make it predictable: a code span
and a Markdown link are opaque to the emphasis scan, so markup inside backticks stays literal and an
address full of underscores stays an address; and reference chips, ordinary anchors, and bare-URL
autolinks resolve inside every block, marks included. It is a line scanner rather than a grammar
because it re-runs on every streamed chunk — an unterminated fence is a code block to the end of what
has arrived, and a header row full of pipes stays a paragraph until its delimiter row lands, so a
table appears once and then grows a row at a time instead of reflowing. A single newline is still a
line break, the way `remark-breaks` makes it one on the App.

A fenced code block is a horizontal `ScrollView` whose text is fixed at its ideal size on both
axes (`RichMessageCodeBlockView`). A transcript cell is first laid out at UIKit's placeholder height,
and an unfixed `Text` truncated to one line there and never re-measured, so a thirty-line block
drew one line centred in a row sized for all thirty. The plate keeps the column's trailing margin
and fades its trailing edge while more of the longest line is off to the right. A fixed header
above the scrolling body carries the fence's language as a micro label (`CodeFenceLanguage`,
mirroring the App's `codeLanguageForFence`) and a copy button that copies the whole block.

Blocks draw as a `VStack` of `RichMessageBlockView`, and every run of running text — prose, headings,
list rows, quoted prose — goes through the same TextKit body the chips need, so selection, copy, the
row's long press, and link taps are exactly what they were. A table is a native `Grid` inside a
horizontal `ScrollView` rather than another `WKWebView`, because a web view per table in a scrolling
transcript is a content process per table: hairline rules between rows, a medium-weight muted column
label with no fill behind it, 12×8pt cells, tabular digits, and the `:---` / `:---:` / `---:`
alignment the delimiter row declares, with each body cell naming its column to VoiceOver. Cells draw
with `Text` over an `AttributedString`, not the TextKit view, because a column's width is decided by
what its cells ask for and the text view answers that with the whole paragraph on one line — so a
chip inside a cell keeps its identity ink and its weight and loses only its painted mark. Headings
are section labels rather than titles: the App's 19/17/13px ladder over a 14px body compresses to one
step above the phone's 17pt body for `#` and `##` and to body size below that, semibold throughout.
Fenced code sits on the App's secondary surface at the control corner and scrolls rather than wraps.
Task lists, footnotes, setext headings, backslash escapes outside a table cell, and syntax
highlighting inside a fence are deliberately not modelled.

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
its pan never begins and the table's vertical drag and long press see an untouched hierarchy. The
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
`visuals`, the fences in the order they were written. `richBlocks` parse from `prose`, so a fence
can never leak into the transcript as raw HTML, and neither can it leak into a preview line —
`RichMessageParser.oneLinePreview` substitutes each fence with its fallback text (explicit title,
else the document `<title>`, else the first heading, else "Visual"). The Nth fence is a visual's
identity; content only ever appends while a reply streams, so ordinals never reorder.

`VisualSandboxDocument` is the same document the web builds: the same CSP with the same pinned
map CDN entries and no charting library (ADR 0033), the same base stylesheet that gives bare `<table>` markup the app's table look,
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
inside the flipped table, which re-hosts a visible row only when its own item changes or the
screen's `rowRevision` does (`TranscriptRowReconfiguration`, driven from `updateUIView`) — a height
measured inside a cell has nowhere to go. So `VisualHeightRegistry` holds measured heights keyed
by message id and fence ordinal, exactly as `AttachmentImageTileRegistry` holds tile anchors, and
`MessageTimelineView` and `ThreadDetailView` each own one. The screen folds the registry's
`revision` into `rowRevision`, which is what turns a frame's report into a re-render, a reconfigure,
and a row at its new height. A visual draws no shell — transparent, unbordered, filling the message
column, the same inline frame as the web (ADR 0031) — and uses natural document height,
with 240pt reserved until the first report, a 120pt minimum, and a 100,000pt resource guard for
pathological documents, matching the web. Height changes apply immediately without animation or
collapse controls. The transcript owns vertical scrolling; wide tables still pan horizontally.

An ```` ```artifact ```` fence names a self-contained HTML page in the authoring Agent's workspace.
`ArtifactFence` ports the App's `splitArtifactFences` and the shared props schema — opener mid-line,
terminator glued or on its own line, a strict `{path, title?}` object with a confined `.html`/`.htm`
path — and only a payload that passes becomes a card; anything else stays message text. Valid fences
leave the prose before the visual split runs, so their JSON never renders, and a preview line reads the
page's title (else `Artifact: <path>`). The cards sit under the visuals, as compact rows that read
nothing: tapping one presents `ArtifactPageSheet` from the frontmost controller (rows have no view
controller of their own), which reads the page through `agent.workspaceFile` — the App's artifact pane
read — and draws it in `VisualWebView` with scrolling on, the app's tokens injected after `<head>` and
a viewport rule added when the page has none. Blank while it loads; a Computer that does not answer is
a calm unavailable state with Try Again, never an error string. A read that never reached the Server
(a `TRPCClientError.transport` whose `URLError` code means no route — `isNoConnection`), or a relay or
transport failure while the App's live streams are down (`isConnected` false), says the phone is
offline instead, since blaming the Computer would name the wrong thing to fix. The App installs the reader in
`ArtifactPageReader` at its root, beside `InAppReferenceRoutes`.

An Agent's message that answers a Reminder or Trigger fire carries a `cause` (ADR 0026), and the Chat
row draws `MessageCauseLine` above its identity in place of an inline-reply line: the reply line's
elbow in the automation's ink, the clock or bolt glyph in a soft box of that ink, then the title. A
caused message always opens its own identity block. The phone has no hover card or Automations surface,
so the line is a statement, not a control. `ChatMessageCause` decodes the Server's current
`messageCauseSchema` and still decodes away on a malformed cause rather than costing the row.

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

Dissolving content is not enough on its own: a line of body text passing behind the clock, a
floating Chat title, or the chrome buttons stayed legible enough to read as two layers of text
colliding. Every top `chromeBar` therefore also sits on `ChromeScrollEdge`, the bar material solid
behind the status bar and the upper chrome row and feathering out across the runway, which is what
the system navigation bar does. It covers the Chat canvas and the Inbox alike, and the header still
floats rather than capping the screen with a hard edge.

The composer keeps the plain inset and a hard edge on purpose: the clearance it reserves is the
transcript's own scroll bound, so no sharp row ever reaches past it, and the rows that reach its
glass are already being refracted. `HausChrome.transcriptBottomRunway` is the breathing room the
transcript holds above that clearance — a scroll bound too, not composer padding — and it runs wider
than the inter-message rhythm because the composer's glass rim sits inside the region it reserves. The Thread transcript wears the same mask under its system
navigation bar.

Every floating chrome control is one control. `GlassChromeButton` owns the 44-point circle, the
22-point app icon, and the glass or material treatment, and `ChromeHeader` owns the 56-point
chrome row that positions leading, centered, and trailing chrome. Its layout offers the center only
the width between equal side gutters, so a long title truncates instead of sliding under a chrome
button, and like a system navigation bar it stops growing with text size at the largest standard
size; the Chat title offers the Large Content Viewer past it. Call sites choose a glyph and a
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
holds while authentication resolves. The launch screen carries a still render of that opening ghost
(`LaunchGhost` in `HausApp/Launch.xcassets`, light and dark, at the drift's first frame) on the same
system background, and the opening frame centres its ghost on the full screen as the launch screen
does, so launch hands off without a pop. Re-render the imageset if the mark or its palette changes. The retired `HausBrandMark` and its `HausMark` imageset are
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
Reduce Motion and the scene phase: the sidebar stays mounted behind the canvas, so the sidebar's
drawer root sets the `hausSidebarHidden` environment value whenever no sliver of the drawer is
showing — mid-drag counts as visible —
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

A chrome button's shadow spills past the edges of whatever contains it. The sidebar's reveal clip
is a full-screen-height UIKit view, so the search and gear buttons' shadows have the whole screen
to spill into; do not reintroduce a SwiftUI `.mask()` on the sidebar, which rasterizes into a
buffer sized to the sidebar's resolved height and cut the search button's shadow at a hard line.

Dismiss controls follow one vocabulary. A form that creates or edits a draft uses Cancel plus a
confirming verb (Create, Save); an informational sheet with nothing to confirm — Search, Chat
details, Archived, and the Settings root alike — uses Done in the confirmation slot; and a pushed
screen uses the system back chevron rather than an explicit control.

There is no shell banner and no send status. A send is optimistic, as on the web: the row lands in
the transcript the moment the viewer sends, drawn exactly as the durable row that replaces it — no
caption, spinner, dimming, or "Sending" anywhere, including the row's accessibility label and its
attachments, which show their staged files and simply ignore taps until Server names them. The
only trace is behavior the web also withholds: no reactions, drawer, or reply actions on a row Server
has not named. The send itself runs in the background. `chat.send` and `attachment.reserve` are
idempotent by nonce, so `IdempotentRetry` (HausTransport) replays them through transport failures
(timeouts, a dropped or absent connection, a 502/503/504) with 1s, 3s, and 8s waits before giving
up; anything Server actually answered fails at once. A slow Server therefore shows nothing at all.

A failure is told where it happened, the way iOS apps do it. A send that does not reach Server
after those retries stays in the transcript as the viewer's own optimistic row, at its sent
position, marked failed (iMessage's pattern): a red `exclamationmark.circle.fill` beside the row, a
red "Not sent" caption under it, and an error haptic. The composer clears on send either way, because
the content lives in the row. Tapping the row opens a confirmation dialog with Try Again and Delete
Message (`FailedSendControls`, routed through `FailedSendRoutes`, which the App installs at its root
because hosted rows have no environment); the row's accessibility element reads "Not sent" and
carries the same two actions. Try Again replays the original send — same content, target
(`PendingSendTarget`), and nonce, so a send that did land replays on Server rather than posting twice
— and Delete removes the local row and its staged files. The state machine is
`OptimisticSendState` in HausModels (sending → failed → sending on retry, single-flight; only a
failed row can be deleted), pinned by `OptimisticSendStateTests`. Failed rows are app-local Store
state: they survive Chat switches within the session, never patch durable history, and are not
persisted across launches. The Store owns staged attachment files from the moment a send leaves the
composer and removes them after a confirmed send or a delete. The composer keeps its draft only
when nothing left it at all (no Server).

A page of history or replies the reader asked for that fails to load says so in place: the
transcript's load-older accessory turns into a quiet "Couldn't load earlier messages · Try Again" line
(`TranscriptLoadOlderButton`). Background work (event catch-up, foreground refresh, stream recovery,
history refresh, Cloud Agent refresh) logs instead: the header already speaks for connectivity.
Lost connectivity is header state, never a banner over the transcript (`ConnectionOutage`): once the
Server connection has been down for two seconds the Chat header's title, or a Thread's navigation
subtitle, reads "Connecting…" until it returns, so a stream that drops and reconnects says nothing.
The Server connection is the Store's `isConnected`, which follows the live streams: the transport
retries transport failures inside a subscription, so an outage never ends the stream, and
`subscribe` reports each failed attempt or dropped stream (`onDisconnected`) and each reconnect
(`onConnected`) instead (`TRPCSubscriptionOutageTests`).
A file the composer could not stage is a native "Couldn’t Add Attachment" alert. The jump-to-message alert and the Inline replies region's Retry keep their own failure
states.

Search focuses its field as the sheet opens, so the keyboard is already up. Each result marks the
matched term in label ink and semibold, and a message whose match falls late starts its excerpt at a
word shortly before it, so the match lands inside the two visible lines. Opened from a Chat's header,
Search offers that Chat as a scope beside Everywhere, through `chat.search`'s own `chatId` filter;
a scoped search lists messages only. A message result opens its Chat and reveals the message through
the transcript's existing jump-and-flash path.

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
horizontally scrollable content such as staged attachments alone. It recognizes alongside scroll views
only, so once it begins every tap and press under the finger fails: the canvas travels with the
finger, so a drag ends inside the row it started on, and a still-live row tap would open that Chat
on release (`DrawerPanDelegateTests`). There is no edge-only hit zone and
no all-or-nothing open. Because the drawer owns every right-drag on the canvas, no canvas row carries
a leading swipe action: a row's swipe actions sit on the trailing edge (swipe-left), as the Inbox's
Mark read and Archived's Restore do, so one drag never both reveals a row action and moves the drawer. Selecting a Chat is the only action that closes the drawer; every sidebar
entry point that presents another surface — Search, Tasks, Settings, Archived, New channel — leaves
the drawer open behind it, so dismissing returns to the open drawer and no presentation ever runs
against the closing spring.

A drag of the drawer is GPU-composited translation and nothing else: a pan frame evaluates no
SwiftUI body and lays out neither the sidebar nor the canvas. `HausDrawerContainer` hosts each side
in its own `UIHostingController` inside `HausDrawerController`, a UIKit container that owns the pan
recognizer, the per-frame offset, and the settle. A frame writes layer properties only, all derived
from one offset by `DrawerGeometry`: the canvas's translation and corner radius, the shadow's alpha,
the veil's alpha, the sidebar's parallax translation, and the width of the rectangular clip that
keeps the sidebar (glass included) out of the canvas's rounded corners. The canvas shadow is a
`shadowPath` on a view of its own, so the canvas's content — bar materials, glass buttons, the
transcript — is never rendered offscreen to find its outline; the corner is the layer's own
continuous `cornerRadius`. Release starts a `UIViewPropertyAnimator` spring seeded with the
release velocity (a short ease-out under Reduce Motion), and a finger that lands mid-settle catches
the canvas where it is on screen rather than where it was heading. Do not move any of this back into
SwiftUI state: the SwiftUI drawer (observable offset read by two small frame views, `.offset`,
`.shadow`, `.clipShape`, and a sidebar `.mask`) re-ran two bodies and re-rendered every effect each
frame, and missed the frame budget on device even after the shell body stopped observing the drag.

`HausDrawerState` is the drawer's discrete state, shared by the shell and the container, and it
never changes per frame. The container reports only the moments a SwiftUI reader needs: a drag
starting (`isDragging`, which with `isPresented` makes `isEngaged`), the drawer committing to a side,
and the sidebar becoming visible or hidden. Each side's hosted root observes exactly one of those
booleans and republishes it into the environment (`hausDrawerEngaged`, `hausSidebarHidden`), so a
drag invalidates each side once when it starts and once when it ends. `set(open:)` from SwiftUI
(the header button, a selection, the veil tap) asks the container to settle. Each committed side
change is a `.selection` haptic from the container, and a Chat switch made without a drawer snap
(from Search or a route) ticks on its own. `onDrawerPresentedChange` reports every settled open and
close so the App can hold the sidebar's order still while the drawer is open; the sidebar animates
a re-sort's row moves when it lands.

A hosting controller starts a fresh SwiftUI environment, so environment the App sets above the shell
does not reach either side on its own. `HausDrawerEnvironment` reads those values where the container
sits and re-applies them inside: the scene phase, the opening entrance, the reaction board, Cloud
Agent cancel, and the engagement and stopped-Agent sources. A new value set above the shell and read
by the sidebar or a canvas screen must be added there. The sidebar host keeps the screen's container
safe area and ignores the keyboard; the canvas host has no safe area at all, because its screens take
their insets as values and read the keyboard themselves.

The sidebar marks what is on screen — Tasks while it is pushed, the Inbox while it is the canvas,
otherwise the selected Chat — with one selection capsule. A Chat row's long press offers **Mark
Read** (when unread, through the Inbox's own `chat.markRead` path) and the Chat's details sheet.
There is no Archive or Copy link there: the phone has no archive action for a Chat, and no app
origin to build a shareable link from. Row heights, the glyph column, and section labels scale with
Dynamic Type (`SidebarRowMetrics`); at accessibility sizes a title may wrap to two lines.

The Chat canvas is keyed by the selected destination: a Chat switch remounts the screen, so each
Chat lays out bottom-anchored and fully formed before the drawer reveals it, and no scroll offset or
screen-local state crosses between Chats. The swap and the closing slide are two events and must land
in two frames. The drawer's geometry — offset, corner radius, veil, shadow, and the pan — belongs to
the UIKit container, which outlives the keyed screen, so the incoming screen mounts inside the moving
canvas and travels with it, its leading edge fixed to the canvas's. The selection reaches the canvas's
hosting controller in the shell's next SwiftUI update, after `selectDestination` returns, so
`selectDestination` defers `HausDrawerState.set(open:)` to the next main-actor turn, and the
container lays the new screen out before the closing spring's first frame; closing in the same turn
slid the outgoing screen for a frame and then showed an empty canvas while the new one mounted. The
hold is the new screen's first layout. The veil decides how the close reads. An interactive close
(drag, veil tap, header button) fades it with the closing spring — the canvas lifting off the same
Chat — while a Chat selection drops it at once, in the frame the new screen appears, so the
incoming Chat arrives fully lit and the slide is the whole transition. `HausDrawerClose` carries that
distinction and `HausDrawerVeil.isPainted` applies it. Anything that must survive a switch — the composer draft,
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
append may do to the viewport, and reveals arrive as one-shot `TranscriptReveal` tokens. A
viewer's own send eases in whole (`animateToNewest`), once: when the send is confirmed and its
optimistic row hands over to the durable row under a new id, that tail insertion replaces a row rather
than adding one (`TranscriptListUpdate.replacedTailCount`), so nothing is staged again and a travel
already in flight finishes; staging it replayed the send from one row lower, which in a short Thread
showed the anchor and hid the reply. Anyone else's reply arriving while the
reader is at the tail is followed from its top (`followNewest`): once it is taller than the
viewport its top is held just below the header as it streams in, the way Claude reads a long
answer, until a drag, a reveal, or a newer item ends the hold. A reader who scrolled up is never
moved: the update's anchor is held, and every later content-size change — a long row arriving
below them and sizing itself a moment after the update — re-applies it until anything else moves
the viewport (`TranscriptListView+AnchorHold`).

An update costs what it changes. The screens memoize their row items per page
(`MessageTimelineProjection`, `ThreadTranscriptProjection`), so the body that runs on every frame of
a drawer pan or keyboard rise hands the list the same array storage and the list's comparison is an
identity check. A visible row is re-hosted and re-measured (`reconfigureRows`) only when its item
changed — which is how a row that grew in place, a streamed reply, gets its new height — or when
`rowRevision`, everything rows read beyond their item (a press tint, a registry's revision, history
load state), changed. An inset-only update re-hosts nothing; `TranscriptListBehaviorTests` pins it. The list
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
travel is the coordinator's own (`TranscriptSettleTravel`, stepped by a display link in
`TranscriptListView+SettleTravel`): each frame writes the real `contentOffset`, so the table lays
out every row the viewport passes over — a `UIView.animate` block on `contentOffset` writes the
destination immediately and leaves everything travelled through blank. The travel holds a distance
from home, not a destination, and reads home live each frame, so a home that moves mid-flight
carries the travel with it. UIKit's `setContentOffset(_:animated:)` travelled to a destination fixed
at its start, and a send moves home under it: an attachment send drops the composer's strip a frame
before the Store's row arrives, its glass keeps collapsing for several frames, and Server confirms
the row under a new id mid-flight. Snapping to each new rest threw the transcript about two messages
away and eased it back. So a resting transcript eases down when the bottom inset shrinks (it still
lifts at once when the inset grows), an append stages from where the previous newest row stood
before the update rather than against the new rest, and while a travel starts past the newest edge
the table's inset is held open to it so UIKit has nothing to clamp; it closes as the travel arrives.
Each settle holds a single-use `SettleTicket`, closed by the travel arriving home or by a drag,
which orphans it. `TranscriptListBehaviorTests.testAttachmentSendMovesTheTranscriptAsOneMotion`
pins the attachment-send motion.

The flip has known UIKit seams, all owned inside `TranscriptListView`: the system scroll edge effects are
hidden (they compute their region from safe areas the flipped table lacks and wash the viewport —
the dissolve is `transcriptTopDissolve`), the opening entrance runs as a UIKit animation because a
SwiftUI opacity animation over a platform view can freeze mid-flight, hosting-configuration cells
carry `minSize` zero so continuation rows keep their tight rhythm, and a row's long press is the
table's own `UILongPressGestureRecognizer` rather than a context menu, because a context-menu lift
of a flipped cell renders upside down; the screen answers it with the message drawer.

An inline reply in a Channel or DM leads its identity block with one quiet parent line, the App's
`InlineReplyPreview`: an elbow in the avatar rail curving toward the parent author's small avatar,
name, and a one-line excerpt, with no card, bar, or icon. The whole line jumps to the parent.
`TranscriptRowGrouping` also opens each calendar day with a quiet divider (`TranscriptDayDivider`:
Today, Yesterday, a weekday within the week, then the date) and never lets an identity block run
across one; a Thread places the same divider between replies as items of its own. Row timestamps
stay times of day.
`TranscriptRowGrouping` owns the App's `markRepeatedReplyReferences` rule: a reply from the same
author to the same parent as the row above skips the line and joins that row's block, so an
acknowledgment and its follow-up read as one answer. A shown reference always opens a new identity
block, and a plain message never joins a reply's block. The composer states the pending target as
"Replying to **Name**" with a cancel control, and lets go of it the moment the reply is sent —
the reply is already in the transcript — taking it back only when nothing left the composer.

Cloud agents use the same Server records as the web App. Settings → Cloud agents lets an Owner or
Admin inspect, connect, or disconnect Cursor on a selected Computer. Connecting opens the provider's
sign-in browser on that Computer, not on the phone; iOS never receives the credential.

Each delegation's typed Message body supplies its inline cloud-agent card in a Chat or Thread.
The parent Chat's preview carries the Thread's cloud agents from `cloudAgentWork.listForChat` as
cards beside the ingress button, never inside it (`ThreadCloudAgentStackView`). One job is just its
card. Two or more collapse like an iOS notification group: `N cloud agents` with a counts line
(problems first and tinted — `1 failed · 2 no update · 6 working · 1 done`), a Show all control,
the full card of the job that most needs attention on top (the first failed job, else the first
with no update, else the first started — `ThreadCloudAgentStack`), and up to two fixed-height edges
peeking beneath it for the next jobs in start order. Jobs keep the order they were started (work
`createdAt`, ties in the Server's order), so nothing re-sorts while agents work; the top card changes
only when a job's state does. Show all lists every job in start order — a calm working job without
a pull request as a compact header-only card that opens the Thread, every other job as the full
card — with Show less above and below. Expansion lives in the session's
`ThreadCloudAgentStackExpansion` (owned by `HausStore`, read through the environment), keyed by
anchor Message id, so it survives the row scrolling away and the Chat reopening; stacks start
collapsed. Toggling animates with a spring (a 150ms ease under Reduce Motion). The Thread connector keeps running down the left of the cards and turns in beside the top
card, or beside the bottom Show less when expanded. Cards follow the
[card contract](../../specs/cloud-agents.md): the Server's `job` headlines in Cursor's vocabulary
(never "Queued"), an optional PR row, exactly one single-line status line
(`CloudAgentStatusLine`), and View PR / Open in Cursor / a chevron menu with Copy link and, for
Owners/Admins, Cancel run. Missing diff evidence stays absent, not zero.
`cloud-agent-work.updated` refreshes the loaded Thread and parent Chat through the normal durable
event/reconnect path. Cards scroll with their Messages and follow-ups update the same card.

An anchor message owns one unboxed Thread ingress, joined to its avatar rail by a rounded connector.
The reply count and chevron lead, followed by the latest Server-projected reply's avatar, author,
and one-line snippet. Task status remains a secondary note; cloud agents sit below as cards (above).
The whole ingress opens the Thread, including before a Task's first reply. Every row uses an 18pt
identity mark. Reply and Task rows enter, exit, and swap with a 220ms slide/fade; Reduce Motion uses
a 150ms crossfade. The count stays in place. The anchor
message remains the task title and is never duplicated inside the ingress.

Chat honors the App's own task visibility rule (`TaskVisibility.visibleInChat` in `HausModels`,
applied through `ThreadPreviewProjection.ingressTask`). An **empty** claim an Agent made for itself
states nothing in Chat unless the reader asked for it: no note, no ingress, no reserved space. A
task a human composed or converted always states itself, and so does any task whose Thread has
replies — the App's own `hasReplies || taskVisibleInChat(…)` rule. Once people are talking in a
Thread its card is on screen anyway, and which work they are talking about is part of reading it,
so the ingress states `Task #N · status` even under a hidden claim. The preference is per device,
like appearance — `@AppStorage` under the App's own `haus.chat.showTasks` key — and Settings →
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
→ Task list → Chat canvas.

Opening a Task leaves the canvas selection alone — its route carries the
parent Chat id and the Task carries the child Chat id, so selecting the parent would mark a channel
the user never visited as read and strand them there once the Tasks list pops. A pushed Thread owns
the open Chat while it is on screen, and the shell's Chat selection resumes ownership when it pops;
the covered canvas Chat stays named so its page keeps refreshing underneath, but read
acknowledgements belong to the deepest surface alone.

A Thread is titled "Thread", or "Task #N" for a Task's Thread, with its conversation ("#design", or
"DM") as the subtitle (`ThreadOpening`). One the anchor says has replies opens blank until its first
reply page lands — at most `ThreadOpening.holdLimit` — so the push never draws the anchor first and
then snaps to the newest reply.

The Inbox is the phone's landing screen and the sidebar's anchor. It mirrors the App page section
for section — header, **Active this week**, **Unread**, **Happening now** —
because [that page's order is the contract](../features/inbox.md), and it renders from the Store
snapshots below rather than from reads of its own: `HausUI/Inbox` owns the row projections and the
page, and `HausApp/InboxPresentationAdapters.swift` is the only place the Store's records become
them. A section renders nothing at all until its read lands, so an unsettled section is blank rather
than an empty box that fills a moment later; **Unread** waits for the Chat list, which is the
same read the sidebar dot waits for.

It is the canvas itself, not a push on the root stack. A cold start shows the Inbox page as the
shell's canvas — no navigation bar, no title, no Back chevron, because there is nothing behind a
landing screen to go back to — and the page's greeting and date are its first content. The Chat
canvas and the Inbox take turns in the one canvas slot, so the drawer belongs to the slot rather
than to either of them: the leading chrome button sits where it sits on a Chat screen, and the veil
and the edge pan are the same ones. `showsInbox` is App-owned state (`AuthenticatedHausView`) and
the shell clears it whenever a Chat is selected; the sidebar's Inbox row sets it back. The last-open
Chat is still restored for the drawer's selection, and selecting one swaps the canvas the way it
always did. `HausRootRoute` therefore carries only `.tasks` and `.thread`. A Cloud Agent work row
pushes the Thread it hangs off, carrying the conversation's Chat id and the anchor Message — the
same pair a Thread composer sends to — and leaving the canvas selection alone for the same reason a
Task does; an Unread row opens its DM or Channel.
Unread and **Happening now** rows share one Messages-style two-line row (`InboxRowView`): a 44pt
mark, the title with its perishable fact trailing, and the context below in secondary. Each line is
capped at one, so every row in both sections is the same height at a given text size. At
accessibility sizes the title may wrap and the trailing fact stacks under it instead of squeezing the
title to a letter, and the mark scales with the text up to 64 points. Every row's separator starts
under its title, whatever its mark drew. An Unread row
is the Chat's name, its age, and the quoted line truncated to one line. A Cloud Agent work row is
the work's title (`Cloud work` when untitled), its job status (`Working · 3m`, `Working · 1h 59m`,
or `Follow-up waiting · 2m` for a settled job listed only for its live follow-up —
`CloudAgentPresentation.duration`, the App's `formatCloudAgentDuration`, whose hours never roll
into days), and `#channel · Agent`; the provider glyph, boxed like a Channel mark, already says
it is Cloud work, and carries a presence-style dot — yellow running, gray queued. An Agent mid-turn is its name, time in its step, and the step itself. The page is a stock `.insetGrouped` `List`, so an Unread
row marks read with a trailing swipe (swipe-left; `.swipeActions(edge: .trailing)`, full swipe
allowed) whose button is a bare image, which iOS 26 draws as an icon-only circle (its accessibility label is "Mark read"),
confirmed by a success haptic, or the long-press peek's **Mark Read**. A week card that lands after
the **Active this week** strip has drawn joins it with an animated insertion rather than a reshuffle.
Stalled claims live on the Task list, in its **Stopped before finishing** group. One row still lands somewhere the App does not send it, because the phone
has nowhere else: an Agent in **Happening now** opens that Agent's DM rather than a profile page. The sidebar's first row is the
Inbox, wearing the iridescent Haus ghost at 26 points in the same glyph
column every other row uses — a deliberate exception to the column's 26-point boxed glyphs, because
this mark is the logo rather than a screen's icon, and it grows inside the shared column so the
`Inbox` label stays on the `Tasks` label's edge. It marks
`unreadChatCount` with the unread dot the Chat rows wear — absent at zero, which is also
what it reads while the count is still unknown. Its mesh drifts, and drifts quicker while an Agent
on this Server is working: `HausStore.agentActivityGhostTempo` resolves the App's own rule through
`HausGhostTempo.resolve`, and reads one stored bit rather than the activity dictionary
`agent.onActivity` rewrites on every tool call, so a busy Server does not invalidate the shell.

What the Inbox stands on is Server-wide and Store-owned rather than screen-owned. `HausStoreInbox`
reads the Chat list's unread Chats, the Cloud Agent work running right now
(`cloudAgentWork.listActive`), and the Server's token-usage snapshot (`stats.live`), and each stays
nil until its first load. That nil is load-bearing: `unreadChatCount` is nil until the Chat list
has landed, so "nothing unread" is never confused with "not yet known". The count is the number of
Chats with an `unreadCount` above zero on the active Server, the same Chats the App lists, and it
drives the sidebar's Inbox dot. The app icon badge is not that count: it is the Server's cross-Server
`chat.unreadChatCount`, the number push puts on `aps.badge`. `HausStoreIconBadge` reads it into
`iconBadgeCount` wherever the Chat list reloads (Server load, snapshot refresh on foreground or
reconnect, every `reloadChats`) and on becoming active without a background trip. Durable events refresh only what this
client already holds, the way the App's invalidation only refetches a live query:
`message.created` and `chat.read` reload the Chat list, `task.created` and `task.updated` reload the
Server Task lens beside the affected Chat page, and `cloud-agent-work.updated` reloads the active
work list beside its own.
A failed Inbox read keeps the previous snapshot and is logged — a stale row is honest, while a
Chat-level send alert raised by a background read is not.

An Unread row ([ADR 0038](../adr/0038-inbox-is-unread-not-attention.md)) is one Chat from the
Chat list with an `unreadCount` above zero. Opening it reads it the way any open transcript does;
**Mark read** sends `chat.markRead` with the Chat's `lastMessageSequence` and `includeThreads: true`,
so the Thread replies its count rolls up clear with it, and newer activity brings the row back.
There is no question screen, card, or marker — the mention chip in the transcript is the whole
presentation of a question ([Inbox](../features/inbox.md#notifications)).

A Task lens widens through `loadTasks(includeBackground:)`, and
a Server-wide read keeps `task.list`'s `backgroundCount` on the Store so a surface can say "N
background" without a second round trip. An "Active this week" card keeps its figure and sparkline
on one row at standard text sizes; at accessibility sizes it widens, stacks the header, figure, and
sparkline, and lets the caption wrap rather than truncate. The week behind "Active this week" is sliced per Agent out
of that one usage snapshot (`AgentTokenUsage.summarize`, the App's `summarizeAgentTokenUsage`) on
UTC days, because ranking a week is a question about every Agent at once and a per-Agent read was
never its shape. A Chat row's quoted last line is Server's own `lastMessage` projection and stays
raw Markdown; collapsing it to one plain line is the reader's job.

Swift optimistic Chat and Thread rows remain app-local and keyed by the client nonce. Thread replies
use the canonical parent Chat plus anchor-message contract. A failed mutation keeps its row, marked
"Not sent", for Try Again or Delete, while a successful row remains pending until a refreshed Server
page contains the matching nonce. The transcript is the durable page in Server order followed by
`OptimisticMessageRow.unsettled` rows in send order; pages load as whole snapshots, so a message
that arrives while a send is in flight sits above it, and the page that carries the nonce places
the row by sequence. The send receipt's canonical id is adopted first, so that page swaps the row in
place under the same id. `OptimisticTranscriptTests` pins confirmation, interleaving, rapid sends,
and failed-then-retried rows. On returning to the foreground, the app keeps cached presentation
visible, refetches its Server snapshot in one gathered pass — applied as a single repaint, with
every Chat surface on the stack refetched eagerly: the deepest open Chat first, then the canvas Chat
underneath it, so popping a Thread reveals a parent that is already fresh instead of one round trip
stale; the event walk and `openChat` cover the rest — then restarts live Chat and Agent lifecycle
streams. A return from under 30 seconds in the background with healthy streams skips all of that and
keeps the streams: a frame sent while suspended is still in the socket, and a dropped socket
reconnects and walks the event log on its own. A voluntary refresh keeps the connected state;
offline is what a failed refresh or a broken stream reports. The transport reconnects transport
failures itself; an error it will not retry (auth, procedure) or a stream the Server ends restarts
all three streams with capped exponential backoff (1s doubling to 60s) after a forced Clerk token
refresh, and the chat stream's connect catch-up recovers what was missed. Live SSE Chat events coalesce for a
short window (`ChatEventCoalescer`) before the existing batch applier runs, so a burst lands as one
refetch fan-out rather than one per frame. The batch refetches affected loaded pages concurrently,
and every event-driven `chat.list` read shares one coalesced refresh with a 150ms gather window, so
the `chat.read` echo of the acknowledgement a `message.created` batch made does not read the list
again. Events carry no unread count (it includes followed Thread replies and excludes the reader's
own), so the client never patches unread locally.

A cold launch paints from an on-disk launch snapshot before the network answers
(`LaunchSnapshot`, `HausStoreLaunchSnapshot.swift`): the last Server list, Chat list, Agent and
member directories, the Server usage read behind the Inbox's week strip (optional, so an older
snapshot still decodes; without it the strip popped in after the paint and shoved the page down), and
up to three bounded latest-message pages (the canvas and open Chats first), written as versioned JSON to Application Support atomically (file protection until first unlock, the
directory excluded from iCloud and Finder backups; Application Support rather than Caches so storage
pressure cannot purge the paint), off the main actor, at most once per two
seconds and again when the app leaves the foreground. It is a cache: scoped to the signed-in Clerk
user, discarded on a version, user, or decode mismatch, cleared on sign-out, and replaced by the
live load. The live launch is `server.list`, then `chat.eventHead`, then the Chat list, Agent list,
and identity-synced member list together, then the mounted pages; Computers and the badge load
after the shell is up. A painted launch whose live load fails stays on the painted state, reports
offline, and retries with backoff.

The Chat projections the shell renders every frame — message rows and the destination list — are
memoized in the Store behind a structural invalidation contract: their input fields are stored
privately in `HausStore` and published through accessors whose setters drop equal-value writes and
retire exactly the cached projections that field feeds. A new field a projection reads must join
that "Projected Server state" block, and a projection must read its observable inputs before its
cache check so a cached answer leaves the calling view subscribed to exactly what a rebuilt one
would. Rows are cheap to rebuild; body parsing is not, so each message's parsed body (visual fences,
rich blocks, resolved reference chips) is memoized by id, content, and a reference revision
(`MessageBodyMemo`, `ReferenceDirectory`) that moves only when a chip-visible name, avatar, or
channel appearance changes. A Thread chip's label comes from another page — its anchor's first line
in the parent Chat — so a parsed body also records each Thread chip's resolved label and reparses
when it would now differ, and a page write retires the rows of every Chat that links into that page
(`ReferenceReferrers`). Presence and unread churn rebuild rows from cached bodies, and a page,
optimistic-row, or cloud-work write retires only the Chats whose values changed. Optimistic rows adopt the canonical Server message id from the send receipt, so a pending
row's presentation id is a real Server id from that moment and its ForEach identity never changes
when the durable row arrives. Chat and Thread timelines keep a 200-message window in Server sequence
order. `chat.messages` reads 50 rows using exclusive `beforeSequence`, `afterSequence`, or
`aroundMessageId` selectors. Moving either direction evicts the opposite edge and leaves a cursor
for reloading it. UIKit reuses visible cells; a surviving visible row and its pixel offset anchor
window changes. New events update overlapping rows while reading older history, without joining
disconnected ranges. Returning to latest replaces the window when needed.

The Store retains six recently used Chat windows, protecting mounted, sending, and loading Chats.
Filtered inline-reply windows have the same 200-message bound and a separate six-root cache.
Derived message projections and visual-height measurements are retired with evicted history.
Search and reply-reference jumps fetch a page around the target instead of walking every older page.
History requests carry identities so a superseded response cannot overwrite a newer navigation.
Deploy the Server paging contract before distributing this iOS build: older Servers reject the new
forward and around-message selectors. Older iOS builds ignore the added response cursor.
The Swift prototype keeps one in-memory event cursor per active
Server, walks `chat.events` from that cursor on reconnect, and refetches loaded affected Chat pages.
The SSE connection is established before recovery, while buffered live events are consumed only after
the walk completes, so events arriving during recovery are not missed. A cold start seeds the cursor
from `chat.eventHead` read before its Chat list, directory, and page reads, so the first stream
connect walks only newer events;
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
and a message outside the loaded window is fetched by its authorized `aroundMessageId` selector.
A failed lookup offers retry without walking the entire transcript. Archived channels load
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

The Chat canvas answers the keyboard by hand. The shell's geometry ignores the keyboard entirely
(`.ignoresSafeArea(.keyboard)` on `HausShellView`), so the sidebar never resizes for one, and the
Chat screen reads the keyboard itself through `onKeyboardInsetChange` (`KeyboardInset.swift`): a
probe pinned to UIKit's `keyboardLayoutGuide`, which follows a finger through interactive dismissal
frame by frame, plus the announced end frame of `keyboardWillChangeFrame`, which lands a keyboard
that leaves while the screen is mid-transition. Each reading carries its own transaction — the
keyboard's curve (`ComposerKeyboardMotion.travel`) when UIKit animates the keyboard, none while a
finger drags it — so the composer rides the keyboard's top edge through the rise, the fall, and a
drag in either direction. A keyboard frame counts only while something is first responder: after a cancelled back
swipe out of a Thread, UIKit keeps reporting a 233-point keyboard that is not on screen.

Do not go back to SwiftUI's keyboard safe area read through the shell's `GeometryReader`: it
floated the composer a growing gap above the keyboard as a draft grew (about 57pt at six lines),
went stale across a Thread pop so a returning keyboard covered the composer, shrank the sidebar
under a keyboard still up, and, with a spring on every step, trailed the finger through a drag.

Three gestures put the keyboard away. Dragging the transcript down into the keyboard dismisses it
interactively (`keyboardDismissMode = .interactive` on the flipped table) and is cancellable by
dragging back up. A tap on the transcript that lands on no row control resigns the composer
(`onContentTap`, the Thread's existing rule); links and controls still act on that tap, and a long
press still opens the message drawer. And anything that covers the composer resigns it first: the
drawer as soon as it is open or under a finger (`HausDrawerState.isEngaged`, published to the screen
as `hausDrawerEngaged`), and a pushed Thread. Neither raises the keyboard again when it goes away;
a sheet, which takes the keyboard for itself, hands it back on dismissal the way UIKit does. A
pushed screen such as Thread keeps the system bar and native keyboard avoidance, and needs none of
this.

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
upload is unresolved, with no upload indicator; a failed send keeps the text and files on its
"Not sent" row for Try Again, and successful Server attachments render identically in
main timelines and Thread replies. Opening an image attachment opens the attachment viewer described
above; every other kind resolves its cached file and presents the native Quick Look surface. The
client enforces the Server's 50 MiB limit before reservation.

Message reactions render as the App's die-cut stickers (`Sources/HausUI/Chat/Reactions/`), on a
compact row under the body: one sticker per reactor per emoji in the Server's order, four drawn and
the rest behind a "+N", 19pt apart on one baseline. Each leans exactly 8°, even places left and odd
right, the App's `stickerTilt`, so a pile poses the same on both clients; the landing burst's seed is
the App's FNV hash. The pile scales with Dynamic Type as one piece, capped at 1.6×. A sticker
is a bitmap `StickerImageRenderer` draws once per emoji: the glyph at 160pt, its alpha blurred and
thresholded back to a hard edge in Core Image for a round-brush outline, and a soft close
shadow. The outline is white in light mode and near-black (`#0A0A0B`) with a lighter shadow in dark
mode, matching the App's `--reaction-diecut` token; bitmaps cache per emoji and appearance.
`chat.react` sends the viewer's reaction; its receipt patches every loaded page carrying the
message and `message.reaction.updated` refetches the affected lenses. Tapping a sticker toggles the
viewer's own emoji.

Long-pressing a durable message, in a Chat or a Thread, opens the message drawer
(`Sources/HausUI/Chat/MessageActions/`): a stock sheet with the grabber and system dimming, its
height a custom detent measured from the actions list so it ends at the last card for any Dynamic Type
size. The sheet sits over the transcript, which never scrolls or insets for it, so the pressed row may
end up covered. It leads with six rounded tiles — the head of the viewer's
frequently used emoji, kept in `UserDefaults` by `FrequentEmoji` and seeded with the App's quick
four plus 🔥 and 👋 — tinted where the viewer already reacted, so pressing one takes it back; then a
smiley tile. When the message has reactions, a "6 reactions · You, Blippy, Cove" row pushes the
reactors list inside the sheet, one line per sticker, the viewer's own first with a checkmark and
removed on press, which is iOS's place for what the App shows on hover. Inset grouped cards follow:
Reply (where the Chat has inline replies) and Reply in Thread or Open Thread, then Copy Text. The
Thread's drawer keeps reactions and Copy Text. A chosen action runs after the sheet has gone, so a
push or the composer's focus never races the dismissal. VoiceOver cannot reach the row's long press, so each
message's identity block reads as one element — author, time, body — carrying the drawer's actions
as rotor actions (React opens the drawer; `MessageRowAccessibility`).

The smiley turns the drawer, in place, into the emoji picker at 75% of the screen (draggable to full;
the reactors list opens the same way)
(`Sources/HausUI/Chat/Reactions/Picker/`): a search field on the ordinary keyboard, Frequently used,
then every Unicode group in one lazy grid with a category bar along the bottom, and a long press on
an emoji that takes skin tones offering them in a popover. The data is
`Resources/emoji-catalog.json`, generated by `scripts/generate-emoji-catalog.ts` from the pinned MIT
datasets `unicode-emoji-json` (order, groups, CLDR names, versions, skin-tone support) and `emojilib`
(search keywords, so "dino" finds 🦖). `EmojiCatalog` drops emoji newer than the OS draws (Emoji 15.1
before iOS 18.4, 16.0 before iOS 26.4, then 17.0) and anything `ReactionEmoji` (a port of the
Server's `normalizeReactionEmoji`) rejects, and every pick is checked by it again before sending. A
reaction chosen in the drawer is sent at once and its stamp waits for the sheet to close.

Only a reaction that arrives live stamps in: the 0.65s fall from 8×, squash, and a dust burst drawn
in a `Canvas`, with a 2pt row thud and a rigid haptic on the landing frame. `ReactionStickerBoard`
holds that app-local state beside, never inside, the durable pages: the fresh-reaction ledger
(ported from the App's `fresh-reactions.ts`), the viewer's unconfirmed adds, and running stamps,
which the sticker samples by time so a recycled cell picks a stamp up at the right frame. Every row
reports its pile, empty ones included, because a message's first pile is its baseline; history and
relaunches therefore render at rest. Reduce Motion keeps the haptic and drops the stamp. Transcript
cells do not clip and stack newer rows over older ones (`TranscriptCell`) so a fall can pass over
the messages above, and an add chosen in the drawer waits for the drawer to close before it
stamps.

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
Server message arrives; a failed send stays in the transcript as a "Not sent" row for an explicit
retry.
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
markdown and the reference target are untouched. A one-line preview has no mark to say what a
reference is, so `RichMessageParser.oneLinePreview` mirrors the App's `messagePreviewLine` instead:
every link reads as its link text as written (`#product`, `@Blippy`, `$agent-browser`), and heading,
bullet, emphasis, and code markers drop away. Human references remain visual and do not create
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
`.link` at all, where the App opens a profile or a channel. A Thread chip is the one in-app route: the
Server rewrites an Agent's Thread mention to `chat://<chatId>?thread=<anchorMessageId>`, which
`ThreadReferenceTarget` reads ahead of the Channel form (any other query on `chat://` is no reference,
as in the shared parser). It wears the App's thread glyph, names its anchor's first line once the parent
page holds the anchor, and keeps that wire target as its `.link`; the coordinator asks
`InAppReferenceRoutes` before handing any URL to the system, and the App's installed route pushes the
Thread over its parent Chat, fetching the anchor when the page is not loaded. A table cell is SwiftUI
`Text` rather than the text view, and a `Text` link inside a hosted transcript row never receives its
tap. So a cell carrying exactly one link is that link as a whole: it drops the dead `.link`, takes a
tap gesture that calls `openURL`, and gives up text selection, which would take the tap.
`RichMessageTableView` installs `inAppReferenceRoutes()` on that `openURL`, so a Thread chip in a
cell opens its Thread the same way. A cell with two or more links still draws them, and they stay
inert on the phone. UIKit's own link machinery decides the
tap, and `RichMessageLinkCoordinator` — the representable's `UITextViewDelegate` — decides only what
it means: `textView(_:primaryActionFor:defaultAction:)` returns a `UIAction` that hands the address
to `UIApplication.open`, and `textView(_:menuConfigurationFor:defaultMenu:)` returns nil so a link
offers no menu of its own against the row's. The long press still belongs to the row's message drawer,
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
for inside the self-sizing transcript cells. Each text view retains up to four proposal-size results
until its attributed text changes. This avoids repeated TextKit measurement during SwiftUI's width
probes while still invalidating for content, Dynamic Type, and Bold Text changes. Reference-mark
revision is computed once per message body, rather than scanning every block for every block.
A long press belongs to the row, not the text: the text
view refuses its own long-press recognizers so `TranscriptListView`'s row press wins, leaving
double-tap word selection intact. The body carries an accessibility label naming each reference's
kind, and the text view's value is suppressed so VoiceOver reads the sentence once, as
`Agent reference, Marlow`.

A message is read when it has been on screen, not when its page loaded — the phone runs the web
App's rule rather than a mobile variant of it. `chat.markRead` carries the highest sequence the
viewport has actually shown, and nothing else moves the mark: a Chat opened and left at the top of
a long unread run stays unread until the reader scrolls down to the newest rows. The transcripts
answer that question from the substrate they already sit on — `TranscriptListView`'s flipped table
knows exactly which cells intersect its bounds, so `indexPathsForVisibleRows` is the phone's
`IntersectionObserver`. Visible ids ride the same once-per-runloop-turn sync as the near-newest
reading, for the same reason: mid-turn geometry describes a viewport that is still landing. Rows
sitting behind the header's or the composer's glass count, because glass is translucent and the
browser counts them too.

`ChatReadLedger` in `HausModels` is the rule as one pure value, and it owns four properties the call
order cannot be trusted to produce: a Chat's visible mark is a **high-water mark**, so scrolling
back into history never sends a lower sequence; one `(chat, sequence)` is **attempted once** while
it is in flight; a **failed** acknowledgement releases its claim without advancing the mark, so the
next visibility change or foreground retries it; and nothing acknowledges at all unless the app is
**frontmost**, the phone's reading of the web App's document-visible-and-window-focused gate.
Returning to active re-evaluates the open Chat's current mark. Reads still belong to the deepest
surface alone: every mounted transcript reports what it is showing, including a canvas Chat a pushed
Thread covers, but only `openChatID` acknowledges — and while the Inbox is the canvas there is no
Chat screen mounted to report at all. The durable `chat.read` event — which Server writes only when
the read moved and addresses to the reader alone — owns the `chat.list` refresh, exactly as the web
App's `useChatRead` does, so one acknowledgement produces one list refresh and unread counts remain
Server projections rather than local durable state.

Native Thread routes are anchored by the parent message id, which exists before the child Chat is
created. The route also carries the parent Chat id and may carry a resolved Thread Chat id. Opening an
unthreaded message therefore needs no speculative Server write: the first reply sends the parent Chat
id plus the anchor message id, adopts the returned child Chat id, and continues on the same screen.
Thread optimistic rows stay keyed by the anchor across that transition; once Server names the child
Chat, the Store records the provisional key's adoption (`adoptedChatIDs`) and `threadChatID` answers
with it, so the open screen reads the Chat the row moved into before the parent page refetches. Existing Threads reuse the
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
Sign Out is the Settings root's last group and confirms first. `HausStore.signOut()` owns it: it
ends the Clerk session (a failure throws and leaves the viewer signed in), then stops event streams,
drops the restored last-open Chat, and empties the avatar image cache (decoded and on-disk bytes),
the in-memory attachment decodes (`AttachmentImageMemory`: timeline thumbnails, viewer pages, staged
composer files), and the attachment disk cache; a load already in flight cannot repopulate any of
them. The auth boundary discards the Store's in-memory snapshots. On any session loss the auth
boundary dismisses the authenticated app's presented sheets before it swaps the root: SwiftUI
re-hosts a sheet whose presenter unmounts with fresh state, which flashed Settings back to its top.
If UIKit drops that dismissal's completion (a sheet mid-transition), the swap still runs after one
second. In Debug, an explicit
sign-out persists `haus.debug.explicit-sign-out`, so auto sign-in stands down across relaunches until
the human taps "Sign in to local Server".

## Native surface

The app shell, navigation, chat timeline, composer, and threads are native SwiftUI. An interactive
artifact may use an isolated web canvas inside a native route when the artifact runtime requires
browser APIs; that canvas would receive a narrow serialized contract and would not own authentication,
navigation, Server queries, or durable app state. An ```` ```artifact ```` page is the one such
canvas today (see the artifact cards above).

Corners come from one scale, `HausRadius`, beside `HausPlatformColor`: `inline` 4 for text-run plates
such as inline code, `small` 8 for compact controls, `medium` 12 for content inside a transcript or
list row (cards, code blocks, image tiles, press tints, the action list), `large` 16 for standalone
surfaces and floating banners, and `grouped` 22 for Settings sections, always `.continuous`
(`.haus(_:)`). A surface takes its tier by role. A box forced to an exact side derives its corner
instead: an icon mark is `HausRadius.mark(side:)`, a third of its side, the Channel icon's shape, and a
box nested in a rounded surface is concentric with it (`HausRadius.nested(in:inset:)`). The composer's
own surfaces and portal keep their measured corners for now.

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
chip beside the fact it repeats — so no surface here carries an unread badge. A channel's Chat
details sheet shows its Server description in an "About" section under the hero, the same shape as
an Agent profile's About, and shows nothing when the channel has none. The phone reads channel
descriptions but does not edit them; editing stays in the App. The Chat
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
