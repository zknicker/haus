import type { ChatMessage } from '@haus/api';
import type { HausOutputs } from '../../lib/haus-server.tsx';

/**
 * What a transcript list keeps per message id (specs/realtime-events.md,
 * "Normalized transcript cache"): the facts the row model groups and orders
 * by, plus the other parts of a message that never change once it commits.
 * Messages are append-only, so these are fixed for the life of the id. The
 * mutable annotations (reactions, task, Cloud Agent work body, Thread summary)
 * and the prose live only on the `chat.message` entity a row reads.
 *
 * `author` carries its profile because the transcript names a deleted author
 * from it; `attachments` because Files lists a chat's loaded attachments
 * without reading every entity.
 */
export type ChatMessageLayout = Pick<
    ChatMessage,
    | 'attachments'
    | 'author'
    | 'chatId'
    | 'createdAt'
    | 'id'
    | 'nonce'
    | 'reply'
    | 'runId'
    | 'sequence'
    | 'serverId'
>;

/** One loaded `chat.messages` page as a transcript list holds it: ids and layout facts. */
export interface TranscriptPage {
    entries: readonly ChatMessageLayout[];
    nextAfterSequence: number | null;
    nextBeforeSequence: number | null;
    scannedThroughSequence: number;
}

/** A transcript list's loaded pages merged oldest-first. */
export interface TranscriptLayout {
    entries: readonly ChatMessageLayout[];
    nextAfterSequence: number | null;
    nextBeforeSequence: number | null;
}

export type ChatMessagePage = HausOutputs['chat']['messages'];

export function toChatMessageLayout(message: ChatMessage): ChatMessageLayout {
    return {
        attachments: message.attachments,
        author: message.author,
        chatId: message.chatId,
        createdAt: message.createdAt,
        id: message.id,
        nonce: message.nonce,
        reply: message.reply,
        runId: message.runId,
        sequence: message.sequence,
        serverId: message.serverId,
    };
}

export function toTranscriptPage(page: ChatMessagePage): TranscriptPage {
    return {
        entries: page.messages.map(toChatMessageLayout).sort(bySequence),
        nextAfterSequence: page.nextAfterSequence,
        nextBeforeSequence: page.nextBeforeSequence,
        scannedThroughSequence: page.scannedThroughSequence,
    };
}

/** Combines newest-first cursor pages into one oldest-first transcript, first copy of an id wins. */
export function mergeTranscriptPages(
    pages: readonly TranscriptPage[] | undefined
): TranscriptLayout | undefined {
    if (!pages) {
        return undefined;
    }
    const byId = new Map<string, ChatMessageLayout>();
    for (const page of pages) {
        for (const entry of page.entries) {
            if (!byId.has(entry.id)) {
                byId.set(entry.id, entry);
            }
        }
    }
    return {
        entries: [...byId.values()].sort(bySequence),
        nextAfterSequence: pages[0]?.nextAfterSequence ?? null,
        nextBeforeSequence: pages.at(-1)?.nextBeforeSequence ?? null,
    };
}

/**
 * Appends a tail read's entries to the newest page, deduplicated by id in
 * sequence order, and moves its scan position forward (never back).
 */
export function appendToNewestPage(
    pages: readonly TranscriptPage[],
    tail: TranscriptPage
): TranscriptPage[] {
    const [newest, ...older] = pages;
    if (!newest) {
        return [...pages];
    }
    const known = new Set(newest.entries.map((entry) => entry.id));
    const added = tail.entries.filter((entry) => !known.has(entry.id));
    const scannedThroughSequence = Math.max(
        newest.scannedThroughSequence,
        tail.scannedThroughSequence
    );
    if (added.length === 0 && scannedThroughSequence === newest.scannedThroughSequence) {
        return [...pages];
    }
    return [
        {
            ...newest,
            entries: [...newest.entries, ...added].sort(bySequence),
            scannedThroughSequence,
        },
        ...older,
    ];
}

function bySequence(left: ChatMessageLayout, right: ChatMessageLayout) {
    return left.sequence - right.sequence;
}
