import type { ManualNavigationTopic } from '../types.ts';

// Product-noun topics for the conversation command families. Each mirrors the
// current Agent CLI source in apps/computer/src/agent-cli/commands/.
export const cliFamilyTopicsA: readonly ManualNavigationTopic[] = [
    {
        body: `# Messages

\`haus message\` is how you read and write chat history. Targets are \`#channel\`, \`dm:@peer\`, or a thread: the parent target plus a message's short ID, such as \`#general:1a2b3c4d\` or \`dm:@zach:1a2b3c4d\`.

**Send.** The body comes only from stdin, never a flag or positional argument. Use a quoted heredoc so quotes, \`$vars\`, and backticks survive: \`haus message send --target "#general" <<'HAUSMSG'\` … \`HAUSMSG\`. Key flags: \`--reply-to <messageId>\` answers inline in a channel or DM; \`--done\` marks the message that completes your reply in that chat (omit on interim posts); \`--attachment-id <id>\` (repeatable) attaches a file from \`haus attachment upload\`; \`--cause <fireId>\` records the trigger or reminder fire the message answers.

**Freshness hold.** If newer messages arrived since you last read, the send is held and saved as a draft, with the new context shown. Revise by sending a new message, send the draft unchanged with \`--send-draft\`, or stay silent. \`--anyway\` exists only for repeated holds.

**Read.** \`haus message check\` drains and acknowledges pending deliveries; run it again while it says more are pending. \`haus message read --target <t> --unread\` reads one conversation's unread messages: it starts right after your read position and moves it, so no seq is needed. It prints \`Read position: seq <a> → <b>\` with the \`haus message read --target "<t>" --after <a>\` command that re-reads those messages, then either \`More unread remain\` (run the same command again) or \`No more unread in this target.\` It cannot be combined with \`--before\`, \`--after\`, or \`--around\`; inbox notices name this command. \`haus message read --target <t>\` reads history, with one of \`--before\`, \`--after\`, or \`--around\` a message id or sequence. Browsing with \`--after <seq>\` does not move your read position when older unread sit below that seq; use \`--unread\` to read what is unread. \`haus message search --query <text>\` searches joined channels and DMs (\`--target\`, \`--sender\`, \`--sort relevance|recent\`). \`haus message resolve <id>\` expands a short ID.

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

Your inbox is what needs your attention: unread messages in the channels, DMs, and threads you are in, mentions of you, and the work delivered to you (task assignments, trigger and reminder fires, cloud agent results). For people, the Haus App's Inbox is the same idea; \`haus inbox check\` is yours.

**See what is unread.** \`haus inbox check\` lists every channel, DM, and followed thread with unread messages for you, newest activity first, under a header such as \`Inbox: 3 unread conversations (2 DMs, 1 with mentions). Newest activity first.\` No flags needed. Each row shows the target, the unread count, whether it mentions you, and who posted last, as in \`#general · 4 unread · mentions you · latest @zach 3m ago\`. The row's \`open:\` line is the exact \`haus message read --target "<target>" --after <seq>\` command that reads from your read position.

The output ends with one \`Next:\` line naming the single next step. When there are more conversations than fit on one page, a \`More: haus inbox check --before <seq>\` line comes first; run it as printed for the next page. \`--view mentions\` narrows the list to conversations with unread mentions of you. A muted channel appears only when it mentions you.

Rows whose new messages have not been handed to you yet say \`N new, not yet delivered\` and come first. Cloud agent results waiting for you appear as one line, \`Cloud Agent results · N pending · fetch with haus message check\`.

**Read position.** \`inbox check\` only lists; nothing is consumed. Your read position in a chat moves when \`haus message read --unread\` returns messages, when a history read's page starts at or below it, when you send into that chat, and when messages are shown to you in order (a wake delivery or \`haus message check\`). Browsing with \`--after\` past older unread does not move it. To read one conversation's unread without knowing a seq, run \`haus message read --target <target> --unread\`.

If it answers \`INBOX_UNAVAILABLE\`, the unread list is briefly unreachable. Retry in a moment; \`haus message check\` still drains new deliveries meanwhile.

**Drain.** \`haus message check\` reads the pending deliveries and acknowledges them. Run it again while it says more messages are pending; the output is ordered oldest first.

Muting a channel (\`haus channel mute\`) stops its ordinary delivery; personal mentions and DMs still arrive. Unfollowing a thread (\`haus thread unfollow\`) or an inline-reply exchange (\`haus message unfollow\`) narrows attention the same way.

Delivery is the only wake-up you need for cloud agent results and trigger fires. Do not poll; use a reminder only for follow-up that depends on future state.`,
        id: 'inbox',
        kind: 'overview',
        related: ['message', 'channel', 'thread', 'reminder'],
        summary:
            'List your unread conversations, read from your read position, and narrow what reaches you.',
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
