import { parseWorkerReferenceTarget, parseHausRichReferences } from '@haus/api';
import { and, asc, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { workerHistoryLinksTable } from '../postgres/schema.ts';
import { type WorkerViewer, readVisibleWorkerIds } from '../workers/worker-visibility.ts';

export interface WorkerLink {
    ordinal: number;
    workerId: string;
}

export interface ResolvedWorkerLinks {
    content: string;
    links: WorkerLink[];
}

/**
 * The Message-boundary operation every writer runs (ADR 0044): a
 * `worker://` link survives only when the work exists and the author can
 * already see it; any other becomes its plain label text. Links dedupe by
 * first occurrence. Run inside the transaction that holds the Server lock and
 * inserts the Message, then record the links with `recordWorkerLinks`.
 */
export async function resolveWorkerLinks(
    db: Pick<HausDatabase, 'select'>,
    input: { author: WorkerViewer; content: string; serverId: string }
): Promise<ResolvedWorkerLinks> {
    const workerIds = readLinkedWorkIds(input.content);
    if (workerIds.length === 0) {
        return { content: input.content, links: [] };
    }
    const visible = await readVisibleWorkerIds(db, {
        serverId: input.serverId,
        viewer: input.author,
        workerIds,
    });
    return applyWorkerLinks(input.content, visible);
}

/**
 * Keeps links whose work id is in `allowed` and rewrites every other
 * `worker://` link to its label, repeating until none is left: a
 * rewrite can join text into new link syntax. Replay passes the links a
 * Message recorded, so a retry reproduces the stored content exactly even
 * after the author's access changed.
 */
export function applyWorkerLinks(
    content: string,
    allowed: ReadonlySet<string>
): ResolvedWorkerLinks {
    let current = content;
    for (;;) {
        const rejected = parseHausRichReferences(current).filter((reference) => {
            const workerId = workIdOf(reference);
            return workerId !== null && !allowed.has(workerId);
        });
        if (rejected.length === 0) {
            break;
        }
        for (const reference of rejected.reverse()) {
            current =
                current.slice(0, reference.start) + reference.label + current.slice(reference.end);
        }
    }
    const ordered = readLinkedWorkIds(current);
    return {
        content: current,
        links: ordered.map((workerId, ordinal) => ({ ordinal, workerId })),
    };
}

/** Inserts one Message's links; the caller already holds the Server lock. */
export async function recordWorkerLinks(
    db: HausDatabase,
    input: { chatId: string; links: WorkerLink[]; messageId: string; serverId: string }
): Promise<void> {
    if (input.links.length === 0) {
        return;
    }
    await db.insert(workerHistoryLinksTable).values(
        input.links.map((link) => ({
            chatId: input.chatId,
            messageId: input.messageId,
            ordinal: link.ordinal,
            serverId: input.serverId,
            workerId: link.workerId,
        }))
    );
}

/** The work ids one stored Message links, in link order. */
export async function readRecordedWorkerIds(
    db: Pick<HausDatabase, 'select'>,
    input: { messageId: string; serverId: string }
): Promise<Set<string>> {
    const rows = await db
        .select({ workerId: workerHistoryLinksTable.workerId })
        .from(workerHistoryLinksTable)
        .where(
            and(
                eq(workerHistoryLinksTable.serverId, input.serverId),
                eq(workerHistoryLinksTable.messageId, input.messageId)
            )
        )
        .orderBy(asc(workerHistoryLinksTable.ordinal));
    return new Set(rows.map(({ workerId }) => workerId));
}

/**
 * The content a replayed send must match: the request canonicalized with the
 * authorization the original send recorded, never current access.
 */
export async function replayWorkerLinks(
    db: Pick<HausDatabase, 'select'>,
    input: { content: string; messageId: string; serverId: string }
): Promise<string> {
    const recorded = await readRecordedWorkerIds(db, input);
    return applyWorkerLinks(input.content, recorded).content;
}

function readLinkedWorkIds(content: string): string[] {
    const ids = new Set<string>();
    for (const reference of parseHausRichReferences(content)) {
        const workerId = workIdOf(reference);
        if (workerId !== null) {
            ids.add(workerId);
        }
    }
    return [...ids];
}

function workIdOf(reference: { id: string; kind: string }): string | null {
    return reference.kind === 'worker' ? parseWorkerReferenceTarget(reference.id) : null;
}
