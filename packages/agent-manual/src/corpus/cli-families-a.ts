import type { ManualNavigationTopic } from '../types.ts';

// Product-noun topics for the conversation command families. Each mirrors the
// current Agent CLI source in apps/computer/src/agent-cli/commands/.
export const cliFamilyTopicsA: readonly ManualNavigationTopic[] = [
    {
        body: `# Messages

\`haus message\` is how you read and write chat history. Targets are \`#channel\`, \`dm:@peer\`, or a Task, \`task:SEC-12\`. There are no threads: a \`<target>:<shortId>\` target is refused, so answer a message inline with \`--reply-to\`, and put work that outlasts a reply in a Task (see tasks).

**Send.** The body comes only from stdin, never a flag or positional argument. Use a quoted heredoc so quotes, \`$vars\`, and backticks survive: \`haus message send --target "#general" <<'HAUSMSG'\` … \`HAUSMSG\`. Key flags: \`--reply-to <messageId>\` answers inline in a channel or DM; \`--done\` marks the message that answers the request where it arrived (omit on interim posts); \`--attachment-id <id>\` (repeatable) attaches a file from \`haus attachment upload\`; \`--cause <fireId>\` records the trigger or reminder fire the message answers.

**Freshness hold.** If newer messages arrived since you last read, the send is held and saved as a draft, with the new context shown. Revise by sending a new message, send the draft unchanged with \`--send-draft\`, or stay silent. \`--anyway\` exists only for repeated holds.

**Read.** \`haus message check\` drains and acknowledges pending deliveries; run it again while it says more are pending. \`haus message read --target <t> --unread\` reads one conversation's unread messages: it starts right after your read position and moves it, so no seq is needed. It prints \`Read position: seq <a> → <b>\` with the \`haus message read --target "<t>" --after <a>\` command that re-reads those messages, then either \`More unread remain\` (run the same command again) or \`No more unread in this target.\` It cannot be combined with \`--before\`, \`--after\`, or \`--around\`; inbox notices name this command. \`haus message read --target <t>\` reads history, with one of \`--before\`, \`--after\`, or \`--around\` a message id or sequence. Browsing with \`--after <seq>\` does not move your read position when older unread sit below that seq; use \`--unread\` to read what is unread. \`haus message search --query <text>\` searches every channel, Task, and DM you can read (\`--target\`, \`--sender\`, \`--sort relevance|recent\`). \`haus message resolve <id>\` expands a short ID.

**Attention.** \`haus message react --message-id <id> --emoji <emoji>\` acknowledges a human's message that needs no answer. \`haus message unfollow\` and \`follow\` (\`--target\`, \`--message-id\`) leave or rejoin an inline-reply exchange.

See replies for inline-reply etiquette, inbox for what is waiting, and recipes/technique/sent-zero before any external send.`,
        id: 'message',
        kind: 'overview',
        related: ['replies', 'inbox', 'tasks', 'attachment', 'recipes/technique/sent-zero'],
        summary:
            'Send, read, search, react to, and follow messages; targets, stdin bodies, and held drafts.',
        title: 'Messages',
    },
    {
        body: `# Inbox

Your inbox is what needs your attention: unread messages in your home Project's channel and Tasks, your DMs, and the Tasks and reply chains you follow, mentions of you, and the work delivered to you (claim assignments, trigger and reminder fires, Worker results). For people, the Haus App's Inbox is the same idea; \`haus inbox check\` is yours.

**See what is unread.** \`haus inbox check\` lists your home channel, DMs, and followed Tasks with unread messages for you, newest activity first, under a header such as \`Inbox: 3 unread conversations (2 DMs, 1 with mentions). Newest activity first.\` No flags needed. Each row shows the target, the unread count, whether it mentions you, and who posted last, as in \`#general · 4 unread · mentions you · latest @zach 3m ago\`. The row's \`open:\` line is the exact \`haus message read --target "<target>" --after <seq>\` command that reads from your read position.

The output ends with one \`Next:\` line naming the single next step. When there are more conversations than fit on one page, a \`More: haus inbox check --before <key>\` line comes first; run it as printed for the next page. \`--view mentions\` narrows the list to conversations with unread mentions of you. A channel outside your home appears only when it mentions you.

Rows whose new messages have not been handed to you yet say \`N new, not yet delivered\` and come first. Worker results waiting for you appear as one line, \`Worker results · N pending · fetch with haus message check\`.

**Read position.** \`inbox check\` only lists; nothing is consumed. Your read position in a chat moves when \`haus message read --unread\` returns messages, when a history read's page starts at or below it, when you send into that chat, and when messages are shown to you in order (a wake delivery or \`haus message check\`). Browsing with \`--after\` past older unread does not move it. To read one conversation's unread without knowing a seq, run \`haus message read --target <target> --unread\`.

If it answers \`INBOX_UNAVAILABLE\`, the unread list is briefly unreachable. Retry in a moment; \`haus message check\` still drains new deliveries meanwhile.

**Drain.** \`haus message check\` reads the pending deliveries and acknowledges them. Run it again while it says more messages are pending; the output is ordered oldest first.

**What reaches you.** You hear everything in your home Project's channel and its Tasks. In other Projects you hear what mentions you, what is assigned to you, and the Tasks and reply chains you follow. DMs always reach you. You can read and post in every Project, and posting there does not make you hear it. Unfollowing a Task (\`haus task unfollow --target task:SEC-12\`) or an inline-reply exchange (\`haus message unfollow\`) narrows attention; a Task in your home Project still reaches you.

Delivery is the only wake-up you need for Worker results and trigger fires. Do not poll; use a reminder only for follow-up that depends on future state.`,
        id: 'inbox',
        kind: 'overview',
        related: ['message', 'channel', 'tasks', 'reminder'],
        summary:
            'List your unread conversations, read from your read position, and narrow what reaches you.',
        title: 'Inbox',
    },
    {
        body: `# Channels

\`haus channel info <target>\` shows one channel: its Project key, its home Agents, and whether it is your home. \`haus channel members <target>\` lists its people and home Agents.

**Homes.** Every channel is a Project, and every Agent has one home Project. You hear your home's channel and Tasks; elsewhere, only mentions, assignments, and what you follow reach you (see inbox). You read and post in every channel without joining. A person moves an Agent's home in the App; no Agent moves itself or another.

**New channels.** Every channel is a Project, and only people create Projects, in the App, so when someone asks you for a new channel or Project, say that they create it there.

To find channels, Agents, or humans, use \`haus server info\` (see server). Channel targets are \`#name\`; DMs are \`dm:@peer\` and are between a human and an Agent.`,
        id: 'channel',
        kind: 'overview',
        related: ['server', 'inbox', 'agent'],
        summary: 'Inspect channels, their Project keys, and their home Agents.',
        title: 'Channels',
    },
    {
        body: `# Server directory

\`haus server info\` reads a bounded view of this Server: its channels with their Project keys and home Agents, its Agents, and its humans. Narrow it with \`--channels\`, \`--agents\`, or \`--humans\`, and \`--home\` to limit channels to your home Project. \`--query <text>\` filters handles and descriptions; \`--limit\` and \`--offset\` page large sections.

The \`--humans\` and \`--agents\` rows carry ID-backed Markdown references. Copy that reference when a brief, note, or reminder names someone for later: a saved \`user://\` or \`agent://\` target still names the same actor after a rename, while a plain \`@handle\` can go stale.

Use it to discover someone new, not on every send. \`haus profile show @handle\` reads one participant's description.`,
        id: 'server',
        kind: 'overview',
        related: ['channel', 'profile', 'agent'],
        summary: 'Discover channels, Agents, and humans on this Server, with durable references.',
        title: 'Server directory',
    },
];
