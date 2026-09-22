import { isAssistantNarrationItem } from './chat-transcript-activity-utils.ts';
import type { TranscriptItem, TranscriptRow } from './chat-transcript-model.ts';

export type AgentItemSegment =
    | { item: TranscriptItem; key: string; kind: 'item' }
    | { items: TranscriptItem[]; key: string; kind: 'activity' };

export function groupAgentItems(items: TranscriptItem[]) {
    const segments: AgentItemSegment[] = [];
    let activityItems: TranscriptItem[] = [];
    let activityGroupKey: string | null = null;

    for (const item of items) {
        if (isTranscriptActivityItem(item)) {
            const nextGroupKind = getActivityGroupKind(item);
            if (activityGroupKey && activityGroupKey !== nextGroupKind) {
                flushActivitySegment(segments, activityItems);
                activityItems = [];
            }
            activityItems.push(item);
            activityGroupKey = nextGroupKind;
            continue;
        }

        flushActivitySegment(segments, activityItems);
        activityItems = [];
        activityGroupKey = null;
        segments.push({ item, key: getTranscriptItemKey(item), kind: 'item' });
    }

    flushActivitySegment(segments, activityItems);

    return segments;
}

function getActivityGroupKind(item: TranscriptItem) {
    if (item.kind === 'row' && item.row.kind === 'system' && item.row.systemKind === 'thinking') {
        return 'thinking';
    }

    return 'work';
}

function flushActivitySegment(segments: AgentItemSegment[], items: TranscriptItem[]) {
    if (items.length === 0) {
        return;
    }

    segments.push({
        items,
        key: `activity:${getActivityGroupKind(items[0])}:${getTranscriptItemKey(items[0])}`,
        kind: 'activity',
    });
}

export function isTranscriptActivityItem(item: TranscriptItem) {
    if (item.kind === 'activeReply' || item.kind === 'activeStatus') {
        return false;
    }

    if (item.kind === 'row' && item.row.kind === 'system' && item.row.systemKind === 'turnStatus') {
        return false;
    }

    return (
        item.kind !== 'row' ||
        (item.row.kind !== 'message' &&
            item.row.kind !== 'widget' &&
            !isAssistantNarrationItem(item))
    );
}

export function getTranscriptItemKey(item: TranscriptItem) {
    if (item.kind === 'activeReply') {
        return `reply:${item.reply.runId}`;
    }

    if (item.kind === 'activeStatus') {
        return `active-status:${item.reply.runId}:${item.status}`;
    }

    const replyRunId = getDurableReplyRunId(item.row);

    if (replyRunId) {
        return `reply:${replyRunId}`;
    }

    const sendNonce = getUserSendNonce(item.row);

    return sendNonce ? `send:${sendNonce}` : item.row.id;
}

// The pending row a human send draws and the durable message it becomes share
// one key, so the row keeps its DOM identity — and its geometry — across the
// confirmation swap instead of unmounting and remounting.
function getUserSendNonce(row: TranscriptRow) {
    if (row.kind !== 'message' || row.message.senderType !== 'user') {
        return null;
    }

    const nonce = row.message.sendNonce?.trim();

    return nonce ? nonce : null;
}

// The streamed reply and the durable assistant message it becomes share one
// key, so the reply slot keeps its identity when the turn completes instead
// of remounting.
function getDurableReplyRunId(row: TranscriptRow) {
    if (row.kind !== 'message' || row.message.senderType !== 'agent' || row.id.startsWith('act_')) {
        return null;
    }

    const runtime = row.message.metadata?.runtime;

    if (!(runtime && typeof runtime === 'object' && !Array.isArray(runtime))) {
        return null;
    }

    const runId = (runtime as Record<string, unknown>).runId;

    return typeof runId === 'string' && runId.trim().length > 0 ? runId : null;
}
