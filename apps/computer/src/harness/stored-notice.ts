import { randomBytes } from 'node:crypto';
import { link, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { StoredNoticeReceipt } from '../delivery.ts';

export async function deliverStoredNotice(
    agentRoot: string,
    deliver: (notice: string) => Promise<boolean>,
    onDelivered?: (receipt: StoredNoticeReceipt) => void,
    onReady?: () => void
) {
    try {
        const value = JSON.parse(await readFile(pendingNoticePath(agentRoot), 'utf8')) as {
            notice?: unknown;
            receipt?: unknown;
        };
        if (typeof value.notice === 'string') {
            const accepted = deliver(value.notice);
            onReady?.();
            if (!(await accepted)) {
                return;
            }
            const receipt = parseStoredNoticeReceipt(value.receipt);
            if (receipt) {
                onDelivered?.(receipt);
            }
        }
    } catch (cause) {
        if (!(isRecord(cause) && cause.code === 'ENOENT')) {
            throw cause;
        }
    } finally {
        onReady?.();
    }
}

/**
 * Puts a notice the runtime accepted but never handed the model back on the pending path, so
 * the next turn delivers it. A notice stored since is a newer, complete inbox summary and wins:
 * the restore only creates the file (an atomic hard link), never replaces one.
 */
export async function restorePendingNotice(agentRoot: string, notice: string): Promise<boolean> {
    const destination = pendingNoticePath(agentRoot);
    await mkdir(dirname(destination), { mode: 0o700, recursive: true });
    const temporary = `${destination}.${randomBytes(8).toString('hex')}.tmp`;
    await writeFile(temporary, `${JSON.stringify({ notice })}\n`, { mode: 0o600 });
    try {
        await link(temporary, destination);
        return true;
    } catch (cause) {
        if (isRecord(cause) && cause.code === 'EEXIST') {
            return false;
        }
        throw cause;
    } finally {
        await rm(temporary, { force: true });
    }
}

/** A harness stream part that opens or resolves a tool call. */
export interface ToolCallPart {
    preliminary?: unknown;
    toolCallId?: unknown;
}

/** Observes tool calls opening and resolving across a turn stream. */
export interface ToolGate {
    toolCallSettled(part: ToolCallPart): Promise<void>;
    toolCallStarted(part: ToolCallPart): void;
}

/**
 * Busy notices wait for a tool boundary with no tool call still in flight: with parallel tool
 * calls, one result is not a safe boundary while its siblings run. The harness exposes no
 * in-progress compaction signal, so compaction cannot gate this (specs/raft-alignment I2).
 * Each notice is a complete inbox summary, so a newer one supersedes any still waiting and
 * the superseded callers share its outcome.
 */
export function createNoticeCoordinator(
    deliver: (notice: string) => Promise<boolean>
): ToolGate & { close(): void; enqueue(notice: string): Promise<boolean> } {
    let pending: { notice: string; resolvers: Array<(accepted: boolean) => void> } | null = null;
    const inFlightToolCalls = new Set<unknown>();
    let closed = false;
    const take = () => {
        const entry = pending;
        pending = null;
        return entry;
    };
    const flush = async () => {
        const entry = take();
        if (!entry) {
            return;
        }
        const settleAll = (accepted: boolean) => {
            for (const resolve of entry.resolvers) {
                resolve(accepted);
            }
        };
        try {
            settleAll(await deliver(entry.notice));
        } catch (error) {
            settleAll(false);
            throw error;
        }
    };
    return {
        close() {
            closed = true;
            for (const resolve of take()?.resolvers ?? []) {
                resolve(false);
            }
        },
        enqueue(notice: string): Promise<boolean> {
            if (closed) {
                return Promise.resolve(false);
            }
            return new Promise((resolve) => {
                pending = { notice, resolvers: [...(pending?.resolvers ?? []), resolve] };
            });
        },
        toolCallStarted(part: ToolCallPart) {
            inFlightToolCalls.add(part.toolCallId);
        },
        async toolCallSettled(part: ToolCallPart) {
            if (part.preliminary === true) {
                return;
            }
            inFlightToolCalls.delete(part.toolCallId);
            if (inFlightToolCalls.size === 0) {
                await flush();
            }
        },
    };
}

function parseStoredNoticeReceipt(value: unknown): StoredNoticeReceipt | null {
    if (!(isRecord(value) && typeof value.runId === 'string' && Array.isArray(value.workIds))) {
        return null;
    }
    const workIds = value.workIds.filter((id): id is string => typeof id === 'string');
    return workIds.length === value.workIds.length ? { runId: value.runId, workIds } : null;
}

function pendingNoticePath(agentRoot: string) {
    return join(agentRoot, 'runtime', 'pending-notice.json');
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object';
}
