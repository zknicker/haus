import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentInboxItem } from './agent-inbox-item.ts';
import { noticePath, type StoredNoticeReceipt, writePendingNotice } from './delivery.ts';
import { composeInboxNotice } from './inbox-format.ts';

export interface AgentInboxLocation {
    agentId: string;
    dataRoot: string;
    serverId: string;
}

export interface VisibleMessageIdentity {
    chatId: string;
    id: string;
    sequence: number;
}

export interface PendingInboxState {
    consumedMessageIds: string[];
    items: AgentInboxItem[];
    totalPending: number;
}

const inboxWrites = new Map<string, Promise<void>>();

/** Accepts a concrete run and reconciles its rows out of the busy-notice mirror. */
export async function acceptRunInbox(
    location: AgentInboxLocation,
    runId: string,
    items: AgentInboxItem[]
): Promise<AgentInboxItem[]> {
    return await withInboxWrite(location, async () => {
        const root = inboxRoot(location);
        await mkdir(join(root, 'runs'), { mode: 0o700, recursive: true });
        await writeJsonAtomic(join(root, 'runs', `${runId}.json`), items);
        await consumeVisibleIdsLocked(
            location,
            items.map((item) => item.id)
        );
        return items;
    });
}

/** Mirrors the Server's current bounded busy-Agent inbox window locally. */
export async function replacePendingInbox(
    location: AgentInboxLocation,
    items: AgentInboxItem[],
    totalPending = items.length,
    deliverNotice?: (notice: string) => Promise<void>,
    receipt?: StoredNoticeReceipt
): Promise<string | null> {
    const notice = await withInboxWrite(location, async () => {
        const current = await readPendingState(location);
        const consumed = new Set(current.consumedMessageIds);
        const byId = new Map<string, AgentInboxItem>();
        for (const item of items) {
            if (!consumed.has(item.id)) {
                byId.set(item.id, item);
            }
        }
        const pending = [...byId.values()].sort(
            (left, right) =>
                left.createdAt.localeCompare(right.createdAt) ||
                left.sequence - right.sequence ||
                left.id.localeCompare(right.id)
        );
        const visibleInSnapshot = new Set(
            items.filter((item) => consumed.has(item.id)).map((item) => item.id)
        ).size;
        const nextTotal = Math.max(pending.length, totalPending - visibleInSnapshot);
        await writePendingState(location, {
            consumedMessageIds: current.consumedMessageIds,
            items: pending,
            totalPending: nextTotal,
        });
        return await reconcilePendingNotice(location, pending, nextTotal, receipt);
    });
    if (notice && deliverNotice) {
        await deliverNotice(notice);
    }
    return notice;
}

/** Server re-offered these canonical identities in a new turn after a failed run. */
export async function reofferPendingMessages(
    location: AgentInboxLocation,
    items: AgentInboxItem[]
): Promise<void> {
    const offeredIds = new Set(items.map((item) => item.id));
    if (offeredIds.size === 0) {
        return;
    }
    await withInboxWrite(location, async () => {
        const current = await readPendingState(location);
        const consumedMessageIds = current.consumedMessageIds.filter((id) => !offeredIds.has(id));
        if (consumedMessageIds.length === current.consumedMessageIds.length) {
            return;
        }
        await writePendingState(location, { ...current, consumedMessageIds });
    });
}

export async function readPendingInbox(location: AgentInboxLocation): Promise<AgentInboxItem[]> {
    try {
        return (await readPendingState(location)).items;
    } catch {
        return [];
    }
}

export async function readPendingInboxState(
    location: AgentInboxLocation
): Promise<PendingInboxState> {
    return await readPendingState(location);
}

/**
 * The single Computer-local consume point for messages that became model-visible.
 * Every visibility path removes exact identities from the pending notice projection.
 */
export async function consumeVisibleMessages(
    location: AgentInboxLocation,
    messages: Iterable<VisibleMessageIdentity>
): Promise<void> {
    const visibleIds = [...messages].map((message) => message.id);
    if (visibleIds.length === 0) {
        return;
    }
    await withInboxWrite(location, async () => {
        await consumeVisibleIdsLocked(location, visibleIds);
    });
}

/**
 * A bodiless inbox item mirrored into the local inbox: a Trigger or Reminder
 * fire, or a task assignment, which speaks as `@haus`. None has a backing
 * Chat message, so the Server alone can serve it and mark it served, and its
 * key must never enter message-visibility attestation.
 */
export function isAutomationInboxItem(item: AgentInboxItem): boolean {
    return !item.message && ['trigger', 'reminder', 'haus'].includes(item.senderHandle);
}

/** Retires bodiless items the Server just served on `/api/agent/events` from the mirror. */
export async function consumeServedAutomations(
    location: AgentInboxLocation,
    fireIds: string[]
): Promise<void> {
    if (fireIds.length === 0) {
        return;
    }
    await withInboxWrite(location, async () => {
        await consumeVisibleIdsLocked(location, fireIds);
    });
}

/** Durable exact visibility evidence carried with the turn summary after local-first pulls. */
export async function recordRunVisibleMessages(
    location: AgentInboxLocation,
    runId: string,
    messages: VisibleMessageIdentity[]
): Promise<void> {
    if (messages.length === 0) {
        return;
    }
    await withInboxWrite(location, async () => {
        const path = runVisiblePath(location, runId);
        let current: VisibleMessageIdentity[] = [];
        try {
            current = JSON.parse(await readFile(path, 'utf8')) as VisibleMessageIdentity[];
        } catch (error) {
            if (!isMissingFile(error)) {
                throw error;
            }
        }
        const byId = new Map(current.map((message) => [message.id, message]));
        for (const message of messages) {
            byId.set(message.id, message);
        }
        await writeJsonAtomic(path, [...byId.values()]);
    });
}

export async function readRunVisibleMessages(
    location: AgentInboxLocation,
    runId: string
): Promise<VisibleMessageIdentity[]> {
    try {
        return JSON.parse(await readFile(runVisiblePath(location, runId), 'utf8'));
    } catch (error) {
        if (isMissingFile(error)) {
            return [];
        }
        throw error;
    }
}

export async function clearRunVisibleMessages(
    location: AgentInboxLocation,
    runId: string
): Promise<void> {
    await withInboxWrite(location, async () => {
        await rm(runVisiblePath(location, runId), { force: true });
    });
}

/** Re-exposes locally pulled bodies before an accepted run is replayed after a crash. */
export async function prepareRunReplay(location: AgentInboxLocation, runId: string): Promise<void> {
    await withInboxWrite(location, async () => {
        const path = runVisiblePath(location, runId);
        let visible: VisibleMessageIdentity[];
        try {
            visible = JSON.parse(await readFile(path, 'utf8')) as VisibleMessageIdentity[];
        } catch (error) {
            if (isMissingFile(error)) {
                return;
            }
            throw error;
        }
        const replayIds = new Set(visible.map((message) => message.id));
        const current = await readPendingState(location);
        await writePendingState(location, {
            ...current,
            consumedMessageIds: current.consumedMessageIds.filter((id) => !replayIds.has(id)),
        });
        await rm(path, { force: true });
    });
}

async function readPendingState(location: AgentInboxLocation): Promise<PendingInboxState> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(await readFile(pendingPath(location), 'utf8'));
    } catch (error) {
        if (isMissingFile(error)) {
            return { consumedMessageIds: [], items: [], totalPending: 0 };
        }
        throw error;
    }
    if (Array.isArray(parsed)) {
        return {
            consumedMessageIds: [],
            items: parsed as AgentInboxItem[],
            totalPending: parsed.length,
        };
    }
    if (!(parsed && typeof parsed === 'object')) {
        throw new Error('Invalid local Agent inbox state.');
    }
    const record = parsed as Record<string, unknown>;
    if (
        (record.consumedMessageIds === undefined || Array.isArray(record.consumedMessageIds)) &&
        Array.isArray(record.items) &&
        Number.isInteger(record.totalPending)
    ) {
        return {
            consumedMessageIds: record.consumedMessageIds ?? [],
            items: record.items,
            totalPending: record.totalPending,
        } as PendingInboxState;
    }
    throw new Error('Invalid local Agent inbox state.');
}

async function consumeVisibleIdsLocked(
    location: AgentInboxLocation,
    visible: string[]
): Promise<void> {
    const state = await readPendingState(location);
    const visibleIds = new Set(visible);
    const remaining = state.items.filter((item) => !visibleIds.has(item.id));
    const consumed = state.items.length - remaining.length;
    const existingConsumed = new Set(state.consumedMessageIds);
    const hasNewVisible = [...visibleIds].some((id) => !existingConsumed.has(id));
    const consumedMessageIds = [...new Set([...state.consumedMessageIds, ...visibleIds])];
    if (consumed === 0 && !hasNewVisible) {
        return;
    }
    const next = {
        consumedMessageIds,
        items: remaining,
        totalPending: Math.max(remaining.length, state.totalPending - consumed),
    };
    await writePendingState(location, next);
    await reconcilePendingNotice(location, next.items, next.totalPending);
}

async function writePendingState(
    location: AgentInboxLocation,
    state: PendingInboxState
): Promise<void> {
    await writeJsonAtomic(pendingPath(location), state);
}

function inboxRoot(location: AgentInboxLocation) {
    return join(
        location.dataRoot,
        'servers',
        location.serverId,
        'agents',
        location.agentId,
        'runtime',
        'inbox'
    );
}

function pendingPath(location: AgentInboxLocation) {
    return join(inboxRoot(location), 'pending.json');
}

function runVisiblePath(location: AgentInboxLocation, runId: string) {
    return join(inboxRoot(location), 'runs', `${runId}-visible.json`);
}

async function reconcilePendingNotice(
    location: AgentInboxLocation,
    items: AgentInboxItem[],
    totalPending = items.length,
    receipt?: StoredNoticeReceipt
): Promise<string | null> {
    const notice = composeInboxNotice(items, totalPending);
    if (!notice) {
        await rm(noticePath(location.dataRoot, location), { force: true });
        return null;
    }
    await writePendingNotice(location.dataRoot, {
        agentId: location.agentId,
        notice,
        receipt,
        serverId: location.serverId,
    });
    return notice;
}

async function writeJsonAtomic(path: string, value: unknown) {
    await mkdir(join(path, '..'), { mode: 0o700, recursive: true });
    const temporary = `${path}.${randomBytes(8).toString('hex')}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600 });
    await rename(temporary, path);
}

function isMissingFile(error: unknown): boolean {
    return (
        error instanceof Error &&
        'code' in error &&
        (error as Error & { code?: string }).code === 'ENOENT'
    );
}

async function withInboxWrite<T>(
    location: AgentInboxLocation,
    write: () => Promise<T>
): Promise<T> {
    const key = inboxRoot(location);
    const previous = inboxWrites.get(key) ?? Promise.resolve();
    const result = previous.then(write, write);
    const settled = result.then(
        () => undefined,
        () => undefined
    );
    inboxWrites.set(key, settled);
    try {
        return await result;
    } finally {
        if (inboxWrites.get(key) === settled) {
            inboxWrites.delete(key);
        }
    }
}
