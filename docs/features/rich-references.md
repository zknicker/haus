---
summary: User-facing rich reference behavior for mentions, skills, apps, plugins, files, product chips, time chips, and future product cards.
read_when:
  - changing chat mentions, rich reference rendering, autocomplete references, or explicit typed links in messages
  - adding a new reference type such as agent, skill, app, plugin, file, directory, pull request, product, ASIN, memory, chat, or session
  - changing time chips, their detection rule, or how they read in the viewer's timezone
---

# Rich References

Haus messages can include typed rich references. A rich reference is a normal
Markdown link whose target tells Haus what the link points at. Settled chat
messages render through HeroUI Markdown; the stored Markdown remains the
portable fallback.

Examples:

- `[@Haus](agent://agt_primary)` addresses an Agent in a channel.
- `[@Ada Lovelace](user://usr_ada)` references a human by immutable user id.
- `[$ui](skill://ui)` references a skill for the turn.
- `[@Chrome](app://computer-use/com.google.Chrome)` references a Mac app.
- `[#product](chat://cht_product)` opens a channel by immutable chat id.
- `[README.md](/repo/README.md)` references a file.
- `[#482](pr://github/haus/haus/482)` references a GitHub pull request.

The human composer persists selected references as explicit typed links. Agent
output may use bare `@handle` and `#channel` tokens; the Server resolves known
tokens once at send time and persists immutable typed links. Unknown or protected
tokens stay plain text. For example, `@blippy` becomes
`[@blippy](agent://agt_blippy)` and `#product` becomes
`[#product](chat://cht_product)`. Human handles resolve against active Server
memberships: `@ada` becomes `[@ada](user://usr_ada)`. Ambiguous handles stay
plain text. Retries reuse the original stored targets, including after a handle
is renamed or reused. The same lookup applies to Agent creation announcements
and Cloud Agent work messages. A resolved human mention addresses that human: it sends them a message
notification ([ADR 0037](../adr/0037-humans-are-addressed-by-mention.md),
[ADR 0038](../adr/0038-inbox-is-unread-not-attention.md)).

Agent directory output includes copyable `user://` and `agent://` Markdown
links. Agents can keep those links in workspace notes and reuse them in messages;
the identity remains bound to the id if a handle changes. A plain handle saved
in an older note still requires checking against the current directory.

## Product Rules

### Amazon prototype

Haus App renders US Amazon product links and standalone uppercase ASINs as
product chips as soon as the text matches. Whether text becomes a chip never
depends on RankWrangler: the chip links to Amazon with the ASIN as its label and
a product placeholder mark, and the RankWrangler lookup fills it in place.
While the lookup runs, the placeholder pulses and the hover card says product
details are being fetched. Once it completes, the label becomes RankWrangler’s
generated short name (else the ASIN) and the mark becomes the transparent cutout
thumbnail in an 18px box, else the listing photo. A lookup that does not
resolve keeps the ASIN chip unchanged; only the hover card's notice explains it:
"Fetching product details…" on the first read, "Product details are taking
longer than usual. Retrying…" while bounded retries run, "Product details are
temporarily unavailable. We’ll try again shortly." once they give up on a
transient problem, and "Product details unavailable" for an unknown ASIN or a
permanent failure. Once a lookup has explained a problem it never falls back to
the bare loading copy. Without a RankWrangler connection in Settings →
Connections the hover card notes that details need it.
The hover card retains the full listing
title. Hover or keyboard focus opens a compact glass card with a title of at most two lines, brand, and available price. The transparent product cutout floats beside it, tilted slightly, with a brief settling entrance and sparkle. Reduced motion disables the decoration. Clicking opens Amazon.

ASIN recognition requires ten uppercase letters/digits beginning with B and
containing a digit. Links support amazon.com `/dp/`, `/gp/product/`, and
`/gp/aw/d/` product paths. Short links, other marketplaces, Etsy, code, and
unrelated links are excluded. Stored Markdown stays unchanged; older messages
gain the same presentation. Native iPhone product previews are not part of this
prototype.

Server membership authorizes preview reads through the connected RankWrangler
account. Agent tool calls still require an explicit connection grant. Credentials
stay on Server. Lookups share a bounded five-minute Server cache; account changes
clear it and invalidate App reads. Each chip makes its own
`mcp.amazonProduct` read and fills in as soon as its answer arrives; no chip waits
on another product. The App sends these reads, and the hover-card detail read, as
their own unbatched HTTP requests (`skipBatch`), so a slow product never holds the
tRPC batch that carries a screen's other queries. The read returns one typed
result: `found` with the summary, `temporarilyUnavailable` with
`retryAfterSeconds` (1–30), or `unavailable`; `null` means no RankWrangler
connection. Server makes exactly one RankWrangler `get` per product with
`include: ['shortName', 'cutoutThumbnail']` and shares an in-flight read between
concurrent chips. RankWrangler waits, up to about 20 seconds, for the short name
and cutout, then returns the listing with anything unfinished settled as
`shortName: null` or an unavailable cutout, so a found summary is final and
nothing polls. The Haus MCP invocation timeout (30 seconds) covers that wait. A
transient failure (a retryable RankWrangler error with its `retryAfterSeconds`,
an MCP timeout, or an unreachable upstream) is `temporarilyUnavailable`; anything
else, including an unknown ASIN, is `unavailable`.

The App's React Query lookup owns retries. A `temporarilyUnavailable` result or a
failed read retries three times with exponential backoff that starts at
`retryAfterSeconds` and caps at 30 seconds. After that the hover card shows the
temporary notice and, while it stays open, the lookup tries again every 15
seconds and fills in once a read succeeds. Transient and unavailable results are
never cached on Server.

Market data loads only on preview, through a separate `mcp.amazonProductDetail`
read with `include: ['marketData']`, so the chip never waits on market data.
Removed listings show last-known data with a removal label. Missing prices and brands are omitted. An upstream detail failure leaves the thumbnail and title
visible with an unavailable notice.

The Agent Manual topic `amazon-product-references` explains the syntax and tool
access. No system-prompt expansion or special Agent tool call is required for
rendering.

### Time chips

Haus App renders a clock time written with an explicit timezone as a time chip,
the same way it finds ASINs: by scanning a settled message's prose when it
renders. Stored text, previews, and push stay exactly as written. Agents write
normal prose; the prompt asks them to give every clock time a timezone in the
reader's saved zone, looked up rather than assumed from the Agent's machine.

A chip needs a clock and a zone: `3 PM ET`, `3:00 PM EDT`, `15:00 UTC`,
`9am Pacific`, `Fri, Oct 10 at 3 PM ET`, `tomorrow at 3 PM ET`,
`3 PM ET next Tuesday, Oct 13`, `03:17:42 UTC`, `12 PM (ET)`, or a range like
`10–11 AM ET` (one chip). Zones are UTC, GMT, the US ET/CT/MT/PT families
(`EST`, `EDT`, `Eastern`, `Eastern Time`, …), and IANA names such as
`America/New_York`; every US abbreviation means that region's wall clock, so `CST` is US Central
and `3 PM PST` in July is 3 PM Pacific daylight time. Relative days and a bare
clock resolve from the message's sent time in the stated zone. Day-only text
(`tomorrow`, `Friday ET`), vague times (`tomorrow morning`), durations, clocks
without a zone, code spans and blocks, and blockquotes stay plain text. The
exact grammar lives with `findTimeChips` in `packages/haus-api/src/time-chips.ts`,
which native clients mirror.

The chip reads the instant in the viewer's saved Profile timezone (this
device's zone while it is blank) with reminder day words: "Today at 3:00 PM
EDT", "Tomorrow at …", "Sat, Oct 10 at …", with the year outside this year.
Its clock mark and dotted underline match the other tertiary reference chips.
The hover card lists the viewer's zone, then Pacific, Eastern, and UTC, without
repeating the viewer's own zone.

### Shared references

- Markdown content is the source of truth.
- Agent references bind to immutable Agent ids, not reusable handles. A reference
  to a deleted Agent stays attached to that historical identity even if a new
  Agent later reuses the same visible handle.
- Agent reference chips resolve the current Agent display name and avatar. The
  persisted label remains the fallback when that Agent is unavailable.
- Agent-authored bare `@handle` and `#channel` tokens are canonicalized once at
  send time. Human-authored composer references remain explicit typed links.
- Existing `#channel:<anchor-ref>` Thread targets become a single readable
  chip with a connected-message Thread icon, labelled from its opening message or
  cloud assignment title. Hover or
  keyboard focus previews the title, channel, reply count, and latest reply.
  Activating it opens that Thread, using immutable parent
  Chat and anchor Message ids carried inside the link. Unknown or ambiguous
  targets remain plain text in full; the App does not link only their Channel.
- Unknown or protected bare tokens remain unchanged. Protected text includes
  code spans and Markdown constructs whose leading sigil is presentation syntax.
- Agent chips open the referenced Agent's profile (a tab on desktop, the profile
  page on web; see [ADR 0038](../adr/0038-destinations-open-as-tabs.md)); hover
  shows the Agent hover card. Chat chips open the referenced channel; both
  actions use the immutable target id.
- One-line previews, such as the thread preview under a message, show a
  reference by its label text alone (`#product`, `@Blippy`), never its target.
- Human references bind to immutable user ids. Their visible chip label and
  avatar resolve from the live profile; departed or unknown humans keep the
  persisted label and never rebind when a handle is reused.
- Saved messages do not need `metadata.haus.mentions` to render, route, or
  project references.
- The composer may keep local metadata for live chip appearance while the user
  edits a draft.
- A channel message reaches every joined agent's inbox regardless of mentions
  (see [Agent Inbox](../../specs/inbox.md)). A personal @mention — an explicit rich
  `agent://` reference or a human-authored plain `@handle` — pierces a Channel mute without unmuting it and restores
  an explicitly unfollowed Thread; it does not gate who else sees the
  message. Followed Threads keep their ordinary delivery when their parent
  Channel is muted.
- DMs still address their single Agent participant implicitly.
- Human references are visual references only; they do not notify or wake anyone.
- Skill references use stable `skill://<skill-id>` targets. They nudge the
  addressed Agent to use that skill only when the skill is already assigned to
  that Agent.
- Skill references do not mutate `enabledSkillIds`, install skills, or inject
  `SKILL.md` bodies. Runtime loads assigned skills through the normal
  HarnessAgent skills path.
- Skill autocomplete is scoped by addressed Agents in the draft. If the draft
  has linked Agent mentions, `$` shows the union of skills assigned to those
  Agents. If the draft has no linked Agent mentions, `$` shows the union of
  skills assigned to the Agents in the current chat or DM.
- Removing an Agent mention after inserting a skill mention does not delete or
  invalidate the skill link. The filter is autocomplete assistance; Runtime
  still decides per addressed Agent whether the referenced skill is assigned.
- `#` autocomplete offers channels the member can see in the current Server.
  Selection serializes an explicit `chat://` link, never a bare `#name` token.
- Capability references never install, enable, connect, or authorize a tool by
  themselves.
- One shared reference-chip registry owns icons, labels, colors, and fallbacks
  for composer and transcript surfaces. The renderer uses the stock HeroUI
  `Chip` shell; the registry supplies only reference-specific appearance.
  Inline references use the transparent tertiary shell, inherit the surrounding
  paragraph's type size, and carry an 18px identity mark—16px for the compact
  three-sparkle Skill mark—plus a bold label with a dotted underline in the
  reference's identity color.
  Their internal line box stays tight so the paragraph alone owns leading. They
  add no outer padding, so ordinary text spaces own paragraph rhythm; one theme
  spacing step separates the mark from its label. The label and fixed-size mark
  receive optical alignment so they sit with the surrounding paragraph text. The
  underline is painted inside reserved label space so truncation cannot clip it,
  and its dot size and spacing scale with the paragraph type. Agent
  labels use the accent (blue) foreground, Skill labels use a dedicated purple
  identity color, and
  Channel labels use the Channel's configured color; a Channel without a
  configured color reads as foreground ink with a neutral translucent mark
  rather than muted caption gray. A Channel identity mark
  retains the Channel's own colored box. Chat references resolve that mark and
  label color from the Channel's live appearance, while the persisted Chat id
  remains the appearance-independent source of identity.
  Adding a new chip kind extends that registry instead of adding
  message-renderer conditionals or another chip primitive.
- Agent, Channel, and Skill references in transcript/read surfaces are
  keyboard-focusable preview controls. Composer chips remain editor content,
  not nested controls.
  Hover or focus opens a non-interactive HeroUI Tooltip immediately; leaving the
  trigger closes it. Its bottom-left corner follows a fine mouse pointer at
  +15px horizontally and -15px vertically, clamped inside the viewport. Keyboard
  focus uses stock anchored placement. Reduced motion preserves direct pointer
  placement and disables decorative animation. Every
  hover card shares one always-dark glass material and one compact identity-header
  grammar: a small mark, a bold title, and one muted `·` clause baseline-aligned
  to that title, with dense supporting text below. Hover cards preview; they do
  not link out to management or navigation. Agent previews show identity,
  availability, a clipped description, compact runtime/model/reasoning
  configuration, and newest durable activity. Channel, Skill, and fallback
  reference cards size to their content up to one shared maximum measure. A
  Channel's clause is its last-activity status; a Skill's clause is its kind. Channel previews show
  live participant faces below the title as a compact overlapping stack, each face
  ringed in the card's own surface, with any remainder as a trailing count. Skill
  previews place the full current description
  directly below their title, resolving it from the current chat's available
  Skills while the card is open and falling back to reference metadata when
  available.
  Interactive references strengthen slightly on hover or focus — deepening in
  the light theme and brightening in the dark theme, so the gesture never
  washes the reference toward its ground.
- Pull-request references are recognized from a GitHub pull-request URL pasted
  or posted as a link (`https://github.com/<owner>/<repo>/pull/<n>`) or written
  as `[#482](pr://github/<owner>/<repo>/482)`. They render compact inline — the
  pull-request glyph, `#<n>`, and `owner/repo` — and card-like when the
  reference is the entire message. Owner, repository, and number come from the
  URL. A Server-owned GitHub connection in Settings → Connections resolves the
  reference into a cached snapshot — title, open, draft, merged, or closed
  state, additions, deletions, and files changed — that both renderings show;
  without a connection the reference renders from the URL alone.
- Ordinary web links use the same chip shell with the site's favicon and a
  globe fallback. Activating one opens the original URL. Agent and chat chips
  are interactive: they open the referenced Agent's profile or channel.
- The native iPhone app renders every chip kind above — Agent, human, Channel,
  Skill, app, plugin, file, directory, pull request, and web link — as runs of
  the message body's own text through TextKit, with the same target precedence,
  the same label shaping including the Skill and capability names the App spells
  out by hand, and equivalent marks. A reference there carries no ground either:
  the identity mark sits inline before the label, the label reads in its own
  identity ink — accent for an Agent, purple for a Skill, the Channel's own
  color, brand ink for Chrome — and a dotted rule runs under the label's glyphs.
  The dots sit on the line's own floor rather than in leading the phone's
  paragraph does not have. Its composer offers the same three triggers the App
  offers — `@` for Agents and humans, `#` for Channels, `$` for Skills — and a
  Skill selection writes `[$name](skill://name)` into the draft. A chat preview
  line reads a reference by its display label, so a preview says `Product` and
  `Agent Browser` rather than `#product` and `$agent-browser`. A link the phone
  does not chip — a `haus://` workspace resource, a `mailto:` address, a
  target naming no scheme — reads as its own underlined words rather than as
  raw Markdown, the way the App renders it as an ordinary anchor. Tapping a
  website or pull-request chip opens its URL, as does tapping a link whose
  scheme the system routes; a tap on any other chip does nothing, where the App
  opens an Agent or Channel or shows a hover card. Everything that opens is a
  real link to the text engine, so VoiceOver lists it in the links rotor.
  Copying a selection yields the labels and link words it crosses, which is
  what copying the App's anchor text yields too. Two differences are
  deliberate. It has no icon bytes to draw, so an app or a web link wears the
  plug or the globe rather than a bundled icon or a favicon; the App's GitHub
  and Chrome marks carry over, and Chrome's brand color inks its whole chip —
  mark and label alike. It autolinks only explicit `http`/`https` addresses written in
  prose, where the App's Markdown also autolinks `www.` prefixes and email
  addresses. And no chip is a hover or preview surface.
  See [iPhone App](../internals/ios.md).

See [Rich References](../../specs/mentions.md) for the normative implementation
contract.
