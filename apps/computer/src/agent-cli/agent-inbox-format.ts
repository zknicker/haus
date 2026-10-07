import type {
    AgentInboxConversations,
    AgentInboxPendingRow,
    AgentInboxView,
} from './agent-inbox-schemas.ts';

/**
 * `haus inbox check`: the Agent's Activity panel (Raft's `inbox check`).
 *
 * The Server list is the durable unread set, newest activity first and
 * keyset-paged; the pending queue snapshot only annotates it ("N new, not yet
 * delivered") and leads the first page with targets the list does not show
 * yet. Every conversation row carries its one `open:` command and the output
 * ends with exactly one `Next:` line.
 */
export interface InboxCheckInput {
    before?: number;
    list: AgentInboxConversations;
    nowMs: number;
    /** Why the pending queue snapshot could not be read. */
    pendingError?: string;
    /** The pending queue snapshot, when it could be read. */
    pendingRows?: readonly AgentInboxPendingRow[];
    view: AgentInboxView;
}

type Conversation = AgentInboxConversations['items'][number];

interface RenderedRow {
    lines: string[];
    next: string;
}

export function formatInboxCheck(input: InboxCheckInput): string {
    const { list, view } = input;
    const pendingRows = input.pendingRows ?? [];
    const pendingByChat = new Map(
        pendingRows.filter((row) => !row.cloudAgentResult).map((row) => [row.chatId, row])
    );
    const listed = new Set(list.items.map((item) => item.chatId));
    // Pending targets the durable list does not show yet lead the first page:
    // they are the newest activity there is.
    const extraPending =
        input.before === undefined
            ? pendingRows.filter(
                  (row) =>
                      (row.cloudAgentResult || !listed.has(row.chatId)) &&
                      (view === 'unread' || row.mentioned)
              )
            : [];
    const rows: RenderedRow[] = [
        ...renderPendingOnly(extraPending),
        ...list.items.map((item) =>
            renderConversation(item, pendingByChat.get(item.chatId), input.nowMs)
        ),
    ];

    let header = formatHeader(input, extraPending.length);
    if (rows.length > 0) {
        header +=
            input.before === undefined
                ? ' Newest activity first.'
                : ` Activity before seq ${input.before}, newest first.`;
    }
    const sections = [header];
    if (rows.length > 0) {
        sections.push(rows.flatMap((row) => row.lines).join('\n'));
    }
    sections.push(formatTrailer(input, rows[0]));
    if (input.pendingError) {
        sections.push(
            `Pending queue unavailable (${input.pendingError}); not-yet-delivered counts are not shown.`
        );
    }
    return sections.join('\n\n');
}

function formatHeader(input: InboxCheckInput, extraPending: number): string {
    const { totals } = input.list;
    if (input.view === 'mentions') {
        if (totals.mentions === 0 && extraPending === 0) {
            return totals.conversations === 0
                ? 'Inbox: nothing unread.'
                : `Inbox: no unread mentions (${plural(totals.conversations, 'unread conversation')} in total).`;
        }
        return `Inbox: ${plural(totals.mentions, 'conversation')} with unread mentions (of ${plural(totals.conversations, 'unread conversation')}).`;
    }
    if (totals.conversations === 0 && extraPending === 0) {
        return 'Inbox: nothing unread.';
    }
    return `Inbox: ${plural(totals.conversations, 'unread conversation')} (${plural(totals.dms, 'DM')}, ${totals.mentions} with mentions).`;
}

function formatTrailer(input: InboxCheckInput, first: RenderedRow | undefined): string {
    const { list, view } = input;
    const viewFlag = view === 'mentions' ? ' --view mentions' : '';
    const trailer: string[] = [];
    if (list.hasMore && list.nextBefore !== null) {
        trailer.push(`More: haus inbox check${viewFlag} --before ${list.nextBefore}`);
    }
    if (first) {
        trailer.push(`Next: ${first.next}`);
    } else if (input.before !== undefined && list.totals.conversations > 0) {
        trailer.push(
            `Next: no older ${view === 'mentions' ? 'mentions' : 'unread conversations'}; run haus inbox check${viewFlag} for the newest.`
        );
    } else if (view === 'mentions' && list.totals.conversations > 0) {
        trailer.push('Next: run haus inbox check to list all unread conversations.');
    } else {
        trailer.push('Next: nothing to do; new messages will reach you as they arrive.');
    }
    return trailer.join('\n');
}

function renderConversation(
    item: Conversation,
    pending: AgentInboxPendingRow | undefined,
    nowMs: number
): RenderedRow {
    const parts = [item.target, `${item.unread} unread`];
    if (item.mentions > 0) {
        parts.push(item.mentions === 1 ? 'mentions you' : `mentions you ${item.mentions}x`);
    }
    if (pending && pending.pendingCount > 0) {
        parts.push(`${pending.pendingCount} new, not yet delivered`);
    }
    const latest = [
        item.latestSenderHandle ? `@${item.latestSenderHandle}` : null,
        formatAgo(item.latestAt, nowMs),
    ]
        .filter(Boolean)
        .join(' ');
    if (latest) {
        parts.push(`latest ${latest}`);
    }
    return openableRow(parts, openCommand(item.target, item.lastReadSequence));
}

/**
 * Pending-only rows, in queue order. Cloud Agent results are bodiless work
 * items, not a conversation to open, so they fold into one row fetched with
 * `haus message check` (Raft's grouped third-party app events row).
 */
function renderPendingOnly(rows: readonly AgentInboxPendingRow[]): RenderedRow[] {
    const cloudCount = rows
        .filter((row) => row.cloudAgentResult)
        .reduce((sum, row) => sum + row.pendingCount, 0);
    const rendered: RenderedRow[] = [];
    let cloudShown = false;
    for (const row of rows) {
        if (!row.cloudAgentResult) {
            const parts = [row.target, `${row.pendingCount} new, not yet delivered`];
            if (row.mentioned) {
                parts.push('mentions you');
            }
            parts.push(`latest @${row.latestSender}`);
            const afterSeq =
                typeof row.firstSequence === 'number' ? row.firstSequence - 1 : undefined;
            rendered.push(openableRow(parts, openCommand(row.target, afterSeq)));
        } else if (!cloudShown) {
            cloudShown = true;
            rendered.push({
                lines: [
                    `Cloud Agent results · ${cloudCount} pending · fetch with haus message check`,
                ],
                next: 'fetch the Cloud Agent results above: haus message check',
            });
        }
    }
    return rendered;
}

function openableRow(parts: string[], open: string): RenderedRow {
    return {
        lines: [parts.join(' · '), `  open: ${open}`],
        next: `open the first conversation above: ${open}`,
    };
}

function openCommand(target: string, afterSeq?: number): string {
    const after = afterSeq !== undefined && afterSeq > 0 ? ` --after ${afterSeq}` : '';
    return `haus message read --target "${target}"${after}`;
}

function formatAgo(iso: string | null, nowMs: number): string | null {
    if (!iso) {
        return null;
    }
    const at = Date.parse(iso);
    if (!Number.isFinite(at)) {
        return null;
    }
    const seconds = Math.max(0, Math.round((nowMs - at) / 1000));
    if (seconds < 60) {
        return 'just now';
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
        return `${minutes}m ago`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 48) {
        return `${hours}h ago`;
    }
    return `${Math.floor(hours / 24)}d ago`;
}

function plural(count: number, one: string): string {
    return `${count} ${count === 1 ? one : `${one}s`}`;
}
