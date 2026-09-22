# Chats

Chats are Haus's shared conversation surfaces.

## Product Expectations

- Chats are the primary reading surface for real conversations.
- A chat feels like one stable shared conversation, not a raw transport-specific fragment.
- A chat is the long-lived conversation container in Haus.
- Multiple sessions may participate in one chat.
- A chat is not just one session, and it is not replaced when a session resets.
- New Haus-owned chats begin when a person sends the first message to the primary agent,
  rather than through a separate create-chat flow.
- The chats surface reads like a wall of live conversation columns rather than a thin list of
  transport records.

## Chat Loading And Handoffs

- Chat detail routes keep the conversation shell and composer mounted while transcript data
  loads or routes reconcile. Do not replace the transcript body with loading copy or generic
  skeleton cards.
- Transcript loading is indicated outside the transcript body, using the shared app spinner
  in the chat screen chrome.
- Chat messages carry no entrance motion. Every row — durable history on load, a human send,
  an Agent reply arriving at the live edge — paints at full weight in the frame it mounts.
- When a new Haus chat moves from the optimistic `/chats/new` draft route to the real
  `/chats/:chatId` route, rows already visible in the draft must not change appearance
  after reconciliation.
- Optimistic draft rows are app-local presentation state. They reconcile to the real chat
  route without becoming a separate durable transcript source.

## Config And Observation

- Haus-owned Chats are created, named, ordered, archived, and deleted by Haus Server through
  first-party Server APIs.
- Agent engines do not create, name, rename, archive, or delete Haus-owned chats.
- Archiving a chat hides it from normal Haus chat lists without deleting its chat row. Runtime
  session and message records may continue to reference that stable chat id.
- Archived regular channels stay listable through an explicit archived chat list, stay readable
  by id, and can be unarchived. While archived, the channel and its child threads accept no new
  writes. Undrained Agent work is canceled and is not replayed after restore.
- Owner/Admin deletion of a regular channel is irreversible aggregate deletion. It removes the
  channel, child threads, durable collaboration dependents, and attachment bytes. `#all`, DMs,
  and threads do not expose independent archive or delete actions.
- Runtime may observe agent sessions and messages that belong to a Haus chat.
  Those observations attach through the Runtime-owned agent participant for that chat.
- External platform conversations, such as Discord channels or DMs, are separate first-class
  frontend conversations for Haus agents. They do not automatically appear as Haus App chats.

## Identity And Labels

- A chat has a stable identity in Haus.
- An implicit human↔Agent sidebar selection is not a chat and has no Chat id.
  Listing or opening it never persists state. The first durable send resolves
  the human membership stint and Agent id, creates their canonical pair Chat
  under the database uniqueness constraint, and writes the message atomically.
- For Haus-owned chats, the stable identity is the Haus chat id and the label is Haus-owned
  presentation metadata.
- For external runtime-observed chats, labels are Haus presentation derived from synced primitive
  data.
- The Runtime adapter must not provide final Haus chat names.
- The Runtime adapter must not create Haus chats from agent sessions. Haus sessions are
  runtime facts that attach to an existing Haus chat; they are not a chat catalog.
- Direct chats prefer participant names as their primary title.
- Channel-style chats prefer the source-native room or thread name as their primary title.
- A synced chat keeps an explicit conversation kind so title and badge rendering do not rely
  on page-level heuristics.
- Runtime-observed direct chat records expose primitive data such as `type`, `scope`, typed
  chat participants, bound agents, and observed display labels. The server does not hard-code
  final marketing-style titles when the frontend can derive them from those primitives.
- Platform-specific facts belong in typed `platformMetadata` on the chat record. For example,
  a Discord chat can carry guild, channel, thread, DM user, account, observed label, and source
  record facts without making those fields part of every chat row.
- Runtime adapter records do not include chat `name` or chat `workspaceFolder`. Names are
  Haus presentation, and runtime file browsing is agent-file scoped unless a runtime exposes a
  separate chat-file capability.
- For external direct messages, the external participant is a first-class chat primitive. Haus
  renders the best observed label while retaining the participant as provenance.

## Relationships

- A chat makes it easy to understand which agent participated.
- A runtime-observed chat includes typed chat participants.
- A chat participant is a typed actor in that conversation: local user, agent,
  system, plugin, or observed external participant.
- The Runtime adapter owns platform-specific parsing before Haus receives the chat. Haus
  does not parse Discord-specific fields to understand chat membership.
- The primary agent participates in a chat as an agent participant with a current agent session.
- Runtime records may still include multiple bound agents when product behavior needs them, but
  normal Haus chat UI does not expose agent choice.
- A new session for the agent stays inside the same chat unless Haus explicitly starts a
  different chat.
- A chat makes it easy to understand which non-agent participants were present.
- A chat makes it easy to move from the shared conversation to the related sessions when
  needed.
- A chat may contain message, tool, worker, and system interactions in one shared history.
