import type { EarlierThreadsScope, OpenThread } from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { readThreadRows } from './read-thread-rows.ts';

const earlierPageSize = 50;

/** The viewer's open Threads, and which Threads they closed (specs/open-threads.md). */
export async function listOpenThreads(
    db: HausDatabase,
    member: Pick<HausUser, 'id'> | null,
    serverId: string
): Promise<{ closedThreadChatIds: string[]; threads: OpenThread[] }> {
    await requireServerMembership(db, member, serverId);
    if (!member) {
        return { closedThreadChatIds: [], threads: [] };
    }
    const rows = await readThreadRows(db, member.id, serverId, 'candidates', new Date());
    return {
        closedThreadChatIds: rows.filter((row) => row.closed).map((row) => row.thread.threadChatId),
        threads: rows.filter((row) => row.open).map((row) => row.thread),
    };
}

/** Threads not open right now, newest activity first. The cursor is an offset into that list. */
export async function listEarlierThreads(
    db: HausDatabase,
    member: Pick<HausUser, 'id'> | null,
    input: { cursor?: number | null; scope: EarlierThreadsScope; serverId: string }
): Promise<{ nextCursor: number | null; threads: OpenThread[] }> {
    await requireServerMembership(db, member, input.serverId);
    if (!member) {
        return { nextCursor: null, threads: [] };
    }
    const scope = input.scope === 'all' ? 'all' : 'candidates';
    const rows = await readThreadRows(db, member.id, input.serverId, scope, new Date());
    const earlier = rows.filter((row) => !row.open);
    const start = input.cursor ?? 0;
    const end = start + earlierPageSize;
    return {
        nextCursor: end < earlier.length ? end : null,
        threads: earlier.slice(start, end).map((row) => row.thread),
    };
}
