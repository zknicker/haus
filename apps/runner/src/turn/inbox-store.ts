import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { composeInboxNotice } from '@haus/agent-prompt';
import type { AgentNoticeCommand, AgentStartCommand } from '@haus/api';
import * as z from 'zod';
import { clearPendingNotice, type NoticeReceipt, writePendingNotice } from './pending-notice.ts';

type InboxItem = AgentStartCommand['inbox'][number];
type IssueItemsNotice = NonNullable<AgentNoticeCommand['issueItems']>;

interface PendingInbox {
    readonly consumedMessageIds: readonly string[];
    readonly items: readonly InboxItem[];
    readonly issueItems?: IssueItemsNotice;
    readonly totalPending: number;
}

const pendingSchema = z.object({
    consumedMessageIds: z.array(z.string()),
    items: z.array(z.custom<InboxItem>((value) => typeof value === 'object' && value !== null)),
    issueItems: z.custom<IssueItemsNotice>().optional(),
    totalPending: z.number().int().nonnegative(),
});

const locks = new Map<string, Promise<unknown>>();

export function inboxStore(runtimeDir: string) {
    const locked = <T>(work: () => Promise<T>) => {
        const previous = locks.get(runtimeDir) ?? Promise.resolve();
        const next = previous.then(work, work);
        locks.set(
            runtimeDir,
            next.catch(() => undefined)
        );
        return next;
    };
    const pendingPath = join(runtimeDir, 'inbox', 'pending.json');
    const read = async () => {
        const raw = await readJson(pendingPath);
        const empty: PendingInbox = { consumedMessageIds: [], items: [], totalPending: 0 };
        return raw === null ? empty : pendingSchema.parse(raw);
    };
    const write = async (state: PendingInbox, receipt?: NoticeReceipt) => {
        await writeJsonAtomic(pendingPath, state);
        const notice = composeInboxNotice([...state.items], state.totalPending, {
            ...(state.issueItems ? { issueItems: state.issueItems } : {}),
        });
        if (notice) {
            await writePendingNotice(runtimeDir, { notice, ...(receipt ? { receipt } : {}) });
        } else {
            await clearPendingNotice(runtimeDir);
        }
        return notice;
    };
    const consumeLocked = async (ids: readonly string[], dropIssueItems = false) => {
        const state = await read();
        const visible = new Set(ids);
        const remaining = state.items.filter((item) => !visible.has(item.id));
        const { issueItems, ...rest } = state;
        await write({
            ...rest,
            consumedMessageIds: [...new Set([...state.consumedMessageIds, ...ids])],
            items: remaining,
            totalPending: Math.max(
                remaining.length,
                state.totalPending - (state.items.length - remaining.length)
            ),
            ...(issueItems && !dropIssueItems ? { issueItems } : {}),
        });
    };
    return {
        acceptRun(start: AgentStartCommand) {
            return locked(async () => {
                const state = await read();
                const offered = new Set(start.inbox.map((item) => item.id));
                const consumedMessageIds = state.consumedMessageIds.filter(
                    (id) => !offered.has(id)
                );
                if (start.inboxDelivery === 'notice') {
                    await write({
                        consumedMessageIds,
                        items: start.inbox,
                        totalPending: start.totalPending,
                    });
                    return;
                }
                await writeJsonAtomic(pendingPath, { ...state, consumedMessageIds });
                await consumeLocked(
                    start.inbox.map((item) => item.id),
                    start.issueAssignments !== undefined || start.issueEvents !== undefined
                );
            });
        },
        consume(ids: readonly string[]) {
            return ids.length === 0 ? Promise.resolve() : locked(() => consumeLocked(ids));
        },
        replace(notice: AgentNoticeCommand, receipt: NoticeReceipt) {
            return locked(async () => {
                const state = await read();
                const consumed = new Set(state.consumedMessageIds);
                const pending = notice.inbox
                    .filter((item) => !consumed.has(item.id))
                    .toSorted(
                        (left, right) =>
                            left.createdAt.localeCompare(right.createdAt) ||
                            left.sequence - right.sequence ||
                            left.id.localeCompare(right.id)
                    );
                const alreadyVisible = notice.inbox.length - pending.length;
                return await write(
                    {
                        consumedMessageIds: state.consumedMessageIds,
                        items: pending,
                        totalPending: Math.max(
                            pending.length,
                            notice.totalPending - alreadyVisible
                        ),
                        ...(notice.issueItems
                            ? { issueItems: notice.issueItems }
                            : {}),
                    },
                    receipt
                );
            });
        },
    };
}

export async function readJson(path: string) {
    try {
        const value: unknown = JSON.parse(await readFile(path, 'utf8'));
        return value;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
        }
        throw error;
    }
}

export async function writeJsonAtomic(path: string, value: unknown) {
    await mkdir(dirname(path), { mode: 0o700, recursive: true });
    const temporary = `${path}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600 });
    await rename(temporary, path);
}
