import { getTranscriptItemKey } from './chat-transcript-item-utils.ts';
import type {
    TranscriptActiveReply,
    TranscriptActor,
    TranscriptRow,
} from './transcript-contract.ts';

export type { TranscriptActor, TranscriptRow } from './transcript-contract.ts';

export interface ConversationMessageLayout {
    showAgentIdentity: boolean;
    showHumanIdentity: boolean;
}

// activeReply/activeStatus items feed the status stack's turn drawer
// (chat-active-turn.ts), which builds its own entries from the agent's live
// activeReplies. The main transcript no longer feeds activeReplies in here
// (specs/chat-timeline.md; no turn.* event ever populates one), so these
// kinds never appear in the pane itself.
export type TranscriptItem =
    | { kind: 'activeReply'; reply: TranscriptActiveReply }
    | { kind: 'activeStatus'; reply: TranscriptActiveReply; status: 'thinking' }
    | { kind: 'row'; row: TranscriptRow };

export interface TranscriptSystemEntry {
    id: string;
    item: TranscriptItem;
    kind: 'system';
    timestamp: string | null;
}

export interface TranscriptTurnEntry {
    actor: TranscriptActor;
    id: string;
    items: TranscriptItem[];
    key: string;
    kind: 'turn';
    participant: 'agent' | 'user';
    // Server-truth turn identity from the owning response, when rows carry
    // it. Live tail items and legacy rows fall back to grouping heuristics.
    responseId: string | null;
    timestamp: string | null;
}

export type TranscriptEntry = TranscriptSystemEntry | TranscriptTurnEntry;

const turnMaxGapMs = 5 * 60 * 1000;

// A turn maps to one comment (specs/chat-timeline.md): each agent message,
// live reply, or failure is its own entry keyed by run identity, and the
// turn's attachments (widgets, clarifications, stop notes) join that entry by
// run or response id — a direct lookup, never order-sensitive grouping.
// Consecutive plain user messages still read as one block, which is
// presentation adjacency, not turn reconstruction; a message carrying a task
// or a Thread keeps its own row so its block stays attached to its prose.
export function buildTranscriptEntries(input: {
    activeReplies?: readonly TranscriptActiveReply[];
    rows: TranscriptRow[];
}) {
    const items = buildTranscriptItems(input);
    const entries: TranscriptEntry[] = [];
    const anchorsByRun = new Map<string, TranscriptTurnEntry>();
    const anchorsByResponse = new Map<string, TranscriptTurnEntry>();
    const attachments: TranscriptTurnEntry[] = [];
    const usedIds = new Set<string>();

    const pushTurnEntry = (
        item: TranscriptItem,
        participant: 'agent' | 'user',
        options: { attachment?: boolean } = {}
    ) => {
        const responseId = getItemResponseId(item);
        const runId = participant === 'agent' ? getItemRunId(item) : null;
        // Run identity first: live tail items only carry the run id, so a
        // response-keyed id would remount the turn at the live → durable
        // swap. The response id covers turns with no extractable run id.
        // Attachments never claim the turn id — it belongs to the anchor
        // they usually merge into.
        const candidate =
            participant === 'agent' && !options.attachment
                ? runId
                    ? `turn:${runId}`
                    : responseId
                      ? `turn:${responseId}`
                      : getTranscriptItemKey(item)
                : getTranscriptItemKey(item);
        const id = usedIds.has(candidate) ? getTranscriptItemKey(item) : candidate;
        usedIds.add(id);
        const entry: TranscriptTurnEntry = {
            actor: getItemActor(item),
            id,
            items: [item],
            key: getTurnKey(item, participant),
            kind: 'turn',
            participant,
            responseId,
            timestamp: getItemTimestamp(item),
        };
        entries.push(entry);
        return entry;
    };

    for (const item of items) {
        const participant = getItemParticipant(item);

        if (participant === 'system') {
            entries.push({
                id: getTranscriptItemKey(item),
                item,
                kind: 'system',
                timestamp: getItemTimestamp(item),
            });
            continue;
        }

        if (participant === 'user') {
            const previous = entries.at(-1);

            if (previous?.kind === 'turn' && canAppendUserMessage(previous, item)) {
                previous.items.push(item);
                continue;
            }

            pushTurnEntry(item, 'user');
            continue;
        }

        if (isTurnAttachmentItem(item)) {
            attachments.push(pushTurnEntry(item, 'agent', { attachment: true }));
            continue;
        }

        const entry = pushTurnEntry(item, 'agent');

        const runId = getItemRunId(item);

        if (runId && !anchorsByRun.has(runId)) {
            anchorsByRun.set(runId, entry);
        }

        if (entry.responseId && !anchorsByResponse.has(entry.responseId)) {
            anchorsByResponse.set(entry.responseId, entry);
        }
    }

    // Attachments join their turn's comment; without an anchor (a live widget
    // before any reply text, a stop note with no output) they stand alone at
    // their own position.
    for (const entry of attachments) {
        const item = entry.items[0];

        if (!item) {
            continue;
        }

        const runId = getItemRunId(item);
        const anchor =
            (runId ? anchorsByRun.get(runId) : undefined) ??
            (entry.responseId ? anchorsByResponse.get(entry.responseId) : undefined);

        if (!anchor || anchor === entry) {
            // No contribution to join (a stopped turn's leftovers): the first
            // attachment fronts the cluster so the rest of the run still
            // reads as one unit — a widget with its stop note, for example.
            if (runId && !anchorsByRun.has(runId)) {
                anchorsByRun.set(runId, entry);
            }
            if (entry.responseId && !anchorsByResponse.has(entry.responseId)) {
                anchorsByResponse.set(entry.responseId, entry);
            }
            continue;
        }

        anchor.items.push(item);
        anchor.responseId ??= entry.responseId;
        entries.splice(entries.indexOf(entry), 1);
    }

    return entries;
}

// Widgets, clarifications, stop notes, and artifacts are parts of a turn's
// contribution rather than contributions of their own. Execution evidence
// (tools, workers, thinking, narration) never rides the timeline, but when a
// caller feeds a run's evidence in — the status stack building the live
// drawer's entry — it folds into the same turn.
function isTurnAttachmentItem(item: TranscriptItem) {
    if (item.kind !== 'row') {
        return false;
    }

    if (isActivityBackedMessageRow(item.row) && item.row.kind === 'message') {
        return item.row.message.senderType === 'agent';
    }

    return (
        item.row.kind === 'widget' ||
        item.row.kind === 'tool' ||
        item.row.kind === 'worker' ||
        (item.row.kind === 'system' &&
            (item.row.systemKind === 'turnStatus' ||
                item.row.systemKind === 'artifact' ||
                item.row.systemKind === 'thinking'))
    );
}

function canAppendUserMessage(entry: TranscriptTurnEntry, item: TranscriptItem) {
    if (entry.participant !== 'user' || entry.key !== getTurnKey(item, 'user')) {
        return false;
    }

    // A task, Thread, or inline reply owns its own conversation context.
    // Merging it with a neighbour would stack that block against the wrong
    // message, so anything with attached work stands as its own row.
    const previous = entry.items.at(-1);

    if (hasAttachedWork(item) || (previous && hasAttachedWork(previous))) {
        return false;
    }

    const currentTimestamp = parseTimestamp(getItemTimestamp(item));
    const previousTimestamp = parseTimestamp(previous ? getItemTimestamp(previous) : null);

    return Math.abs(currentTimestamp - previousTimestamp) <= turnMaxGapMs;
}

function hasAttachedWork(item: TranscriptItem) {
    if (
        item.kind === 'activeReply' ||
        item.kind === 'activeStatus' ||
        item.row.kind !== 'message'
    ) {
        return false;
    }

    return Boolean(item.row.message.task || item.row.thread || item.row.message.reply);
}

export function getItemRunId(item: TranscriptItem) {
    if (item.kind === 'activeReply' || item.kind === 'activeStatus') {
        return item.reply.runId;
    }

    if (item.row.kind === 'message') {
        const fromMetadata = runtimeMetadataRunId(item.row.message.metadata);

        if (fromMetadata) {
            return fromMetadata;
        }
    }

    if (item.row.kind === 'system' && item.row.systemKind === 'turnStatus') {
        return item.row.turnStatus.runId;
    }

    // Server-projected work rows carry run identity as a field; prefer it
    // over deriving from row ids.
    if ('runId' in item.row && typeof item.row.runId === 'string' && item.row.runId.length > 0) {
        return item.row.runId;
    }

    if (item.row.kind === 'worker') {
        return item.row.worker.runId;
    }

    if (item.row.kind === 'system' && item.row.systemKind === 'thinking') {
        const messageId = item.row.thinking.messageId.trim();

        if (isLikelyRunId(messageId)) {
            return messageId;
        }
    }

    return null;
}

function runtimeMetadataRunId(metadata: Record<string, unknown> | null | undefined) {
    const runtime = metadata?.runtime;

    if (!(runtime && typeof runtime === 'object' && !Array.isArray(runtime))) {
        return null;
    }

    const runId = (runtime as Record<string, unknown>).runId;

    return typeof runId === 'string' && runId.trim().length > 0 ? runId : null;
}

function isLikelyRunId(value: string) {
    return value.startsWith('run_') || value.startsWith('run-');
}

function buildTranscriptItems(input: {
    activeReplies?: readonly TranscriptActiveReply[];
    rows: TranscriptRow[];
}) {
    // Once a turn's durable reply is in the rows, its live reply items are
    // redundant: rendering both creates sibling segments with one `reply:`
    // key, which restructures the turn (and replays animations) during the
    // completion handoff.
    const activeReplies = (input.activeReplies ?? []).filter(
        (reply) =>
            !(
                hasDurableReplyRow(input.rows, reply.runId) ||
                hasStoppedTurnRow(input.rows, reply.runId)
            )
    );
    const items: TranscriptItem[] = input.rows.flatMap((row) => {
        if (isDuplicateReplyThinkingRow(row, input.rows, activeReplies)) {
            return [];
        }

        return [{ kind: 'row', row }];
    });

    // One live item per run. The turn's post carries its content once it
    // exists; this overlay only bridges the first streamed characters and
    // the thinking state before any content.
    for (const reply of activeReplies) {
        if ((reply.text?.trim() ?? '').length > 0) {
            items.push({ kind: 'activeReply', reply });
        } else {
            items.push({ kind: 'activeStatus', reply, status: 'thinking' });
        }
    }

    // Append-only from the reader's seat (specs/chat-timeline.md): a turn's
    // post is created at first visible content, so its creation time IS its
    // appearance order. Items sort by that alone; live overlays with no post
    // yet ride at the tail.
    return items
        .map((item, index) => ({ index, item }))
        .sort(
            (left, right) =>
                parseTimestamp(getItemTimestamp(left.item)) -
                    parseTimestamp(getItemTimestamp(right.item)) || left.index - right.index
        )
        .map(({ item }) => item);
}

function hasDurableReplyRow(rows: TranscriptRow[], runId: string) {
    return rows.some(
        (row) =>
            row.kind === 'message' &&
            row.message.senderType === 'agent' &&
            !row.id.startsWith('act_') &&
            getItemRunId({ kind: 'row', row }) === runId
    );
}

function hasStoppedTurnRow(rows: TranscriptRow[], runId: string) {
    return rows.some(
        (row) =>
            row.kind === 'system' &&
            row.systemKind === 'turnStatus' &&
            row.turnStatus.runId === runId
    );
}

function isThinkingRow(row: TranscriptRow) {
    return row.kind === 'system' && row.systemKind === 'thinking';
}

function isDuplicateReplyThinkingRow(
    row: TranscriptRow,
    rows: TranscriptRow[],
    activeReplies: readonly TranscriptActiveReply[]
) {
    if (!isThinkingRow(row)) {
        return false;
    }

    const runId = getItemRunId({ kind: 'row', row });
    const thinkingText = row.thinking.text;

    if (!(runId && thinkingText.trim())) {
        return false;
    }

    const activeReply = activeReplies.find((reply) => reply.runId === runId);

    if (activeReply && isTranscriptTextPrefix(thinkingText, activeReply.text ?? '')) {
        return true;
    }

    return rows.some(
        (candidate) =>
            candidate !== row &&
            isDurableAgentReplyRow(candidate, runId) &&
            isTranscriptTextPrefix(thinkingText, candidate.message.content)
    );
}

function isDurableAgentReplyRow(
    row: TranscriptRow,
    runId: string
): row is Extract<TranscriptRow, { kind: 'message' }> {
    return (
        row.kind === 'message' &&
        row.message.senderType === 'agent' &&
        !row.id.startsWith('act_') &&
        getItemRunId({ kind: 'row', row }) === runId
    );
}

function isTranscriptTextPrefix(prefix: string, value: string) {
    const normalizedPrefix = normalizeTranscriptText(prefix);
    const normalizedValue = normalizeTranscriptText(value);

    return Boolean(normalizedPrefix && normalizedValue.startsWith(normalizedPrefix));
}

function normalizeTranscriptText(value: string) {
    return value.replace(/\s+/g, ' ').trim();
}

/**
 * Activity-backed message rows (act_ ids) are intra-turn narration projected
 * from response activities. They belong to the work log and are never the
 * turn's durable reply.
 */
export function isActivityBackedMessageRow(row: TranscriptRow) {
    return row.kind === 'message' && row.id.startsWith('act_');
}

function getItemParticipant(item: TranscriptItem): 'agent' | 'system' | 'user' {
    if (item.kind === 'activeReply' || item.kind === 'activeStatus') {
        return 'agent';
    }

    const { row } = item;

    if (row.kind === 'message') {
        return row.message.senderType === 'system'
            ? 'system'
            : row.message.senderType === 'user'
              ? 'user'
              : 'agent';
    }

    if (row.kind === 'tool' || row.kind === 'widget' || row.kind === 'worker') {
        return row.sessionKey?.trim() || row.actor?.kind === 'agent' ? 'agent' : 'system';
    }

    if (row.systemKind === 'turnStatus') {
        return 'agent';
    }

    if (row.systemKind === 'runtimeNotice') {
        return 'system';
    }

    return 'agent';
}

function getTurnKey(item: TranscriptItem, participant: 'agent' | 'user') {
    return `${participant}:${getItemActorKey(item)}:${getItemSessionKey(item) ?? 'no-session'}`;
}

function getItemActor(item: TranscriptItem): TranscriptActor {
    if (item.kind === 'activeReply' || item.kind === 'activeStatus') {
        return { id: item.reply.agentId, kind: 'agent' };
    }

    if (item.row.kind === 'system' && item.row.systemKind === 'turnStatus') {
        return { id: item.row.turnStatus.agentId, kind: 'agent' };
    }

    if (item.row.kind !== 'system') {
        return item.row.actor;
    }

    return null;
}

function getItemActorKey(item: TranscriptItem) {
    return getActorKey(getItemActor(item)) ?? 'system';
}

function getActorKey(actor: TranscriptActor) {
    if (actor) {
        return `${actor.kind}:${actor.id}`;
    }
    return null;
}

/**
 * Whether this entry's rendering can depend on the live reply. Streaming
 * updates replace the activeReply object on every event, so list renderers
 * pass it only to entries that can actually be active and let memoized
 * historical rows skip the re-render.
 */
export function findTranscriptEntryActiveReply(
    entry: TranscriptEntry,
    activeReplies: readonly TranscriptActiveReply[]
): TranscriptActiveReply | null {
    if (entry.kind !== 'turn' || entry.participant !== 'agent') {
        return null;
    }

    // An entry that already carries a live item belongs to exactly that run;
    // the sessionKey heuristic below is only for run-less historical rows.
    const liveItem = entry.items.find(
        (item): item is Extract<TranscriptItem, { kind: 'activeReply' | 'activeStatus' }> =>
            item.kind === 'activeReply' || item.kind === 'activeStatus'
    );

    if (liveItem) {
        return activeReplies.find((reply) => reply.runId === liveItem.reply.runId) ?? null;
    }

    return activeReplies.find((reply) => transcriptEntryUsesActiveReply(entry, reply)) ?? null;
}

export function transcriptEntryUsesActiveReply(
    entry: TranscriptEntry,
    activeReply: TranscriptActiveReply | null
) {
    if (!activeReply || entry.kind !== 'turn' || entry.participant !== 'agent') {
        return false;
    }

    if (entry.items.some((item) => item.kind === 'activeReply' || item.kind === 'activeStatus')) {
        return true;
    }

    // The turn's post replaces the live overlay item the moment it exists,
    // but while it is still streaming the run is live — only a finalized
    // reply ends the entry's claim on the active reply.
    if (
        entry.items.some(
            (item) =>
                item.kind === 'row' &&
                item.row.kind === 'message' &&
                !(isActivityBackedMessageRow(item.row) || isStreamingPostMessageRow(item.row))
        )
    ) {
        return false;
    }

    return entry.items.some((item) => getItemSessionKey(item) === activeReply.sessionKey);
}

// The runtime flags the turn's message row while it is still being edited.
export function isStreamingPostMessageRow(row: Extract<TranscriptRow, { kind: 'message' }>) {
    const runtime = row.message.metadata?.runtime;

    return Boolean(
        runtime &&
            typeof runtime === 'object' &&
            !Array.isArray(runtime) &&
            (runtime as Record<string, unknown>).streaming === true
    );
}

function getItemResponseId(item: TranscriptItem) {
    if (item.kind !== 'row') {
        return null;
    }

    // Session-history row kinds never carry a response id.
    return 'responseId' in item.row ? (item.row.responseId ?? null) : null;
}

export function getItemSessionKey(item: TranscriptItem) {
    if (item.kind === 'activeReply' || item.kind === 'activeStatus') {
        return item.reply.sessionKey;
    }

    const { row } = item;

    if (row.kind === 'message') {
        const sessionKey = row.message.sourceSessionKey.trim();
        return sessionKey.length > 0 ? sessionKey : null;
    }

    if (row.kind === 'tool' || row.kind === 'widget' || row.kind === 'worker') {
        return row.sessionKey;
    }

    if (row.systemKind === 'turnStatus') {
        return row.turnStatus.sessionKey;
    }

    return null;
}

export function getItemTimestamp(item: TranscriptItem) {
    if (item.kind === 'activeReply' || item.kind === 'activeStatus') {
        return item.reply.startedAt;
    }

    const { row } = item;

    if (row.kind === 'message') {
        return row.message.timestamp;
    }

    if (row.kind === 'tool' || row.kind === 'widget' || row.kind === 'worker') {
        return row.startedAt ?? row.completedAt;
    }

    return row.timestamp;
}

function parseTimestamp(timestamp: string | null) {
    const parsed = timestamp ? Date.parse(timestamp) : Number.NaN;
    return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}
