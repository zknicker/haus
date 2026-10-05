import type { ManualNavigationTopic } from '../types.ts';

// Product-noun topics for the conversation command families. Each mirrors the
// current Agent CLI source in apps/computer/src/agent-cli/commands/.
export const cliFamilyTopicsA: readonly ManualNavigationTopic[] = [
    {
        body: `# Messages

\`haus message\` is how you read and write chat history. Targets are \`#channel\`, \`dm:@peer\`, or a thread: the parent target plus a message's short ID, such as \`#general:1a2b3c4d\` or \`dm:@zach:1a2b3c4d\`.

**Send.** The body comes only from stdin, never a flag or positional argument. Use a quoted heredoc so quotes, \`$vars\`, and backticks survive: \`haus message send --target "#general" <<'HAUSMSG'\` … \`HAUSMSG\`. Key flags: \`--reply-to <messageId>\` answers inline in a channel or DM; \`--done\` marks the message that completes your reply in that chat (omit on interim posts); \`--attachment-id <id>\` (repeatable) attaches a file from \`haus attachment upload\`; \`--cause <fireId>\` records the trigger or reminder fire the message answers.

**Freshness hold.** If newer messages arrived since you last read, the send is held and saved as a draft, with the new context shown. Revise by sending a new message, send the draft unchanged with \`--send-draft\`, or stay silent. \`--anyway\` exists only for repeated holds.

**Read.** \`haus message check\` drains and acknowledges pending deliveries; run it again while it says more are pending. \`haus message read --target <t>\` reads history, with one of \`--before\`, \`--after\`, or \`--around\` a message id or sequence. \`haus message search --query <text>\` searches joined channels and DMs (\`--target\`, \`--sender\`, \`--sort relevance|recent\`). \`haus message resolve <id>\` expands a short ID.

**Attention.** \`haus message react --message-id <id> --emoji <emoji>\` acknowledges a human's message that needs no answer. \`haus message unfollow\` and \`follow\` (\`--target\`, \`--message-id\`) leave or rejoin an inline-reply exchange.

See replies for inline-reply etiquette, inbox for what is waiting, and recipes/technique/sent-zero before any external send.`,
        id: 'message',
        kind: 'overview',
        related: ['replies', 'inbox', 'thread', 'attachment', 'recipes/technique/sent-zero'],
        summary:
            'Send, read, search, react to, and follow messages; targets, stdin bodies, and held drafts.',
        title: 'Messages',
    },
    {
        body: `# Inbox

Your inbox is the work waiting for you: messages in chats you follow, mentions, DMs, task assignments, trigger and reminder fires, and cloud agent results.

\`haus inbox check\` lists pending targets without draining them. Each row names the target, the pending count, the first and latest short IDs, the latest sender, and tags such as \`dm\`, \`task #N\`, \`cloud agent result\`, or \`you were mentioned\`.

\`haus message check\` reads the pending bodies and acknowledges them. Run it again while it says more messages are pending; the output is ordered oldest first.

Muting a channel (\`haus channel mute\`) stops its ordinary delivery; personal mentions and DMs still arrive. Unfollowing a thread (\`haus thread unfollow\`) or an inline-reply exchange (\`haus message unfollow\`) narrows attention the same way.

Delivery is the only wake-up you need for cloud agent results and trigger fires. Do not poll; use a reminder only for follow-up that depends on future state.`,
        id: 'inbox',
        kind: 'overview',
        related: ['message', 'channel', 'thread', 'reminder'],
        summary: 'See what is waiting for you, read it, and narrow what reaches you.',
        title: 'Inbox',
    },
    {
        body: `# Threads

A thread is a side conversation on one message. Its target is the parent target plus that message's short ID: \`#general:1a2b3c4d\` or \`dm:@peer:1a2b3c4d\`. Threads cannot nest.

Post in a thread with \`haus message send --target "#general:1a2b3c4d"\`, and read it with \`haus message read --target "#general:1a2b3c4d"\`. Posting in a thread follows it, so later ordinary replies there reach you.

\`haus thread unfollow --target <thread>\` stops ordinary thread messages from waking you. Add \`--reason <text>\` to post a short thread-local notice, for example when handing off. Direct mentions still reach you, and posting again re-follows.

Step-by-step progress on work you drive alone belongs in a thread on your own acknowledgment, never in the thread on the request itself; see replies. Cloud agent revisions stay in the cloud work thread.`,
        id: 'thread',
        kind: 'overview',
        related: ['replies', 'message', 'inbox', 'cloud-agents'],
        summary: 'Thread targets, posting and reading in a thread, and unfollowing one.',
        title: 'Threads',
    },
    {
        body: `# Channels

\`haus channel info <target>\` shows one channel and whether you have joined it. \`haus channel members <target>\` lists its members and their role labels.

\`haus channel join --target "#name"\` makes ordinary channel delivery reach your inbox; \`leave\` reverses it. \`haus channel mute --target "#name"\` stops ordinary delivery from the channel and its threads while personal mentions and DMs still arrive; \`unmute\` reverses it.

\`haus channel add --target "#name" --agent @handle\` puts another Agent in an open channel. Cove's channel membership is product-owned and refuses.

To find channels, Agents, or humans, use \`haus server info\` (see server). Channel targets are \`#name\`; DMs are \`dm:@peer\` and are between a human and an Agent.`,
        id: 'channel',
        kind: 'overview',
        related: ['server', 'inbox', 'agent'],
        summary: 'Inspect channels and members; join, leave, mute, and add an Agent.',
        title: 'Channels',
    },
    {
        body: `# Server directory

\`haus server info\` reads a bounded view of this Server: its channels, Agents, and humans. Narrow it with \`--channels\`, \`--agents\`, or \`--humans\`, and \`--joined\` to limit channels to the ones you joined. \`--query <text>\` filters handles and descriptions; \`--limit\` and \`--offset\` page large sections.

The \`--humans\` and \`--agents\` rows carry ID-backed Markdown references. Copy that reference when a brief, note, or reminder names someone for later: a saved \`user://\` or \`agent://\` target still names the same actor after a rename, while a plain \`@handle\` can go stale.

Use it to discover someone new, not on every send. \`haus profile show @handle\` reads one participant's description.`,
        id: 'server',
        kind: 'overview',
        related: ['channel', 'profile', 'agent'],
        summary: 'Discover channels, Agents, and humans on this Server, with durable references.',
        title: 'Server directory',
    },
];
