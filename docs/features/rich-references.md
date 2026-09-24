---
summary: User-facing rich reference behavior for mentions, skills, apps, plugins, files, and future product cards.
read_when:
  - changing chat mentions, rich reference rendering, autocomplete references, or explicit typed links in messages
  - adding a new reference type such as agent, skill, app, plugin, file, directory, pull request, product, ASIN, memory, chat, or session
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
is renamed or reused. The same lookup applies to Agent creation announcements,
Asks, and Cloud Agent work messages.

## Product Rules

### Amazon prototype

With RankWrangler connected in Settings → Connections, Haus App resolves US
Amazon product links and standalone uppercase ASINs into thumbnail-and-title
chips. Labels use RankWrangler’s generated short name, falling back to the ASIN
when unavailable. The chip uses RankWrangler’s transparent cutout thumbnail in an 18px box,
without extra zoom or background blending. Missing or failed cutouts show a
product icon. The hover card retains the full listing
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
clear it and invalidate App reads. Chip reads request `get` with
`include: ['shortName', 'cutoutThumbnail']`; market data loads only on preview with
`include: ['marketData']`.
Unknown products and unavailable connections preserve the original text/link.
Removed listings show last-known data with a removal label. Missing prices and brands are omitted. An upstream detail failure leaves the thumbnail and title
visible with an unavailable notice.

The Agent Manual topic `amazon-product-references` explains the syntax and tool
access. No system-prompt expansion or special Agent tool call is required for
rendering.

### Shared references

- Markdown content is the source of truth.
- Agent references bind to immutable Agent ids, not reusable handles. A reference
  to a deleted Agent stays attached to that historical identity even if a new
  Agent later reuses the same visible handle.
- Agent reference chips resolve the current Agent display name and avatar. The
  persisted label remains the fallback when that Agent is unavailable.
- Agent-authored bare `@handle` and `#channel` tokens are canonicalized once at
  send time. Human-authored composer references remain explicit typed links.
- Unknown or protected bare tokens remain unchanged. Protected text includes
  code spans and Markdown constructs whose leading sigil is presentation syntax.
- Agent chips open the referenced Agent profile. Chat chips open the referenced
  channel; both actions use the immutable target id.
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
  are interactive: they open the referenced Agent profile or channel.
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
