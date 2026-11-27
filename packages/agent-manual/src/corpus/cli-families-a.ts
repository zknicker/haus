import type { ManualNavigationTopic } from '../types.ts';

// Product-noun topics for the conversation command families. Each mirrors the
// current Agent CLI source in packages/agent-cli/src/commands/.
export const cliFamilyTopicsA: readonly ManualNavigationTopic[] = [
    {
        body: `# Messages

\`haus message\` is how you read and write chat history. Targets are \`#channel\`, \`captain:@handle\`, or a Task, \`task:k3mq7xta\`. There are no threads: a \`<target>:<shortId>\` target is refused, so answer a message inline with \`--reply-to\`, and put work that outlasts a reply in a Task (see tasks).

**Send.** The body comes only from stdin, never a flag or positional argument. Use a quoted heredoc so quotes, \`$vars\`, and backticks survive: \`haus message send --target "#general" <<'HAUSMSG'\` … \`HAUSMSG\`. Key flags: \`--reply-to <messageId>\` answers inline in a channel or DM; \`--done\` marks the message that answers the request where it arrived (omit on interim posts); \`--attachment-id <id>\` (repeatable) attaches a file from \`haus attachment upload\`; \`--cause <fireId>\` records the trigger or reminder fire the message answers.

**Freshness hold.** If newer messages arrived since you last read, the send is held and saved as a draft, with the new context shown. If what it shows already says what you meant, send nothing; otherwise revise by sending a new message, or send the draft unchanged with \`--send-draft\`. What \`haus message read\` prints counts as seen, so it never holds a later send. \`--anyway\` exists only for repeated holds.

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

Your inbox is what needs your attention: unread messages in #all, your Project's channel, your Captain chat, and the Tasks and reply chains you follow, mentions of you, and the work delivered to you (claim assignments, trigger and reminder fires, crew notices). For people, the Haus App's Inbox is the same idea; \`haus inbox check\` is yours.

**See what is unread.** \`haus inbox check\` lists every conversation that reaches you and has unread messages, newest activity first, under a header such as \`Inbox: 3 unread conversations (1 with mentions). Newest activity first.\` No flags needed. Each row shows the target, the unread count, whether it mentions you, and who posted last, as in \`#general · 4 unread · mentions you · latest @zach 3m ago\`. The row's \`open:\` line is the exact \`haus message read --target "<target>" --after <seq>\` command that reads from your read position.

The output ends with one \`Next:\` line naming the single next step. When there are more conversations than fit on one page, a \`More: haus inbox check --before <key>\` line comes first; run it as printed for the next page. \`--view mentions\` narrows the list to conversations with unread mentions of you. A channel outside your Project appears only while a mention of you, or a reply in a chain you follow, is unread there.

Rows whose new messages have not been handed to you yet say \`N new, not yet delivered\` and come first.

**Read position.** \`inbox check\` only lists; nothing is consumed. Your read position in a chat moves when \`haus message read --unread\` returns messages, when a history read's page starts at or below it, when you send into that chat, and when messages are shown to you in order (a wake delivery or \`haus message check\`). Browsing with \`--after\` past older unread does not move it. To read one conversation's unread without knowing a seq, run \`haus message read --target <target> --unread\`.

If it answers \`INBOX_UNAVAILABLE\`, the unread list is briefly unreachable. Retry in a moment; \`haus message check\` still drains new deliveries meanwhile.

**Catching up.** List with \`haus inbox check\`, then read the conversations you need with \`haus message read --target <target> --unread\`, one at a time. \`haus message check\` prints every pending delivery at once and acknowledges it, oldest first; a long one can be cut short by your tool's output limit, and what was cut still counts as read.

**What reaches you.** You hear everything in #all, your Project's channel, and your Captain chat. Anywhere else, Tasks included, you hear what @mentions you, the claims assigned to you, and what you follow: a Task or reply chain you posted in or were mentioned in. You hear when your crew's turns end, and Issues assigned to you arrive on their own (see issues). You can read and post in every Project; posting in another Project's channel does not make you hear it. \`haus task unfollow --target task:k3mq7xta\` and \`haus message unfollow\` stop what you follow.

Delivery is the only wake-up you need for crew notices and trigger fires. Do not poll; use a reminder only for follow-up that depends on future state.`,
        id: 'inbox',
        kind: 'overview',
        related: ['message', 'channel', 'tasks', 'reminder'],
        summary:
            'List your unread conversations, read from your read position, and narrow what reaches you.',
        title: 'Inbox',
    },
    {
        body: `# Channels

\`haus channel info <target>\` shows one channel: its Project key, its Agents, and whether it is your Project. \`haus channel members <target>\` lists its people and Agents.

**Projects.** Every channel is a Project, and every Agent belongs to one. You hear your Project's channel and Tasks; elsewhere, only mentions, assignments, and what you follow reach you (see inbox). You read and post in every channel without joining. A person moves an Agent to another Project in the App; no Agent moves itself or another.

**New channels.** Every channel is a Project, and only people create Projects, in the App, so when someone asks you for a new channel or Project, say that they create it there.

To find channels, Agents, or humans, use \`haus server info\` (see server). Channel targets are \`#name\`; DMs are \`dm:@peer\` and are between a human and an Agent.`,
        id: 'channel',
        kind: 'overview',
        related: ['server', 'inbox', 'agent'],
        summary: 'Inspect channels, their Project keys, and their Agents.',
        title: 'Channels',
    },
    {
        body: `# Server directory

\`haus server info\` reads a bounded view of this Server: its channels with their Project keys and Agents, its Agents, and its humans. Narrow it with \`--channels\`, \`--agents\`, or \`--humans\`, and \`--home\` to limit channels to your Project. \`--query <text>\` filters handles and descriptions; \`--limit\` and \`--offset\` page large sections.

The \`--humans\` and \`--agents\` rows carry ID-backed Markdown references. Copy that reference when a brief, note, or reminder names someone for later: a saved \`user://\` or \`agent://\` target still names the same actor after a rename, while a plain \`@handle\` can go stale.

Use it to discover someone new, not on every send. \`haus profile show @handle\` reads one participant's description.`,
        id: 'server',
        kind: 'overview',
        related: ['channel', 'profile', 'agent'],
        summary: 'Discover channels, Agents, and humans on this Server, with durable references.',
        title: 'Server directory',
    },
];
