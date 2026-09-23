import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
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
 */
export function createNoticeCoordinator(
    deliver: (notice: string) => Promise<boolean>
): ToolGate & { close(): void; enqueue(notice: string): Promise<boolean> } {
    const pending: Array<{
        notice: string;
        resolve: (accepted: boolean) => void;
    }> = [];
    const inFlightToolCalls = new Set<unknown>();
    let closed = false;
    const flush = async () => {
        const entries = pending.splice(0);
        for (const [index, entry] of entries.entries()) {
            try {
                entry.resolve(await deliver(entry.notice));
            } catch (error) {
                entry.resolve(false);
                for (const remaining of entries.slice(index + 1)) {
                    remaining.resolve(false);
                }
                throw error;
            }
        }
    };
    return {
        close() {
            closed = true;
            for (const entry of pending.splice(0)) {
                entry.resolve(false);
            }
        },
        enqueue(notice: string): Promise<boolean> {
            if (closed) {
                return Promise.resolve(false);
            }
            return new Promise((resolve) => pending.push({ notice, resolve }));
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
