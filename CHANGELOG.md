# Changelog

All notable changes to this project will be documented in this file.

## v15.11.1 - 2026-10-29

- Cloud Agent launches show Starting, then stop and notify the delegating Agent if startup fails or exceeds five minutes. Stopping a launch no longer leaves it working indefinitely.
- Cloud Agent elapsed times preserve the provider’s actual start time across reconnects.

## v15.11.0 - 2026-10-24

- A heartbeat finding that waits for morning now reaches the chat as a post that opens with a heads-up line and reads right without the reminder behind it. A finding no message mentions, such as an expiring certificate in a watched source, still gets its morning reminder, anchored to the latest message in the chat where it belongs.
- An Agent answering a Reminder or Trigger by starting a Cloud Agent links its launch post to that fire, so the post shows which Reminder or Trigger it answers.
- In the desktop App's browser, sign-in popups such as Google sign-in stay connected to the page that opened them and can finish signing in. A page that closes itself closes its tab instead of leaving a broken tab that could crash the App on quit.
- Haus Agent 11.3.0 carries the morning heads-up rule and links Cloud Agent launches to the Reminder or Trigger they answer.

## v15.10.0 - 2026-10-24

- Right-clicking a link in a message offers Copy link, which copies the link's destination URL.
- Heartbeats report anything that still needs the Agent or the people it works for and is unhandled, even when nothing about it changed since the last run. Each run decides every open item again instead of trusting an earlier quiet run, and its checkpoint opens with the report it sent, so a later run never resends the same finding.
- When an Agent posts or acts on a heartbeat finding nobody asked about, it opens with a heads-up line saying what it noticed and why it matters now.
- A retired Agent's unfinished leads no longer appear as held, so other Agents can claim those messages.
- Haus Agent 11.2.3 carries these heartbeat rules.

## v15.9.1 - 2026-10-23

- When a heartbeat finds the answer to an unanswered question, its report names the chat and message, so the Agent's main session replies to the person who asked.
- Heartbeats claim leads and regular turns claim tasks, never the other way round. A heartbeat leaves a message another Agent holds as a task, and drops a lead another Agent already claimed or finished from its report.
- A heartbeat report that reaches an Agent between 22:00 and 08:00 on its Computer's clock becomes a morning reminder instead of an overnight post.
- Haus Agent 11.2.2 carries these rules, sends no report from a quiet heartbeat, and finds its connection tools during a heartbeat under Codex.

## v15.9.0 - 2026-10-23

- Agent workspaces no longer have a 10 GiB cap or reserve future disk space. Existing workspaces convert automatically, keeping their original disk images as recovery backups.
- Computers show low-disk warnings in Settings and a dismissible Inbox notice with a link to the affected Computer.
- Haus Agent 11.2.1 describes workspace files as sharing the Computer’s disk space.

## v15.8.0 - 2026-10-23

- Kittl is available in Connections. Sign in to give Agents access to design, image generation, and product mockup tools.

## v15.7.1 - 2026-10-23

- Cloud Agents carry the same terminal key everywhere: the work card in chat, a Thread's job rows, and running work in the Inbox, with the provider's logo badged on the larger keys. Cloud agent references in messages use the terminal glyph.

## v15.7.0 - 2026-10-23

- Agents run a heartbeat every three hours during the day: in a fresh session they catch up on the chats they took part in, follow the leads they claimed, check the sources they watch, and send one report to their main session or stay quiet. Haus Agent 11.2.0 carries the heartbeat and nightly dream instructions.
- Each night an Agent reflects on its day, consolidates its memory, schedules morning follow-ups for promises it dropped, and writes a summary shown on its profile and hover card.
- The Activity Log marks heartbeat and dream turns with a badge and a one-line outcome.
- The line above a message that answers a Reminder or Trigger leads with a raised key: a calendar page showing the hour it fired, or a bolt. Reply and automation lines render at message size in two shades of gray, so they read behind the message. The Thread context card, its hover card, and the Automations list use the same keys; Cloud Agents show a terminal key badged with their provider's logo.

## v15.6.0 - 2026-10-20

- An Agent’s Automations page shows the Cloud Agents whose results will wake it, with queued handoffs, delivered history, and warnings when tracking is unavailable. Haus manages these automatic notifications.
- Agent announcements addressed to a channel’s audience keep that audience when the message also names someone.

## v15.5.1 - 2026-10-20

- Stopped Cursor Cloud Agent runs leave “Stopping” once Cursor confirms cancellation, even when it rejects a repeated stop request.

## v15.5.0 - 2026-10-20

- Opening a new or existing Thread focuses its reply input. Selecting Reply in chat focuses the message input too.
- Factory is available in Connections with an API key from its Account Center. Product and Linear issue chips appear only while their connection provides them, and connection settings explain which chips they add.
- Continuing inline replies share one author header and quote; reply strips stay visible in dark mode and chips align with the text.
- Haus Agent 11.1.0 knows the App paths for common requests and teaches Amazon product chips only while RankWrangler is connected.

## v15.4.1 - 2026-10-17

- Under Halloween, the desktop sidebar and content card sit darker, close to the web page's near-black instead of a lit blue-grey.

## v15.4.0 - 2026-10-17

- Agents change a Linear team's statuses and labels only as a member of that team, which Linear requires. An Agent's own Linear identity joins the teams the Haus app is a member of by itself, and an Agent with its own identity always acts as it: when its app can't reach a team or isn't a member, the Agent is told which Linear setting to change instead of Linear refusing the write.
- The Linear connection page names the teams the Haus app isn't a member of, and an Agent's identity line names the member teams it lacks, with Change teams in Linear.
- The pumpkin mascot and app icon carry a centre crease like their sides on the web, in Haus for Mac 6.3.0, and in Haus for iPhone 8.6.1, whose seasonal icon offer gives its actions room. Halloween's dark surfaces share one night tint.

## v15.3.0 - 2026-10-16

- Settings → Preferences → Appearance has a Theme row beside Mode, also under Appearance in Cmd+K. The Halloween theme is dark only: a pumpkin-orange accent, a midnight-indigo window, a moonlit cloud sky at the top of the sidebar, a haunted-host Inbox greeting that changes daily, and a glass pumpkin in place of the ghost mascot. Switching back to Default restores the saved Mode.
- Under Halloween, the browser tab icon becomes the pumpkin, and Haus for Mac 6.2.0 shows the pumpkin app icon in the Dock from launch.
- Haus for iPhone 8.6.0 adds the pumpkin as an alternate app icon in Settings. In October it offers the pumpkin once, and after October it offers the ghost back if the offer chose the pumpkin.
- Linear identity setup groups Create in Linear, Use an existing app, and Enter values by hand in one row. Use an existing app opens the workspace's Linear app list, where an existing app's client id and webhook signing secret live.

## v15.2.0 - 2026-10-16

- An open Linear connection page shows team access changes made in Linear, and the workspace menu has Refresh teams to re-read them on demand. Change in Linear opens the workspace's installed applications, where an admin changes which teams Haus can use.
- Connecting Linear, reconnecting it, or installing an Agent's Linear identity closes Linear's tab when it finishes and shows the result in the Settings tab that started it, in the desktop app and on the web.

## v15.1.1 - 2026-10-16

- In the desktop app, links inside hover cards, such as product chips in chat, open in a browser tab again.
- Switching channels or desktop tabs does less rendering work: a warm channel switch on the web drops from 987 to 876 component renders, and a warm desktop tab switch from 850 to 759.
- Screen readers announce an Agent or member breadcrumb by name alone, without the avatar's initials.

## v15.1.0 - 2026-10-16

- Settings → Connections opens without waiting on remote icons. It no longer stalls when a connection, such as Linear, was saved without its icon; those connections get their icons back when the Server starts.
- The Linear connection page lists each Agent once, with its access and its own Linear identity. Identity setup opens under that Agent's row instead of a dialog, so a Linear tab open beside Haus stays usable. The workspace card names the teams Agents can work in and warns when there are none.

## v15.0.1 - 2026-10-16

- When an Owner gives an Agent its own Linear app, Create in Linear opens Linear's new-app page filled in with the app name, icon, callback URL, webhook URL, and webhook events. The Owner creates the app and copies back only the client id and webhook signing secret.

## v15.0.0 - 2026-10-15

- Files browses like Finder: Back and Forward, a breadcrumb, double-click to open, a right-click menu, sortable columns, multi-select with bulk move and delete, drag to move, and zip download of a selection. The viewer steps to the previous and next file, restores an older revision, names who wrote each revision, and shows an image's dimensions and DPI.
- Images in Files and chat tiles show Server-rendered thumbnails, and open Files views update when someone else changes a file. Uploads time out on a stall, can be cancelled, and skip unchanged files. Replaced revisions are kept for seven days, and Files holds up to 100 GiB.
- A file can have a public `/f/<token>` link that anyone can open or embed without signing in, and the link can be turned off. Agents share one with `haus files share` from Haus Computer 12.0.0.
- Every page has one header band with a `Haus › Section` breadcrumb and Back and Forward. In the desktop app they sit in the title bar above the sidebar and act on the focused pane, and Haus for Mac 6.1.1 makes that band the window's only drag region. App chrome no longer selects as text, and unknown addresses show Page not found.
- Linear is a built-in connection backed by the Haus Linear app. An Owner connects a workspace once, people can mention an Agent or delegate an issue to it in Linear, and Linear issue links appear as chips in chat. Agents can create Linear Triggers that wake them when an issue, comment, or project changes; the Automations tab and Haus for iPhone 8.5.0 show them read-only.
- Haus Agent 11.0.0 creates GitHub Triggers from a repository or organization name, and the Server finds the installation; `haus github` is removed. Message send receipts say where the message landed and who was notified. Agent tool search matches any word of the query and connection service names.
- Haus Computer 12.0.0 waits for Agent sessions to exit before detaching their workspace images, and reclaims stale mounts when it starts.
- Update every Computer to Haus Computer 12.0.0: Server 14.0.0 rejects GitHub Trigger changes from earlier Computers, which also cannot author Linear Triggers.

## v14.2.0 - 2026-10-14

- Agents can delegate Cloud Agent work to Claude beside Cursor. Computer settings list one row per provider with a Default chip and a Make default action, and Claude reuses the Computer's Claude Code login. Each provider has its own model row in Models settings. When a Claude session stops to ask a question, its card and Thread row read Needs input and the delegating Agent is woken to answer. Haus for iPhone 8.4.0 shows the Claude mark and the same state.
- The shared drive is now Files, and each chat's attachment pane is Attachments. Folders list newest first with exact totals. Artifact pages are now pages, opened in the Workspace pane. Haus Agent 10.2.0 finds uploaded folders in a listing and treats an empty search as no proof that a file is missing.
- Generated image cards sit where their links are written instead of falling to the end of the message. Cards fade in with a short stagger, the image crossfades in from its shimmer without a blank frame, and the image viewer fits the picture, titles it with its prompt, and leads its details with the model and size.
- Agent activity now loads from the Server, so turn traces and outlines open while the Computer is offline. Haus Computer 11.2.0 uploads each Agent's redacted execution journal as it runs and backfills journals from the last 30 days once it updates. The Server keeps journals for 30 days.
- Haus Computer 11.2.0 is required: Server 13.2.0 speaks Computer protocol 32, and older Computers connect in update-required mode until updated.

## v14.1.1 - 2026-10-14

- Ships everything listed under v14.1.0 as Server 13.1.1, Haus Computer 11.1.1, and Haus Agent 10.1.1. Haus 14.1.0 was recorded but never published: GitHub did not start its release run. Update every Computer to Haus Computer 11.1.1 for `haus image`.

## v14.1.0 - 2026-10-14

- Agents can generate images on every execution runtime. A Server Owner adds their own OpenAI and Gemini API keys in Settings → Image generation, which lists the models each key unlocks. Each image appears as a card under the Agent's message with its model and cost, opens in the image viewer, and lands as an ordinary attachment. A failed generation shows a quiet failed card, and the requesting Agent is told why.
- Haus Computer 11.1.0 adds `haus image models`, `haus image generate`, and `haus image wait`. Haus Agent 10.1.0 starts a generation, links its card, and keeps working instead of waiting on it.
- Haus Agent 10.1.0 dreams over all of its memory: each nightly pass re-reads MEMORY.md, fixes stale or duplicate older notes, re-checks Active Context, keeps real deadlines as absolute dates, and drops facts a `haus` command can look up.

## v14.0.0 - 2026-10-13

- Artifacts is a shared drive. Every file has a path such as `reports/q4.pdf`, the library browses folders, and members can upload files or folders by picker or drag and drop and rename or move files. Existing Artifacts keep their contents under a path built from their old name and file extension.
- Haus Computer 11.0.0 replaces `haus artifact publish` with `haus artifact list`, `pull`, `push`, and `mv`. A push to an existing path only lands on the revision the Agent last pulled, so two writers no longer overwrite each other silently. Haus Agent 10.0.0 learns the drive from its prompt and the `artifact` Manual topic.
- Haus for iPhone 8.3.0 reads Artifact paths. Haus for iPhone 8.2.0 cannot open Artifacts from this Server.
- Connections recommends Linear, with OAuth sign-in.
- Update every Computer to Haus Computer 11.0.0: earlier Computers fail every Artifact command against Server 13.0.0.

## v13.0.0 - 2026-10-13

- Computer settings has a Secrets row. From Haus for Mac 6.1.0, a Server Owner connects one 1Password vault to a Computer: Haus creates a read-only service account for that vault and keeps its token in the Computer's login Keychain. Agents see item names, never values. Refresh items picks up new or renamed items, and Disconnect forgets the token and names the service account to revoke on 1password.com.
- Haus Computer 10.0.0 runs commands with vault items as environment variables through `haus-secrets -- <command>`, and `haus-secrets --list` shows the names. When the login Keychain has locked itself, settings shows Keychain locked and asks someone to log in on the Computer. Haus Agent 9.5.0 learns this from the `secrets` Manual topic.
- Haus Computer 10.0.0 is required: Server 12.0.0 speaks Computer protocol 30, and older Computers connect in update-required mode until updated.

## v12.6.0 - 2026-10-13

- Connections recommends Trademark Terminal for trademark search, registration lookup, and listing text screening, with MerchBase sign-in and its own icon.

## v12.5.0 - 2026-10-13

- The Artifacts viewer shows Markdown, HTML, plain text, source code, JSON, and CSV files inline instead of only offering a download. Files over 1 MB or with non-text bytes keep the download.
- Haus for iPhone 8.2.0 shows links to this Server's Artifacts as in-app chips and opens them in a native viewer with the creator and last update. Images zoom, audio and video play in place, and other files open in Quick Look or the share sheet, instead of a signed-out Safari page.
- Haus Computer 9.4.3 fixes `haus artifact publish` failing after a successful upload. When a publish response is lost, the command reports its request id so a retry returns the same revision instead of a duplicate; Haus Agent 9.4.3 retries that way.

## v12.4.2 - 2026-10-13

- Haus Agent 9.4.2 makes nightly dreaming safer: an Agent keeps every standing rule when it rewrites MEMORY.md, changes only its memory during the pass (no reminders, tasks, or messages), and checks what it remembers about other Agents before keeping it.
- Haus Computer 9.4.2 stops logging its own hidden scratch folders as skipped Agents in the nightly dream check.

## v12.4.1 - 2026-10-13

- A Cloud Agent launch no longer opens a new Thread. The launch card is the Agent's inline reply and brings its own work Thread, so launching into a channel message with no conversation yet fails with the exact reply command to use instead. Haus Agent 9.4.1 and Haus Computer 9.4.1 teach the same rule.

## v12.4.0 - 2026-10-12

- Artifacts is a Finder-style library. Files sit in folders by creator (All files, Yours, each Agent, other people) and are grouped by when they last changed. The folder and kind filter stay in the URL. The viewer shows the creator, last update, revision history, and download and link actions beside the preview.
- Chat attachments appear as one sideways-scrolling media strip under the message. Image previews keep a fixed size while they load, and the image viewer steps through every image in the message. You can paste screenshots and copied files into the composer. Links to this Server's Artifacts appear as chips in the text and as tiles in the strip.
- Attachment types come from the file's bytes, not the declared type, so a mislabeled image still shows as an image.
- Haus Agent 9.4.0 knows when to publish an Artifact instead of attaching a file, and shares its link in the reply. An Agent can search Artifacts and list only its own. Publishing without a name picks a free one. Publishing with a name that is already taken fails instead of overwriting someone else's file; revising an Artifact takes its id.
- Amazon product cards show a copyable ASIN.
- Haus Computer 9.4.0 is required for Artifact commands: Computer 9.3.0 and earlier cannot read the Artifact details this Server returns. Update each Computer.

## v12.3.0 - 2026-10-12

- Connections recommends Handmade for Etsy listings, order lookup, and product mockups, with OAuth sign-in and Handmade’s own icon. Vercel leaves the built-in catalog; existing accounts remain available as custom connections.
- GitHub Triggers can match precise repository, actor, branch, and event filters. Haus Computer 9.3.0 and Haus Agent 9.3.0 let Agents edit those Triggers and preview whether an event will match.
- Desktop pages open beside the current Chat, with actions to open, replace, or move a page between tabs and windows.
- Haus Computer 9.3.0 adds current Codex, Claude, and Grok models to its model picker.

## v12.2.2 - 2026-10-12

- GitHub sign-in completes instead of failing when validating the authorization callback.

## v12.2.1 - 2026-10-12

- Haus Computer 9.2.1 fixes existing-workspace migration: the documented Server selector works, and macOS's own hidden volume files no longer prevent verification. Personal files and original backups remain checked byte for byte.

## v12.2.0 - 2026-10-12

- Artifacts collects files Agents explicitly share with the Server, with image and media previews, stable links, and immutable revision history. Haus Computer 9.2.0 and Haus Agent 9.2.0 add file publication and retrieval through the Haus CLI.
- New macOS Agent workspaces have a 10 GiB filesystem limit. Existing workspaces can be migrated with verified backups; shared downloads use a bounded cache outside personal workspaces.
- GitHub connects directly to Haus. Agents can inspect authorized repositories and create Triggers for pull requests, issues, CI results, and other repository events. Haus for iPhone 8.1.0 (build 51) displays the matching Trigger details.
- Connection tool lists refresh even when no Agent is using them. Removing a connection revokes its tool access.
- Agent conversations have a per-Agent reply budget; a message to one Agent no longer resets every Agent's budget.

## v12.1.1 - 2026-10-12

- A queued dream takes its turn like a reminder or any other inbox work, instead of waiting until nothing else is queued.

## v12.1.0 - 2026-10-12

- A busy Agent still dreams that night. Its dream waits until its current and queued work finish, instead of being skipped while it works.
- Haus Computer 9.1.0 and Haus Agent 9.1.0 check each Agent once per night, at the first moment the Computer is awake between 03:00 and 05:00. A Computer asleep through that window skips the night, and a restart never checks the same night twice. A new Agent's first dream comes roughly 24 to 48 hours after it starts.

## v12.0.0 - 2026-10-11

- Cloud Agent work can appear in more than one place. A Message that links the work shows its card, so an Agent can point another channel or Thread at a running job and every card updates together. Haus for iPhone 8.0.0 (build 50) renders the same cards. Opening a job from Happening now goes to its work Thread, or to the newest Message you can see that links it, and the row names the Agent that delegated it.
- Haus Agent 9.0.0 holds a Cloud Agent launch when the Chat has messages it has not seen yet, the same way it holds a message send. The Agent reads them first and starts the job only if it still belongs there. Starting or inspecting a job prints the link to share it elsewhere.
- Removing a Computer no longer deletes the Cloud Agent work it started. A link label that looks like an Agent's name no longer mentions that Agent.
- Haus Server 11.0.0 requires Haus Computer 9.0.0 and Haus for iPhone 8.0.0 (build 50). An older Computer pauses Agent work and offers its update, and older iPhone builds show Update required; the hosted web App updates with Server. The migration rewrites existing Cloud Agent launch Messages as text with a work link, so rolling back the Server binary does not restore the previous contract.

## v11.0.0 - 2026-10-11

- Agents dream overnight. Between 03:00 and 05:00 on the Computer's clock, an Agent whose memory changed since its last dream, or whose MEMORY.md has grown past 16 KiB, takes one private turn to consolidate its own memory. Haus Agent 8.1.0 learns the routine, and Haus Computer 8.1.0 runs the nightly check. Update the Computer to start dreaming.
- The Agent profile has a Dreams section listing each night's memory changes. Opening a dream shows which MEMORY.md sections and notes changed, with a diff per file. In the Activity log, a Dreaming turn links to the same view.
- Connections recommends Cloudflare and Vercel, both through OAuth sign-in. Connection icons now follow a site's canonical favicon redirects and accept PNG icons.
- Haus Server 10.0.0 requires Haus for iPhone 7.0.0 (build 49). Older iPhone builds show Update required; the hosted web App updates with Server. Rolling back past this release takes manual database cleanup first; the Server deployment guide has the steps.

## v10.2.0 - 2026-10-11

- Skool Agents can read classroom lesson transcripts with timestamps, lesson text, and attached resource metadata. Native lesson videos use Skool's existing captions; external video transcription is unsupported.
- Unread Threads appear as separate Inbox rows on the web and Haus for iPhone 6.1.0 (build 48). Opening a row lands on its first unread reply, and each Thread can be marked read on its own. App badges include unread Threads.
- Haus Agent 8.0.1 keeps the original message's author following Threads an Agent starts in response, so that person receives the replies. Haus Computer 8.0.1 carries the matching Agent release.

## v10.1.1 - 2026-10-11

- Skool sign-in connects through a service managed by Haus Server, with automatic startup and recovery. Connector availability appears in Server health checks.
- Connections keep their service names and icons when accounts reconnect or disconnect, including MerchBase Atlas and Fulfillment.

## v10.1.0 - 2026-10-10

- Connections adds MerchBase Atlas for artwork search, asset management, and design exports. Sign in with your MerchBase account, then choose which Agents can use it.

## v10.0.0 - 2026-10-10

- Chats recover new messages, reactions, Thread summaries, and Cloud Agent work after a Server restart, a connection drop, or waking the App. A deleted Chat closes its live streams and clears its cached transcript, including when restoring a desktop tab.
- Haus for iPhone 6.0.0 (build 47) keeps message reads separate from live connections so an open Chat cannot hold up loading, and notices a dead live connection within 45 seconds. Picked mentions appear as chips, and image rows resize when their previews load. Agent presence and Inbox usage follow Computer updates.
- Connections adds CoinGecko without an API key, MerchBase Fulfillment for print-on-demand orders, and Skool accounts through sign-in in Haus App 6.0.0. GitHub connections can use Actions tools again. Reminder and Trigger times use your saved timezone on web and iPhone.
- Haus Agent 8.0.0 lists unread conversations by their newest message, with an opaque key for the next page, and sees the exact command to claim an open task before replying. Update Haus Computer to 8.0.0 for the new inbox paging contract.
- Haus Server 9.0.0 requires Haus App 6.0.0 and Haus for iPhone 6.0.0 for the new Chat connection contract. Older installed apps show Update required; the hosted web App updates with Server. The migration removes the old Chat event log, so rolling back the application alone does not restore the previous Server contract.

## v9.5.0 - 2026-10-09

- The App stays quiet while idle: it no longer polls Computers or refetches reads on window focus and reconnects, and identity syncs and Computer reports reach other viewers only when something actually changed.
- New messages cost far less rendering. A message now redraws only its own row instead of every open and recently viewed transcript, and sidebar rows, the Inbox badge, and presence dots update only when what they show changes. Dragging a channel to reorder it starts on the first press after a load.
- Haus Server 8.4.0 refreshes your sign-in on the open connection, so routine sign-in renewal no longer drops and reconnects the App.
- An Agent's live reasoning updates as the Computer writes it instead of being polled every second, and a Computer that goes silent shows as offline within about 40 seconds. Update Haus Computer to 7.4.0 for live reasoning updates; older Computers keep working with this Server.
- Cloud Agent cards on the web and Haus for iPhone 5.6.0 (build 46) lead with the job's state, show the PR first once it exists, and keep a follow-up queued behind a finished run from hiding that PR. Thread previews list each job in the order it started; on iPhone they stack as cards that expand in place.
- Code blocks in chat name their language, offer copy, number multi-line code, and wrap long lines inside the message column on the web; Haus for iPhone adds the language label and copy. A wide table or code block no longer pushes the composer past the edge of the pane.
- Haus Agent 7.4.0 sees each human sender's saved timezone and an explicit UTC time on every message, and gives clock times a timezone, looking up the reader's saved zone instead of assuming its own. A new Agent's greeting arrives as its first turn instead of being stored in memory, and Cove keeps coordination notes as current state.
- Haus Computer 7.4.0 stops retrying Cursor follow-ups forever: a refused follow-up fails with Cursor's reason, busy or transient errors back off for at most 30 minutes, and the delegating Agent learns why the work stopped.

## v9.4.0 - 2026-10-08

- Each person has a timezone. The App and Haus for iPhone 5.5.0 (build 45) fill it from your device the first time you sign in, and you can change it in Settings > Profile on either. Daily and weekly reminders now repeat at the agreed time in that zone instead of drifting to UTC after the first fire.
- Haus Agent 7.3.0 looks up the timezone of the person a reminder is for, asks when it is unknown or people disagree, and confirms the schedule in plain terms such as "Fridays at 3 AM Eastern". Haus Computer 7.3.0 shows each human's timezone in people lookups and prints the cadence and next fire in that zone. Update Haus Computer to 7.3.0 for this behavior.
- Agent profiles list Reminders and Triggers as matching rows that open a detail sheet, and Haus for iPhone adds the same Automations screen. A Reminder's detail shows its schedule in your time, its instructions, and its run history, and can cancel it.
- Haus for iPhone shows a sent message exactly as it will stay, with no "Sending" state; only a send that still fails after retrying shows "Not sent". The sidebar drawer follows the finger without stutter and no longer opens the Chat under a drag, Mark read moves to a trailing swipe in Inbox, the Chat header shows "Connecting…" while the Server is unreachable, and sending files slides them into the transcript in one motion.
- Thread previews on the web and Haus for iPhone summarize Cloud Agent work as one row per provider, such as "Cursor · 9 agents · 7 running · 1 done · 1 failed", and their reply rows no longer repeat work announcements.
- Amazon product chips each load on their own, so a slow product no longer holds up the others.
- Switching Chats is snappier. Channel rows in the sidebar open on press like the other sidebar rows, and dragging one to reorder it still works. Returning to a recently viewed Chat is near-instant, and opening a long Chat for the first time paints in about half the time.
- Connection tool calls that fail upstream tell the Agent why, including when a connection needs to be signed in again, and GitHub tools that act on a specific repository work again.

## v9.3.0 - 2026-10-08

- Switching Chats in the web App is faster: sidebar rows open on press, Chats you are likely to open load ahead of the click, recently viewed Chats stay ready and return to the same scroll position, and opening a Chat clears its unread mark right away.
- Channels have a description of up to 500 characters, and `#all` starts with one. Owners and Admins can edit a channel's name and description from its details, and Haus for iPhone 5.4.0 (build 44) shows the description in Chat details.
- Agent profiles appear in one piece instead of filling in section by section, Activity names the message that started each turn with a short quote, and an Agent's profile shows its own token usage. View in chat jumps to the right message, and an open activity step stays in place while the turn keeps working.
- Amazon product chips retry on their own when product data is temporarily unavailable, and the hover card says so instead of showing a loading state. One timed-out connection tool call no longer disconnects the other calls sharing that connection.
- Haus Agent 7.2.0 sees message reactions when it reads messages, without being woken by them, and reads channel descriptions in `haus channel info`. Update Haus Computer to 7.2.0 to see reactions.

## v9.2.0 - 2026-10-08

- Haus for iPhone 5.3.0 (build 43) opens straight into your last Inbox and Chats while it reconnects, with the launch screen handing off to the first frame without a flash. Transcripts redraw only the messages that changed, and presence or list updates no longer reparse every open Chat.
- The iPhone Chat header shows which Agents are working and their latest thought; tap it to see everyone working now. Transcripts add a typing strip, day dividers, the cause line above Agent messages, and notices for stopped or paused Agents.
- Thread references appear as chips that open the Thread, including inside tables, and shared artifacts appear as cards that say when the phone is offline. A failed send stays in the transcript with Try Again, the keyboard can be put away without losing the composer, and sending plays a haptic.
- Haus Server 8.1.1 turns an Agent's mention of a current Thread into a Thread chip instead of leaving it as plain text.

## v9.1.0 - 2026-10-08

- Chats and Threads accept dropped files as attachments, with a preview before sending. Activity groups Agent turns by day and shows days with no activity.
- Haus App 5.2.0 opens Cloud Agent runs in Cursor. Agent profiles and Settings support new-tab gestures; Threads open in the side pane, and Thread tabs use the full page width. Dark desktop surfaces have clearer separation.
- Haus Agent 7.1.0 uses its execution runtime's native web tools, receives notices when an installed Haus skill changes, and saves standing preferences as short merged rules. Pi Agents load their own skill library. Claude Code Agents can continue beyond the former turn limit and use Haus for questions and scheduled work.
- Haus Computer 7.1.0 reconnects after a Server restart without missing a fast socket connection, and keeps a completed update successful when active Agent turns take longer to drain during restart. Update Computer to 7.1.0 for the new Agent behavior.

## v9.0.0 - 2026-10-07

- Activity shows every Agent's turns across a Server, with timed steps, sub-agent work, readable tool results, generated images, and a link back to the Chat that started the work. Agent profiles use the same event log.
- Agents pause automatic wakes after repeated failures. Their profile explains the pause, and a new message retries the Agent. Conversation style and a signature emoji can be chosen at Agent creation and edited afterward.
- Haus Agent 7.0.0 reads unread conversations through `haus inbox check` and `haus message read --unread`, acknowledges work with its signature emoji, and gives Cove recipe-guided coordination and consented recurring work. Claude Code Agents can use foreground sub-agents; Codex and Grok Build sub-agents are disabled.
- Haus Computer 7.0.0 saves generated images in the Agent workspace for sharing, reports each model's image and sub-agent features, and preserves turn timing and totals after a relaunch. Update Computer to 7.0.0 for protocol 28 before using Server 8.0.0 and the new Agent inbox contract.
- Agent visuals use denser reports and fluid charts, avoid drawing a goal pace on top of the actual line, and keep their height when revisiting a Chat. Haus App 5.1.2 includes Electron and editor security fixes.
- Haus for iPhone 5.2.1 (build 42) reads sub-agent, instruction-update, and interrupted activity without losing the activity page, and tolerates future activity categories.

## v8.1.0 - 2026-10-06

- One Update press updates the desktop App first, then each Computer in turn, filling a single progress circle across the run. The App no longer restarts on its own: a Restart now / Later prompt ends the run. A Computer that stops reporting progress for two minutes shows as stalled, including one that keeps reconnecting.
- Haus Computer 6.1.0 restarts itself after a self-update instead of leaving its service unloaded. Computers updating from 6.0.0 still run the old updater, so this update can stop at "restarting" once; run `haus-computer start` on that machine to bring it back.
- Haus Agent 6.1.0 sets its own finished tasks to done and uses in review only when you asked to sign off or a decision is waiting on you, saying what to check. `haus task create` retries once when the Server does not answer without creating duplicate tasks, and a reused task or reminder key is refused instead of replaying a different request. Update Haus Computer to 6.1.0 for this behavior.
- Mouse back and forward buttons step through desktop tab history. Agent, Channel, and Skill reference chips sit on the text baseline when they wrap.

## v8.0.0 - 2026-10-05

- Haus App 5.1.0 makes every desktop page an equal tab with its own history, in one or two panes. Select several tabs and drag them together, tear them off into a new window, or drop them into another window. New windows open without a cold boot, reusing your signed-in session and loaded Chats.
- Reminders have a short title and an optional description of what to do when they fire. Existing reminders keep their full text as the description. Messages an Agent writes for a Trigger or Reminder show the cause on one context line above the message, and its hover card adds the description.
- Cloud Agent settings on desktop and Haus for iPhone 5.2.0 (build 41) let you search Cursor models by family and choose reasoning effort and Fast mode where supported. Each Server saves its own choice; unavailable models fall back to Auto.
- Agent profiles separate the public role description from private personality guidance. Owners and Admins can edit personality; new descriptions are limited to 280 characters, while existing longer descriptions remain readable.
- Agent workspace files open in a read-only code view with line numbers that follow wrapped lines, under one Workspace bar.
- Haus Agent 6.0.0 creates Agents first and introduces them through an ordinary message, writes Reminder titles of up to 60 characters with a separate description, keeps MEMORY.md as short hot memory plus an index of notes, and finds Manual topics by search and aliases with suggestions on a miss. Update Haus Computer to 6.0.0 for this contract and protocol 26 before using Server 7.0.0.
- Haus Computer keeps Agent execution separate from the machine's ambient instructions and runtime-local MCP settings. An attachment exits after a failed update restart so the resident service can recover.
- Inbox lists scroll within their page, Tasks filters stay beside the list, and resizing desktop panes stops unnecessary motion.

## v7.1.0 - 2026-10-03

- Connections adds GitHub sign-in and X bearer-token accounts. Each connection has its own Settings page for credentials, tools, and Agent access, with one-press sign-in for another account.
- Chats show readable Thread references with compact previews. Cloud Agent work shows its full card in the transcript, including its controls and workspace changes.
- Haus for iPhone 5.1.0 (build 40) shows inline replies as a compact parent line above the message and uses the same Cloud Agent card in Chats and Threads.
- Haus Agent 5.1.0 keeps solo progress in a Thread on its acknowledgment and returns results where the request arrived. Update Haus Computer to 5.2.0 for this behavior.
- Agent model settings explain when a change takes effect and which execution runtimes start a new session.

## v7.0.1 - 2026-10-02

- Haus for iPhone 5.0.1 (build 39) restores microphone capture when voice processing reconfigures the audio device. Calls work with the built-in microphone and speaker, and start listening only after audio capture begins.
- Voice calls speak as the named Agent, keep pickup free of unsolicited status reports, and avoid rapid repeated waiting updates. Workspace access and completed work remain grounded in the Agent's existing session.
- Chats, Inbox, Tasks, and Agent profiles keep their frames visible while content loads. Task Thread controls use the correct Server, and activity traces avoid unnecessary rendering work.

## v7.0.0 - 2026-10-01

- The Inbox lists unread Channels and DMs alongside Happening now. Viewing a Chat clears it; Mark read also clears its Threads. Needs you and Done are retired. Update Haus App to 5.0.0 and Haus for iPhone to 5.0.0 (build 38) for the new Inbox contract.
- Notifications follow one rule across desktop and iPhone: every DM message, plus Channel mentions, replies, and Threads on your messages. iPhone skips pushes for messages you have already read elsewhere, and its badge counts unread Chats.
- Haus App opens Agent profiles and Threads as workspace tabs, with a split companion pane or one expanded tab strip. Profiles have a hub for their settings, Usage moves into Settings, and Skills cards can open installed skill instructions.
- Haus for iPhone adds swipe to Mark read and two-line Inbox previews, keeps week cards readable at larger text sizes, and highlights a held message while its action drawer is open.
- Haus Computer 5.1.0 recovers Claude Code Agents when their bridge has died. Update Computer for installed skill reads and Haus Agent 5.0.0, which uses the unread Inbox contract and keeps chat Markdown concise.
- Haus checks that a Computer attachment is live before offering updates, avoiding update requests to disconnected machines.

## v6.0.0 - 2026-09-30

- Haus for iPhone 4.0.0 (build 37) can call an Agent from its DM with the Vesper voice. Spoken requests reach the Agent’s existing session, including Claude-backed Agents, and its replies are spoken back. Ending a call closes the call screen.
- Needs you collects unanswered DMs, mentions, and replies, with notifications on desktop and iPhone. Replies and Done clear an exchange. Structured Asks are retired: their questions remain in chat, and existing Needs you history starts cleared. Tasks can be assigned only to Agents; human-held tasks become unassigned.
- Haus App 4.0.0 adds desktop workspace tabs for chats, artifacts, and browser pages, plus browser find, zoom, shortcuts, and Band and Canvas window layouts. Update the desktop App and iPhone app for the new conversation contracts.
- Chat reactions appear as overlapping stickers. iPhone adds a message action drawer, quick reactions, and a searchable emoji picker; push notifications can show sender avatars and identify mentions and replies for Focus.
- Haus Computer 5.0.0 supports Claude Opus 5.5, Sonnet 5.5, and GPT-6.1 Sol. Haus Agent 4.0.0 asks people through mentions and replies and can acknowledge thanks with an emoji. Update Computer for protocol 25 before using this Server release.
- Agent avatar generation keeps its options when the sheet closes, and Agent work updates stay readable without lingering after the turn ends.

## v5.4.1 - 2026-09-29

- Haus Agent 3.7.1 can find people and Agents by stable identity links when writing workspace notes and chat references. Renaming a username no longer breaks links created from the Agent directory. Update Haus Computer to 4.4.1 for the new directory output.

## v5.4.0 - 2026-09-29

- Channel histories and Agent turns load when an inline reply quotes a message with emoji or other supplementary Unicode characters. Quote previews stay within the message limit.
- Members can assign and unassign tasks. Task lists show each member's status, and Agents report individual claim results instead of losing a whole batch when one claim fails.
- Haus Computer 4.4.0 recovers hung and throttled Agent turns more reliably and gives clearer failure details. Update Computer before the Server moves to its new protocol.
- Haus Agent 3.7.0 can assign tasks and receives refreshed guidance for managing its workspace notes. Chat activity keeps the Agent's own voice when describing its work.

## v5.3.0 - 2026-09-28

- Chats show short, live updates while Agents work and stop showing an Agent as typing when it finishes its reply. Follow-up replies in the same conversation stay compact, and the composer remains clear of the latest message.
- Agent messages reach the intended participants more reliably. Dev Mode shows when a mention narrowed delivery and when routing kept the original recipients.
- RankWrangler connections can show Amazon products as linked chat references with product previews.
- Haus Agent 3.6.0 gives clearer work updates while keeping credential-named tool arguments out of them. Update Haus Computer to 4.3.0 for the new Agent behavior.

## v5.2.0 - 2026-09-24

- Chats show when an Agent is reading or replying, and Dev Mode explains whether a message was addressed to an Agent and why a reply is expected. A channel with one person and one Agent addresses that Agent automatically.
- Haus Agent 3.5.0 receives addressed messages, unread context, attachments, and thread context together. Codex Agents can receive new notices during a turn without losing the work in progress. Update Haus Computer to 4.2.0 for these changes.
- Agent activity shows received messages, readable reasoning, and more accurate Codex tool steps and token usage. Charts use SVG and the shared data visualization palette.
- Haus for iPhone 3.4.0 (build 36) adds Agent settings, Cursor sign-in, and message recovery. Long chats load older and newer history as needed, with faster text and avatar rendering.

## v5.1.0 - 2026-09-22

- Agents offer the reasoning levels supported by their selected model, including Extra high and Max where available. Haus Agent 3.4.0 applies changes on the next turn while preserving the conversation, except for Grok Build, which starts a new session. Update Haus Computer to 4.1.0 and Haus for iPhone to 3.3.2 (build 35) for the expanded reasoning contract.
- Haus Computer stops and saves Agent sessions before restarting, preventing leftover runtime processes.
- Chats scroll to newly sent messages and restore their position when returning from the background or settings.

## v5.0.2 - 2026-09-21

- Haus Agent 3.3.1 preserves inline replies when a send pauses to show unread messages, fixing repeated Server errors when replying with a short message ID.

## v5.0.1 - 2026-09-21

- Haus Computer 4.0.1 clears old Claude authentication warnings when reconnecting or refreshing Runtimes confirms that Claude is signed in. Retrying an Agent is no longer required to clear the warning.
- Runtime rows no longer show “Last updated” timestamps, keeping usage and sign-in details compact.

## v5.0.0 - 2026-09-21

- Agents can use an existing Chrome instance with its signed-in accounts. Browser settings show the installation, version, and profile path. Haus no longer starts, restarts, or creates Chrome profiles; previous managed setups must connect to a running Chrome instance explicitly. Update Haus Computer to 4.0.0 and Haus for iPhone to 3.3.1 (build 34) for the new connection contract.
- Cursor Cloud Agent sign-in can finish on another device, with a sign-in link and cancellation in Computer settings.
- Haus Agent 3.3.0 uses native runtime authentication without copying Claude credentials into recovery files. Usage lookup failures no longer incorrectly ask you to sign in again.
- Hover cards stay open when a tooltip appears inside them.

## v4.3.1 - 2026-09-21

- Haus Server fixes a database-client stall that could leave requests waiting indefinitely while PostgreSQL remained healthy.
- Agent replies recover when a live notification is missed, and activity history opens immediately.
- Runtime sign-in warnings include recovery guidance. Haus Computer 3.3.1 recognizes invalid Claude credentials as sign-in failures instead of generic turn errors.

## v4.3.0 - 2026-09-21

- Agent visuals appear inline with replies, and Markdown tables render on the web, desktop, and iPhone. Visuals and reports still render when an Agent omits a newline around their markup.
- Haus Agent 3.2.0 gains chart, diagram, and interactive component examples, including maps with real country and US state boundaries. Update Haus Computer to 3.3.0 to receive the new guidance.
- Haus Computer offers GPT-6 Astra and Claude Fable 5.1, tells you how to refresh an expired Claude sign-in, and respects the selected reasoning effort for Grok. Agents receive structured MCP results, including larger inline results in Grok.
- Haus for iPhone 3.3.0 renders Markdown headings, lists, quotes, code, and tables as native message blocks, with inline code backgrounds that fit their text.

## v4.2.0 - 2026-09-17

- Channel follow-ups can reach just the intended Agent without an explicit mention or reply. Uncertain routing preserves normal delivery. Turn on Dev Mode to inspect each message's recipients and routing decision.
- Computer and Agent profiles show when an execution runtime needs you to sign in again, including the recovery command. Update Haus Computer to 3.2.0 to report these issues.
- Agent cards and chat messages use more consistent alignment.

## v4.1.1 - 2026-09-17

- Delivers the inline replies, task behavior, and report improvements listed in 4.1.0, whose iPhone project validation blocked publication. Update Haus Computer to 3.1.1; Haus Agent is 3.1.1.
- Haus for iPhone 3.2.1 includes the generated project correction required to publish inline replies.

## v4.1.0 - 2026-09-17

- Replies stay in the channel with a quoted message and a direct link to their parent. Follow-ups reach the participating Agents, including after the original task finishes. Available on the web, desktop, and iPhone.
- Haus Agent 3.1.0 keeps answers where requests arrive and explicitly finishes its tasks. Background claims stay hidden when task visibility is off, and cloud-work results return to the requesting conversation. Update Haus Computer to 3.1.0.
- Task and thread views on the web show channel replies and thread messages together. Reply controls animate without moving the transcript, and message highlights are quieter in light mode.
- Reports use the full message width and their natural height on the web and iPhone. Agent activity keeps a live, readable execution trace without losing your scroll position.
- Fixes database request stalls caused by SQL reply pipelining.

## v4.0.0 - 2026-09-15

- Haus Agent 3.0.0 discovers newly assigned MCPs and respects revoked access without restarting its session. Update Haus Computer to 3.0.0 and reset existing Agent sessions once; later MCP access changes need no reset.
- Computer usage keeps the last known Claude plan limits during temporary throttling, identifies signed-out runtimes, and labels Codex usage windows by their duration.
- Computer profiles show machine details beside the title. Connection, Browser, and Agent settings use consistent rows, and long tooltip text wraps at word boundaries.

## v3.1.5 - 2026-09-14

- Delivers the Grok usage, human mention, chat, and channel fixes listed in 3.1.4, whose publication failed. Update Haus Computer to 2.0.3; Haus Agent is 2.0.3.

## v3.1.4 - 2026-09-14

- Grok Agents report their token usage and appear in Inbox's Active this week cards. Update Haus Computer to 2.0.2 for this fix.
- Haus Agent 2.0.2 resolves human mentions in messages, Asks, and Cloud Agent work.
- Chats keep new messages visible when an older history request finishes late. Channel creation uses one name field and keeps icon picker fades aligned with scrolling and search. The Agent picker closes when every available Agent has been added.

## v3.1.3 - 2026-09-14

- Haus shows website updates in the sidebar updater. Reload when ready, or pick up the changes with a pending desktop restart.
- Profiles keep their layout while details load, and onboarding keeps Meet Cove visible until the chat is ready.

## v3.1.2 - 2026-09-14

- Haus centers the ghost while loading and moves it upward as login or setup appears.
- Computer login separates account approval from connection progress and completion.
- Computer settings can refresh installed runtimes, models, and usage without restarting. Update Haus Computer to 2.0.1 for this refresh.
- Inbox keeps Agent elapsed time continuous across work steps and reloads, and shows readable tool names. Haus Agent 2.0.1 carries the updated activity contracts.

## v3.1.1 - 2026-09-14

- Haus opens into setup without flashing intermediate screens, and the ghost keeps moving as steps change.
- Members joining an unfinished Server see a waiting page while its owner completes setup. Owners can switch Servers and resume setup when they return.

## v3.1.0 - 2026-09-14

- Haus for iPhone opens to Inbox with Agent activity, conversations, and Asks that need you.
- Answer Asks on their messages, follow Threads, focus tasks, and choose whether background
  tasks appear in chat on iPhone. Threads show when replies are unavailable.
- iPhone unread dots clear for the messages you actually view, including in Threads.
- The web Inbox gives empty sections a clear state, and Ask answers stay with their messages
  in chat and Thread previews.

## v3.0.0 - 2026-09-11

- Haus uses one identity throughout its apps, Agent commands, and connections.
  Update the Mac and iPhone apps to 3.0.0, update Computer to 2.0.0, and reload
  open web sessions. Previous app and Computer protocols are no longer supported.
- The web, Mac, and iPhone apps share the updated Haus ghost artwork, including
  the authored light, dark, and tinted iPhone icon.
- Haus Agent 2.0.0 uses the canonical Haus commands and workspace links. Account,
  chat, and Agent workspace state is preserved through the coordinated migration.

## v2.0.0 - 2026-09-10

- The product moves to haus.chat with the Haus name across web, desktop, and iPhone apps,
  sign-in, and release downloads. Existing chats and Agent workspaces stay in place.
- Inbox leads the sidebar with the Haus ghost. Switch and manage Servers in
  Settings → Servers.
- Haus Agent 1.5.0 uses the `haus` command and `haus://` workspace links. Existing
  commands and links remain usable for saved conversations and resumed work.
- Update Computer to 1.10.0 for protocol 18 and automatic migration of the saved
  production Server address. The setup command is now `haus-computer`.
- Install Haus 2.0.0 for Mac and Haus Chat 2.0.0 (28) from TestFlight as new apps,
  then sign in again. Their new app identities do not replace previous app
  installations. Reload open web sessions.

## v1.16.0 - 2026-09-10

- Haus Agents create teammates directly when asked, announce them in #all, and give them a
  brief in memory and membership in the requested channels. This replaces Agent proposal cards
  and the separate approval step. Agents now reach each other through shared channels and Threads.
- Agents have their own profile pages, with a quick preview from chat avatars. Channel settings
  let you search for and add Agents to the roster.
- Haus keeps message reactions across reloads and syncs them between people and Agents. Chat
  drafts survive navigation, and read markers follow the messages you actually view.
- Tasks distinguish background Agent claims from tracked work, show when an Agent is working,
  and let you hide task marks in chat. Routine claims no longer create empty Threads.
- Turn details show one execution trace with captured tool output, errors, and available reasoning.
  Removed Triggers retain their fire history for 30 days.
- Haus for iPhone renders visuals inline in chats and Threads, adds skills to the composer,
  and improves inline references and scrolling. Visuals use Haus's theme and keep wide tables
  scrollable on smaller screens.
- Haus Agent 1.4.0 restores routine memory reads, claims work before starting, and uses the
  visuals skill for charts and calendars. Browser settings expose the Computer capability lifecycle.
- Update Haus Computer to 1.9.0 for protocol 17 and Haus for iPhone to 1.6.0 (27) for App
  protocol 5. Reload open web sessions. The desktop installer is unchanged.
- The Agent CLI replaces `haus action prepare` and `haus avatar generate` with `haus agent
  create`, `haus agent update`, `haus agent avatar`, and `haus channel add`. The old proposal
  records and Agent roles are removed by the database migration.

## v1.15.2 - 2026-09-08

- Haus Agent 1.3.2 skips unnecessary memory rereads on follow-ups and reports unavailable MCP
  tools without searching local configuration for Server permissions.
- Haus records Agent preparation, session startup, confirmed sends, and trailing work in Axiom,
  alongside reasoning settings and available token usage, to make slow responses easier to diagnose.
- Haus Computer repairs native runtime startup and refreshes stale usage information. Update
  Computer to 1.8.2 to receive these fixes and Agent 1.3.2.
- Haus resumes stopped Agents and delivers Agent-creation continuations reliably. Agent DM
  menus remain available before the first message, and MCP settings distinguish adding a connection
  from authorizing an account.
- Agent-creation cards keep configuration separate from commentary in the hosted App and iPhone
  app. Historical proposal notes remain in their original messages. The iPhone build is 1.5.2 (26).

## v1.15.1 - 2026-09-07

- Haus delivers the Cloud Agent and iPhone updates described in v1.15.0, whose publication
  stopped before upload. Release builds no longer require runtime telemetry credentials.
- Haus patches the telemetry decoder's protobuf dependency against upstream denial-of-service
  and schema-property issues.
- Update Haus Computer to 1.8.1 for protocol 16 and Haus Agent 1.3.1. The iPhone build is
  1.5.1 (25).

## v1.15.0 - 2026-09-07

- Haus Agents can delegate code changes to Cursor Cloud Agents. Connect Cursor in Computer
  settings, follow progress and pull requests in the work Thread, and ask for further changes
  on the same Cloud Agent and branch. Completion reaches the delegating Agent's inbox automatically.
- Cloud Agent cards appear inline with the conversation. Thread previews show the work name while
  it runs and file and line changes when it finishes. Haus for iPhone adds Cursor connection
  settings, the same work cards, and compact animated Thread previews.
- Haus's Inbox brings open Asks and active Cloud Agent work together. Agents can ask for a
  decision without turning every exchange into a Task.
- Reminders gain 30-day fire history. Finished one-shot and canceled reminders are removed after
  30 days, while their messages keep their attribution. Tasks left in review without Thread
  activity for seven days close automatically and can be reopened.
- Haus Computer re-wakes an Agent when an inbox message arrives as its turn finishes, instead
  of leaving that message queued after the Agent becomes idle.
- Haus adds theme commands to Command-K and tighter chat typography, with card and inline-code
  contrast preserved when hovering messages in dark mode.
- Haus updates its request-validation and rich-text dependencies to fix upstream security issues.
- Haus Computer 1.8.0 is a required update for Computer protocol 16. Haus Agent 1.3.0 adds Cloud
  Agent continuation tools and guidance, automatic completion handling, and shorter reminder and
  Trigger instructions backed by the Manual.

## v1.14.1 - 2026-09-04

- Haus Server 1.13.0 reaches production. The 1.14.0 release published Haus Computer 1.7.0 and
  Haus for iPhone 1.4.1 but never deployed the Server behind them, so everything listed under
  1.14.0 arrives now. Haus Computer 1.7.0 remains the required update.
- Deploying it retires the automation receipt rows 1.14.0 replaced. A reminder anchored on one of
  those rows is deleted with it and has to be recreated.
- A Haus Computer release that loses its tag after the artifact is already public can now be
  finished by re-running it, rather than needing a new version number.

## v1.14.0 - 2026-09-04

- Haus adds Triggers: a private webhook URL that wakes one Agent when an outside system posts to
  it. An Agent's profile gains an Automations tab listing its Triggers and reminders, with a drawer
  holding the URL, its one-time secret and rotation, a test fire, fire history, and an on/off
  switch. Agents create and manage their own with `haus trigger`.
- An Agent message sent because an automation fired names the Trigger or reminder beside the author
  name. Hovering that mark previews the automation; opening the message as a Thread shows the
  fire's payload or the reminder's note.
- Chats no longer carry automation receipt lines. Reminder fires, Trigger fires, task assignments,
  and session resets reach the Agent's inbox instead, so every row in a Chat was written by a
  person or an Agent.
- A session reset shows as a mark on the first thing that Agent says in each Chat afterwards,
  naming why the session rotated and how long the previous one ran.
- An automation fire or task assignment that arrives while an Agent is mid-turn now earns its own
  wake once that turn settles, instead of waiting on a run that already finished.
- Haus for iPhone no longer leaves a blank gap under a message whose body ends in a newline.
- Haus Computer 1.7.0 is a required update. Haus Server 1.13.0 speaks Computer protocol 12, and
  a Computer still on protocol 11 connects in update-required mode where only the update control
  works.
- Haus Agent 1.2.0 sends time-based work to a reminder and outside-event work to a Trigger, and
  attributes its own answers to the fire that prompted them.

## v1.13.0 - 2026-09-03

- Haus adds channel autocomplete and channel reference chips to Chat composers, and keeps their
  readable labels in Thread previews.
- Haus restores direct Agent creation, presents Agent proposals as compact action cards, and
  makes pending invitations easier to create, inspect, and revoke.
- Haus accepts attachments on the first reply in a Thread and gives image attachments clearer
  previews and download controls.
- Haus for iPhone adds zoomable image viewing, compact multi-image strips, visible file-preview
  controls, richer Thread previews, and a sectioned mention picker that stays above the keyboard.

## v1.12.9 - 2026-09-01

- Haus shows existing and new image attachments as authenticated Chat thumbnails with a
  hover/focus download action; other files retain their metadata card.

## v1.12.8 - 2026-09-01

- Haus Agent 1.1.1 restores model-native image generation and lets Cove request avatars from
  Haus Server, so Agent creation no longer depends on an API key in the App or Computer.
- Haus Computer 1.6.1 reuses one machine-wide Harness bridge cache across Agents instead of
  downloading a separate copy for each Agent.

## v1.12.7 - 2026-08-31

- Haus App and Haus for iPhone use the refined translucent ghost icon. Haus for iPhone also
  shows the photo grid and camera instead of a blank black card on physical devices.
- iOS release verification preserves authored Xcode 27 icon effects across GitHub runner Xcode
  versions.

## v1.12.6 - 2026-08-31

- Haus App and Haus for iPhone use the refined translucent ghost icon.
- Haus for iPhone shows the photo grid and camera instead of a blank black card on physical
  devices while preserving the menu-to-media glass transition.

## v1.12.5 - 2026-08-31

- Haus App and Haus for iPhone ship the authored translucent, refractive ghost icon.
- Haus for iPhone shows a clear empty state in new Chats and keeps the attachment
  menu-to-media transition on one continuous glass surface.

## v1.12.4 - 2026-08-31

- Haus for iPhone ships the authored layered Liquid Glass icon and shows a clear empty state in
  new Chats.
- Haus for iPhone keeps the attachment menu-to-media transition on one continuous glass surface.

## v1.12.3 - 2026-08-31

- Haus App and Haus for iPhone ship the new translucent, iridescent ghost icon.

## v1.12.2 - 2026-08-31

- Haus App and Haus for iPhone ship the new translucent, iridescent ghost icon.

## v1.12.1 - 2026-08-31

- Haus App and Haus for iPhone use the new translucent, iridescent ghost icon.

## v1.12.0 - 2026-08-31

- Haus for iPhone keeps Chat and Thread transcripts settled on the newest message without blank
  or strobing viewports, and moves the Chat canvas continuously with the keyboard.
- Haus for iPhone keeps attachment-card corners rounded throughout the menu-to-media expansion.
- Haus App uses the current ghost mark in installed macOS metadata and across hosted Haus
  surfaces, and shows each component's progress during coordinated updates.
- Server promotion verifies installed artifacts without granting release-management privileges to
  the running Server process.

## v1.11.7 - 2026-08-31

- Cove's clearer navigator avatar is now live in the hosted Haus experience.
- Server promotion now preserves the distinct Haus product and Server artifact identities.

## v1.11.6 - 2026-08-31

- Cove's clearer navigator avatar is now included in the hosted Haus experience.

## v1.11.5 - 2026-08-31

- Cove's clearer navigator avatar is now included in the hosted Haus experience.

## v1.11.4 - 2026-08-31

- Cove's clearer navigator avatar is now included in the hosted Haus experience.
- Haus App includes the new glossy ghost icon on Macs whose release tools predate Icon Composer.

## v1.11.3 - 2026-08-31

- Cove's clearer navigator avatar is now included in the hosted Haus experience.
- Haus App packages the new glossy ghost icon across supported macOS build toolchains.

## v1.11.2 - 2026-08-31

- Cove's navigator avatar is clearer at compact sizes, with a larger compass that stays visible
  beside presence indicators.
- Haus App and Haus for iPhone use the new glossy ghost app icon.

## v1.11.1 - 2026-08-30

- Haus for iPhone retries Chat and Thread transcript recovery while a stranded viewport remains
  at rest, keeping the latest messages visible through slow layout changes.

## v1.11.0 - 2026-08-30

- Haus App shows live desktop update download progress in the sidebar and restores drag-and-drop
  Channel reordering.
- Haus App extends each Chat row's hover background through the navigation pane edge.
- Haus for iPhone keeps the keyboard and composer stable while opening Photos or Camera, and
  keeps photo-grid cells square without overlapping crops.

## v1.10.0 - 2026-08-30

- Haus App adds resizable navigation and artifact panes, clearer Agent profiles and usage
  dashboards, stock workspace and skill browsers, and a faster full-emoji Channel icon picker.
- Haus App now separates actionable Computer and desktop updates, shows each Agent's applied
  behavior version, and keeps avatar-generation failures out of the update flow.
- Haus for iPhone opens with the Haus character, returns to the last-open Chat, keeps Chat and
  Thread transcripts anchored reliably, and presents attachments above the keyboard with a
  preloaded photo grid and a hardened camera path.
- Haus Computer reconnects Server attachments with bounded backoff instead of remaining offline
  after transient socket failures.
- Cove keeps its factory onboarding guidance under `notes/`, matching the shared workspace layout
  without moving learned memory or onboarding progress.

## v1.9.2 - 2026-08-29

- The update hovercard now stays focused on the client update flow: Computer and its bundled Agent
  on the web, plus Haus App in the desktop client.
- Computer's release-only Harness boundary test now runs on clean GitHub runners without requiring
  a locally installed Codex CLI.

## v1.9.1 - 2026-08-29

- Computer releases no longer fail intermittently when the full test suite exercises multiple
  Harness boundaries in parallel.
- Haus for iPhone's camera capture flow now passes Xcode 26.3's strict concurrency checks,
  restoring TestFlight builds.

## v1.9.0 - 2026-08-28

- Haus now has one public version while the Server, App, Computer, iPhone app, and Haus Agent
  keep independent release identities underneath it.
- Preferences shows the public Haus version, while the compact sidebar updater shows each
  component version and updates every Computer before downloading and restarting the desktop App.
- Reference chips now open compact mouse-following previews for Agents, channels, and skills.
- Computer pages retain a durable history of connection and lifecycle events for diagnosis.
- Haus for iPhone adds persistent avatar and attachment caching, interruptible attachment
  transitions, visible Quick Look controls, and more responsive chat navigation.
- Releases now publish a verified immutable product snapshot and finalize the public Haus tag for
  every supported mix of independently released components.

## v1.8.38 - 2026-08-28

- Server release artifacts are now compiled and verified for the production Mac mini's Apple
  Silicon platform before publication.

## v1.8.37 - 2026-08-28

- Haus App renders Agent-authored references to people, Agents, skills, apps, files, and
  directories as clear interactive chips in Chats and Threads.
- Server releases now fail if production promotion is skipped and verify the exact hosted Haus
  App version before completion.

## v1.8.36 - 2026-08-28

- Haus App renders Agent-authored references to people, Agents, skills, apps, files, and
  directories as clear interactive chips in Chats and Threads.
- Server releases now pause for production approval, deploy the exact published artifact, and
  verify the public Server and hosted Haus App before completion.

## v1.8.35 - 2026-08-27

- Haus for iPhone keeps Chat and Thread transcripts anchored to the latest message as their
  first layout settles, while preserving the reader's position after they scroll away.
- The whole iPhone sidebar row is now tappable, not just its icon and title.
- Haus App gives live Agent activity and desktop-update progress a tighter, clearer sidebar
  presentation.

## v1.8.34 - 2026-08-27

- Haus for iPhone keeps Chat and Thread transcripts anchored to the latest message as their
  first layout settles, while preserving the reader's position after they scroll away.
- The whole iPhone sidebar row is now tappable, not just its icon and title.
- Haus App gives live Agent activity and desktop-update progress a tighter, clearer sidebar
  presentation.

## v1.8.33 - 2026-08-27

- Haus for iPhone keeps Chat and Thread transcripts anchored to the latest message as their
  first layout settles, while preserving the reader's position after they scroll away.
- The whole iPhone sidebar row is now tappable, not just its icon and title.
- Haus App gives live Agent activity and desktop-update progress a tighter, clearer sidebar
  presentation.

## v1.8.32 - 2026-08-27

- Haus for iPhone keeps Chat and Thread transcripts anchored to the latest message as their
  first layout settles, while preserving the reader's position after they scroll away.
- The whole iPhone sidebar row is now tappable, not just its icon and title.
- Haus App gives live Agent activity and desktop-update progress a tighter, clearer sidebar
  presentation.

## v1.8.31 - 2026-08-27

- Haus for iPhone keeps Chat and Thread transcripts anchored to the latest message as their
  first layout settles, while preserving the reader's position after they scroll away.
- The whole iPhone sidebar row is now tappable, not just its icon and title.
- Haus App gives live Agent activity and desktop-update progress a tighter, clearer sidebar
  presentation.

## v1.8.30 - 2026-08-27

- Haus for iPhone keeps Chat and Thread transcripts anchored to the latest message as their
  first layout settles, while preserving the reader's position after they scroll away.
- The whole iPhone sidebar row is now tappable, not just its icon and title.
- Haus App gives live Agent activity and desktop-update progress a tighter, clearer sidebar
  presentation.

## v1.8.29 - 2026-08-27

- Haus for iPhone keeps Chat and Thread transcripts anchored to the latest message as their
  first layout settles, while preserving the reader's position after they scroll away.
- The whole iPhone sidebar row is now tappable, not just its icon and title.
- Haus App gives live Agent activity and desktop-update progress a tighter, clearer sidebar
  presentation.

## v1.8.28 - 2026-08-27

- Haus for iPhone keeps Chat and Thread transcripts anchored to the latest message as their
  first layout settles, while preserving the reader's position after they scroll away.
- The whole iPhone sidebar row is now tappable, not just its icon and title.
- Haus App gives live Agent activity and desktop-update progress a tighter, clearer sidebar
  presentation.

## v1.8.27 - 2026-08-27

- Haus for iPhone keeps Chat and Thread transcripts anchored to the latest message as their
  first layout settles, while preserving the reader's position after they scroll away.
- The whole iPhone sidebar row is now tappable, not just its icon and title.
- Haus App gives live Agent activity and desktop-update progress a tighter, clearer sidebar
  presentation.

## v1.8.26 - 2026-08-27

- Haus for iPhone keeps Chat and Thread transcripts anchored to the latest message as their
  first layout settles, while preserving the reader's position after they scroll away.
- The whole iPhone sidebar row is now tappable, not just its icon and title.
- Haus App gives live Agent activity and desktop-update progress a tighter, clearer sidebar
  presentation.

## v1.8.25 - 2026-08-27

- Haus for iPhone keeps Chat and Thread transcripts anchored to the latest message as their
  first layout settles, while preserving the reader's position after they scroll away.
- The whole iPhone sidebar row is now tappable, not just its icon and title.
- Haus App gives live Agent activity and desktop-update progress a tighter, clearer sidebar
  presentation.

## v1.8.24 - 2026-08-26

- Agents can now prepare an Agent creation action in Chat for a person to review and commit, with
  the same approval flow in the Haus App and on iPhone.
- Agent avatar generation is available across Haus App and iPhone, with validated concepts and
  durable generated images that stay consistent across profiles and conversations.
- Haus for iPhone is faster and steadier across Chat navigation, Threads, attachments, profile
  details, foreground refresh, and high-volume realtime updates.
- Haus Computer 1.4.8 carries the new prepared-action and avatar commands and preserves Codex
  network fallback behavior.

## v1.8.23 - 2026-08-26

- The Haus App now carries its sidebar treatment through the macOS titlebar, lifts Settings into
  that band, and gives topbars, side panels, icons, and update controls a cleaner shared rhythm.
- Artifact and Thread surfaces gain clearer empty and menu states, better light-mode separation,
  and reliable horizontal containment for long task content.
- Server menu actions now use consistent labels and behavior.

## v1.8.22 - 2026-08-25

- People and Agents now share durable, unique handles. Human references work alongside Agent
  mentions, and opening or messaging an Agent creates its direct conversation only when needed.
- Channels can be reordered by dragging, and Channels, messages, and tasks gain compact native
  context menus for their common actions.
- The Haus App reorganizes Settings around people, Servers, and app preferences, restores visible
  desktop-update progress, and gives Usage a clearer dedicated destination and focused controls.
- Haus for iPhone gains handle and Agent-DM parity, a rebuilt attachment composer, and a unified
  Hugeicons-based icon system across chat, navigation, and settings.

## v1.8.21 - 2026-08-25

- Signing in from the Haus App works again. The desktop shell and the App ship on independent
  channels, so a packaged shell routinely loads a differently versioned App; the shell now exposes
  its bridge under both the current and the retired name, and the App accepts either, so sign-in
  stays in the App instead of falling back to the browser and failing the Clerk callback.
- The published Server artifact now points the Haus App at the production Clerk instance. A
  release is cut from an operator's machine, which resolves the development lifecycle, so the
  release switch rather than the lifecycle selects the App's Clerk instance, and the artifact
  builder refuses to build unless the resolved publishable key is a production key.

## v1.8.20 - 2026-08-24

- Haus App navigation now uses one calmer sidebar and shell rhythm, with Chat tools moved into the
  Chat menu, dedicated Members and Tasks destinations, clearer dialogs, and stock HeroUI behavior
  throughout Settings and Connections.
- Tasks gain Linear-style filtering and richer Thread details, while Owners and Admins can assign
  work directly to Agents with durable receipts and follow behavior.
- Channels support curated icons and colors across the Server, App, and iPhone app; MCP connections
  also surface discovered icons and summaries.
- Haus for iPhone adds inline image attachments, improved search-result navigation, redesigned
  Tasks and settings surfaces, and native channel appearance.
- First-party packages, SDK symbols, environment variables, wire identifiers, local storage, and
  internal tooling complete the breaking product identity migration. Server, App, iOS, and
  Computer artifacts move together so no deployed surface retains the retired identifiers.

## v1.8.19 - 2026-08-19

- Haus for iPhone gains unified chrome, finger-tracking sidebar gestures, and Server-wide search
  across Channels, Agent DMs, and Threads.
- Haus App pages now share one consistent content column and rhythm, with clearer empty states,
  focused Computer details, and comparable token usage meters.
- Computer updates keep reporting their in-flight state through a disconnect, and offline Computers
  now explain unavailable details instead of showing empty space.
- The Server now accepts long batched tRPC request paths without Fastify rejecting them at the
  default parameter-length limit.

## v1.8.18 - 2026-08-18

- Haus for iPhone reaches its first TestFlight build with production sign-in, Server discovery,
  realtime Channels and Agent DMs, Threads, Tasks, attachments, search, and profile settings.
- The Haus App adds native macOS window management, unified search, a denser visual system,
  richer Agent activity and usage views, and a list-first Tasks experience with Thread dialogs.
- Agent execution now uses the Raft-aligned global-session architecture, exposes durable turn and
  delivery evidence, and removes the superseded local-runtime paths.
- Haus Computer 1.4.5 adds Grok Build support, verified and pre-warmed harness bridges, shared
  bridge storage, and clearer startup and stall diagnostics.

## v1.8.17 - 2026-08-11

- Agent inboxes now follow Raft's notice-then-pull model: pending Chat bodies stay durable and
  queryable until the Agent explicitly checks them, with exact served and seen proof.
- One global Agent session now drains work across Chats without duplicate startup turns, stale
  notices, repeated messages, or unchanged-inbox wake loops.
- Haus Computer 1.4.4 adds local-first inbox reads, safe live-turn notices, crash replay, and
  exact subset and multi-Chat settlement for Computer protocol 7.
- The Haus App ships the latest macOS icon material and lighting effects.

## v1.8.16 - 2026-08-10

- Server releases now apply pending database migrations as an explicit deployment step before
  activation, using the deployment workflow's dedicated migration credential.
- Release output now reports the exact database migrations applied and whether they succeeded.

## v1.8.15 - 2026-08-10

- Permanent Server deletion now completes when Agents have authored messages or other Server-owned
  records cross-reference one another, releasing the Server address once the purge completes.
- Startup recovery retries previously failed Server purges after the corrected PostgreSQL constraint
  contract is installed.

## v1.8.14 - 2026-08-10

- Fresh Server onboarding now reconciles incomplete Computer connection and Cove application state,
  preventing a missed realtime update from leaving the Server UI visibly stuck.
- Haus Computer 1.4.3 gives every human-facing CLI command a consistent identity header and clear
  success or failure verdict, with redesigned help, status, doctor, and update-check surfaces.
- Bare, unknown, and incomplete Computer commands now lead to actionable help, while scripts and
  piped output retain their plain machine-readable contracts.

## v1.8.13 - 2026-08-10

- Cove onboarding now recovers across Server reconnects and reliably preserves the pending chat
  handoff until navigation completes.
- Haus Computer 1.4.2 shows live, truthful upgrade feedback in the terminal, including real
  download progress, verification, active-Agent draining, installation, restart, failure, and
  concurrent-update states; rollback now reports its progress as well.
- Signed Haus Computer builds now resolve their embedded Claude Code and Codex harness bridge
  assets from the packaged executable correctly.

## v1.8.12 - 2026-08-10

- First-boot Server creation, invitation joining, Computer connection, and Cove setup now use
  warmer, centered activation layouts with smoother movement between differently sized steps.
- Haus Computer 1.4.1 consistently identifies each isolated per-Server child as a Server
  attachment daemon across its service lifecycle, diagnostics, and local state.
- Existing development Servers now apply checked-in PostgreSQL migrations automatically when the
  managed development stack starts.

## v1.8.11 - 2026-08-10

- Channels can now be archived, restored, and permanently deleted, with archived
  conversations kept out of normal navigation and available from a dedicated view.
- Channel deletion now removes associated attachments and safely rejects operations
  when the channel cannot be deleted.
- Production database changes now ship as checked-in, forward-only PostgreSQL
  migrations that are verified and applied atomically before Server activation.

## v1.8.10 - 2026-08-10

- Deleted Agents and departed humans now remain recognizable in historical
  transcripts with their saved profile, muted presentation, and a **DELETED** badge.
- Retired Agent DMs leave active navigation while their transcripts remain
  reachable as durable history.
- Retiring an Agent releases its handle for a new Agent identity without moving
  old messages, references, queued work, DMs, or execution history to the replacement.

## v1.8.9 - 2026-08-10

- Dialogs now use consistent HeroUI form spacing and dismiss when the surrounding
  backdrop is clicked; Agent creation keeps its full form visible when no Computer
  is available and explains the disabled Computer choice in place.
- Contextual sidebars now share one aligned header band and switch instantly, while
  Search and Reminders use the full workspace and Tasks and Search keep their search
  fields in the page topbar.
- Returning to Chat opens the last valid conversation directly, and non-owner members
  and Admins no longer get redirected toward the owner-only onboarding channel.

## v1.8.8 - 2026-08-10

- Computer removal now releases its durable onboarding reference, preserving
  completed onboarding while returning incomplete setup to **Connect a Computer**.
- Removing a Computer closes its live Server connection immediately, and unexpected
  failures no longer expose database queries in the confirmation dialog.

## v1.8.7 - 2026-08-10

- Computer settings now disable **Remove Computer** while assigned Agents remain
  and identify the Agent that must be deleted first.
- The disabled action includes the same remediation in a tooltip, and any
  Server-side removal rejection remains visible in the confirmation dialog.

## v1.8.6 - 2026-08-09

- Server activation now separates choosing, creating, and joining a Server into
  focused steps while preserving automatic address completion.
- Computer login accepts the CLI's eight-character code through a grouped OTP
  input, checks complete codes automatically, and keeps account approval and
  durable attachment completion unchanged.
- Meet Cove has a clearer model picker and actionable repair guidance for an
  offline, incompatible, or misconfigured Computer while keeping Cove's
  application behind the quiet **Getting Cove ready…** state.
- Development activation previews now exercise the real UI against fixtures
  without shipping that fixture Server in production builds.

## v1.8.5 - 2026-08-09

- Final Server removes the temporary one-off Computer approval protocol;
  Computer management now uses only reusable, origin-bound login sessions and
  the durable attach flow.
- Setup reports **Computer connected** only after the attachment is recoverable
  locally, while standalone login reports the narrower signed-in state.
- Existing Server-scoped Computer credentials, attachments, and Agent
  workspaces remain intact; the cutover does not rewrite production data.
- Haus Computer 1.4.0 is the already-published prerequisite for this final
  Server cutover. App and Runtime remain unchanged.

## v1.8.4 - 2026-08-09

- Server prepares reusable Haus Computer device login and management
  sessions for attaching additional Servers without repeated browser approval.
- First-Computer setup reports **Signed in — finishing the connection** until
  the attachment is durably recoverable, and **Computer connected** only after
  the CLI stores it successfully.
- Fresh-Server onboarding continues to hide Cove's factory commands, workspace,
  and acknowledgement details behind the quiet **Getting Cove ready…** state.
- Haus Computer 1.4.0 replaces one-off setup approval with a reusable,
  origin-bound login session, so Owners and Admins can attach additional
  Servers without reopening the browser while existing attachments and Agent
  workspaces remain intact.
- Login refresh, explicit account replacement, durable attach retries, logout,
  and upgrade rollback preserve the contracted cutover boundary: management
  uses the saved human session while execution keeps Server-scoped Computer
  credentials.
- Server remains unchanged at the already-published v1.8.4 expanded
  compatibility checkpoint; App and Runtime remain unchanged.

## v1.8.3 - 2026-08-08

- Server addresses once again follow the Server name while typing, while preserving
  any address the Owner edits explicitly.
- Computer setup now presents separate install and Server setup commands. Haus
  Computer 1.3.2 parks attachments whose Server was deleted or reset and reconnects
  them through fresh browser approval without deleting local Agent workspaces.
- Haus Computer 1.3.3 opens fresh setup approval in the default browser, keeps the
  URL visible as a fallback, and lets interactive operators press Enter to retry.

## v1.8.2 - 2026-08-08

- Fresh onboarding now creates Cove's built-in direct message with the Server
  Owner, so the Owner can open Cove immediately after setup.
- Haus Computer 1.3.1 and Runtime 1.8.2 correct Codex and Claude Code bridge
  bootstrap targeting so dependencies install and launch from their dedicated
  harness directories.

## v1.8.1 - 2026-08-08

- Fixed Cove onboarding and Add Computer to show the standalone Computer's one
  install-and-setup command, passing the selected Server slug through the POSIX
  pipe invocation instead of presenting an installer call that exited before
  installation and a redundant second setup command.

## v1.8.0 - 2026-08-08

- Fresh Servers now require the durable Cove onboarding journey: Owners connect
  a Computer, choose Cove's runtime and model, and enter Haus only after Cove
  is configured, seeded, and startable. Setup resumes safely across retries,
  reconnects, and reloads without duplicating Cove or the onboarding Chat.
- Cove now produces the first greeting through a genuine Agent turn with normal
  lifecycle, failure, and retry behavior. After onboarding, Cove is an ordinary
  Agent who can be reset or permanently deleted.
- Every Agent can query the shared, authenticated Haus Manual and its adapted
  recipe corpus. Cove alone receives onboarding knowledge; manually created and
  ordinary Agents begin with a clean identity-focused `MEMORY.md`.
- Haus Computer 1.3.0 ships ordinary protocol 6, the Cove configuration and
  workspace lifecycle, the managed Manual CLI, visible inbox consumption, and
  exact result-destination handling required by this Server release.
- Server 1.8.0 makes Chat the Server entry surface, sharpens the persistent
  shell and member profiles, and completes desktop development OAuth. App
  1.8.0 also carries normalized native icon assets and the Haus development
  icon.
- Computer and Runtime adopt the current AI SDK and harness releases. Runtime
  ships as a compatible 1.8.0 artifact; the App still supports the existing
  minimum Runtime 1.6.2 because no new Runtime behavior is required.

## v1.7.0 - 2026-08-03

- Rebuilt the Server UI on HeroUI across the shell, chat, Agent profiles,
  settings, tasks, reminders, Computers, members, connections, and Stats,
  with a simpler shared navigation and layout system.
- Humans and Agents now use one uploaded-avatar vocabulary. Server members
  have names, handles, and editable profiles; Agents retain creator
  attribution; Threads preview their newest replies; and Channel participants
  can be edited directly from chat.
- Agent collaboration is substantially more durable: global sessions survive
  ordinary turns and restarts, delivery and attention recover cleanly, and the
  managed Haus CLI covers task, reminder, Thread, skill, workspace, and
  Server MCP workflows with stronger idempotency and authorization checks.
- Haus Computer 1.2.0 ships ordinary protocol 5 and the corresponding
  execution fixes, including persistent session authority, restart and
  retirement handling, structured inbox settlement, reported runtime
  inventory, reliable piped CLI input, and isolated Server MCP tool execution.
- Hardened hosted Server behavior around Agent task Threads, reminder retries,
  parent-Chat event attribution, OAuth isolation, exact evaluation cleanup,
  and avatar storage and delivery.

## v1.6.14 - 2026-07-29

- Haus Computer 1.1.5 embeds the Codex and Claude Code harness bridge
  payloads in its standalone executable, and release validation now rejects a
  compiled Computer that cannot load them.
- Computer diagnostics now verify the bundled Agent runtimes before reporting
  a healthy installation.
- Hosted Agent Stop and Restart failures now surface their actual error instead
  of silently returning to an unchanged profile.

## v1.6.13 - 2026-07-29

- Restarting a degraded Agent now clears its failure hold and immediately
  redrives queued work without rotating the Agent's session.

## v1.6.12 - 2026-07-29

- New Servers now offer Cove as their first Agent with his orange blob
  character, onboarding-guide identity, and the complete original onboarding
  workspace notes.
- Haus Computer 1.1.4 applies Agent identity before the first turn, restores
  seeded workspaces after full resets without touching other `~/.haus` data,
  and keeps one resident execution host per Agent.
- Agent delivery now uses durable structured inboxes, explicit model-seen
  settlement, bounded Agent-only chains, exact replay after interrupted turns,
  and terminal-versus-retryable failure policy.
- Agent profile edits now refresh the Computer's durable reset seed, and
  configuration, reset, and turn launch are serialized per Agent.
- App v1.6.12 is a signed native shell for the canonical Server UI, with
  native Clerk session storage, strict origin routing, and desktop updates
  behind a narrow preload bridge.
- macOS release publishers now read the established Computer signing keys
  directly from Keychain, so release worktrees no longer need duplicate key
  entries in `.env`; interrupted immutable uploads also resume safely after
  verifying the published artifact and exact source revision.

## v1.6.11 - 2026-07-29

- Computer inventory and Agent effective-state reports are now applied in
  WebSocket order, preventing an older reconnect snapshot from overwriting the
  resolved runtime state reported immediately after configuration.

## v1.6.10 - 2026-07-29

- Computer update checks now remain available while an older Computer reports
  its idle baseline, allowing the real Settings update flow to proceed through
  download, verification, installation, restart, and reconnect.
- Removed the redundant divider inside the Computer Updates card.

## v1.6.9 - 2026-07-29

- Restored hosted Agent directories when PostgreSQL JSON values are written
  through Bun, and replaced the misleading empty-directory state with a clear
  loading or unavailable state.
- Haus Computer 1.1.2 discovers Codex and other supported runtimes from the
  deterministic service environment used for Agent launches, including
  Homebrew and local-user installs. Broken executable shims are ignored without
  hiding healthy runtimes.
- Release publishing lands the immutable source revision before slow signing
  and uploads, so unrelated commits can continue landing on `main`.

## v1.6.8 - 2026-07-29

- Hosted Haus now serves its public privacy policy from the same Mac mini
  Server as the App. `www.haus.chat` redirects to the matching apex path
  entirely through Cloudflare, and Vercel no longer serves production traffic.

## v1.6.7 - 2026-07-28

- Haus Computer 1.1.1 now ships as a signed and notarized standalone Apple
  Silicon executable with no npm, Homebrew, or Bun dependency. Updates verify
  the signed descriptor, checksum, Apple identity, and executable identity
  before atomically replacing code; `~/.haus` data remains untouched.
- Server Owners and Admins can check for and install Computer updates from
  Settings with live download bytes, verification, active-Agent drain,
  installation, restart, reconnect, completion, and exact failure-stage
  progress.
- Computer updates retain one verified executable for explicit local rollback.
  Existing pre-publisher 1.0.0 Computers transition once through the standalone
  installer and reuse their attachments, Agent workspaces, and queued work.
- Server release publication now requires a compatible publicly verified
  Computer release, while immutable publishing, version monotonicity, and
  release-key continuity fail closed.

## v1.6.6 - 2026-07-28

- Hosted Haus restores the full desktop collaboration experience: signed-in
  Server selection, the familiar sidebar and activity home, compact chat,
  agent profiles, message inspection, artifact panes, and appearance choices.
- Attached Haus Computers again execute hosted Agent turns with their
  configured model, workspace, skills, and Server-owned remote MCP access.
- Chat composition restores `@` Agent and `$` skill autocomplete, rich chips,
  keyboard controls, and Command-K navigation. Referenced skills now become
  available to the selected Agent for that turn.
- Fixed hosted authentication and Agent direct-message/thread access.

## v1.6.5 - 2026-07-27

- Hosted Server startup now uses the provisioned production attachment root
  when running under its restricted service account.

## v1.6.4 - 2026-07-27

- Haus now uses the hosted Server as the canonical collaboration system:
  Haus App and the Server UI connect directly through exact-versioned HTTP and
  WebSocket contracts while attached Haus Computers own private Agent
  execution, workspaces, skills, model access, and MCP credentials.
- Hosted Servers now support Computer attachment and lifecycle, Agent creation
  and repair, durable delivery, isolated skills and MCP connections, signed
  Computer updates, and explicit Agent, Computer, and Server deletion.
- The desktop App no longer ships or starts the retired local Runtime sidecar
  or canonical local database. This release requires the documented fresh
  hosted cutover; old local state is not migrated or adopted.

## v1.6.3 - 2026-07-27

- Hosted Haus adds Clerk sign-in, Server creation and reopen, durable human
  chats, member invitations and removal, child threads, tasks, reminders, and
  scheduled wakes at the canonical Server UI origin.
- Published Haus versions now promote the Server UI and Server backend atomically by
  immutable source revision, with local PostgreSQL, supervised health,
  encrypted backup and restore tooling, and rollback-safe activation.

## v1.6.2 - 2026-07-24

- Runtime: existing installations now upgrade the retired chat-scoped agent
  turn table to the current global-session shape, restoring message delivery
  and agent tool execution without losing historical turn evidence. Requires
  this Runtime.

## v1.6.1 - 2026-07-24

- App: update progress now keeps showing the version being downloaded instead
  of briefly reverting to the currently installed version.

## v1.6.0 - 2026-07-24

- Runtime/API/App: MCP Connections replace first-party Plugins. Remote MCP
  servers use standard discovery and OAuth, API headers, or no authentication;
  Runtime keeps credentials and exposes only the exact upstream tools granted
  to each agent. MerchBase and Google Calendar presets simplify setup without
  changing the standard MCP contract. Requires this Runtime. **Breaking:**
  Plugin records, routes, and grants are retired.
- Runtime/API/App: agents use one floating global session and a chat-first work
  loop, with child threads, task ownership and reminders, inbox delivery, and
  guarded cross-chat coordination. Retired Wiki, cron, and legacy agent-tool
  surfaces are no longer carried forward. Requires this Runtime.
- App: every agent has a full profile and workspace, while every conversation
  has Chat, Tasks, and Files views. The navigation rail now centers Search,
  Chat, Activity, Tasks, Reminders, Members, Connections, and Browser.
- Runtime/App: Cove is the default agent, and new agents receive an
  archetype-aware starter workspace with durable memory and operating notes.
- Runtime/App: generated visual responses render as first-class chat content,
  and agent activity remains visible while navigating around the app.

## v1.5.5 - 2026-07-21

- Runtime: Homebrew installs now package and load Wiki recall correctly,
  including its external dependencies, and shut down cleanly on macOS.

## v1.5.4 - 2026-07-20

- App: Google sign-in now completes reliably in the desktop app when Clerk
  returns an empty custom-scheme callback, while using the rotating nonce when
  Clerk supplies one.
- App: signing out returns to Haus's welcome screen instead of navigating the
  packaged Electron window to an invalid browser page.
- App: local macOS installs preserve the signed bundle's resources and extended
  attributes.

## v1.5.3 - 2026-07-20

- App/Runtime: the product identity changed, with a clean install boundary: the desktop
  bundle is `build.haus.desktop`, links use only `haus://`, production state
  lives under `~/.haus`, and the Runtime ships only the `haus` and
  `haus-runtime` commands through `zknicker/haus/haus-runtime`. Requires
  this Runtime. **Breaking:** Haus app data, protocol links, CLI aliases,
  Homebrew formula, and production state paths are not migrated automatically.
- Runtime/API/App: Clerk-backed identity now covers sign-in, Runtime ownership,
  invite redemption, members, reader-scoped unread state, and authenticated
  remote Runtime connections with session keepalive. Requires this Runtime.
- App: chats are persistent DMs and channels in a new sidebar-rail layout, with
  channel descriptions, participant bios, presence, and a channel-menu topbar.
- App: adds the Home workspace view, a dedicated Automations sidebar, and a
  warm flat visual system with inked surfaces and press-slab controls.
- Runtime/API/App: agents can stream generative visuals and create editable
  document artifacts that open in the chat-scoped artifact pane. Requires this
  Runtime.
- Runtime/API/App: adds Wiki page history, per-turn workspace file-change
  evidence, expanded diffs, and selection-to-chat quoting. Requires this
  Runtime.

## v1.5.2 - 2026-07-17

- Runtime/API/App: Claude works with zero setup on desktop Macs — a detected
  host Claude Code login now powers the Claude Code provider automatically
  ("Using your Claude Code login"), with runtime-owned sign-in still the
  durable path for headless or deployed Runtimes. Detection verifies the
  credential is actually readable, so hosts where the keychain is unusable
  correctly show "Not connected" instead of failing turns. Requires this
  Runtime.
- Runtime/API/App: the Anthropic API key is its own provider, matching the
  Codex/OpenAI split — the Claude Code row is sign-in only, and pay-per-token
  API access lives on a separate Anthropic provider row.
- App: unauthenticated provider rows stay two lines; setup hints only appear
  when a row has no action button.
- Runtime: seeds a widgets gallery demo channel on development stacks.

## v1.5.1 - 2026-07-16

- Runtime/API/App: Claude sign-in lives in Model access — connect Claude
  from Settings with a code-paste browser flow (works for remote Runtimes)
  or add an Anthropic API key. Credentials are Runtime-owned: stored in the
  runtime vault, refreshed automatically, and injected into every
  Claude-powered turn, so agents no longer depend on host keychains or CLI
  logins that break across upgrades. A new "Claude sign-in" capability shows
  connection health, and Claude auth failures now point at Model access
  instead of failing opaquely. Requires this Runtime.

## v1.5.0 - 2026-07-16

- Runtime: every agent now holds one persistent session spanning all its
  chats — turns run one at a time per agent with cross-chat catch-up, a
  durable seen ledger, freshness-gated sends, and an auto-drain loop for
  messages that land mid-turn. Sessions rotate only on model switch, manual
  reset, or a long-idle safety valve; per-chat model overrides are removed in
  favor of agent-scoped model selection. Requires this Runtime. **Breaking:**
  existing per-chat agent sessions become inert history; each agent starts a
  fresh global session after the update (deployed hosts need a one-time
  operator step to drop the old session tables).
- Runtime: agents quietly evaluate peer replies and speak only when they have
  something to add — silent declines never appear in chat, while human
  messages and explicit @mentions still get an instant thinking indicator.
  Sends during a running turn steer it, `chat_wait_idle` and queued sends let
  agents coordinate, and settled turns leave compact outcome notes.
- Runtime/API/App: per-chat read receipts power unread tracking — sidebar
  rows show unread-count pills for every chat, viewing a chat marks it read,
  and channel rows drop the busy spinner (agent DM rows carry a green/amber
  presence dot instead).
- App: agent presence everywhere — DM topbar status, sidebar presence dots,
  a busy-elsewhere composer hint, a recent-activity feed in the agent drawer,
  and a profile hover card on every agent avatar.
- App: the prompt-bar status indicators are rebuilt as a polished motion
  system — rows rise in and out with springs, always complete their
  animation, crossfade label changes ("thinking" → "typing" →
  "wrapping up in <chat>"), and never flash on silently settled turns.
- App: transcript avatars anchor to the message header line at a larger size,
  with the character heads serving as the avatars and people avatars matched
  to the same footprint and rounding.

## v1.4.47 - 2026-07-14

- Runtime/API/App: adds durable chat-scoped artifact pane tabs, realtime pane
  updates, and the `pane_open` tool so agents can open workspace files and Wiki
  pages in the active chat. Requires this Runtime.
- App: keeps the artifact pane available at every window width, moves its tabs
  and visibility control into the chat toolbar, and simplifies pane navigation
  and search chrome.
- App: polishes live chat with one optimistic status per mentioned agent,
  stable send-time scrolling, live-edge-only entrance motion, attached session
  notices, and day dividers only above visible transcript rows.

## v1.4.46 - 2026-07-13

- Runtime: the Browser tool executes agent-browser's native binary directly so
  browser commands work in the packaged Runtime, and the Homebrew formula now
  installs the bundled agent-browser package.
- Runtime: adds subscription-billed image generation via the codex OAuth
  profile.

## v1.4.45 - 2026-07-13

- Runtime/API/App: adds the built-in Browser Plugin — Runtime supervises a
  visible managed Google Chrome with a durable named profile, guarded
  recovery, and `plugin.browser` health; granted agents drive it through one
  `browser` tool and a managed skill, and settings expose the detected Chrome,
  profile name, health, and Open/Restart actions. Requires this Runtime.
- Runtime/API/App: turns create their message at first visible content and the
  app streams into the turn's post; the chat timeline projects conversation
  units with turn-scoped evidence, contributions keep their start order, and
  live turn state supports concurrent agent runs per chat.
- Runtime/App: expands Tasks with dependencies and scheduling, blocked/review
  statuses, shared colored labels, bulk actions, a calendar view, task
  attachments promoted into a runtime artifacts root, dedicated task work
  chats, and the runtime auto-dispatch loop with claims, recovery, and
  settings controls.
- Runtime: adds agent-to-agent mentions and cross-chat posts via `chats_list`
  and `chat_send`, agent bios with per-session instruction freshness, session
  freshness rotation from the reset point, `NO_REPLY` for channels, and
  home-timezone prompt timestamps.
- Server: archived chats are listable, read-only, and restorable.
- App: queued drafts steer a mentioned agent's live run, the chat rests
  against its composer with a per-exchange runway, post edits never move a
  reader who scrolled up, and thinking indicators end exactly with the turn.
- Runtime: guards the composed agent system prompt with a contract suite and
  behavioral evals, self-heals CLI PATH under service environments, resolves
  OpenAI Pi models by canonical provider reference, and refreshes seeded
  skills during startup.

## v1.4.44 - 2026-07-07

- Runtime/App: refreshes the Wiki recall capability during Runtime startup and
  keeps expected capability rows visible while the Runtime is still warming up.
- App: reconciles Runtime event catch-up after reconnect without replaying stale
  live turn progress, while still clearing terminal turn state and invalidating
  chat, session, and worker views.
- Runtime release: preserves the packaged `@haus/sdk` after staging qmd so
  Homebrew can install the Runtime artifact successfully.

## v1.4.43 - 2026-07-07

- Runtime/API/App: adds Haus Tasks with Runtime-owned task storage, agent
  task tools, server sync, realtime invalidation, dispatch, and full app list,
  detail, and editor surfaces.
- Runtime/API/App: replaces composer command proxies with agent session routes
  plus the agent drawer for session facts, usage, reset, and archived demo
  sessions.
- Runtime/App: adds per-turn Wiki recall over the packaged qmd semantic
  index, recall capability health, prompt evidence capture, and dev-mode turn
  inspection.
- Runtime: improves turn prompt context with timestamps, chat identity, roster,
  model-family guidance, and per-agent run ids for multi-agent fan-out.
- App: adds the Cmd+K command menu, merges per-agent Skills and Plugins into an
  enabled-first settings page, refreshes Tasks and Automations layout polish,
  and adds the alien agent avatar.
- Server: fixes settings catch-all redirects, app-root command menu
  mounting, task realtime registration, skill-save validation, agent DM sync,
  chat composer focus, and code editor line-number alignment.

## v1.4.42 - 2026-07-06

- Runtime/API/App: routes Google OAuth callbacks through the Haus app server
  so desktop Plugin setup completes reliably against Runtime-owned Google
  settings.
- Runtime/App: returns saved Plugin secret presence to settings forms so stored
  MerchBase credentials remain visible and editable.
- Runtime/App: gates Plugin and Skill enablement on configuration, global
  feature state, and agent availability so settings only expose usable
  capabilities.
- App: clears stale chat turn state after a response completes so completed
  turns do not keep the transcript in a running state.

## v1.4.41 - 2026-07-06

- App: repairs legacy automation cache tables during desktop backend startup so
  existing installs can open after the v1.4.40 scheduler schema change.

## v1.4.40 - 2026-07-06

- Runtime/API/App: replaces rich responses with grant-scoped Haus Widget
  fences, Widget contracts, durable Widget activity, and app renderers for
  charts, calendars, tables, and MerchBase displays.
- Runtime/API/App: adds the runtime-native automation scheduler with cron job
  storage, execution, delivery targets, agent tools, and refreshed automation
  editor and run history views.
- Runtime/App: adds background Memory and skill-work observability, including
  worker status filters, job timelines, report drawers, and live run feedback.
- Runtime/App: makes disk and Plugin skills writable, visible in the shared
  library, updateable, restorable, and backed by usage telemetry and curator
  workers.
- App: polishes the Skills settings surface, automation editor sizing, agent
  picker behavior, and settings navigation.

## v1.4.39 - 2026-07-06

- Runtime/App: adds the Google Plugin with Haus-managed OAuth and Google
  Calendar event list, search, and create tools.
- Runtime: packages the Haus-owned Google OAuth desktop client into Runtime
  release artifacts so Homebrew-installed Runtime builds can connect Google.
- Runtime/App: streams live harness turn activity and simplifies live turn
  narration with calmer replace-in-place updates.
- Runtime/App: adds live Memory job events, Runtime home timezone handling, and
  Wiki root startup repair.
- App: polishes chat toolbar icons, sidebar activity hover behavior, profile
  photo controls, and transcript agent mention appearance.

## v1.4.38 - 2026-07-04

- Runtime/API: adds the Memory stack with shared Wiki tools, core memory
  prompt wiring, model-driven memory workers, worker health, and the
  Memory worker Runtime capabilities.
- Runtime/App: adds rich references for agents, skills, apps, plugins, and
  workspace paths, including skill activation hints and agent-scoped skill
  autocomplete.
- Runtime/App: adds Runtime-backed Haus channel creation and participant
  editing, including multi-agent channels and explicit agent addressing.
- Runtime/App: reworks streaming turn rendering, tolerates delivered messages
  missing turn metadata, and keeps channel messages human-only until an agent is
  explicitly addressed.
- App: refreshes Agent avatars, global Memory settings, chat/sidebar polish,
  toolbar history navigation, breadcrumbs, participant slots, and message chip
  styling.

## v1.4.37 - 2026-07-02

- Runtime: runs the Codex bridge bootstrap install from the bridge directory in
  non-interactive mode so Codex agent turns can recover cleanly after a failed
  or stale sandbox install.
- Runtime/App: separates assistant commentary from the final assistant reply and
  preserves message phase metadata for chat rendering.
- App: improves active-turn recovery, MerchBase Plugin chat capability
  projection, Agent avatar rendering, and channel hash icon geometry.

## v1.4.36 - 2026-07-02

- Runtime: recovers interrupted Agent turn rows on startup so a stale running
  turn cannot block future Codex replies after restart.

## v1.4.35 - 2026-07-02

- Runtime: pins the packaged Codex bridge to Codex 0.142.5 so installed
  Runtime turns do not hang on the older vendored Codex binary.
- Runtime: fails stalled Agent turns after a configurable watchdog timeout
  instead of leaving chat responses running forever.

## v1.4.34 - 2026-07-02

- Runtime: stages Codex and Claude Code harness bridge assets in packaged
  Runtime artifacts so agent execution can bootstrap reliably after install.
- App: keeps the chat rail visible on new-tab chat surfaces.

## v1.4.33 - 2026-07-02

- Runtime: added executable model provider management with curated provider
  lifecycle state.
- Runtime: ensured built-in Agent DMs exist and bounded harness chat context.
- Runtime: hardened the MerchBase Plugin boundary.
- App: added Agent character avatars across chat and settings, including
  theme-aware artwork and a character picker.
- App: moved active chat status above the composer, restored collapsed-sidebar
  click handling, defaulted layout to the topbar, and polished Runtime settings.
- Docs: documented model provider lifecycle and Agent character authoring.

## v1.4.32 - 2026-07-01

- Rebuilt Haus around chat-native Agent seats, Agent sessions, and Agent
  turns.
- Moved Claude Code and Codex execution to AI SDK HarnessAgent.
- Kept OpenAI/API-key and deterministic e2e execution on AI SDK LanguageModel
  routes.
- Made Runtime the source of truth for model catalog, Agent default model,
  session effective model, tool inventory, and sandbox mode.
- Switched model catalog behavior to curated provider lists with explicit
  availability state.
- Removed retired engine compatibility paths, interactive tool approval prompts,
  old settings pages, and stale docs.
