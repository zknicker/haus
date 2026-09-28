# Raft (app.raft.build) UI Anatomy Notes

> **Provenance.** This is a visual/behavioral recon of the live app, not a source read — it stays
> the right method for UI anatomy. Raft's source is public at
> https://github.com/botiverse/raft-source (pinned commit `05f7d8fd77d2535f993d5d90b85118438bc18216`,
> release `v1.13.0-source.1`, daemon `1.0.25`); prefer it over the app or the installed CLI/binary
> for any underlying mechanism claim this file makes in passing.

Server: "arcade". Logged in as Zach (owner/human). Captured via read_page (accessible
names double as tooltip text) + screenshots. Written for a designer who has never
seen the app — every section is self-contained.

---

## 1. GLOBAL LAYOUT

### Far-left icon rail (top to bottom, ~57px wide, mustard-yellow background)
1. **Server switcher** — square avatar tile with server initial (e.g. black tile "A"
   for "arcade"). aria-label "Switch server (current: arcade)". Top of rail, visually
   separated from the rest (sits in its own black-bordered box, slightly larger).
2. **Search** — magnifying glass icon. Opens full-page global search (see §10).
3. **Chat** — speech-bubble icon. Default/home view; shows channel list sidebar + the
   selected channel or DM. Highlighted with a black border box when active.
4. **Activity** — pulse/heartbeat-line icon. Opens the cross-conversation inbox (§7).
5. **Tasks** — checkmark-in-box icon. Opens the *global* Tasks board/list (§6),
   distinct from a channel's own Tasks tab.
6. **Members** — two-person icon. Opens a Members directory + per-member profile
   panel (agent panel is here) and a "Graph" relationship view (§3, §9).
7. **Computers** — monitor/display icon. Opens Computers management (read-only
   scanned; see §11).
8. **Settings** (bottom of rail, separated by flex-grow gap) — gear icon. Global
   server settings, not opened in depth to avoid changing anything (out of scope for
   read-only pass beyond a peek at the icon's placement).

Active rail icon gets a white background + black border "card" treatment; inactive
icons are plain outline glyphs on the yellow rail. No text labels are shown at rest —
labels only exist as accessible names (they act as tooltips) and appear as page
titles once clicked (e.g. clicking Activity shows a page header "Activity — 0 active").

### Sidebar (Chat view), top to bottom
- **Saved** — bookmark icon + "Saved" label, own row above the section list (a
  quick-access pseudo-section, not collapsible in the way others are).
- **PINNED (0)** — collapsible section header with count badge. Empty state (in this
  server): muted italic-style text "Drag channels or DMs here to pin" — confirms
  pinning is a drag target, not just a menu action.
- **JOINT CHANNELS (0)** — collapsible header, icon buttons on the right: sort
  ("Sort sidebar conversations", an up/down-arrows icon) and "+" ("Create joint
  channel"). Empty state: "No joint channels yet."
- **CHANNELS (2)** — same header pattern (sort + "+" "Create channel"). Rows: "# all"
  (pink/magenta highlight when selected — this is the active-row color, not a status
  color) and "🔒 onboarding-owner" (lock glyph prefix = private channel indicator,
  confirmed elsewhere too).
- **DIRECT MESSAGES (2)** — header with only a sort icon (no "+"/create button here).
  Rows: **Cindy** — avatar, name bold, italic-gray subtitle "Onboarding Assistant",
  green online dot at avatar's bottom-right corner. **Bob** — avatar, name bold,
  italic-gray subtitle is literally Bob's personality string "humorous, sarcastic,
  witty, short tempered, a man of few words" (truncated with ellipsis in the sidebar
  width), green online dot. So the DM row subtitle = the agent's `description` field,
  not a channel topic.
- A "bottom-of-sidebar agent activity strip" (e.g. "Message received") **does
  exist but only renders conditionally** while an agent is mid-turn — see the
  Unread/mention-badges subsection just below for its full anatomy, and §4 for it
  captured live during a real message exchange. At rest (all agents idle) nothing
  renders there at all, which is why it wasn't visible in this initial screenshot.

### Unread/mention badges
- Section headers show a plain count in parentheses-less style, e.g. "PINNED 0",
  "CHANNELS 2", "DIRECT MESSAGES 2" — small gray numeral immediately after the label,
  same weight, not a pill/badge shape.
- **Unread count badge** (confirmed once traffic existed): a small solid pink
  rounded-rect pill with a bold numeral (e.g. "1") sits to the right of a DM/channel
  row's status dot, replacing/joining the online dot. Confirmed on the Bob DM row
  after Bob posted an unread reply.
- **Draft indicator**: while text is typed but not yet sent in a conversation's
  composer, that conversation's sidebar row shows a small pencil icon next to its
  status dot (distinct glyph from the unread-count pill) — a live "you have an
  unsent draft here" signal, cleared immediately once the message is sent.
- **Bottom-of-rail agent activity strip — CONFIRMED, but conditional, not
  persistent.** It does not show at rest (nothing renders below Settings when all
  agents are idle). It **appears only while an agent is actively mid-turn**: a
  floating row at the very bottom of the yellow icon rail (below the Settings gear)
  showing a small avatar + colored status dot + the agent's live state text, e.g.
  "🐷 ● Starting…" → "🐷 ● Sending message…" → "🐷 ● Message received" → "🐷 ●
  Claiming tasks…" → "🐷 ● Editing file…". This exactly mirrors the same state text
  shown in that agent's channel/DM header (see §4) and in its Activity-tab
  diagnostics log (see §3) — three surfaces echoing the same underlying state
  machine. It disappears again once the agent returns to Idle.
- The rail's **Activity** and **Tasks** icons also grow a small solid pink dot
  (no numeral) in their top-right corner when there is unseen activity/task
  movement — a lighter-weight badge than the numbered pill used on conversation
  rows.

### Top-right channel header buttons (in a channel, e.g. #all)
Left to right, each its own square icon button:
1. **Search this channel** (magnifying glass) — clicking routes to the full-page
   global Search UI (§10) pre-scoped with a `#all` filter chip already applied.
2. **Mute activity for this channel** (bell icon) — not toggled (out of scope).
3. **Stop all agents in this channel** (a plain square/box icon) — not clicked
   (would be disruptive/irreversible-ish); noted only by its exact aria-label.
4. **Edit channel** (gear icon) — opens "EDIT CHANNEL" modal (§9).
5. **View participants** (people icon + numeral, e.g. "3") — opens "MEMBERS (3)"
   modal (§9).

---

## 2. CHANNEL VIEW TABS — Chat / Tasks / Files (in #all)

Tab bar sits directly under the channel header: **☐ Chat | ☰ Tasks | 📎 Files**,
each with a small leading icon. Active tab has a solid yellow underline/fill.

### Tasks tab (channel-scoped)
- Sub-header row: **Creator** dropdown, **Assignee** dropdown (both filters, see
  exact contents below — identical popover content to the global Tasks view minus
  the Channel filter, since channel is implied), a pink **"+ New Task"** button, and
  a right-aligned **Board / List** toggle (segmented control, List/Board both exist
  and persist your last choice across tabs/global view).
- **Board view**: horizontal columns, each a card with a colored status pill +
  numeral count: `TODO 0` (orange), `IN PROGRESS 0` (blue), `IN REVIEW 1` (purple),
  and further right `DONE 0`, `CLOSED 0` (partially off-screen, need horizontal
  scroll). Empty columns show a dashed-border placeholder box with muted text
  ("No todo tasks.", "No in progress tasks."). Populated column shows a task card:
  small "#1" id line, bold title ("Test"), status pill in the corner.
- **List view**: same 5 status groups but stacked vertically, each with a chevron
  (collapse/expand — DONE/CLOSED default collapsed showing a `>` chevron instead of
  `v`). Each task row: "#1" tag + bold title, right-aligned status pill with a small
  pencil icon — **clicking the pill itself opens an inline dropdown** (not a
  separate menu button) listing all 5 statuses with a checkmark on the current one:
  `Todo / In Progress / In Review / Done / Closed`.
- Filter popovers:
  - **Creator**: header "CREATOR", a search box, a quick italic shortcut "Created by
    me", then an agent list with avatars (Bob, Cindy).
  - **Assignee**: header "ASSIGNEE", search box, two italic quick options "Assigned
    to me" and "Unassigned", then agent list (Bob, Cindy).
  - (Global Tasks view only) **Channel**: header "CHANNELS", search box, channel
    list (#all, #onboarding-owner) — DMs are not listed as filterable "channels"
    here.

### Files tab (channel-scoped)
- Empty state: large paperclip icon, heading **"No files yet"**, subtext "Attach
  files in Chat, or drag files into the message composer. They will appear here
  after the message is sent."

---

## 3. AGENT PANEL (Members → click an agent) — TOP PRIORITY SECTION

Reached via the rail's Members icon, then clicking an agent row in the left list
(sub-nav: "Graph" link + AGENTS section + HUMANS section, each with a "+" add
button). Clicking an agent swaps the right pane from "SELECT A CHANNEL" placeholder
to the full agent profile.

### Header (persistent across all 6 tabs)
- Avatar (small, square, pixel-art style icon in this seed data).
- Name, bold, large (e.g. "Cindy").
- Subtitle directly under the name = the agent's **description** field verbatim
  (e.g. "Onboarding Assistant" for Cindy; the full personality string for Bob,
  truncated with an ellipsis if long).
- Top-right: 3 square icon buttons, always present regardless of active tab:
  - **Messages** (speech-bubble icon) — presumably deep-links to the DM with this
    agent (not clicked here to avoid navigating away mid-panel-audit, but the
    aria-label is exact).
  - **Stop Agent** (plain square/box icon) — NOT clicked (would actually halt the
    agent process — out of the read-only scope).
  - **Restart / Reset** (circular-arrow icon) — NOT clicked (same reasoning).

### Tab bar: Profile | Activity | Chat | Reminders | Workspace | Apps
Each tab has a small leading icon (person, pulse-line, speech-bubble, bell,
folder, and a chain/link glyph respectively).

#### Profile tab
- Big avatar, **Name + colored status dot + "Online"/status text** inline next to
  the name, handle below (e.g. "@Cindy").
- **DISPLAY NAME** field — label + pencil "edit" icon, value below in a bordered box
  (e.g. "Cindy").
- **DESCRIPTION** field — same edit-pencil pattern, value below (e.g. "Onboarding
  Assistant" for Cindy; the personality string for Bob).
- **INFO** section (label header, all-caps, gray):
  - **Role** — label with a "ⓘ" info icon (opens an "AGENT ROLES" explainer modal,
    see below) and a pencil "Edit role" icon. Value is a colored pill:
    Cindy = **"Admin"** (pink/magenta pill), Bob = **"Member"** (purple/lavender
    pill) — pill color appears to encode the role, not the agent.
  - **Computer** — plain label, value is the host name as a clickable link/button
    (e.g. "Zachs-MacBook-Pro-2"), with a status line underneath: colored dot +
    "Connected · computer v1.0.9".
  - **Created** / **Creator** — two columns: a date ("Jul 15, 2026") and the
    creating human's avatar + name + handle ("Zach Knickerbocker @zknicker").
- **RUNTIME CONFIG** section (label + pencil "Edit Runtime Config" icon) — four
  colored pills in a row: **Runtime** (e.g. "Codex CLI", blue), **Model** (e.g.
  "GPT-5.6-Terra", purple), **Reasoning** (e.g. "Medium", yellow), **Mode** (e.g.
  "Default", orange). Each pill is its own labeled column (small gray caption above
  the pill).
- **ENVIRONMENT VARIABLES** section — only appears when at least one var is set
  (present for Cindy: a masked value row "SLOCK_ONBOARDING_MEMORY_SEED=•••••••••";
  absent entirely for Bob — confirms this block is conditional, not a fixed empty
  state).
- **CREATED AGENTS (0)** — count in the section header; empty state italic text
  "No created agents" (i.e. agents can spawn/own other agents; that list would show
  here).
- **SKILLS (n)** — section header with total count (77 for both agents in this
  server — this environment mirrors the underlying coding-agent's real skill
  library). Two filter chips under the header: **"Global (77)"** (globe icon,
  currently selected/highlighted) and **"~/skills (50)"** (folder-path style chip).
  Below that, a scrolling list of skill cards, each a bordered box: **bold skill
  name** + a muted description line (1–3 lines, truncated with "…"). A few skill
  cards show no description text and instead render a bare blinking-cursor-like
  vertical bar — likely lazy-loaded/async metadata rather than an intentional empty
  state (e.g. "academic-researcher", "code-reviewer", "fullstack-developer" showed
  this in the same session, so it's probably just slow to hydrate rather than
  agent-specific).

  **AGENT ROLES modal** (opened via the Role "ⓘ" icon): title "AGENT ROLES", close
  X, two description cards:
  - **Admin** — "Operational server admin." / "Server profile. Channels and channel
    members. No agents, machines, invites, join links, or role promotion yet."
  - **Member** — "Regular server participant." / "Allowed channels, DMs, and tasks.
    No server-level settings, channels, or membership management."

#### Activity tab
- Header: **"ACTIVITY DIAGNOSTICS"** + a right-aligned **"Copy Diagnostic Info"**
  button (with a clipboard icon).
- Body is a **dense, timestamped raw execution log** (not a friendly summary feed):
  each row = `HH:MM:SS AM/PM` + a small colored status dot + a bold state label +
  detail text. Observed state labels: "Running command" (yellow dot, shows the
  literal shell command run, e.g. `/bin/zsh -lc 'rg --files notes/recipes | wc -l'`),
  "Editing file" (yellow dot, shows the absolute file path under
  `~/.slock/agents/<uuid>/...`), "Updating task status" / "Updated task #1 to
  in_review" (blue dot, includes a `target: dm:@zknicker`-style meta line), "Idle"
  (gray/yellow dot), "Working — Message received" and "Checking messages" (recurring
  pair right after a new inbound message), and — importantly — an **error state**:
  red dot, bold "Computer operation failed", detail "Computer upgrade unconfirmed:
  ready_timeout". This is effectively a live agent-engine trace exposed directly to
  the owner: shell commands, file edits, task-status transitions, idle/working
  cycles, and infra failures all interleave in one chronological list. No filters,
  no pagination controls were visible — it reads like an append-only log rendered
  top-to-bottom (oldest at top based on Home-key scroll test).

#### Chat tab (agent-scoped, NOT the same as messaging the agent)
- Header **"AGENT CHANNELS AND DMS"**.
- **CHANNELS** section — subtext "Channels this agent currently participates in."
  Row shown: 🔒 **onboarding-owner** — "Your private onboarding space" — right-
  aligned muted **"Private"** pill/badge. Notably, `#all` (a channel this agent
  clearly posts in) is NOT listed here — this tab appears scoped to
  private/notable channels rather than every channel membership, or possibly only
  channels the agent "owns"/was set up in. Worth flagging as an open question.
- **AGENT DMS** section — subtext "Recent agent-to-agent DMs. These rows are
  intentionally activity-only, not conversation links." Empty state: speech-bubble
  icon, "No agent-to-agent DMs yet", "Recent agent-to-agent DM activity will appear
  here." (Confirms agent-to-agent DMs are a first-class, separately-tracked concept
  in the product, distinct from human↔agent DMs.)

#### Reminders tab
- Empty state: bell icon, heading **"No reminders yet"**, subtext: *"This agent
  hasn't scheduled anything. To set one, just tell your agent: "remind me tomorrow
  to follow up.""* — confirms reminders are created conversationally (told to the
  agent in chat), not via a form in this panel; the panel is a read surface only
  (no visible "+ Add reminder" button was present).

#### Workspace tab
- Breadcrumb path bar at top: the agent's absolute home directory, e.g.
  `/Users/zknicker/.slock/agents/<uuid>` with a copy-to-clipboard icon.
- Left column **"WORKSPACE"** — eye-slash icon (toggle hidden files) + refresh icon,
  then a file tree: expandable folder `notes` (collapsed, chevron `>`), file
  `MEMORY.md`.
- Right column: empty state (file icon + "Select a file to view") until a file is
  clicked. Selecting `MEMORY.md` shows: filename header, a **Raw / Preview** toggle
  (Preview selected by default, segmented control), rendered Markdown body below,
  and a footer status bar with **file size + last-modified timestamp** (e.g.
  "2.3 KB · Jul 21, 11:20 AM"). Content is literally the agent's persistent
  memory/system-prompt-like brief (role, goals, decision principles) — i.e. this
  tab exposes the agent's real working files, not a mocked view.
- Same structure for Bob, different UUID path — confirms each agent gets an
  isolated workspace directory.

#### Apps tab
- Header **"CONNECTED APPS"**, subtext "Apps this agent has logged into with Raft
  Agent Login". Empty state: plain text **"No connected apps yet."** (no icon).
  Implies a per-agent OAuth-like identity ("Raft Agent Login") for connecting an
  agent to third-party apps — a distinct concept from human OAuth.

### Cindy vs Bob differences observed
- Role pill: Cindy = Admin (pink), Bob = Member (purple).
- Description: Cindy = a role label ("Onboarding Assistant"); Bob = a personality/
  tone string used as both description and sidebar subtitle.
- Environment Variables block: present for Cindy, entirely absent for Bob (section
  is conditional on having ≥1 var set).
- Everything else (Runtime Config shape, Skills list/count, tab set, Workspace
  structure, empty Reminders/Apps copy) identical in structure between the two.

---

## 4. MESSAGING AN AGENT (Bob DM) — full lifecycle observed

Test message 1 sent in the (previously genuinely empty) Bob DM: **"UI test —
exploring, feel free to ignore. What runtime are you on?"**

### Empty-state DM
Before any message: centered speech-bubble icon, heading **"No messages yet"**,
subtext **"Start the conversation."** DM header at rest: avatar, name, colored
status dot + **"Online"** text (no description subtitle shown in the DM header
itself — that only lives in the sidebar row and the agent panel).

### Send → reply lifecycle, in exact order observed
1. While typing (not yet sent): sidebar row grows a pencil "draft" icon (see §1).
2. On hitting Send: the just-sent human message appears immediately (optimistic,
   no visible pending/sending state on the message bubble itself), under a fresh
   **"TODAY"** date divider, with a muted **"Beginning of messages"** line at the
   very top of the DM (first-ever message in this conversation).
3. The DM header status text begins cycling through short present-tense states,
   each replacing the "Online" text next to the colored dot (dot color also shifts
   from green to yellow/amber during this sequence): **"Starting…"** →
   **"Sending message…"** → back to **"Online"** once settled. The exact same
   text mirrors live in the bottom-of-rail activity strip (§1) at each step.
4. Bob's reply appeared already fully formed by the next screenshot poll (~1-2s
   cadence) — **no incremental/growing bubble was caught**. Either the reply is
   delivered as one complete message rather than token-streamed into the DOM, or
   it streamed faster than manual screenshot polling could resolve. No in-chat
   "typing…"/"thinking…" bubble indicator was seen in the message list itself —
   all "is the agent working" signal lives at the **header/rail level** (the
   Starting/Sending states), not as a placeholder chat bubble. This is a notable
   contrast with typical chat UIs that show a dots-typing bubble in the message
   list.
5. Final settled reply: **"Bob · humorous, sarcastic, witty, short tempe… ·
   11:26 AM — macOS / darwin arm64. Codex agent runtime, inside Raft."** — same
   timestamp minute as the human message (fast turnaround in this seed
   environment). Header status reverts to "Online", green dot restored.
6. The DM row also picked up a numeric unread-pill badge once Bob's reply landed
   while attention was elsewhere, and reordered to the top of the DIRECT MESSAGES
   list (most-recently-active conversation sorts first).

No read-receipt / "seen" indicator (e.g. a small "Read" label or avatar checkmark)
was observed on the human's own sent message — flagged as unobserved rather than
confirmed-absent.

---

## 5. THREADS

Two different presentations were observed for what is structurally "the same"
thread, depending on entry point:

- **From the global Tasks view** (clicking a task card in Tasks → List/Board):
  opens as a **centered modal dialog** on top of a dimmed backdrop (the Tasks page
  is still visible behind, darkened). Modal header: **"Thread — #all"**, a search
  icon, an **"View in channel"** button (external-link icon), a close **X**.
  Composer at the bottom: placeholder "Message thread", attach-media/attach-file
  icons, a disabled (pale pink) send button while empty.
- **From inside a channel** (clicking a message's **"22 replies"** badge directly):
  the thread **replaces the entire chat pane** (not an overlay) — sidebar stays put,
  main content area becomes the thread. Header: **back-chevron button** ("<") on
  the far left, **"Thread — #all"** title, then on the right: a **"Scroll thread to
  first message"** icon button, a **"Search in thread"** icon, and **"View in
  channel"** button. Clicking the back-chevron returns to the normal channel Chat
  view (not the previous "22 replies" state — goes to top-level channel).
- **"View in channel"** (from either presentation) closes the thread and jumps to
  the channel's Chat tab, auto-scrolling to and briefly highlighting the parent
  message with a flash background tint (light warm-yellow), fading after a moment.

### Thread panel anatomy (in-channel presentation)
- Scrolling up reveals a **floating "↓ Back to bottom" pill button** once you've
  scrolled away from the latest reply — confirms the thread view defaults to
  scrolled-to-bottom (most recent reply) on open, same as a normal channel.
- At the very top of the scroll is the **anchor/parent message**, rendered exactly
  like it looks in the channel (avatar, name, role, timestamp, body text, and its
  task chip if any — e.g. "◉ #1 @Cindy" pill under "Test"). Immediately below the
  parent is a centered divider: **"Beginning of replies"** / **"22 replies"** (two
  stacked lines, muted gray), then the reply list begins.
- Replies render as normal chat messages (avatar, name, role, timestamp, body).
  Hovering a reply reveals a small action cluster top-right of the bubble: a
  circular-arrow icon (aria-label came through generically, likely "reply-in-
  thread" or similar) and a bookmark icon labeled **"Save Message"**; in the
  channel's own message list (not inside a thread) the same hover cluster instead
  shows a reply/speech-bubble icon, a circular-arrow icon, and a bookmark icon —
  plus an **"Add Reaction"** button appears specifically on thread replies.
- Composer at the bottom: "Message thread" placeholder, attach-media/attach-file
  buttons, send button.
- The parent channel is NOT simultaneously visible next to the thread in this
  server's layout (no Slack-style split view) — it's either "replace main pane"
  (in-channel entry) or "modal over dimmed background" (Tasks-view entry).

### Thread creation affordance — confirmed
Hovering any message (channel or DM, not already inside a thread) reveals a
3-icon cluster top-right of the bubble, aria-confirmed as: **"Reply in thread"**
(speech-bubble, leftmost), **"Add Reaction"** (circular icon, middle), **"Save
Message"** (bookmark, rightmost). Right-clicking a message opens a fuller context
menu (see below) which also contains **"Open Thread"** — i.e. there are two
separate entry points to the same thread, one a direct hover-icon shortcut, one
buried in the right-click menu alongside other actions.

Clicking "Reply in thread" on a message with zero replies opens the thread
panel/page exactly like an existing thread, except the empty state reads:
speech-bubble icon + **"No replies yet"** (this is distinct from the "Beginning
of replies / N replies" divider that only appears once at least one reply
exists). No "Scroll to first message" icon is present in the header at this
zero-reply stage (nothing to scroll to yet) — that button appears only once
replies exist.

Posting the first reply immediately: (a) changes the thread's divider text to
**"Beginning of replies / 1 reply"** (singular grammar, confirmed pluralizing
correctly at 2+: "2 replies"), and (b) adds a **"💬 1 reply"** pill directly
under the parent message in the normal channel/DM view — same pill component
used for the pre-existing #all task thread ("22 replies"), just with a lower
count. When a thread gains a reply from someone else while you're not looking at
it, the pill's text can gain a qualifier, observed as **"2 replies · 1 new"** —
i.e. the reply-count pill also encodes an unread sub-count inline, not just a
raw total.

### Right-click context menu (any message)
Full menu observed on a plain message (right-click):
- A row of 6 quick-reaction emoji shortcuts along the top (👍 ❤️ and four more
  icon-style reactions in a horizontal strip) for one-click reacting without
  opening a picker.
- **Copy Link**
- **Copy Markdown**
- **Select Message**
- **Open Thread**
- **Save Message**
- **Unfollow Thread** (appears once you're implicitly following a thread you
  started — i.e. authoring a message that gets a thread auto-follows you to it;
  this is the unfollow toggle for that)
- **Convert to Task** — see §6, this is the primary "make an existing message a
  task after the fact" affordance, separate from the composer's "As Task"
  checkbox used at send-time.

### DM threads vs channel threads — differences observed
- **Naming**: a DM thread's header reads **"Thread — @Bob"** (`@`-prefixed agent
  handle) versus a channel thread's **"Thread — #all"** (`#`-prefixed channel
  name) — the separator/format is identical, only the target-name sigil differs.
- Structurally identical otherwise: same header buttons (back-chevron, search,
  "Scroll thread to first message" once populated, "View in channel"/would-be
  "View in DM"), same composer, same reply rendering, same empty/populated
  divider text.
- Posting a reply in a DM thread that doesn't @-mention the agent does **not**
  automatically get an agent response — my own plain thread reply sat alone
  until a separate action (converting the parent to a task) triggered Bob to
  read and respond in that same thread. This suggests thread replies are treated
  like ordinary unaddressed channel messages for notification purposes (agents
  don't reflexively answer every thread reply, only ones that are mentioned,
  assigned, or otherwise directed at them) — contrast with the top-level DM
  message from §4, where every top-level DM message did get an immediate agent
  reply. Flagged as an inferred pattern from one data point, not exhaustively
  proven.

---

## 6. TASKS — full status-flow lifecycle observed

Already confirmed from the global/channel Tasks views (see §2 for filter popovers):
- Status flow is a fixed 5-stage lifecycle: **Todo → In Progress → In Review →
  Done → Closed**, editable via a dropdown directly on the status pill (in both the
  task list rows and — confirmed separately — by clicking the task chip on the
  original chat message itself, which opens the identical 5-option dropdown inline
  in the channel).
- A task's **chip on the originating message** reads: a small circular/target icon
  + **"#1 @Cindy"** (id + assignee) inside a rounded pill, sitting directly under
  the message body, next to a separate **"💬 22 replies"** pill (the task's thread).
  Both pills are clickable independently: the assignee/id chip opens the status
  dropdown inline; the replies pill opens the thread.
- A system/meta line appears once, directly under the two chips, timestamped and
  muted: **"07/15 12:23 PM  🗒 1 new task created: #1 "Test""** — this looks like a
  one-time creation receipt rather than something that repeats on later status
  changes.
- Cindy's own in-thread explanation of the task model (paraphrased, not quoted
  verbatim beyond short fragments): a task is created by converting a top-level
  message; claiming it flips status to in_progress; all execution logs/decisions/
  questions go in that task's own thread; the agent sets in_review when it wants
  owner validation; the owner approving ("looks good"/"merge it") is what flips it
  to done. Assignment (who owns it) and status (where it is) are explicitly
  separate axes — a task can be unassigned at any status.
- A task is scoped to the channel/DM its origin message was posted in — there is
  no cross-channel task migration; the global Tasks view is a read-across-channels
  aggregate, not a separate task pool.

### Composer "As Task" checkbox — confirmed appearance only (not used to send)
A plain checkbox labeled **"As Task"** sits at the bottom-right of every message
composer (channel, DM, but notably NOT inside a thread composer — thread replies
have no "As Task" option, since a task's thread can't itself contain a nested
task). Its full accessible name is **"Send as task (⌘/Ctrl-Shift-Enter)"** —
confirming a keyboard shortcut exists to submit-as-task directly, bypassing the
checkbox click. Unchecked = empty white box with black outline; checked = solid
black fill with a white/pink checkmark. Checking it does not change any other
composer chrome (no extra fields for title/assignee appear inline) — the task's
title is evidently derived straight from the message body at send time. Toggled
on and back off without sending, to inspect the visual state only.

### Convert to Task (right-click → "Convert to Task") — used for the budgeted task
This is the affordance actually exercised (converting an already-sent test
message rather than composing a new one), to keep total new messages in the Bob
DM to 2. Selecting it on my own message **"UI test — exploring, feel free to
ignore. What runtime are you on?"** produced, in order:
1. A muted system receipt line directly under the message, timestamped:
   **"11:29 AM 🗒 Zach Knickerbocker converted a message to task #1 "UI test —
   exploring, feel f…""** — note the wording differs from the #all channel's
   task (which was created via the composer/checkbox path and read **"1 new task
   created: #1 "Test""**). So the receipt copy is conditioned on *how* the task
   was created: "N new task created: …" for compose-time creation vs.
   "[Actor] converted a message to task #N "…"" for after-the-fact conversion.
2. A task chip appeared under the message: initially a **hollow orange circle +
   "#1"** (no assignee shown) — orange matches the Todo status color, confirming
   the chip's icon/pill color encodes **status**, not who's assigned.
3. Within seconds, **fully automatically, with zero further human action**, Bob
   (the DM's counterpart agent) auto-claimed the task: header/rail state cycled
   "Message received" → **"Claiming tasks…"** → **"Sending message…"**, the chip
   updated to a **filled blue circle/play glyph + "#1 @Bob"** (blue = In
   Progress), and the thread's reply count ticked from "1 reply" to **"2 replies
   · 1 new"**.
4. Bob then posted directly into that same thread: **"Answered: macOS (darwin
   arm64), Codex agent runtime in Raft."** — a short closure-style log entry
   referencing the answer already given earlier in the parent DM.
5. Immediately after, the chip changed again to a **filled purple/lavender
   circle + "#1 @Bob"** (purple = In Review) — Bob self-transitioned the task to
   In Review after considering its answer "done," entirely without the owner
   touching the status dropdown. Confirmed by opening the DM's own Tasks tab:
   the task appears under the **IN REVIEW (1)** column/group with the task's
   **title equal to the full original message text** ("UI test — exploring, feel
   free to ignore. What runtime are you on?") — unlike #all's task, whose title
   was just "Test" (a short string, since that one's origin message body was
   literally just the word "Test"). Confirms: **task title = origin message
   body, verbatim, not a separately-authored/derived title.**

### DM-task vs channel-task — a real architectural split, not just cosmetic
- The **global Tasks view** (rail Tasks icon) and a **channel's own Tasks tab**
  both explicitly scope to **channels only**. The global view's header even
  states **"1 channel task"** even after the Bob-DM task existed — the DM task
  never appeared there, in either Board or List view, before or after
  refreshing. The Channel filter popover in the global view only ever listed
  `#all` / `#onboarding-owner` — no DM entries, confirming DMs are excluded by
  design from that aggregate, not merely filtered out by a default.
- The **DM's own Tasks tab** (Chat | Tasks | Files inside the Bob DM) does show
  the task correctly, with the identical board/list UI (status columns, filters,
  New Task button) as a channel's Tasks tab — so per-conversation task tracking
  works uniformly, only the *cross-conversation aggregate* excludes DMs.
- This is worth flagging prominently for a rebuild: **"all my tasks across the
  server" as currently implemented silently omits every DM-scoped task** — an
  owner who assigns work over DM rather than in a channel won't see it in the
  global board at all.

---

## 7. ACTIVITY / CATCH-UP (rail Activity icon)

- Header: **"Activity"** + muted counter subtitle, e.g. "0 active".
- Filter control: a **radiogroup "Filter inbox"** rendered as 3 segmented buttons:
  **All** (selected by default) / **Unread** / **Mentions**.
- Empty state (nothing to catch up on): outlined speech-bubble icon, heading
  **"Activity is empty"**, subtext: *"Channels, DMs, and followed threads stay here
  until they are done."* — implies the model is: items appear here when unread/
  followed, and clear themselves once "done" (read or resolved), rather than being
  a permanent log.
- No resume-at-first-unread behavior could be exercised since the inbox was empty
  in this server (nothing unread to jump to) — flagged as unobserved.
- **Saved** items are a separate top-of-sidebar entry point in the Chat view (§1),
  not inside the Activity page — not opened in this pass (bookmarked via the
  "Save Message" hover action seen in threads/messages); flagged as a light gap,
  can be revisited if needed.

---

## 8. REMINDERS

- Primary surface found: the agent panel's **Reminders** tab (§3) — read-only list,
  empty in this server, with copy explicitly stating reminders are set by *telling*
  the agent in chat ("remind me tomorrow to follow up"), not via a form control
  here.
- No in-chat 🔔 system "reminder receipt" messages were encountered in the scanned
  history (the #all channel transcript and Cindy's task-thread explanation text);
  did not open `#onboarding-owner` or the Cindy DM in depth for this pass (Cindy DM
  explicitly flagged as having onboarding state to avoid disturbing; #onboarding-
  owner is a private/locked channel — read-only peek only, see §9). Flagged as
  **unobserved** rather than confirmed-absent.

---

## 9. CHANNEL ANATOMY (#all)

- **Header**: `#` icon in a small yellow tile, channel name bold ("all"), and
  directly under it a muted description line: *"General channel for all members"*
  — this is the channel's `description` field rendered inline under the name, not
  a separate hoverable tooltip.
- **Header buttons**: see §1 (search / mute / stop-agents / edit / members-count).
- **MEMBERS modal** (from the members-count button): title **"MEMBERS (3)"**, close
  X, content grouped into two labeled sections: **AGENTS** (Cindy — Online, Bob —
  Online, each with avatar + status text) and **HUMANS** (Zach Knickerbocker — no
  status/subtitle text shown, unlike the agents). No "owner" role label appeared
  inside this particular modal, even though Zach is styled as "owner" elsewhere
  (message headers, sidebar) — the Members modal seems to only distinguish
  Agent vs Human, not server role.
- **EDIT CHANNEL modal** (gear button): title **"EDIT CHANNEL"**, close X. Fields:
  **NAME*** (required, text input, value "all") with a locked-state helper note
  directly under it: *"The #all channel cannot be renamed"* (input still appears
  editable/focusable but presumably rejected on save — not tested to avoid any
  edit). **DESCRIPTION (optional)** — a multi-line textarea, value "General channel
  for all members". Footer buttons: **Cancel** / **Save Changes** (pink, primary).
  Below a divider, a separate lower-emphasis destructive-style action: an orange/
  muted full-width button **"🚫 Hide #all"** (eye-slash icon) — visually separated
  from Cancel/Save to signal it's a different class of action. Not clicked.
- **Private channel indicator**: `#onboarding-owner` shows a **lock glyph** in place
  of the `#` hash in the sidebar row — this is the only visual marker of privacy in
  the list (no separate "Private" text label in the sidebar itself, though the
  agent-panel Chat tab does spell out "Private" as a pill for this same channel,
  see §3).
- **Mute control**: exists as the bell icon in the channel header ("Mute activity
  for this channel") — placement only noted, not toggled.

---

## 10. SEARCH (rail Search icon / channel Search button / ⌘K)

Opens as a **full-page view** (replaces the whole right pane, sidebar becomes the
rail-only mini state) rather than a floating command palette overlay, despite the
"⌘K" hint text shown in the input.

- Top bar: large text input, placeholder **"Search channels, DMs, messages... ⌘K"**,
  right-aligned **"ESC"** hint chip (not a button, just a label) and (only while
  typing) an inline **×** clear icon inside the input.
- Filter/toolbar row directly under the input: **From** (dropdown), **Scope**
  (dropdown), a channel-scope chip if the search was launched from inside a channel
  (e.g. a removable **"# all ×"** pill — pre-applied only when entered via a
  channel's own search button, not the rail's global search icon), **Any Time**
  (dropdown), **Relevant** (sort dropdown — grayed out/disabled until a query is
  typed), and a **"Clear All"** button on the far right.
  - **From** popover: header "FROM", search box, then a plain member list with
    avatars: **Me**, **Bob**, **Cindy**.
  - **Scope** popover: header "SCOPE", three plain rows: **@ Me**, **Humans**,
    **Agents** (no search box here, unlike From).
  - **Any Time** popover: header "TIME", four rows with a checkmark on the active
    one: **Any Time** (default, checked), **Today**, **Last 7 Days**, **Last 30
    Days**.
- **Empty state** (no query yet): centered large magnifying-glass icon, heading
  **"Search everything"**, subtext *"Search channels, DMs, people, agents, and
  message history."*
- **Results state** (typed "task"): a result-count line **"11 RESULTS"**, then a
  section label **"MESSAGES"**. Results are grouped by parent thread when hits
  cluster in one: a highlighted (pale pink/lavender) group-header row reading
  **"☐ THREAD  #all  10 HITS  6 days ago"** followed by the parent message's title
  in bold ("Test"), then each individual matching reply indented below as its own
  row: `#all` tag, small "☐ thread" icon+label, avatar + author name, relative
  timestamp ("6 days ago"), and a one-line snippet of the message with the matched
  term highlighted in yellow and the rest of the line truncated with "…". Once a
  query exists, the **Relevant** sort control becomes enabled (was disabled/gray at
  the empty state).
- Closed via Escape without submitting/acting on any result (read-only per scope).

---

## 11. MISC

- **Agent vs human visual differentiation**: agents show a colored **online-status
  dot** at the bottom-right of their avatar (green = Online) consistently in the
  sidebar, Members modal, and agent panel header; the human owner (Zach) does not
  get this dot anywhere observed. Message headers show the author name in bold plus
  a small role-style tag right after it — agents show their **description/role
  text** in that slot (e.g. "Onboarding Assistant"), while the human owner shows the
  literal word **"owner"** there instead — i.e. that slot is doing double duty as
  "role for humans" / "description for agents", not two separate concepts visually
  distinguished by color, just by which string appears.
- **"owner" role label styling**: small, gray/muted, lowercase, sits immediately
  after the bold display name in a message header — no pill/badge shape, just plain
  inline text (contrast with the agent panel's actual Role field, which IS a
  colored pill — "owner" in message headers is a different, lighter-weight
  treatment than the Admin/Member pills in the profile).
- **System message styling**: the task-creation receipt line ("1 new task created:
  #1 "Test"") renders small, centered-under-the-chips, muted gray, prefixed with
  the timestamp and a small document/clipboard icon — visually much quieter than a
  normal message (no avatar, no bubble).
- **Date dividers**: a centered full-width horizontal rule with a small all-caps
  label floating on it, e.g. **"THURSDAY, JULY 16"** — plain muted gray text,
  classic pattern, nothing unusual.
- **Action cards**: none were encountered actually rendered in the scanned history
  (Cindy's own message text *describes* action cards conceptually — "Raft does have
  native action cards for prepared human commits" — but no live action-card UI was
  visible in the #all transcript scrolled so far). Flagged as **unobserved** live
  example; only have the concept confirmed via in-chat description text, not a
  screenshot of a real one.
- **"Joint Channels" empty state**: "No joint channels yet." — same muted-italic
  treatment as Pinned's empty state, sits directly under the section header, no
  icon.
- **Computers rail icon / Computers management** (rail icon 7) — a devops-style
  fleet page. Left column: **"COMPUTERS (1)"** header + "+" add button, a single
  row (monitor-icon tile + name "Zachs-MacBook-P…" truncated + green online dot
  + muted subtitle "computer v1.0.9"). Right pane before selection shows the same
  generic **"SELECT A CHANNEL"** placeholder text reused from the Members page
  (a literal copy/paste of empty-state copy across two structurally-similar but
  conceptually different list+detail pages — worth flagging as a minor copy bug
  for our own rebuild to avoid).
  Clicking the computer opens a detail page:
  - Header: monitor icon, name, **"● Connected"**, hostname
    ("Zachs-MacBook-Pro-2.local").
  - **NAME** (editable pencil) and **DESCRIPTION** (editable pencil, empty here:
    italic "No description") fields, same pattern as the agent profile fields.
  - **INFO**: **OS** ("darwin arm64"), **Computer Version** ("v1.0.9"),
    **Detected Runtimes** — a wrapped row of pills, one per known CLI/runtime,
    colored teal/cyan when installed and grayed-out with "(not installed)"
    suffix when not: installed = Claude Code, Codex CLI, Built-in Pi, Kimi Code,
    Cursor CLI, OpenCode, Pi; not installed = Grok Build, Antigravity CLI,
    Copilot CLI. **Created** date.
  - **AGENTS ON THIS COMPUTER (2)** section with two buttons **"✓ Select"** and
    **"+ Create"** (pink), then a row per agent: avatar, name, its runtime as a
    muted subtitle ("Codex CLI"), right-aligned "● Online" status.
  - **AGENT WORKSPACES** section (folder icon) with a **"⟳ Scan"** button and
    subtext "Click Scan to check for workspace directories on this computer."
    (i.e. workspace directories aren't auto-discovered/live-synced, you trigger a
    scan).
  - **ACTIONS** section, several sub-cards:
    - **"Computer"** card: "Restart the Computer service; it is already on the
      latest version." / "If this Computer looks online but stops responding,
      restart it." — a **Restart** button plus a muted **"Up to date"** status
      label.
    - **"VERIFY FROM THIS COMPUTER'S TERMINAL"** card: "If this page and the
      computer seem to disagree, ask the computer itself:" followed by two
      literal terminal commands shown as code: `raft-computer status` and
      `raft-computer doctor`; then "Web buttons not responding? Restart from the
      terminal:" with `raft-computer restart /arcade`.
    - **"RECOVERY GUIDE"** card: "Start with the lightest recovery step and move
      down only if the problem continues." — a numbered 3-step escalation:
      **1. Restart the service** (`raft-computer restart /arcade`), **2. Stop,
      then start the service** (`raft-computer stop` / `raft-computer start`
      shown as two separate commands), **3. Reinstall Computer** — "Use this
      last to reinstall the binary and supervisor without removing this
      Computer's identity or credentials." (`curl -fsSL
      https://cdn.raft.build/computer/install.sh | sh`).
    - **"Delete Computer"** — "Permanently remove this computer. All agents must
      be deleted first." with a **Delete Computer** button — presumably
      disabled/blocked while agents exist (not tested, per the no-destructive-
      actions constraint).
  This page is notably more "infra ops console" in tone than anything else in
  the product — plain terminal commands, service-restart semantics, a stepped
  recovery runbook — a very different register from the chat-first, product-
  copy tone everywhere else.

---

## UNOBSERVED / OPEN QUESTIONS

1. **Global Settings** (rail gear icon) — not opened at all, out of caution around
   accidental changes; unknown structure. Only its placement (bottom of rail) is
   documented.
2. **Streaming vs. atomic message delivery** — could not confirm whether Bob's DM
   replies are token-streamed into a growing bubble or delivered whole; manual
   screenshot polling (~1-2s cadence) never caught a partial/growing bubble, and
   no in-chat "typing…" placeholder was seen. The only visible "is it working"
   signal was header/rail state text (Starting… / Sending message…). A tighter
   polling loop or reading network requests (SSE/websocket frames) would be
   needed to settle this definitively — flagged as inconclusive, not as
   "no streaming exists."
3. Whether `#all`'s absence from the agent panel's Chat tab "CHANNELS" list (§3) is
   because that list is scoped to private/dedicated channels only, or a display
   limit/bug — not confirmed either way from the UI alone.
4. Reminder system messages (🔔) — actively looked for in `#onboarding-owner`
   (scrolled through its visible history) and found none; Cindy's DM was
   intentionally not opened at all per instructions (has onboarding state). No
   reminder receipt of any kind was seen anywhere in this pass, and the
   Reminders tab was empty for both agents — flagged as **unobserved**, not
   confirmed to not exist (the copy in the empty state implies it's a real,
   conversationally-triggered feature, just not currently exercised in this
   server).
5. Saved items view (bookmarked messages) — opened and confirmed empty ("No saved
   messages yet" / "Save messages by clicking the bookmark icon on any message.")
   but never populated it (would have required using "Save Message" on a message
   and then re-checking, which was skipped to stay inside the message-count
   budget) — so the *populated* row anatomy of Saved is still unobserved.
6. Resume-at-first-unread behavior in Activity — could not be exercised since the
   inbox was empty (nothing unread in this server) even after generating DM
   activity (the Bob DM activity seems to have been "caught up" instantly since I
   was actively viewing it).
7. Read-receipt / "seen" indicator on human-sent messages — not observed either
   way.
8. Whether thread replies *ever* trigger an unmentioned agent to respond
   automatically, or whether it's strictly mention/assignment-gated — only one
   data point gathered (a plain, unmentioned thread reply did not get a
   response; a task-conversion action on the parent did). Not exhaustively
   proven.
9. Populated "Detected Runtimes" behavior when a runtime is added/removed on a
   Computer, and what the disabled/enabled state of "Delete Computer" actually
   looks like (its exact disabled styling when agents still exist) — not tested,
   since doing so would require deleting agents first.
10. The "Global (77)" vs "~/skills (50)" filter chips on an agent's Skills list —
    only the default "Global" state was inspected; did not click into "~/skills"
    to see whether the resulting subset/layout differs.

---

## CORRECTIONS — desktop-width re-verification (2026-07-21)

The recon above ran in an 800px-wide viewport; several "full page / replaces pane" observations
were responsive fallbacks. Re-verified at 1680x1000:

1. **Threads open as a RIGHT SIDE PANE** (like our artifacts pane): channel stays visible,
   thread has its own header ("Thread — #all", search, View in channel) and composer, and the
   anchor message gets a highlight outline in the channel while its thread is open. The
   "replaces the main pane + back-chevron" behavior in §5 is the NARROW-viewport responsive
   collapse (worth copying as the responsive model), not the desktop design.
2. **Agent profile opens as a RIGHT SIDE PANE from chat**: clicking an agent's AVATAR in a
   message row opens the same tabbed profile component (Profile | Activity | Chat | Reminders
   …, header actions Message/Stop/Restart, close ×) as a side pane. Clicking the agent's NAME
   in a message header inserts an @mention into the composer instead — avatar=profile,
   name=mention is the deliberate split. The DM-header name is inert. The Members rail page
   (§3) remains the full list+detail home of the same component.
3. **Search is a full-page takeover at any width** — confirmed design, not fallback.
4. **Settings sections** (recon gap #1, glimpsed): Personal — Account (display name, username,
   email + verified badge, connected Google/GitHub accounts, change password), Language &
   Region, Appearance, Notifications; Workspace — Server Profile, Plan & Billing,
   Administration, Connected Apps; About — About, Release Notes; prominent Log out card.
5. Unverified at width: the task-board→thread modal entry (§5) — may remain a modal by design
   from that context.

---

## WS5 LIVE RE-VERIFICATION (2026-07-22, arcade server, desktop width)

Second live pass focused on the WS5 surfaces (operator mandate: live app wins over these notes).
Captured via accessibility tree + screenshots; one reversible 👍 reaction was added and removed on
an old test message.

1. **Right-click context menu — exact contents and order** (plain channel message):
   a quick-react strip of **SEVEN** emoji (the §5 note said six) with aria labels "React with X":
   👍 ❤️ 🎉 👀 🔥 😂 ✅ — then `Copy Link`, `Copy Markdown`, `Select Message`, separator,
   `Open Thread`, `Save Message`, `Convert to Task`. ("Unfollow Thread" appears additionally only
   on followed-thread anchors, per §5.)
2. **Hover cluster** order confirmed: Reply in thread / Add Reaction / Save Message. The
   Add Reaction popover is the same 7-emoji strip plus one trailing full-picker slot.
3. **Reactions**: pill = emoji + count chip directly under the message body; own reaction gets a
   filled/highlighted style; clicking the pill toggles it off; aria label is
   "👍 reaction from Zach Knickerbocker" (actor names ride the label).
4. **Task chip**: aria "Change status for task #1 @Cindy"; clicking opens the 5-status dropdown
   (Todo / In Progress / In Review / Done / Closed) with a checkmark on the current status.
5. **Status colors, complete**: todo=orange, in_progress=blue, in_review=purple, **done=green**,
   **closed=gray/black** (the original pass could not see done/closed pills).
6. **Board view**: horizontally scrollable status columns; header = status pill + count +
   collapse chevron; done/closed columns default collapsed (chevron-right) in BOTH board and
   list views; empty columns show dashed-border "No <status> tasks." boxes; card = "#N" small
   line + bold title + status pill (pencil) bottom-right.
7. **Composer**: As Task checkbox aria is exactly "Send as task (⌘/Ctrl-Shift-Enter)".
8. **Creator popover** verified as §2 described (header, search, italic "Created by me",
   avatar list).
9. **Agent profile Reminders tab** re-confirmed empty-state copy: "No reminders yet / This agent
   hasn't scheduled anything. To set one, just tell your agent: 'remind me tomorrow to follow
   up.'" Populated reminder rows remain unobserved (no reminders exist on arcade).
10. **First-channel system line** observed at history top: "#all is now live — Bob just joined
    the team…" quiet centered line — same treatment as task receipts.
