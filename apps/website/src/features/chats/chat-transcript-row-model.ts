import { formatDayLabel } from '../../components/chats/day-divider.tsx';
import type { TranscriptEntry, TranscriptItem, TranscriptRow } from './chat-transcript-model.ts';
import { findTranscriptEntryActiveReply, getItemSessionKey } from './chat-transcript-model.ts';
import { areTranscriptRenderRowsEqual } from './transcript-render-row-equality.ts';

export type SessionNoticeRow = Extract<
    TranscriptRow,
    { kind: 'system'; systemKind: 'runtimeNotice' }
>;

export type TranscriptRenderRow =
    | { id: 'hidden-count'; kind: 'hiddenCount' }
    | { id: string; kind: 'dayDivider'; label: string }
    | {
          entry: TranscriptEntry;
          followsRuntimeNotice: boolean;
          id: string;
          kind: 'entry';
          // The new-session notice this turn opened, surfaced as a hover
          // affordance on the turn instead of a standalone row.
          sessionNotice: SessionNoticeRow | null;
          turnStartedAt: string | null;
      };

export interface StableTranscriptRenderRowsState {
    byId: Map<string, TranscriptRenderRow>;
    result: TranscriptRenderRow[];
}

export function buildTranscriptRenderRows(entries: TranscriptEntry[], hiddenCount: number) {
    const rows: TranscriptRenderRow[] = [];

    if (hiddenCount > 0) {
        rows.push({ id: 'hidden-count', kind: 'hiddenCount' });
    }

    let previousDayKey: string | null = null;
    // A new-session notice never renders standalone: it waits here for the
    // turn it opened — that agent's next rendered turn — and rides along as
    // that row's hover affordance.
    const pendingSessionNotices: SessionNoticeRow[] = [];

    entries.forEach((entry, index) => {
        // A new-session notice is intercepted before any render check: it
        // never becomes its own row, it rides along with the turn it opened.
        const sessionNoticeRow = getSessionNoticeRow(entry);

        if (sessionNoticeRow) {
            pendingSessionNotices.push(sessionNoticeRow);
            return;
        }

        // Day dividers key off rendered rows only — a divider with nothing
        // below it is noise, so hidden entries never open a new day (and a
        // hidden turn never claims a pending session notice either).
        if (!shouldRenderTranscriptEntry(entry)) {
            return;
        }

        const previousEntry = index > 0 ? entries[index - 1] : null;
        const timestamp = entry.timestamp;
        const dayKey = getDayKey(timestamp);

        if (timestamp && dayKey !== null && dayKey !== previousDayKey) {
            rows.push({
                id: `day:${dayKey}`,
                kind: 'dayDivider',
                label: formatDayLabel(timestamp),
            });
        }

        rows.push({
            entry,
            followsRuntimeNotice: isRuntimeNoticeEntry(previousEntry),
            id: entry.id,
            kind: 'entry',
            sessionNotice: takeSessionNoticeForEntry(pendingSessionNotices, entry),
            turnStartedAt: getAgentTurnStartedAt(previousEntry, entry),
        });

        if (dayKey !== null) {
            previousDayKey = dayKey;
        }
    });

    return rows;
}

function getSessionNoticeRow(entry: TranscriptEntry): SessionNoticeRow | null {
    return entry.kind === 'system' &&
        entry.item.kind === 'row' &&
        entry.item.row.kind === 'system' &&
        entry.item.row.systemKind === 'runtimeNotice' &&
        entry.item.row.runtimeNotice.kind === 'new_session'
        ? entry.item.row
        : null;
}

// Prefer the notice written for this turn's agent; a notice without agent
// identity attaches to the next agent turn in order.
function takeSessionNoticeForEntry(
    pending: SessionNoticeRow[],
    entry: TranscriptEntry
): SessionNoticeRow | null {
    if (pending.length === 0 || entry.kind !== 'turn' || entry.participant !== 'agent') {
        return null;
    }

    const agentId = entry.actor?.kind === 'agent' ? entry.actor.id : null;
    let index = pending.findIndex((notice) => notice.runtimeNotice.agentId === agentId);

    if (index === -1) {
        index = pending.findIndex((notice) => notice.runtimeNotice.agentId === null);
    }

    if (index === -1) {
        return null;
    }

    const [notice] = pending.splice(index, 1);

    return notice ?? null;
}

export function computeStableTranscriptRenderRows(
    rows: TranscriptRenderRow[],
    previous: StableTranscriptRenderRowsState
): StableTranscriptRenderRowsState {
    const next = new Map<string, TranscriptRenderRow>();
    let anyChanged = rows.length !== previous.byId.size;
    const result = rows.map((row, index) => {
        const previousRow = previous.byId.get(row.id);
        const nextRow =
            previousRow && areTranscriptRenderRowsEqual(previousRow, row) ? previousRow : row;

        next.set(row.id, nextRow);

        if (!anyChanged && previous.result[index] !== nextRow) {
            anyChanged = true;
        }

        return nextRow;
    });

    return anyChanged ? { byId: next, result } : previous;
}

/** A row's height before it renders: the placeholder a windowed transcript draws in its place. */
export function getEstimatedTranscriptRowSize(row: TranscriptRenderRow | undefined) {
    if (!row || row.kind === 'hiddenCount') {
        return 32;
    }

    if (row.kind === 'dayDivider') {
        return 36;
    }

    if (row.entry.kind === 'system') {
        return 48;
    }

    if (row.entry.participant === 'user') {
        return 88;
    }

    if (isActiveStatusOnlyAgentEntry(row.entry)) {
        return 56;
    }

    return 180;
}

export function findTranscriptRenderRowActiveReply(
    row: TranscriptRenderRow | undefined,
    activeReplies: Parameters<typeof findTranscriptEntryActiveReply>[1]
) {
    if (!row || row.kind === 'hiddenCount' || row.kind === 'dayDivider') {
        return null;
    }

    return findTranscriptEntryActiveReply(row.entry, activeReplies);
}

// Every rendered row paints at its natural size — an entry with nothing to
// show emits no row at all, so timeline spacing stays structurally even
// (specs/chat-timeline.md). Mirrors the pane's visibility rules: thinking
// status renders in the status stack, and a lifecycle note with no content
// above it is noise.
function shouldRenderTranscriptEntry(entry: TranscriptEntry) {
    if (entry.kind !== 'turn' || entry.participant !== 'agent') {
        return true;
    }

    return entry.items.some(isPaneVisibleAgentItem);
}

function isPaneVisibleAgentItem(item: TranscriptItem) {
    if (item.kind === 'activeReply') {
        return true;
    }

    if (item.kind !== 'row') {
        return false;
    }

    if (item.row.kind === 'message' || item.row.kind === 'widget') {
        return true;
    }

    if (item.row.kind === 'system' && item.row.systemKind === 'artifact') {
        return true;
    }

    return item.row.kind === 'tool' && Boolean(item.row.clarification);
}

function isActiveStatusOnlyAgentEntry(entry: TranscriptEntry) {
    return (
        entry.kind === 'turn' &&
        entry.participant === 'agent' &&
        entry.items.length === 1 &&
        entry.items[0]?.kind === 'activeStatus'
    );
}

// New-session notices never render standalone (they ride their turn's row),
// so they don't count as a rendered notice above the next entry.
function isRuntimeNoticeEntry(entry: TranscriptEntry | null) {
    return (
        entry?.kind === 'system' &&
        entry.item.kind === 'row' &&
        entry.item.row.kind === 'system' &&
        entry.item.row.systemKind === 'runtimeNotice' &&
        entry.item.row.runtimeNotice.kind !== 'new_session'
    );
}

function getDayKey(timestamp: string | null) {
    if (!timestamp) {
        return null;
    }

    const date = new Date(timestamp);
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function getAgentTurnStartedAt(
    previousEntry: TranscriptEntry | null,
    entry: TranscriptEntry
): string | null {
    if (
        entry.kind !== 'turn' ||
        entry.participant !== 'agent' ||
        previousEntry?.kind !== 'turn' ||
        previousEntry.participant !== 'user'
    ) {
        return null;
    }

    const agentSessionKey = getEntrySessionKey(entry);
    const userSessionKey = getEntrySessionKey(previousEntry);

    return agentSessionKey && agentSessionKey === userSessionKey ? previousEntry.timestamp : null;
}

function getEntrySessionKey(entry: Extract<TranscriptEntry, { kind: 'turn' }>) {
    for (const item of entry.items) {
        const sessionKey = getItemSessionKey(item);

        if (sessionKey) {
            return sessionKey;
        }
    }

    return null;
}
